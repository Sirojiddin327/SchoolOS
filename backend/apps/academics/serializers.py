from rest_framework import serializers

from .models import Lesson, Subject


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ("id", "name")


class LessonSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    school_class_name = serializers.CharField(source="school_class.name", read_only=True)
    teacher_name = serializers.SerializerMethodField()

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
