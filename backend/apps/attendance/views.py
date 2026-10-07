import re
from datetime import timedelta
from typing import ClassVar

from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from apps.academics.models import Lesson
from apps.common.permissions import IsDirector
from apps.common.tenancy import in_organization, students_in_organization
from apps.schools.models import SchoolClass
from apps.schools.serializers import StudentRosterSerializer
from apps.users.models import StudentProfile

from . import services
from .filters import AttendanceFilter
from .models import Attendance
from .serializers import (
    AttendanceRosterSerializer,
    AttendanceSerializer,
    BulkMarkAttendanceSerializer,
)

_GRADE_PREFIX = re.compile(r"^(\d+)")


class AttendanceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Read history here; attendance is written exclusively through `bulk-mark`."""

    serializer_class = AttendanceSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated]
    filterset_class = AttendanceFilter
    ordering_fields = ("lesson__date", "lesson__start_time")

    def get_permissions(self):
        if self.action == "daily_summary":
            return [IsDirector()]
        return super().get_permissions()

    def get_queryset(self):
        user = self.request.user
        queryset = in_organization(
            user,
            Attendance.objects.select_related(
                "lesson__subject", "lesson__school_class", "student__user", "marked_by"
            ),
        )

        if user.is_director:
            return queryset
        if user.is_teacher:
            return queryset.filter(
                Q(lesson__teacher=user.teacher_profile)
                | Q(lesson__school_class__class_teacher=user.teacher_profile)
            ).distinct()
        if user.is_student:
            student_profile = getattr(user, "student_profile", None)
            if student_profile:
                return queryset.filter(student=student_profile)
        return queryset.none()

    @action(detail=False, methods=["post"], url_path="bulk-mark")
    def bulk_mark(self, request):
        serializer = BulkMarkAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lesson = serializer.validated_data["lesson"]

        if not services.can_mark_attendance(request.user, lesson):
            raise PermissionDenied("You may not mark attendance for this lesson.")
        if not services.is_attendance_window_open(request.user, lesson):
            now = timezone.now()
            if now >= services.attendance_window_closes_at(lesson):
                detail = "Dars tugagani uchun davomatni endi o'zgartirib bo'lmaydi."
            else:
                detail = (
                    f"Davomatni dars boshlanganidan {services.ATTENDANCE_GRACE_MINUTES} "
                    "daqiqa o'tgach belgilash mumkin."
                )
            raise ValidationError({"lesson": detail})

        attendances = services.mark_lesson_attendance(
            lesson=lesson,
            records=serializer.validated_data["records"],
            marked_by=request.user,
        )
        return Response(AttendanceSerializer(attendances, many=True).data)

    @action(detail=False, methods=["get"], url_path="class-summary")
    def class_summary(self, request):
        school_class_id = request.query_params.get("school_class")
        if not school_class_id:
            raise ValidationError({"school_class": "This query parameter is required."})

        try:
            school_class = SchoolClass.objects.get(pk=school_class_id)
        except (SchoolClass.DoesNotExist, ValueError, TypeError) as exc:
            raise ValidationError({"school_class": "Invalid class id."}) from exc

        if not self._can_view_class(request.user, school_class):
            raise PermissionDenied("You may not view this class's attendance.")

        date_param = request.query_params.get("date")
        target_date = parse_date(date_param) if date_param else timezone.localdate()
        if target_date is None:
            raise ValidationError({"date": "Use YYYY-MM-DD format."})

        day_records = Attendance.objects.filter(
            lesson__school_class=school_class, lesson__date=target_date
        )
        counts = services.count_by_status(day_records)

        def _students_with_status(status: str):
            student_ids = (
                day_records.filter(status=status).values_list("student_id", flat=True).distinct()
            )
            return students_in_organization(
                request.user, StudentProfile.objects.filter(id__in=student_ids)
            ).select_related("user")

        # Only staff (teacher/director) see a parent's phone number here — a
        # student viewing their own class's summary must not see classmates'.
        is_staff_viewer = request.user.is_director or request.user.is_teacher
        roster_serializer = (
            AttendanceRosterSerializer if is_staff_viewer else StudentRosterSerializer
        )

        return Response(
            {
                "class_id": school_class.id,
                "class_name": school_class.name,
                "date": target_date,
                "total_students": school_class.students.count(),
                "present": counts[Attendance.Status.PRESENT],
                "late": counts[Attendance.Status.LATE],
                "absent": counts[Attendance.Status.ABSENT],
                "excused": counts[Attendance.Status.EXCUSED],
                "absent_students": roster_serializer(
                    _students_with_status(Attendance.Status.ABSENT), many=True
                ).data,
                "late_students": roster_serializer(
                    _students_with_status(Attendance.Status.LATE), many=True
                ).data,
            }
        )

    @action(detail=False, methods=["get"], url_path="lesson-summary")
    def lesson_summary(self, request):
        """Per-lesson attendance state for a date — lets the student's and the
        director's pages show a lesson as "davomat olinmagan" the moment its
        attendance was never taken, instead of the lesson silently vanishing.
        Scoped like the rest of the app: director sees every lesson, a teacher
        their own/led class's, a student their own class's.
        """
        date_param = request.query_params.get("date")
        target_date = parse_date(date_param) if date_param else timezone.localdate()
        if target_date is None:
            raise ValidationError({"date": "Use YYYY-MM-DD format."})

        school_class_param = request.query_params.get("school_class")
        if school_class_param:
            try:
                school_class_id = int(school_class_param)
            except ValueError as exc:
                raise ValidationError({"school_class": "Invalid class id."}) from exc
        else:
            school_class_id = None

        user = request.user
        queryset = (
            in_organization(request.user, Lesson.objects.filter(date=target_date))
            .select_related("subject", "school_class", "teacher__user")
            .annotate(
                students_count=Count("school_class__students"),
                marked_count=Count("attendance_records"),
            )
            .order_by("start_time")
        )

        if user.is_director:
            pass
        elif user.is_teacher:
            profile = user.teacher_profile
            queryset = queryset.filter(
                Q(teacher=profile) | Q(school_class__class_teacher=profile)
            ).distinct()
        elif user.is_student:
            profile = getattr(user, "student_profile", None)
            if profile and profile.school_class_id:
                queryset = queryset.filter(school_class_id=profile.school_class_id)
            else:
                queryset = queryset.none()
        else:
            queryset = queryset.none()

        if school_class_id is not None:
            queryset = queryset.filter(school_class_id=school_class_id)

        return Response(
            [
                {
                    "id": lesson.id,
                    "subject_name": lesson.subject.name,
                    "school_class_name": lesson.school_class.name,
                    "teacher_name": str(lesson.teacher),
                    "date": lesson.date,
                    "start_time": lesson.start_time,
                    "end_time": lesson.end_time,
                    "students_count": lesson.students_count,
                    "marked_count": lesson.marked_count,
                    "attendance_marked": lesson.marked_count > 0,
                }
                for lesson in queryset
            ]
        )

    @action(detail=False, methods=["get"], url_path="daily-summary")
    def daily_summary(self, request):
        """Whole-school (or one grade's) attendance status counts, one row per
        day, for the director's "kunlik diagramma" — the bar chart needs a
        single number per day, not the raw per-lesson record list, so this
        aggregates server-side rather than making the client page through
        (potentially thousands of) individual Attendance rows.
        """
        max_days = 60
        try:
            days = int(request.query_params.get("days", 14))
        except ValueError:
            days = 14
        days = min(max(days, 1), max_days)

        since = timezone.localdate() - timedelta(days=days - 1)
        queryset = Attendance.objects.filter(lesson__date__gte=since)

        grade = request.query_params.get("grade")
        if grade:
            matching_class_ids = [
                school_class.id
                for school_class in SchoolClass.objects.only("id", "name")
                if (match := _GRADE_PREFIX.match(school_class.name)) and match.group(1) == grade
            ]
            queryset = queryset.filter(lesson__school_class_id__in=matching_class_ids)

        rows = queryset.values("lesson__date", "status").annotate(count=Count("id"))
        by_date: dict = {}
        for row in rows:
            day_counts = by_date.setdefault(
                row["lesson__date"], dict.fromkeys(Attendance.Status.values, 0)
            )
            day_counts[row["status"]] = row["count"]

        empty_day = dict.fromkeys(Attendance.Status.values, 0)
        result = []
        for offset in range(days):
            day = since + timedelta(days=offset)
            counts = by_date.get(day, empty_day)
            result.append(
                {
                    "date": day.isoformat(),
                    "present": counts[Attendance.Status.PRESENT],
                    "late": counts[Attendance.Status.LATE],
                    "absent": counts[Attendance.Status.ABSENT],
                    "excused": counts[Attendance.Status.EXCUSED],
                }
            )
        return Response(result)

    @staticmethod
    def _can_view_class(user, school_class) -> bool:
        if user.is_director:
            return True
        profile = getattr(user, "teacher_profile", None)
        if profile is not None:
            return (
                school_class.class_teacher_id == profile.pk
                or school_class.lessons.filter(teacher=profile).exists()
            )
        student_profile = getattr(user, "student_profile", None)
        return bool(student_profile and student_profile.school_class_id == school_class.pk)
