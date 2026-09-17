import django_filters

from .models import Attendance


class AttendanceFilter(django_filters.FilterSet):
    date = django_filters.DateFilter(field_name="lesson__date")
    date_from = django_filters.DateFilter(field_name="lesson__date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="lesson__date", lookup_expr="lte")
    school_class = django_filters.NumberFilter(field_name="lesson__school_class_id")
    subject = django_filters.NumberFilter(field_name="lesson__subject_id")
    teacher = django_filters.NumberFilter(field_name="lesson__teacher_id")

    class Meta:
        model = Attendance
        fields = ("lesson", "student", "status", "date", "school_class", "subject", "teacher")
