from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import TimeStampedModel


class Notification(TimeStampedModel):
    class Category(models.TextChoices):
        GENERAL = "GENERAL", _("General")
        ATTENDANCE = "ATTENDANCE", _("Attendance")

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("recipient"),
        related_name="notifications",
        on_delete=models.CASCADE,
    )
    title = models.CharField(_("title"), max_length=255)
    body = models.TextField(_("body"))
    category = models.CharField(
        _("category"), max_length=20, choices=Category.choices, default=Category.GENERAL
    )
    is_read = models.BooleanField(_("is read"), default=False)

    class Meta:
        verbose_name = _("notification")
        verbose_name_plural = _("notifications")
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.title} -> {self.recipient}"
