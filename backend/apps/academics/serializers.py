from rest_framework import serializers

from apps.common.tenancy import request_active_organization

from .models import Lesson, Subject, TimetableSlot


def _validate_own_class(value, serializer, *, field: str = "Bu sinf"):
    """A `school_class` written through the API must belong to the caller's
    active organization — both Lesson and TimetableSlot take it as a writable
    FK, and its PK alone says nothing about which tenant it lives in."""
    organization = request_active_organization(serializer.context.get("request"))
    if organization is None or value.organization_id != organization.pk:
        raise serializers.ValidationError(f"{field} boshqa tashkilotga tegishli.")
    return value


def _validate_own_teacher(value, serializer):
    """The assigned teacher must actually teach in the active organization;
    `teacher` is a writable FK with a global queryset, so without this a
    director could book a stranger from another school."""
    organization = request_active_organization(serializer.context.get("request"))
    if organization is None or not value.user.organization_memberships.filter(
        organization=organization
    ).exists():
        raise serializers.ValidationError("Bu o'qituvchi boshqa tashkilotga tegishli.")
    return value


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ("id", "name")


class LessonSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    school_class_name = serializers.CharField(source="school_class.name", read_only=True)
    teacher_name = serializers.SerializerMethodField()
    secondary_teacher_name = serializers.CharField(source="secondary_teacher", read_only=True)

    class Meta:
        model = Lesson
        fields = (
            "id",
            "subject",
            "subject_name",
            "school_class",
            "school_class_name",
            "teacher",
            "teacher_name",
            "secondary_teacher",
            "secondary_teacher_name",
            "date",
            "start_time",
            "end_time",
            "room",
            "topic",
        )

    def get_teacher_name(self, obj) -> str:
        return str(obj.teacher)

    def validate(self, attrs):
        start_time = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end_time = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start_time and end_time and end_time <= start_time:
            raise serializers.ValidationError({"end_time": "End time must be after start time."})
        return attrs

    def validate_school_class(self, value):
        return _validate_own_class(value, self)

    def validate_teacher(self, value):
        return _validate_own_teacher(value, self)

    def validate_secondary_teacher(self, value):
        return _validate_own_teacher(value, self)


class TimetableSlotSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    school_class_name = serializers.CharField(source="school_class.name", read_only=True)
    teacher_name = serializers.CharField(source="teacher_label", read_only=True)
    secondary_teacher_name = serializers.CharField(source="secondary_teacher", read_only=True)
    day_of_week_display = serializers.CharField(source="get_day_of_week_display", read_only=True)

    class Meta:
        model = TimetableSlot
        fields = (
            "id",
            "school_class",
            "school_class_name",
            "subject",
            "subject_name",
            "teacher",
            "teacher_name",
            "secondary_teacher",
            "secondary_teacher_name",
            "day_of_week",
            "day_of_week_display",
            "period_number",
            "room",
        )

    def get_teacher_name(self, obj) -> str:
        return str(obj.teacher)

    def validate_school_class(self, value):
        return _validate_own_class(value, self)

    def validate_teacher(self, value):
        return _validate_own_teacher(value, self)

    def validate_secondary_teacher(self, value):
        return _validate_own_teacher(value, self)


class GenerateLessonsSerializer(serializers.Serializer):
    week_start = serializers.DateField()
