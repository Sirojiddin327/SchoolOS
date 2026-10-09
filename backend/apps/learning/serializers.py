from rest_framework import serializers

from apps.academics.models import Subject, TimetableSlot
from apps.common.tenancy import request_active_organization
from apps.schools.models import SchoolClass
from apps.users.models import TeacherProfile

from .models import (
    LOW_FREQUENCY_QUESTION_CAP,
    LOW_FREQUENCY_WEEKLY_LESSON_THRESHOLD,
    Activity,
    ActivityResult,
    ActivitySubmission,
    Option,
    Question,
    Test,
    TestAttempt,
)


def _validate_own_class(value, serializer):
    """A `school_class` in a write payload must belong to the caller's active
    organization — it is a writable FK with a global queryset everywhere."""
    organization = request_active_organization(serializer.context.get("request"))
    if organization is None or value.organization_id != organization.pk:
        raise serializers.ValidationError("Bu sinf boshqa tashkilotga tegishli.")
    return value


def _validate_own_teacher(value, serializer):
    """The chosen teacher must hold a membership in the active organization."""
    organization = request_active_organization(serializer.context.get("request"))
    if organization is None or not value.user.organization_memberships.filter(
        organization=organization
    ).exists():
        raise serializers.ValidationError("Bu o'qituvchi boshqa tashkilotga tegishli.")
    return value


class OptionSerializer(serializers.ModelSerializer):
    """Deliberately excludes `is_correct` — this is what students see."""

    class Meta:
        model = Option
        fields = ("id", "text")


class OptionWriteSerializer(serializers.ModelSerializer):
    """Teacher/director view — includes `is_correct`."""

    class Meta:
        model = Option
        fields = ("id", "question", "text", "is_correct")

    def validate_question(self, value):
        user = self.context["request"].user
        if user.is_director:
            # A director may write options on their own tenant's tests only —
            # `value.test` belongs to an organization, not to the director.
            organization = request_active_organization(self.context.get("request"))
            if organization is None or value.test.organization_id != organization.pk:
                raise serializers.ValidationError("Bu savol boshqa tashkilotga tegishli.")
            return value
        profile = getattr(user, "teacher_profile", None)
        if not profile or value.test.teacher_id != profile.pk:
            raise serializers.ValidationError("You do not own this question's test.")
        return value


class QuestionSerializer(serializers.ModelSerializer):
    """Safe, answer-free view — nested inside `TestDetailSerializer` for students."""

    options = OptionSerializer(many=True, read_only=True)

    class Meta:
        model = Question
        fields = ("id", "text", "order", "options")


class QuestionWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ("id", "test", "text", "order")

    def validate_test(self, value):
        user = self.context["request"].user
        if not user.is_director:
            profile = getattr(user, "teacher_profile", None)
            if not profile or value.teacher_id != profile.pk:
                raise serializers.ValidationError("You do not own this test.")
        else:
            # A director drafts questions on their own tenant's tests only.
            organization = request_active_organization(self.context.get("request"))
            if organization is None or value.organization_id != organization.pk:
                raise serializers.ValidationError("Bu test boshqa tashkilotga tegishli.")

        # Only a new question can trip the cap — editing an existing one doesn't add to the count.
        if self.instance is None:
            weekly_lessons = TimetableSlot.objects.filter(
                school_class=value.school_class, subject=value.subject
            ).count()
            if (
                0 < weekly_lessons <= LOW_FREQUENCY_WEEKLY_LESSON_THRESHOLD
                and value.questions.count() >= LOW_FREQUENCY_QUESTION_CAP
            ):
                raise serializers.ValidationError(
                    f"Bu fan shu sinfda haftasiga {weekly_lessons} marta o'tiladi — "
                    f"test uchun ko'pi bilan {LOW_FREQUENCY_QUESTION_CAP} ta savol qo'shish mumkin."
                )
        return value


class TestListSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    school_class_name = serializers.CharField(source="school_class.name", read_only=True)
    teacher_name = serializers.SerializerMethodField()
    question_count = serializers.IntegerField(source="questions.count", read_only=True)
    max_questions = serializers.SerializerMethodField()

    class Meta:
        model = Test
        fields = (
            "id",
            "title",
            "subject",
            "subject_name",
            "school_class",
            "school_class_name",
            "teacher_name",
            "time_limit_minutes",
            "max_xp",
            "is_published",
            "question_count",
            "max_questions",
            "created_at",
        )

    def get_teacher_name(self, obj) -> str:
        return str(obj.teacher)

    def get_max_questions(self, obj) -> int | None:
        """None = no cap. Otherwise the low-weekly-frequency cap (see `QuestionWriteSerializer`)."""
        weekly_lessons = TimetableSlot.objects.filter(
            school_class_id=obj.school_class_id, subject_id=obj.subject_id
        ).count()
        if 0 < weekly_lessons <= LOW_FREQUENCY_WEEKLY_LESSON_THRESHOLD:
            return LOW_FREQUENCY_QUESTION_CAP
        return None


class TestDetailSerializer(TestListSerializer):
    """Read-only, answer-free view for anyone who can see the test (students included)."""

    questions = QuestionSerializer(many=True, read_only=True)

    class Meta(TestListSerializer.Meta):
        fields = (*TestListSerializer.Meta.fields, "description", "questions")


