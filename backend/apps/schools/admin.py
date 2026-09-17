from django.contrib import admin

from .models import SchoolClass


@admin.register(SchoolClass)
class SchoolClassAdmin(admin.ModelAdmin):
    list_display = ("name", "class_teacher")
    search_fields = ("name",)
    autocomplete_fields = ("class_teacher",)
