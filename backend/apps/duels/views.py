from typing import ClassVar

from django.db.models import Prefetch, Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from apps.common.permissions import IsStudent
from apps.users.models import StudentProfile

from . import rules, services
from .models import Duel, DuelRating
from .serializers import (
    ClassmateSerializer,
    DuelAnswerSerializer,
    DuelCreateSerializer,
    DuelRatingSerializer,
    DuelSerializer,
    archetype_for,
)

RESULT_FILTERS = {"win", "loss", "draw"}


class DuelViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Duels are a student-to-student feature — director/teacher have no place
    here. Every duel a student can see is one they're a side of; classmates
    are the only possible human opponents."""

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated, IsStudent]
    serializer_class = DuelSerializer

    def get_queryset(self):
        return services.duels_of(self.request.user.student_profile).select_related(
            "challenger__user", "opponent__user", "subject"
        )

    def get_object(self):
        # Lazily close lapsed invitations and abandoned matches on every read.
        return services.settle_if_stale(super().get_object())

    def list(self, request, *args, **kwargs):
        """History and open duels. `?status=open|finished`, `?result=win|loss|draw`."""
        profile = request.user.student_profile
        queryset = self.get_queryset()
        for duel in queryset.filter(status__in=services.OPEN_STATUSES):
            services.settle_if_stale(duel)

        wanted_status = request.query_params.get("status")
        if wanted_status == "open":
            queryset = queryset.filter(status__in=services.OPEN_STATUSES)
        elif wanted_status == "finished":
            queryset = queryset.filter(status=Duel.Status.COMPLETED)

        result = request.query_params.get("result")
        if result in RESULT_FILTERS:
            as_challenger = Q(challenger=profile)
            as_opponent = Q(opponent=profile)
            queryset = queryset.filter(status=Duel.Status.COMPLETED)
            if result == "draw":
                queryset = queryset.filter(result=Duel.Result.DRAW)
            elif result == "win":
                queryset = queryset.filter(
                    (as_challenger & Q(result=Duel.Result.CHALLENGER)) | (as_opponent & Q(result=Duel.Result.OPPONENT))
                )
            else:
                queryset = queryset.filter(
                    (as_challenger & Q(result=Duel.Result.OPPONENT)) | (as_opponent & Q(result=Duel.Result.CHALLENGER))
                )

        page = self.paginate_queryset(queryset)
        serializer = DuelSerializer(page if page is not None else queryset, many=True, context=self.get_serializer_context())
        return self.get_paginated_response(serializer.data) if page is not None else Response(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = DuelCreateSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        duel = serializer.save()
        return Response(DuelSerializer(duel, context=self.get_serializer_context()).data, status=status.HTTP_201_CREATED)

    def _run(self, fn, **kwargs):
        try:
            return fn(**kwargs)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

    def _state(self, duel):
        duel.refresh_from_db()
        return Response(DuelSerializer(duel, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        duel = self._run(services.respond, duel=self.get_object(), student=request.user.student_profile, accept=True)
        return self._state(duel)

    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        duel = self._run(services.respond, duel=self.get_object(), student=request.user.student_profile, accept=False)
        return self._state(duel)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        duel = self._run(services.cancel, duel=self.get_object(), student=request.user.student_profile)
        return self._state(duel)

    @action(detail=True, methods=["post"])
    def ready(self, request, pk=None):
        duel = self._run(services.mark_ready, duel=self.get_object(), student=request.user.student_profile)
        return self._state(duel)

    @action(detail=True, methods=["get"])
    def question(self, request, pk=None):
        return Response(self._run(services.open_question, duel=self.get_object(), student=request.user.student_profile))

    @action(detail=True, methods=["post"])
    def answer(self, request, pk=None):
        serializer = DuelAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        duel = self.get_object()
        result = self._run(
            services.answer, duel=duel, student=request.user.student_profile, **serializer.validated_data
        )
        duel.refresh_from_db()
        return Response({**result, "duel": DuelSerializer(duel, context=self.get_serializer_context()).data})

    @action(detail=True, methods=["post"])
    def rematch(self, request, pk=None):
        duel = self._run(services.rematch, duel=self.get_object(), student=request.user.student_profile)
        return Response(DuelSerializer(duel, context=self.get_serializer_context()).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def opponents(self, request):
        """Classmates you're allowed to challenge (same class only)."""
        profile = request.user.student_profile
        # Ratings are per (organization, student), so pin them to the viewer's
        # own organization — a rating earned at school is not a club's ranking.
        organization = request.user.active_organization
        classmates = (
            StudentProfile.objects.filter(school_class_id=profile.school_class_id, user__is_active=True)
            .exclude(pk=profile.pk)
            .select_related("user")
            .prefetch_related(
                Prefetch(
                    "duel_ratings",
                    queryset=DuelRating.objects.filter(organization=organization),
                    to_attr="scoped_duel_ratings",
                )
            )
            .order_by("user__first_name", "user__last_name")
        )
        open_with = set()
        for challenger_id, opponent_id in services.duels_of(profile).filter(
            status__in=services.OPEN_STATUSES
        ).values_list("challenger_id", "opponent_id"):
            open_with.update({challenger_id, opponent_id})
        context = {**self.get_serializer_context(), "open_with": open_with}
        return Response(ClassmateSerializer(classmates, many=True, context=context).data)

    @action(detail=False, methods=["get"])
    def ai(self, request):
        """The AI opponents on offer, with what beating each one is worth."""
        max_xp = rules.MAX_ANSWER_XP + rules.RESULT_XP["WIN"]
        return Response(
            [
                {
                    "level": level,
                    "name": profile["name"],
                    "title": profile["title"],
                    "difficulty": profile["difficulty"],
                    "personality": profile["personality"],
                    "archetype": f"ai-{level.lower()}",
                    "max_xp": max_xp,
                }
                for level, profile in rules.AI_OPPONENTS.items()
            ]
        )

    @action(detail=False, methods=["get"])
    def stats(self, request):
        profile = request.user.student_profile
        return Response({**services.duel_stats(profile), "archetype": archetype_for(profile)})

    @action(detail=False, methods=["get"])
    def leaderboard(self, request):
        """Your class only, like the rest of the app's rankings."""
        profile = request.user.student_profile
        ratings = (
            DuelRating.objects.filter(student__school_class_id=profile.school_class_id)
            .select_related("student__user")
            .order_by("-wins", "-rating")
        )
        return Response(DuelRatingSerializer(ratings, many=True).data)