class TestWriteSerializer(serializers.ModelSerializer):
    """Teacher/director create+update — only the test's own scalar fields.
    Questions/options are managed through their own endpoints; publishing
    only through the `publish`/`unpublish` actions.
    """

    class Meta:
        model = Test
        fields = (
            "id",
            "title",
            "description",
            "subject",
            "school_class",
            "time_limit_minutes",
            "max_xp",
        )

    def validate_school_class(self, value):
        return _validate_own_class(value, self)


class TestGenerateSerializer(serializers.Serializer):
    """Input for `TestViewSet.generate` — an AI-drafted test from a topic.

    `teacher` is only meaningful for a director caller (who has no
    `teacher_profile` of their own and must say which teacher this test
    belongs to) — a teacher caller's own profile is always used instead,
    regardless of what's sent here (see `TestViewSet.generate`).
    """

    title = serializers.CharField(max_length=255)
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())
    school_class = serializers.PrimaryKeyRelatedField(queryset=SchoolClass.objects.all())
    teacher = serializers.PrimaryKeyRelatedField(queryset=TeacherProfile.objects.all(), required=False)
    topic = serializers.CharField(max_length=255)
    question_count = serializers.IntegerField(min_value=3, max_value=20, default=10)
    max_xp = serializers.IntegerField(min_value=1, default=100)
    time_limit_minutes = serializers.IntegerField(min_value=1, required=False, allow_null=True)

    def validate_school_class(self, value):
        return _validate_own_class(value, self)

    def validate_teacher(self, value):
        return _validate_own_teacher(value, self)


class TestAttemptResultSerializer(serializers.ModelSerializer):
    test_title = serializers.CharField(source="test.title", read_only=True)
    student_name = serializers.SerializerMethodField()

    class Meta:
        model = TestAttempt
        fields = (
            "id",
            "test",
            "test_title",
            "student",
            "student_name",
            "status",
            "started_at",
            "submitted_at",
            "score_percent",
            "xp_awarded",
        )
        read_only_fields = fields

    def get_student_name(self, obj) -> str:
        return str(obj.student)


class TestAnswerInputSerializer(serializers.Serializer):
    question = serializers.PrimaryKeyRelatedField(queryset=Question.objects.all())
    selected_option = serializers.PrimaryKeyRelatedField(queryset=Option.objects.all())

    def validate(self, attrs):
        if attrs["selected_option"].question_id != attrs["question"].id:
            raise serializers.ValidationError("selected_option does not belong to question.")
        return attrs


class TestSubmitSerializer(serializers.Serializer):
    answers = TestAnswerInputSerializer(many=True, allow_empty=False)


class ActivityListSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    school_class_name = serializers.CharField(source="school_class.name", read_only=True)
    teacher_name = serializers.SerializerMethodField()
    submission_count = serializers.IntegerField(source="submissions.count", read_only=True)

    class Meta:
        model = Activity
        fields = (
            "id",
            "title",
            "subject",
            "subject_name",
            "school_class",
            "school_class_name",
            "teacher_name",
            "activity_type",
            "max_xp",
            "start_date",
            "end_date",
            "status",
            "submission_count",
            "created_at",
        )

    def get_teacher_name(self, obj) -> str:
        return str(obj.teacher)


class ActivityDetailSerializer(ActivityListSerializer):
    class Meta(ActivityListSerializer.Meta):
        fields = (*ActivityListSerializer.Meta.fields, "description")


class ActivityWriteSerializer(serializers.ModelSerializer):
    """Only the activity's own scalar fields — publishing/closing happens
    only through the `publish`/`close` actions, same rule as `Test`.
    """

    class Meta:
        model = Activity
        fields = (
            "id",
            "title",
            "description",
            "subject",
            "school_class",
            "activity_type",
            "max_xp",
            "start_date",
            "end_date",
        )

    def validate_school_class(self, value):
        return _validate_own_class(value, self)


class ActivityResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityResult
        fields = ("score_percent", "xp_awarded", "feedback", "graded_at")
        read_only_fields = fields


class ActivitySubmissionSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    activity_title = serializers.CharField(source="activity.title", read_only=True)
    result = ActivityResultSerializer(read_only=True)

    class Meta:
        model = ActivitySubmission
        fields = (
            "id",
            "activity",
            "activity_title",
            "student",
            "student_name",
            "content",
            "attachment",
            "submitted_at",
            "result",
        )
        read_only_fields = fields

    def get_student_name(self, obj) -> str:
        return str(obj.student)


class ActivitySubmissionInputSerializer(serializers.Serializer):
    content = serializers.CharField(required=False, allow_blank=True, default="")
    attachment = serializers.FileField(required=False, allow_null=True)

    def validate(self, attrs):
        if not attrs.get("content") and not attrs.get("attachment"):
            raise serializers.ValidationError("Submit either content or an attachment.")
        return attrs


class ActivityGradeSerializer(serializers.Serializer):
    score_percent = serializers.FloatField(min_value=0, max_value=100)
    feedback = serializers.CharField(required=False, allow_blank=True, default="")
