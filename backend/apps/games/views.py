from typing import ClassVar

from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from apps.common.permissions import IsDirector, IsStudent
from apps.common.tenancy import in_organization

from . import question_service, services
from .models import GameSession
from .serializers import (
    GameAnswerCheckSerializer,
    GameQuestionSerializer,
    GameSessionCreateSerializer,
    GameSessionSerializer,
    GameSubmitSerializer,
    PoolRefillSerializer,
)

POOL_NOT_READY_DETAIL = "Bu fan uchun savollar hali kiritilmagan."
# A machine-readable companion to the message above, so the client can show a
# proper empty state ("no questions for this subject yet") and tell it apart
# from a transport/server failure — without either side guessing.
POOL_NOT_READY_CODE = "no_questions_for_subject"


class GameSessionViewSet(
    mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """The self-serve "O'yinlar" section — student-only, any time, not tied to a test."""

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated, IsStudent]

    def get_queryset(self):
        return (
            in_organization(
                self.request.user,
                GameSession.objects.filter(student=self.request.user.student_profile),
            )
            .select_related("subject")
            .prefetch_related("remedial_sessions")
        )

    def get_serializer_class(self):
        if self.action == "create":
            return GameSessionCreateSerializer
        return GameSessionSerializer

    def create(self, request, *args, **kwargs):
        serializer = GameSessionCreateSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        session = serializer.save()
        return Response(GameSessionSerializer(session).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def subjects(self, request):
        """Every subject with its current question-bank size, so a client can
        show a real empty state ("no questions for this subject yet") *before*
        a session is started rather than only when its questions are requested.
        """
        return Response(question_service.subject_availability())

    @action(detail=True, methods=["get"])
    def questions(self, request, pk=None):
        session = self.get_object()
        game_questions = services.pick_session_questions(session)
        if game_questions is None:
            # The session's subject has nothing in the bank — an empty state to
            # show, not an error to retry. `code` is what the client keys off.
            return Response(
                {"detail": POOL_NOT_READY_DETAIL, "code": POOL_NOT_READY_CODE, "subject": session.subject_id},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(GameQuestionSerializer(game_questions, many=True).data)

    @action(detail=True, methods=["post"])
    def answer(self, request, pk=None):
        """Live per-question check. Arqon tortish only learns whether the one
        answer was right (`services.check_answer`); Minora qurish and Kodni
        buzish lock the answer in server-side and get the key, explanation and
        running totals back (`services.record_live_answer`).
        """
        session = self.get_object()
        serializer = GameAnswerCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            if session.game_type in services.LIVE_KEY_GAMES:
                return Response(services.record_live_answer(session=session, **serializer.validated_data))
            correct = services.check_answer(
                session=session,
                question_index=serializer.validated_data["question_index"],
                selected_index=serializer.validated_data["selected_index"],
            )
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

        return Response({"correct": correct})

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        session = self.get_object()
        serializer = GameSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        answers = {
            answer["question_index"]: answer["selected_index"]
            for answer in serializer.validated_data["answers"]
        }
        try:
            session = services.submit_game(session=session, answers=answers)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

        # A low score opens the same AI-tutor flow a low test score does.
        from apps.remedial.services import maybe_start_remedial_for_game

        maybe_start_remedial_for_game(session)
        # Re-read so the response's `remedial_session_id` sees a session just opened
        # (the one from get_object() carries a stale prefetch cache).
        return Response(GameSessionSerializer(self.get_queryset().get(pk=session.pk)).data)


class QuestionPoolViewSet(viewsets.ViewSet):
    """Director-only: see and top up each subject+class question pool that
    powers the self-serve games — see `apps.games.services.refill_pool`. A
    game's live start never calls Gemini; only this (and the scheduled
    `apps.games.tasks.refill_low_pools`) does.
    """

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated, IsDirector]

    def list(self, request):
        return Response(services.pool_status(request.user.active_organization))

    @action(detail=False, methods=["post"])
    def refill(self, request):
        serializer = PoolRefillSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # The subject-wide bank has no class to inherit a tenant from, so the
        # director's own active organization owns it.
        added = services.refill_pool(
            **serializer.validated_data, organization=request.user.active_organization
        )
        return Response({"added": added})
