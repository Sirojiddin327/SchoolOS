import django_filters

from .models import Lesson


class LessonFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="date", lookup_expr="lte")

    class Meta:
        model = Lesson
        fields = ("subject", "school_class", "teacher", "date")
