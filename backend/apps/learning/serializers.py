from rest_framework import serializers

from .models import (
    Activity,
    ActivityResult,
    ActivitySubmission,
    Option,
    Question,
    Test,
    TestAttempt,
)


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
        if user.is_director:
            return value
        profile = getattr(user, "teacher_profile", None)
        if not profile or value.teacher_id != profile.pk:
            raise serializers.ValidationError("You do not own this test.")
        return value


class TestListSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    school_class_name = serializers.CharField(source="school_class.name", read_only=True)
    teacher_name = serializers.SerializerMethodField()
    question_count = serializers.IntegerField(source="questions.count", read_only=True)

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
            "created_at",
        )

    def get_teacher_name(self, obj) -> str:
        return str(obj.teacher)


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
