from rest_framework import serializers

from .models import SchoolTimeSettings


class SchoolTimeSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolTimeSettings
        fields = (
            "start_time",
            "end_time",
            "period_duration_minutes",
            "short_break_minutes",
            "long_break_after_period",
            "long_break_minutes",
        )
