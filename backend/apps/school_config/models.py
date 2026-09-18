from datetime import date, datetime, time, timedelta

from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import TimeStampedModel


class SchoolTimeSettings(TimeStampedModel):
    """Singleton: school-day timing.

    `start_time`/`end_time` gate the School Time Lock (see middleware.py).
    The period-timing fields let the timetable auto-compute each period's
    start/end time from just a period number, instead of the director typing
    times for every single slot.
    """

    start_time = models.TimeField(_("school start time"), default=time(8, 0))
    end_time = models.TimeField(_("school end time"), default=time(13, 10))

    period_duration_minutes = models.PositiveSmallIntegerField(
        _("period duration (minutes)"), default=45
    )
    short_break_minutes = models.PositiveSmallIntegerField(_("short break (minutes)"), default=5)
    long_break_after_period = models.PositiveSmallIntegerField(
        _("long break after period"), default=4
    )
    long_break_minutes = models.PositiveSmallIntegerField(_("long break (minutes)"), default=20)

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

    def period_times(self, period_number: int) -> tuple[time, time]:
        """Start/end time of the Nth period, counting breaks since `start_time`."""
        # The date is an arbitrary anchor — only the resulting .time() is used.
        current = datetime.combine(date(2000, 1, 1), self.start_time)
        for period in range(1, period_number):
            current += timedelta(minutes=self.period_duration_minutes)
            break_minutes = (
                self.long_break_minutes
                if period == self.long_break_after_period
                else self.short_break_minutes
            )
            current += timedelta(minutes=break_minutes)
        period_start = current.time()
        period_end = (current + timedelta(minutes=self.period_duration_minutes)).time()
        return period_start, period_end
