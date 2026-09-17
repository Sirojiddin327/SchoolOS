from rest_framework import serializers

from apps.academics.models import Lesson
from apps.users.models import StudentProfile

from .models import Attendance


class AttendanceSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source="lesson.subject.name", read_only=True)
    school_class_name = serializers.CharField(source="lesson.school_class.name", read_only=True)
    lesson_date = serializers.DateField(source="lesson.date", read_only=True)
    marked_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Attendance
        fields = (
            "id",
            "lesson",
            "subject_name",
            "school_class_name",
            "lesson_date",
            "student",
            "student_name",
            "status",
            "marked_by",
            "marked_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_student_name(self, obj) -> str:
        return str(obj.student)

    def get_marked_by_name(self, obj) -> str | None:
        return str(obj.marked_by) if obj.marked_by else None


class AttendanceRecordInputSerializer(serializers.Serializer):
    student = serializers.PrimaryKeyRelatedField(queryset=StudentProfile.objects.all())
    status = serializers.ChoiceField(choices=Attendance.Status.choices)


class BulkMarkAttendanceSerializer(serializers.Serializer):
    lesson = serializers.PrimaryKeyRelatedField(queryset=Lesson.objects.all())
    records = AttendanceRecordInputSerializer(many=True, allow_empty=False)

    def validate(self, attrs):
        lesson = attrs["lesson"]
        class_student_ids = set(lesson.school_class.students.values_list("id", flat=True))
        submitted_ids = [record["student"].id for record in attrs["records"]]

        if len(submitted_ids) != len(set(submitted_ids)):
            raise serializers.ValidationError("Duplicate student in the same request.")

        outside_class = set(submitted_ids) - class_student_ids
        if outside_class:
            raise serializers.ValidationError(
                f"Students not in {lesson.school_class}: {sorted(outside_class)}"
            )
        return attrs
