from datetime import timedelta
from typing import ClassVar

from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, viewsets
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsDirector, IsStudent
from apps.common.tenancy import in_organization, students_in_organization
from apps.schools.models import SchoolClass
from apps.users.models import StudentProfile

from .models import Achievement, Streak, StudentAchievement, XPTransaction
from .serializers import (
    AchievementManageSerializer,
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
        # Scope first, then narrow: a director's ledger is their school's, not
        # every school's, and the `?student=` filter must not escape that.
        queryset = in_organization(
            user, XPTransaction.objects.select_related("student__user")
        )
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
        return students_in_organization(
            self.request.user,
            StudentProfile.objects.select_related("user", "school_class"),
        ).order_by("-total_xp", "user__first_name")

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
        return in_organization(
            self.request.user, SchoolClass.objects.all()
        ).order_by("-total_xp", "name")

    def list(self, request, *args, **kwargs):
        ranked = [
            {"rank": index, "school_class": school_class}
            for index, school_class in enumerate(self.get_queryset(), start=1)
        ]
        return Response(self.get_serializer(ranked, many=True).data)


class ClassGrowthView(APIView):
    """Every class's cumulative XP over the last N days — the director
    dashboard's "growth" chart. Each class's series ends exactly at its real,
    current `total_xp` (today's point = actual total; earlier points are
    reconstructed backward from that day's XP transactions), so the chart
    stays self-consistent with the rest of the app rather than drifting from
    whatever the ledger happens to contain.
    """

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsDirector]
    MAX_DAYS = 60
    DEFAULT_DAYS = 14

    def get(self, request):
        try:
            days = min(int(request.query_params.get("days", self.DEFAULT_DAYS)), self.MAX_DAYS)
        except ValueError:
            days = self.DEFAULT_DAYS
        days = max(days, 1)

        since = timezone.localdate() - timedelta(days=days - 1)
        date_range = [since + timedelta(days=i) for i in range(days)]

        classes = list(SchoolClass.objects.order_by("name"))
        daily_deltas = {c.id: dict.fromkeys(date_range, 0) for c in classes}

        transactions = XPTransaction.objects.filter(
            created_at__date__gte=since, student__school_class__isnull=False
        ).values_list("student__school_class_id", "created_at", "amount")
        for class_id, created_at, amount in transactions:
            bucket = daily_deltas.get(class_id)
            if bucket is not None:
                bucket[timezone.localtime(created_at).date()] += amount

        result = []
        for school_class in classes:
            deltas = daily_deltas[school_class.id]
            cumulative = school_class.total_xp - sum(deltas.values())
            points = []
            for day in date_range:
                cumulative += deltas[day]
                points.append({"date": day.isoformat(), "total_xp": cumulative})
            result.append(
                {"class_id": school_class.id, "class_name": school_class.name, "points": points}
            )

        return Response(result)


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
                in_organization(
                    self.request.user, StudentAchievement.objects.filter(student=student_profile)
                ).values_list(
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


class MyRankView(APIView):
    """A student's own position — computed here rather than making them find
    themselves in the public leaderboard list, which deliberately carries no
    id/email to match against (privacy: spec says never expose more than
    rank/name/class/xp there). Rank ties share the same number (dense rank via
    a `total_xp__gt` count), matching how the leaderboard itself orders.
    """

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsStudent]

    def get(self, request):
        user = request.user
        student = user.student_profile
        students = students_in_organization(user, StudentProfile.objects.all())
        rank = students.filter(total_xp__gt=student.total_xp).count() + 1
        total_students = students.count()

        class_rank = None
        total_classes = in_organization(user, SchoolClass.objects).count()
        if student.school_class_id:
            class_rank = (
                in_organization(user, SchoolClass.objects)
                .filter(total_xp__gt=student.school_class.total_xp)
                .count()
                + 1
            )

        return Response(
            {
                "rank": rank,
                "total_students": total_students,
                "class_rank": class_rank,
                "total_classes": total_classes,
            }
        )


class AchievementManageViewSet(viewsets.ModelViewSet):
    """Director-only CRUD over the achievement catalog (create/edit/retire
    achievements). Everyone's read-only, unlock-annotated view is
    `AchievementListView` at `/api/achievements/` — kept separate so the two
    never have to compromise on shape.
    """

    serializer_class = AchievementManageSerializer
    queryset = Achievement.objects.all()
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsDirector]
