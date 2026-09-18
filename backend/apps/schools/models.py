from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import TimeStampedModel


class SchoolClass(TimeStampedModel):
    """A class of students, e.g. '9-V'."""

    name = models.CharField(_("name"), max_length=50, unique=True)
    class_teacher = models.ForeignKey(
        "users.TeacherProfile",
        verbose_name=_("class teacher"),
        related_name="led_classes",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    total_xp = models.PositiveIntegerField(
        _("total XP"),
        default=0,
        help_text=_("Never edit directly — only apps.gamification.services.award_xp may change this."),
    )

    class Meta:
        verbose_name = _("school class")
        verbose_name_plural = _("school classes")
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name
