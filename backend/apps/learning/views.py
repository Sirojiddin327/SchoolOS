from typing import ClassVar

from rest_framework import generics, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from apps.common.permissions import IsStudent

from . import services
from .models import Option, Question, Test, TestAttempt
from .permissions import IsOptionOwnerOrDirector, IsQuestionOwnerOrDirector, IsTestOwnerOrDirector
from .serializers import (
    OptionWriteSerializer,
    QuestionWriteSerializer,
    TestAttemptResultSerializer,
    TestDetailSerializer,
    TestListSerializer,
    TestSubmitSerializer,
    TestWriteSerializer,
)


class TestViewSet(viewsets.ModelViewSet):
    """Director: full CRUD over every test. Teacher: full CRUD over their own
    tests only. Student: read-only, published tests for their own class only —
    enforced by `get_queryset`, not just by permission checks.
    """

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated, IsTestOwnerOrDirector]
    filterset_fields = ("subject", "school_class", "is_published")

    def get_serializer_class(self):
        if self.action == "list":
            return TestListSerializer
        if self.action in ("create", "update", "partial_update"):
            return TestWriteSerializer
        return TestDetailSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = Test.objects.select_related("subject", "school_class", "teacher__user").prefetch_related(
            "questions__options"
        )

        if user.is_director:
            return queryset
        if user.is_teacher:
            return queryset.filter(teacher=user.teacher_profile)
        if user.is_student:
            student_profile = getattr(user, "student_profile", None)
            if student_profile and student_profile.school_class_id:
                return queryset.filter(
                    is_published=True, school_class_id=student_profile.school_class_id
                )
        return queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        if user.is_teacher:
            serializer.save(teacher=user.teacher_profile)
        else:
            serializer.save()

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        test = self.get_object()
        test.is_published = True
        test.save(update_fields=["is_published", "updated_at"])
        services.notify_class_of_new_test(test)
        return Response(TestDetailSerializer(test).data)

    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        test = self.get_object()
        test.is_published = False
        test.save(update_fields=["is_published", "updated_at"])
        return Response(TestDetailSerializer(test).data)

    @action(detail=True, methods=["get"])
    def results(self, request, pk=None):
        test = self.get_object()
        attempts = test.attempts.select_related("student__user").filter(
            status=TestAttempt.Status.SUBMITTED
        )
        return Response(TestAttemptResultSerializer(attempts, many=True).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsStudent])
    def start(self, request, pk=None):
        test = self.get_object()
        attempt, _created = TestAttempt.objects.get_or_create(
            test=test, student=request.user.student_profile
        )
        return Response(TestAttemptResultSerializer(attempt).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsStudent])
    def submit(self, request, pk=None):
        test = self.get_object()
        attempt, _created = TestAttempt.objects.get_or_create(
            test=test, student=request.user.student_profile
        )

        serializer = TestSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            attempt = services.grade_attempt(
                attempt=attempt, answers=serializer.validated_data["answers"]
            )
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

        return Response(TestAttemptResultSerializer(attempt).data)


class QuestionViewSet(viewsets.ModelViewSet):
    serializer_class = QuestionWriteSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated, IsQuestionOwnerOrDirector]
    filterset_fields = ("test",)

    def get_queryset(self):
        user = self.request.user
        queryset = Question.objects.select_related("test")
        if user.is_director:
            return queryset
        if user.is_teacher:
            return queryset.filter(test__teacher=user.teacher_profile)
        return queryset.none()


class OptionViewSet(viewsets.ModelViewSet):
    serializer_class = OptionWriteSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated, IsOptionOwnerOrDirector]
    filterset_fields = ("question",)

    def get_queryset(self):
        user = self.request.user
        queryset = Option.objects.select_related("question__test")
        if user.is_director:
            return queryset
        if user.is_teacher:
            return queryset.filter(question__test__teacher=user.teacher_profile)
        return queryset.none()


class MyAttemptsView(generics.ListAPIView):
    """A student's own test history."""

    serializer_class = TestAttemptResultSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated, IsStudent]

    def get_queryset(self):
        return TestAttempt.objects.select_related("test").filter(
            student=self.request.user.student_profile
        )
