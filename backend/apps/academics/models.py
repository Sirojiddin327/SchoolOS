from typing import ClassVar

from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import TimeStampedModel


class Subject(TimeStampedModel):
    name = models.CharField(_("name"), max_length=100, unique=True)

    class Meta:
        verbose_name = _("subject")
        verbose_name_plural = _("subjects")
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name


class Lesson(TimeStampedModel):
    subject = models.ForeignKey(
        Subject,
        verbose_name=_("subject"),
        related_name="lessons",
        on_delete=models.PROTECT,
    )
    school_class = models.ForeignKey(
        "schools.SchoolClass",
        verbose_name=_("class"),
        related_name="lessons",
        on_delete=models.CASCADE,
    )
    teacher = models.ForeignKey(
        "users.TeacherProfile",
        verbose_name=_("teacher"),
        related_name="lessons",
        on_delete=models.PROTECT,
    )
    date = models.DateField(_("date"))
    start_time = models.TimeField(_("start time"))
    end_time = models.TimeField(_("end time"))
    room = models.CharField(_("room"), max_length=50, blank=True)
    topic = models.CharField(_("topic"), max_length=255, blank=True)

    class Meta:
        verbose_name = _("lesson")
        verbose_name_plural = _("lessons")
        ordering = ("date", "start_time")
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(
                fields=["school_class", "date", "start_time"],
                name="unique_class_timeslot",
            ),
            models.UniqueConstraint(
                fields=["teacher", "date", "start_time"],
                name="unique_teacher_timeslot",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.subject} — {self.school_class} ({self.date})"

    def clean(self):
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError({"end_time": _("End time must be after start time.")})
