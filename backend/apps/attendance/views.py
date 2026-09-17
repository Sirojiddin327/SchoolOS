from typing import ClassVar

from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from apps.schools.models import SchoolClass

from . import services
from .filters import AttendanceFilter
from .models import Attendance
from .serializers import AttendanceSerializer, BulkMarkAttendanceSerializer


class AttendanceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Read history here; attendance is written exclusively through `bulk-mark`."""

    serializer_class = AttendanceSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated]
    filterset_class = AttendanceFilter
    ordering_fields = ("lesson__date", "lesson__start_time")

    def get_queryset(self):
        user = self.request.user
        queryset = Attendance.objects.select_related(
            "lesson__subject", "lesson__school_class", "student__user", "marked_by"
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

        counts = services.count_by_status(
            Attendance.objects.filter(lesson__school_class=school_class, lesson__date=target_date)
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
            }
        )

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
