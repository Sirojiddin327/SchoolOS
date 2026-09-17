from typing import ClassVar

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import TimeStampedModel


class Attendance(TimeStampedModel):
    class Status(models.TextChoices):
        PRESENT = "PRESENT", _("Present")
        LATE = "LATE", _("Late")
        ABSENT = "ABSENT", _("Absent")
        EXCUSED = "EXCUSED", _("Excused")

    lesson = models.ForeignKey(
        "academics.Lesson",
        verbose_name=_("lesson"),
        related_name="attendance_records",
        on_delete=models.CASCADE,
    )
    student = models.ForeignKey(
        "users.StudentProfile",
        verbose_name=_("student"),
        related_name="attendance_records",
        on_delete=models.CASCADE,
    )
    status = models.CharField(_("status"), max_length=20, choices=Status.choices)
    marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("marked by"),
        related_name="marked_attendance_records",
        null=True,
        on_delete=models.SET_NULL,
    )

    class Meta:
        verbose_name = _("attendance record")
        verbose_name_plural = _("attendance records")
        ordering = ("-lesson__date", "-lesson__start_time")
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(
                fields=["lesson", "student"], name="unique_attendance_per_lesson"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.student} — {self.lesson} — {self.status}"
