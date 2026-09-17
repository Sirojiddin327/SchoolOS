from django.contrib import admin

from .models import SchoolTimeSettings


@admin.register(SchoolTimeSettings)
class SchoolTimeSettingsAdmin(admin.ModelAdmin):
    list_display = ("start_time", "end_time")

    def has_add_permission(self, request):
        return not SchoolTimeSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
