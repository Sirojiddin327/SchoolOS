from rest_framework import serializers

from .models import SchoolTimeSettings


class SchoolTimeSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolTimeSettings
        fields = ("start_time", "end_time")
