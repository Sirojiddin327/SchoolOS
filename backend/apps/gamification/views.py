from typing import ClassVar

from django.db.models import Q
from rest_framework import generics
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsStudent
from apps.schools.models import SchoolClass
from apps.users.models import StudentProfile

from .models import Achievement, Streak, StudentAchievement, XPTransaction
from .serializers import (
    AchievementSerializer,
    ClassLeaderboardSerializer,
    StreakSerializer,
    StudentLeaderboardSerializer,
    XPTransactionSerializer,
)


class XPHistoryView(generics.ListAPIView):
    """Student: their own XP ledger. Teacher: any of their students', via ?student=.
    Director: everyone's, optionally filtered by ?student=.
    """

    serializer_class = XPTransactionSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = XPTransaction.objects.select_related("student__user")
        student_id = self.request.query_params.get("student")

        if user.is_student:
            student_profile = getattr(user, "student_profile", None)
            return queryset.filter(student=student_profile) if student_profile else queryset.none()

        if user.is_director:
            return queryset.filter(student_id=student_id) if student_id else queryset

        if user.is_teacher:
            profile = user.teacher_profile
            allowed = queryset.filter(
                Q(student__school_class__class_teacher=profile)
                | Q(student__school_class__lessons__teacher=profile)
            ).distinct()
            return allowed.filter(student_id=student_id) if student_id else allowed

        return queryset.none()


class StudentLeaderboardView(generics.ListAPIView):
    serializer_class = StudentLeaderboardSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return StudentProfile.objects.select_related("user", "school_class").order_by(
            "-total_xp", "user__first_name"
        )

    def list(self, request, *args, **kwargs):
        ranked = [
            {"rank": index, "student": student}
            for index, student in enumerate(self.get_queryset(), start=1)
        ]
        return Response(self.get_serializer(ranked, many=True).data)


class ClassLeaderboardView(generics.ListAPIView):
    serializer_class = ClassLeaderboardSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return SchoolClass.objects.order_by("-total_xp", "name")

    def list(self, request, *args, **kwargs):
        ranked = [
            {"rank": index, "school_class": school_class}
            for index, school_class in enumerate(self.get_queryset(), start=1)
        ]
        return Response(self.get_serializer(ranked, many=True).data)


class AchievementListView(generics.ListAPIView):
    """The full catalog, annotated with the caller's own unlock status."""

    serializer_class = AchievementSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return Achievement.objects.filter(is_active=True)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        student_profile = getattr(self.request.user, "student_profile", None)
        context["unlocked"] = (
            dict(
                StudentAchievement.objects.filter(student=student_profile).values_list(
                    "achievement_id", "unlocked_at"
                )
            )
            if student_profile
            else {}
        )
        return context


class MyStreakView(APIView):
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsStudent]

    def get(self, request):
        streak, _created = Streak.objects.get_or_create(student=request.user.student_profile)
        return Response(StreakSerializer(streak).data)
