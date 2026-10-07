from typing import ClassVar

from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import Lesson
from apps.attendance.models import Attendance
from apps.attendance.services import count_by_status
from apps.common.permissions import IsDirector, IsStudent, IsTeacher
from apps.gamification.models import XPTransaction
from apps.learning.models import Activity, Test
from apps.schools.models import SchoolClass
from apps.users.models import StudentProfile, TeacherProfile

from . import reports


def _attendance_counts(queryset) -> dict:
    return {key.lower(): value for key, value in count_by_status(queryset).items()}


def _serialize_lesson(lesson: Lesson, *, teacher_profile=None) -> dict:
    data = {
        "id": lesson.id,
        "subject": lesson.subject.name,
        "school_class": lesson.school_class.name,
        "start_time": lesson.start_time,
        "end_time": lesson.end_time,
        "room": lesson.room,
        "topic": lesson.topic,
        "attendance_marked": lesson.attendance_records.exists(),
    }
    if teacher_profile is not None:
        data["is_own_lesson"] = lesson.teacher_id == teacher_profile.pk
    return data


class DirectorDashboardView(APIView):
    """Whole-school snapshot for today: headcounts + today's attendance breakdown."""

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsDirector]

    def get(self, request):
        today = timezone.localdate()
        today_lessons = Lesson.objects.filter(date=today)
        total_xp_awarded = XPTransaction.objects.aggregate(total=Sum("amount"))["total"] or 0
        top_class = SchoolClass.objects.order_by("-total_xp").first()

        return Response(
            {
                "total_students": StudentProfile.objects.count(),
                "total_teachers": TeacherProfile.objects.count(),
                "total_classes": SchoolClass.objects.count(),
                "today_lessons": today_lessons.count(),
                "today_attendance": _attendance_counts(
                    Attendance.objects.filter(lesson__date=today)
                ),
                "total_tests": Test.objects.count(),
                "total_activities": Activity.objects.count(),
                "total_xp_awarded": total_xp_awarded,
                "top_class": (
                    {"name": top_class.name, "total_xp": top_class.total_xp} if top_class else None
                ),
            }
        )


class TeacherDashboardView(APIView):
    """Today's lessons for this teacher, across both their own lessons and led class."""

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsTeacher]

    def get(self, request):
        profile = request.user.teacher_profile
        today = timezone.localdate()

        today_lessons = (
            Lesson.objects.filter(
                Q(teacher=profile) | Q(school_class__class_teacher=profile), date=today
            )
            .select_related("subject", "school_class")
            .distinct()
            .order_by("start_time")
        )
        my_classes_count = (
            SchoolClass.objects.filter(Q(class_teacher=profile) | Q(lessons__teacher=profile))
            .distinct()
            .count()
        )

        return Response(
            {
                "today_lessons": [
                    _serialize_lesson(lesson, teacher_profile=profile) for lesson in today_lessons
                ],
                "my_classes_count": my_classes_count,
                "unread_notifications": request.user.notifications.filter(is_read=False).count(),
            }
        )


class StudentDashboardView(APIView):
    """Today's lessons for the student's class + their all-time attendance breakdown."""

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsStudent]

    def get(self, request):
        profile = request.user.student_profile
        if profile.school_class_id is None:
            return Response(
                {
                    "school_class": None,
                    "today_lessons": [],
                    "attendance_summary": {
                        "total": 0,
                        **_attendance_counts(Attendance.objects.none()),
                    },
                    "unread_notifications": request.user.notifications.filter(
                        is_read=False
                    ).count(),
                }
            )

        today = timezone.localdate()
        today_lessons = (
            Lesson.objects.filter(school_class=profile.school_class, date=today)
            .select_related("subject", "school_class")
            .order_by("start_time")
        )
        attendance_counts = _attendance_counts(Attendance.objects.filter(student=profile))

        return Response(
            {
                "school_class": profile.school_class.name,
                "today_lessons": [_serialize_lesson(lesson) for lesson in today_lessons],
                "attendance_summary": {
                    "total": sum(attendance_counts.values()),
                    **attendance_counts,
                },
                "unread_notifications": request.user.notifications.filter(is_read=False).count(),
            }
        )


def _report_period(request) -> int:
    try:
        days = int(request.query_params.get("days", reports.DEFAULT_PERIOD))
    except ValueError:
        return reports.DEFAULT_PERIOD
    return days if days in reports.PERIOD_CHOICES else reports.DEFAULT_PERIOD


class ClassReportView(APIView):
    """A class's progress report — per-student test/game averages and trend,
    attendance, XP, weak subjects and a GOOD/WATCH/RISK status. Teachers see
    the classes they lead or teach; the director sees every class."""

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsTeacher | IsDirector]

    def get(self, request, pk):
        school_class = get_object_or_404(reports.classes_visible_to(request.user), pk=pk)
        return Response(reports.build_class_report(school_class, days=_report_period(request)))


class ClassReportAISummaryView(APIView):
    """An AI-written summary of the same report (students anonymized on the way
    out). POST because it may spend an AI call; `refresh` skips the cache."""

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsTeacher | IsDirector]

    def post(self, request, pk):
        school_class = get_object_or_404(reports.classes_visible_to(request.user), pk=pk)
        report = reports.build_class_report(school_class, days=_report_period(request))
        summary = reports.ai_class_summary(report, refresh=bool(request.data.get("refresh")))
        if summary is None:
            return Response(
                {"detail": "AI hozircha javob bera olmadi. Birozdan so'ng qayta urinib ko'ring."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"summary": summary, "generated_at": timezone.now()})


class SchoolReportView(APIView):
    """Whole-school student progress report — all students across all classes.
    Director only."""

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsDirector]

    def get(self, request):
        return Response(reports.build_school_report(days=_report_period(request)))


class SchoolReportAISummaryView(APIView):
    """AI-written summary of the whole-school report. Director only."""

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsDirector]

    def post(self, request):
        report = reports.build_school_report(days=_report_period(request))
        summary = reports.ai_school_summary(report, refresh=bool(request.data.get("refresh")))
        if summary is None:
            return Response(
                {"detail": "AI hozircha javob bera olmadi. Birozdan so'ng qayta urinib ko'ring."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"summary": summary, "generated_at": timezone.now()})
