from django.contrib import admin

from .models import TelegramAccount, TelegramLinkCode


@admin.register(TelegramAccount)
class TelegramAccountAdmin(admin.ModelAdmin):
    list_display = ("user", "telegram_id", "telegram_username", "created_at")
    search_fields = ("user__email", "telegram_username")


@admin.register(TelegramLinkCode)
class TelegramLinkCodeAdmin(admin.ModelAdmin):
    list_display = ("code", "user", "expires_at", "used_at")
    search_fields = ("code", "user__email")
