from django.contrib import admin

from .models import Attendance


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ("student", "lesson", "status", "marked_by")
    list_filter = ("status", "lesson__school_class", "lesson__subject")
    search_fields = (
        "student__user__email",
        "student__user__first_name",
        "student__user__last_name",
    )
    autocomplete_fields = ("lesson", "student", "marked_by")
