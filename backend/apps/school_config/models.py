from datetime import time

from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import TimeStampedModel


class SchoolTimeSettings(TimeStampedModel):
    """Singleton: the daily window during which students may not use the web platform."""

    start_time = models.TimeField(_("school start time"), default=time(8, 0))
    end_time = models.TimeField(_("school end time"), default=time(13, 10))

    class Meta:
        verbose_name = _("school time settings")
        verbose_name_plural = _("school time settings")

    def __str__(self) -> str:
        return f"{self.start_time:%H:%M}–{self.end_time:%H:%M}"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        return None

    @classmethod
    def get_solo(cls) -> "SchoolTimeSettings":
        obj, _created = cls.objects.get_or_create(pk=1)
        return obj

    def is_locked_at(self, current_time) -> bool:
        if self.start_time <= self.end_time:
            return self.start_time <= current_time < self.end_time
        return current_time >= self.start_time or current_time < self.end_time
