from typing import ClassVar

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import TimeStampedModel


class Test(TimeStampedModel):
    """A teacher-authored quiz for one class. The teacher sets `max_xp`; the
    actual XP a student earns is always `max_xp * score_percent / 100`,
    computed server-side in `services.grade_attempt` — never entered by hand.
    """

    title = models.CharField(_("title"), max_length=255)
    description = models.TextField(_("description"), blank=True)
    subject = models.ForeignKey(
        "academics.Subject", verbose_name=_("subject"), related_name="tests", on_delete=models.PROTECT
    )
    school_class = models.ForeignKey(
        "schools.SchoolClass", verbose_name=_("class"), related_name="tests", on_delete=models.CASCADE
    )
    teacher = models.ForeignKey(
        "users.TeacherProfile", verbose_name=_("teacher"), related_name="tests", on_delete=models.PROTECT
    )
    time_limit_minutes = models.PositiveSmallIntegerField(
        _("time limit (minutes)"), null=True, blank=True, help_text=_("Blank = no time limit.")
    )
    max_xp = models.PositiveSmallIntegerField(_("maximum XP"), default=100)
    is_published = models.BooleanField(_("published"), default=False)

    class Meta:
        verbose_name = _("test")
        verbose_name_plural = _("tests")
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.title


class Question(TimeStampedModel):
    test = models.ForeignKey(Test, verbose_name=_("test"), related_name="questions", on_delete=models.CASCADE)
    text = models.TextField(_("text"))
    order = models.PositiveSmallIntegerField(_("order"), default=0)

    class Meta:
        verbose_name = _("question")
        verbose_name_plural = _("questions")
        ordering = ("order", "id")

    def __str__(self) -> str:
        return f"{self.test} — Q{self.order}"


class Option(TimeStampedModel):
    question = models.ForeignKey(
        Question, verbose_name=_("question"), related_name="options", on_delete=models.CASCADE
    )
    text = models.CharField(_("text"), max_length=255)
    is_correct = models.BooleanField(_("is correct"), default=False)

    class Meta:
        verbose_name = _("option")
        verbose_name_plural = _("options")
        ordering = ("id",)

    def __str__(self) -> str:
        return self.text


class TestAttempt(TimeStampedModel):
    """One row per (test, student), ever — the unique constraint below is what
    prevents retakes/duplicate submissions.
    """

    class Status(models.TextChoices):
        IN_PROGRESS = "IN_PROGRESS", _("In progress")
        SUBMITTED = "SUBMITTED", _("Submitted")

    test = models.ForeignKey(Test, verbose_name=_("test"), related_name="attempts", on_delete=models.CASCADE)
    student = models.ForeignKey(
        "users.StudentProfile",
        verbose_name=_("student"),
        related_name="test_attempts",
        on_delete=models.CASCADE,
    )
    status = models.CharField(
        _("status"), max_length=20, choices=Status.choices, default=Status.IN_PROGRESS
    )
    started_at = models.DateTimeField(_("started at"), auto_now_add=True)
    submitted_at = models.DateTimeField(_("submitted at"), null=True, blank=True)
    score_percent = models.FloatField(_("score (%)"), null=True, blank=True)
    xp_awarded = models.PositiveSmallIntegerField(_("XP awarded"), null=True, blank=True)

    class Meta:
        verbose_name = _("test attempt")
        verbose_name_plural = _("test attempts")
        ordering = ("-started_at",)
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["test", "student"], name="unique_test_attempt"),
        ]

    def __str__(self) -> str:
        return f"{self.student} — {self.test} ({self.status})"


class TestAnswer(TimeStampedModel):
    attempt = models.ForeignKey(
        TestAttempt, verbose_name=_("attempt"), related_name="answers", on_delete=models.CASCADE
    )
    question = models.ForeignKey(Question, verbose_name=_("question"), on_delete=models.CASCADE)
    selected_option = models.ForeignKey(Option, verbose_name=_("selected option"), on_delete=models.CASCADE)

    class Meta:
        verbose_name = _("test answer")
        verbose_name_plural = _("test answers")
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["attempt", "question"], name="unique_attempt_question_answer"),
        ]

    def __str__(self) -> str:
        return f"{self.attempt} — {self.question}"


