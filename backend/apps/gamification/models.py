from typing import ClassVar

from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import TimeStampedModel


class XPTransaction(TimeStampedModel):
    """An immutable ledger entry. `StudentProfile.total_xp` is a running sum of
    these — never edit it directly anywhere except `services.award_xp`, which
    is what keeps every XP change auditable back to its source.
    """

    class Source(models.TextChoices):
        TEST = "TEST", _("Test")
        ACTIVITY = "ACTIVITY", _("Activity")

    student = models.ForeignKey(
        "users.StudentProfile",
        verbose_name=_("student"),
        related_name="xp_transactions",
        on_delete=models.CASCADE,
    )
    amount = models.PositiveIntegerField(_("amount"))
    source = models.CharField(_("source"), max_length=20, choices=Source.choices)
    reason = models.CharField(_("reason"), max_length=255)

    # Points at whichever thing granted the XP (a Test today, an Activity later)
    # without XPTransaction needing a new nullable FK for every new XP source.
    content_type = models.ForeignKey(
        ContentType, null=True, blank=True, on_delete=models.SET_NULL
    )
    object_id = models.PositiveIntegerField(null=True, blank=True)
    related_object = GenericForeignKey("content_type", "object_id")

    class Meta:
        verbose_name = _("XP transaction")
        verbose_name_plural = _("XP transactions")
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.student} +{self.amount} XP ({self.source})"


class Achievement(TimeStampedModel):
    """A definition, e.g. 'Perfect Score'. Unlocking is data-driven via
    `condition_type` + `condition_value`, checked by
    `services.CONDITION_CHECKS` — adding a new achievement that reuses an
    existing condition shape is just a new row, no code change.
    """

    class ConditionType(models.TextChoices):
        FIRST_TEST = "FIRST_TEST", _("Complete your first test")
        PERFECT_SCORE = "PERFECT_SCORE", _("Score 100% on a test")
        XP_THRESHOLD = "XP_THRESHOLD", _("Reach a total XP threshold")
        STREAK_LENGTH = "STREAK_LENGTH", _("Reach a streak length")

    name = models.CharField(_("name"), max_length=100, unique=True)
    description = models.CharField(_("description"), max_length=255)
    icon = models.CharField(_("icon"), max_length=10, blank=True)
    condition_type = models.CharField(
        _("condition type"), max_length=20, choices=ConditionType.choices
    )
    condition_value = models.PositiveIntegerField(
        _("condition value"),
        default=0,
        help_text=_("Meaning depends on condition_type, e.g. an XP or streak-day threshold."),
    )
    is_active = models.BooleanField(_("active"), default=True)

    class Meta:
        verbose_name = _("achievement")
        verbose_name_plural = _("achievements")
        ordering = ("condition_type", "condition_value")

    def __str__(self) -> str:
        return self.name


class StudentAchievement(TimeStampedModel):
    student = models.ForeignKey(
        "users.StudentProfile",
        verbose_name=_("student"),
        related_name="unlocked_achievements",
        on_delete=models.CASCADE,
    )
    achievement = models.ForeignKey(
        Achievement,
        verbose_name=_("achievement"),
        related_name="unlocks",
        on_delete=models.CASCADE,
    )
    unlocked_at = models.DateTimeField(_("unlocked at"), auto_now_add=True)

    class Meta:
        verbose_name = _("student achievement")
        verbose_name_plural = _("student achievements")
        ordering = ("-unlocked_at",)
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(
                fields=["student", "achievement"], name="unique_student_achievement"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.student} unlocked {self.achievement}"


class Streak(TimeStampedModel):
    student = models.OneToOneField(
        "users.StudentProfile",
        verbose_name=_("student"),
        related_name="streak",
        on_delete=models.CASCADE,
    )
    current_streak = models.PositiveIntegerField(_("current streak"), default=0)
    longest_streak = models.PositiveIntegerField(_("longest streak"), default=0)
    last_activity_date = models.DateField(_("last activity date"), null=True, blank=True)

    class Meta:
        verbose_name = _("streak")
        verbose_name_plural = _("streaks")

    def __str__(self) -> str:
        return f"{self.student}: {self.current_streak} day streak"
