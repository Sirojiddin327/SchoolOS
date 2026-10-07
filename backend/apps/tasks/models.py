from typing import ClassVar

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import OrganizationScopedMixin, TimeStampedModel


class TeacherTask(OrganizationScopedMixin, TimeStampedModel):
    """A director-authored directive for teachers — administrative, not academic
    (grading/tests/activities are the teacher-to-student side, handled in `apps.learning`).
    Fans out into one `TeacherTaskAssignment` per targeted teacher (see `services.assign_task`).
    """

    organization_source = "created_by.active_organization"

    class Category(models.TextChoices):
        ADMINISTRATIVE = "ADMINISTRATIVE", _("Ma'muriy")
        REPORT = "REPORT", _("Hisobot")
        MEETING = "MEETING", _("Yig'ilish")
        OTHER = "OTHER", _("Boshqa")

    organization = models.ForeignKey(
        "organizations.Organization",
        verbose_name=_("organization"),
        related_name="teacher_tasks",
        on_delete=models.CASCADE,
    )
    title = models.CharField(_("title"), max_length=255)
    description = models.TextField(_("description"), blank=True)
    category = models.CharField(
        _("category"), max_length=20, choices=Category.choices, default=Category.OTHER
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("created by"),
        related_name="+",
        on_delete=models.SET_NULL,
        null=True,
    )
    is_broadcast = models.BooleanField(_("sent to all teachers"), default=False)

    class Meta:
        verbose_name = _("teacher task")
        verbose_name_plural = _("teacher tasks")
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.title


class TeacherTaskAssignment(OrganizationScopedMixin, TimeStampedModel):
    """One row per (task, teacher) — the recipient's copy, and where completion is tracked."""

    organization_source = "task.organization"

    organization = models.ForeignKey(
        "organizations.Organization",
        verbose_name=_("organization"),
        related_name="teacher_task_assignments",
        on_delete=models.CASCADE,
    )
    task = models.ForeignKey(
        TeacherTask, verbose_name=_("task"), related_name="assignments", on_delete=models.CASCADE
    )
    teacher = models.ForeignKey(
        "users.TeacherProfile",
        verbose_name=_("teacher"),
        related_name="task_assignments",
        on_delete=models.CASCADE,
    )
    is_done = models.BooleanField(_("done"), default=False)
    completed_at = models.DateTimeField(_("completed at"), null=True, blank=True)

    class Meta:
        verbose_name = _("teacher task assignment")
        verbose_name_plural = _("teacher task assignments")
        ordering = ("-created_at",)
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(fields=["task", "teacher"], name="unique_teacher_task_assignment"),
        ]

    def __str__(self) -> str:
        return f"{self.task} -> {self.teacher}"
