from typing import ClassVar

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import OrganizationScopedMixin, TimeStampedModel


class Attendance(OrganizationScopedMixin, TimeStampedModel):
    organization_source = "lesson.organization"

    class Status(models.TextChoices):
        PRESENT = "PRESENT", _("Present")
        LATE = "LATE", _("Late")
        ABSENT = "ABSENT", _("Absent")
        EXCUSED = "EXCUSED", _("Excused")

    organization = models.ForeignKey(
        "organizations.Organization",
        verbose_name=_("organization"),
        related_name="attendance_records",
        on_delete=models.CASCADE,
    )
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


class AttendanceReminder(OrganizationScopedMixin, TimeStampedModel):
    """Send-once guard for the "attendance was never taken" reminder a lesson's
    teacher gets ~10 minutes before the lesson ends. Celery Beat re-runs the
    scan every couple of minutes, so a lesson's reminder window can fall inside
    more than one run — this row is what stops the same lesson being pinged twice.
    """

    organization_source = "lesson.organization"

    organization = models.ForeignKey(
        "organizations.Organization",
        verbose_name=_("organization"),
        related_name="attendance_reminders",
        on_delete=models.CASCADE,
    )
    lesson = models.OneToOneField(
        "academics.Lesson",
        verbose_name=_("lesson"),
        related_name="attendance_reminder",
        on_delete=models.CASCADE,
    )
    sent_at = models.DateTimeField(_("sent at"), auto_now_add=True)

    class Meta:
        verbose_name = _("unmarked attendance reminder")
        verbose_name_plural = _("unmarked attendance reminders")

    def __str__(self) -> str:
        return f"Attendance reminder sent for {self.lesson}"
