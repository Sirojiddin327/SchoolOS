from django.contrib import admin

from .models import Lesson, LessonReminder, Subject, TimetableSlot


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ("subject", "school_class", "teacher", "date", "start_time", "end_time", "room")
    list_filter = ("subject", "school_class", "date")
    search_fields = ("topic", "room")
    autocomplete_fields = ("subject", "school_class", "teacher")
    date_hierarchy = "date"


@admin.register(TimetableSlot)
class TimetableSlotAdmin(admin.ModelAdmin):
    list_display = ("school_class", "day_of_week", "period_number", "subject", "teacher", "room")
    list_filter = ("day_of_week", "school_class", "subject")
    autocomplete_fields = ("subject", "school_class", "teacher")


@admin.register(LessonReminder)
class LessonReminderAdmin(admin.ModelAdmin):
    list_display = ("lesson", "sent_at")
    autocomplete_fields = ("lesson",)
