from django.conf import settings
from rest_framework import serializers

from .models import TelegramLinkCode


class TelegramLinkCodeSerializer(serializers.ModelSerializer):
    bot_username = serializers.SerializerMethodField()

    class Meta:
        model = TelegramLinkCode
        fields = ("code", "expires_at", "bot_username")

    def get_bot_username(self, obj) -> str:
        return settings.TELEGRAM_BOT_USERNAME


class TelegramStatusSerializer(serializers.Serializer):
    linked = serializers.BooleanField()
    telegram_username = serializers.CharField(allow_null=True)
