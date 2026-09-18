from django.contrib import admin

from .models import (
    Activity,
    ActivityResult,
    ActivitySubmission,
    Option,
    Question,
    Test,
    TestAnswer,
    TestAttempt,
)


class OptionInline(admin.TabularInline):
    model = Option
    extra = 2


class QuestionInline(admin.TabularInline):
    model = Question
    extra = 1


@admin.register(Test)
class TestAdmin(admin.ModelAdmin):
    list_display = ("title", "subject", "school_class", "teacher", "max_xp", "is_published")
    list_filter = ("is_published", "subject", "school_class")
    search_fields = ("title",)
    autocomplete_fields = ("subject", "school_class", "teacher")
    inlines = (QuestionInline,)


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("test", "text", "order")
    search_fields = ("text",)
    autocomplete_fields = ("test",)
    inlines = (OptionInline,)


@admin.register(TestAttempt)
class TestAttemptAdmin(admin.ModelAdmin):
    list_display = ("test", "student", "status", "score_percent", "xp_awarded")
    list_filter = ("status",)
    search_fields = ("test__title", "student__user__email")
    autocomplete_fields = ("test", "student")


@admin.register(TestAnswer)
class TestAnswerAdmin(admin.ModelAdmin):
    list_display = ("attempt", "question", "selected_option")
    autocomplete_fields = ("attempt", "question", "selected_option")


@admin.register(Option)
class OptionAdmin(admin.ModelAdmin):
    list_display = ("question", "text", "is_correct")
    search_fields = ("text",)
    autocomplete_fields = ("question",)


class ActivityResultInline(admin.StackedInline):
    model = ActivityResult
    extra = 0


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ("title", "activity_type", "subject", "school_class", "teacher", "max_xp", "status")
    list_filter = ("status", "activity_type", "subject", "school_class")
    search_fields = ("title",)
    autocomplete_fields = ("subject", "school_class", "teacher")


@admin.register(ActivitySubmission)
class ActivitySubmissionAdmin(admin.ModelAdmin):
    list_display = ("activity", "student", "submitted_at")
    search_fields = ("activity__title", "student__user__email")
    autocomplete_fields = ("activity", "student")
    inlines = (ActivityResultInline,)
