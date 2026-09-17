from django.contrib import admin

from .models import Lesson, Subject


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
