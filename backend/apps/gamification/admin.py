from django.contrib import admin

from .models import Achievement, Streak, StudentAchievement, XPTransaction


@admin.register(XPTransaction)
class XPTransactionAdmin(admin.ModelAdmin):
    list_display = ("student", "amount", "source", "created_at")
    list_filter = ("source",)
    search_fields = ("student__user__email", "reason")
    autocomplete_fields = ("student",)


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ("name", "condition_type", "condition_value", "is_active")
    list_filter = ("condition_type", "is_active")
    search_fields = ("name",)


@admin.register(StudentAchievement)
class StudentAchievementAdmin(admin.ModelAdmin):
    list_display = ("student", "achievement", "unlocked_at")
    autocomplete_fields = ("student", "achievement")


@admin.register(Streak)
class StreakAdmin(admin.ModelAdmin):
    list_display = ("student", "current_streak", "longest_streak", "last_activity_date")
    autocomplete_fields = ("student",)
