from typing import ClassVar

from django.utils import timezone
from rest_framework import generics, mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from apps.common.permissions import IsDirector, IsStudent, IsTeacher
from apps.common.tenancy import in_organization
from apps.remedial.services import maybe_start_remedial_session

from . import services
from .models import Activity, ActivitySubmission, Option, Question, Test, TestAttempt
from .permissions import (
    IsActivityOwnerOrDirector,
    IsOptionOwnerOrDirector,
    IsQuestionOwnerOrDirector,
    IsSubmissionOwnerOrDirector,
    IsTestOwnerOrDirector,
)
from .serializers import (
    ActivityDetailSerializer,
    ActivityGradeSerializer,
    ActivityListSerializer,
    ActivitySubmissionInputSerializer,
    ActivitySubmissionSerializer,
    ActivityWriteSerializer,
    OptionWriteSerializer,
    QuestionWriteSerializer,
    TestAttemptResultSerializer,
    TestDetailSerializer,
    TestGenerateSerializer,
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
        queryset = in_organization(
            user,
            Test.objects.select_related("subject", "school_class", "teacher__user").prefetch_related(
                "questions__options"
            ),
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

    @action(detail=False, methods=["post"], permission_classes=[IsAuthenticated, IsTeacher | IsDirector])
    def generate(self, request):
        """Drafts a full test from a one-line topic via AI — saves the teacher
        (or director) from typing out every question by hand. Always
        unpublished; reviewed/edited before publishing, same as a
        manually-built test.
        """
        serializer = TestGenerateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if request.user.is_teacher:
            teacher = request.user.teacher_profile
        else:
            teacher = data.get("teacher")
            if teacher is None:
                raise ValidationError({"teacher": "Direktor uchun bu maydon majburiy."})

        try:
            test = services.generate_test_with_ai(
                teacher=teacher,
                title=data["title"],
                subject=data["subject"],
                school_class=data["school_class"],
                topic=data["topic"],
                question_count=data["question_count"],
                max_xp=data["max_xp"],
                time_limit_minutes=data.get("time_limit_minutes"),
            )
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

        return Response(TestDetailSerializer(test).data, status=201)

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

        remedial_session = maybe_start_remedial_session(attempt)

        data = TestAttemptResultSerializer(attempt).data
        data["remedial_session_id"] = remedial_session.id if remedial_session else None
        return Response(data)


class QuestionViewSet(viewsets.ModelViewSet):
    serializer_class = QuestionWriteSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated, IsQuestionOwnerOrDirector]
    filterset_fields = ("test",)

    def get_queryset(self):
        user = self.request.user
        queryset = in_organization(
            user, Question.objects.select_related("test"), field="test__organization"
        )
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
        queryset = in_organization(
            user, Option.objects.select_related("question__test"), field="question__test__organization"
        )
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
        return in_organization(
            self.request.user, TestAttempt.objects.select_related("test")
        ).filter(student=self.request.user.student_profile)


class ActivityViewSet(viewsets.ModelViewSet):
    """Same shape as `TestViewSet`: director full CRUD, teacher CRUD on their
    own activities, student read-only on published activities for their class.
    """

    permission_classes: ClassVar[list[type[BasePermission]]] = [
        IsAuthenticated,
        IsActivityOwnerOrDirector,
    ]
    filterset_fields = ("subject", "school_class", "activity_type", "status")

    def get_serializer_class(self):
        if self.action == "list":
            return ActivityListSerializer
        if self.action in ("create", "update", "partial_update"):
            return ActivityWriteSerializer
        return ActivityDetailSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = in_organization(
            user, Activity.objects.select_related("subject", "school_class", "teacher__user")
        )

        if user.is_director:
            return queryset
        if user.is_teacher:
            return queryset.filter(teacher=user.teacher_profile)
        if user.is_student:
            student_profile = getattr(user, "student_profile", None)
            if student_profile and student_profile.school_class_id:
                return queryset.filter(
                    status=Activity.Status.PUBLISHED, school_class_id=student_profile.school_class_id
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
        activity = self.get_object()
        activity.status = Activity.Status.PUBLISHED
        activity.save(update_fields=["status", "updated_at"])
        services.notify_class_of_new_activity(activity)
        return Response(ActivityDetailSerializer(activity).data)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        activity = self.get_object()
        activity.status = Activity.Status.CLOSED
        activity.save(update_fields=["status", "updated_at"])
        return Response(ActivityDetailSerializer(activity).data)

    @action(detail=True, methods=["get"])
    def submissions(self, request, pk=None):
        activity = self.get_object()
        subs = activity.submissions.select_related("student__user", "result")
        return Response(ActivitySubmissionSerializer(subs, many=True).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated, IsStudent])
    def submit(self, request, pk=None):
        activity = self.get_object()
        student = request.user.student_profile

        if not activity.is_open_for_submissions(timezone.localdate()):
            raise ValidationError("This activity is not open for submissions.")
        if ActivitySubmission.objects.filter(activity=activity, student=student).exists():
            raise ValidationError("You have already submitted this activity.")

        serializer = ActivitySubmissionInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        submission = ActivitySubmission.objects.create(
            activity=activity, student=student, **serializer.validated_data
        )
        return Response(ActivitySubmissionSerializer(submission).data, status=201)


class ActivitySubmissionViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Read a single submission, or (teacher/director) grade it."""

    serializer_class = ActivitySubmissionSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [
        IsAuthenticated,
        IsSubmissionOwnerOrDirector,
    ]

    def get_queryset(self):
        user = self.request.user
        queryset = in_organization(
            user,
            ActivitySubmission.objects.select_related("activity__teacher", "student__user", "result"),
        )
        if user.is_director:
            return queryset
        if user.is_teacher:
            return queryset.filter(activity__teacher=user.teacher_profile)
        if user.is_student:
            student_profile = getattr(user, "student_profile", None)
            return queryset.filter(student=student_profile) if student_profile else queryset.none()
        return queryset.none()

    @action(detail=True, methods=["post"])
    def grade(self, request, pk=None):
        submission = self.get_object()
        serializer = ActivityGradeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            services.grade_submission(
                submission=submission,
                score_percent=serializer.validated_data["score_percent"],
                feedback=serializer.validated_data.get("feedback", ""),
                graded_by=request.user,
            )
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

        return Response(ActivitySubmissionSerializer(submission).data)


class MyActivitySubmissionsView(generics.ListAPIView):
    """A student's own activity submission history."""

    serializer_class = ActivitySubmissionSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated, IsStudent]

    def get_queryset(self):
        return in_organization(
            self.request.user, ActivitySubmission.objects.select_related("activity", "result")
        ).filter(student=self.request.user.student_profile)