class Activity(TimeStampedModel):
    """A non-test assignment — the generic slot for whatever gamified thing
    isn't a multiple-choice `Test`: an assignment, a typing/coding challenge,
    a sports drill, a practical task, etc. Unlike `Test`, an `Activity` isn't
    auto-graded — a teacher scores each submission by hand, and XP is still
    always computed from that score, never entered directly (see
    `services.grade_submission`).
    """

    class ActivityType(models.TextChoices):
        ASSIGNMENT = "ASSIGNMENT", _("Assignment")
        CHALLENGE = "CHALLENGE", _("Challenge")
        TYPING = "TYPING", _("Typing")
        PRACTICAL = "PRACTICAL", _("Practical")
        SPORTS = "SPORTS", _("Sports")

    class Status(models.TextChoices):
        DRAFT = "DRAFT", _("Draft")
        PUBLISHED = "PUBLISHED", _("Published")
        CLOSED = "CLOSED", _("Closed")

    title = models.CharField(_("title"), max_length=255)
    description = models.TextField(_("description"), blank=True)
    subject = models.ForeignKey(
        "academics.Subject", verbose_name=_("subject"), related_name="activities", on_delete=models.PROTECT
    )
    school_class = models.ForeignKey(
        "schools.SchoolClass", verbose_name=_("class"), related_name="activities", on_delete=models.CASCADE
    )
    teacher = models.ForeignKey(
        "users.TeacherProfile", verbose_name=_("teacher"), related_name="activities", on_delete=models.PROTECT
    )
    activity_type = models.CharField(_("activity type"), max_length=20, choices=ActivityType.choices)
    max_xp = models.PositiveSmallIntegerField(_("maximum XP"), default=100)
    start_date = models.DateField(_("start date"), null=True, blank=True)
    end_date = models.DateField(_("end date"), null=True, blank=True)
    status = models.CharField(_("status"), max_length=20, choices=Status.choices, default=Status.DRAFT)

    class Meta:
        verbose_name = _("activity")
        verbose_name_plural = _("activities")
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.title

    def is_open_for_submissions(self, today) -> bool:
        if self.status != self.Status.PUBLISHED:
            return False
        if self.start_date and today < self.start_date:
            return False
        return not (self.end_date and today > self.end_date)


class ActivitySubmission(TimeStampedModel):
    """One row per (activity, student), ever — same one-shot rule as `TestAttempt`."""

    activity = models.ForeignKey(
        Activity, verbose_name=_("activity"), related_name="submissions", on_delete=models.CASCADE
    )
    student = models.ForeignKey(
        "users.StudentProfile",
        verbose_name=_("student"),
        related_name="activity_submissions",
        on_delete=models.CASCADE,
    )
    content = models.TextField(_("content"), blank=True)
    attachment = models.FileField(_("attachment"), upload_to="activity_submissions/%Y/%m/", blank=True)
    submitted_at = models.DateTimeField(_("submitted at"), auto_now_add=True)

    class Meta:
        verbose_name = _("activity submission")
        verbose_name_plural = _("activity submissions")
        ordering = ("-submitted_at",)
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["activity", "student"], name="unique_activity_submission"),
        ]

    def __str__(self) -> str:
        return f"{self.student} — {self.activity}"


class ActivityResult(TimeStampedModel):
    """The graded outcome of a submission — kept separate from `ActivitySubmission`
    so 'what the student sent in' and 'how it was scored' are two auditable things.
    """

    submission = models.OneToOneField(
        ActivitySubmission, verbose_name=_("submission"), related_name="result", on_delete=models.CASCADE
    )
    score_percent = models.FloatField(_("score (%)"))
    xp_awarded = models.PositiveSmallIntegerField(_("XP awarded"))
    feedback = models.TextField(_("feedback"), blank=True)
    graded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name=_("graded by"), on_delete=models.SET_NULL, null=True
    )
    graded_at = models.DateTimeField(_("graded at"), auto_now_add=True)

    class Meta:
        verbose_name = _("activity result")
        verbose_name_plural = _("activity results")

    def __str__(self) -> str:
        return f"{self.submission} — {self.score_percent}%"
