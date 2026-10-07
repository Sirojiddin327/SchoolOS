from typing import ClassVar

from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import OrganizationScopedMixin, TimeStampedModel

LOW_SCORE_THRESHOLD = 50.0


class RemedialSession(OrganizationScopedMixin, TimeStampedModel):
    """Triggered automatically when a student scores below `LOW_SCORE_THRESHOLD`
    on a `Test` or a self-serve practice game (`games.GameSession`) — exactly
    one of `attempt` / `game_session` is set — an AI-tutor explanation of the
    topic, followed by a short
    AI-generated "tug of war" practice game on the same material. The game's
    questions are ephemeral (AI-generated per session), so they're kept as a
    JSON snapshot rather than normalized rows in the permanent question bank.
    """

    organization_source = "student.organization"

    class Status(models.TextChoices):
        PENDING = "PENDING", _("Pending")
        EXPLAINED = "EXPLAINED", _("Explained")
        COMPLETED = "COMPLETED", _("Completed")

    organization = models.ForeignKey(
        "organizations.Organization",
        verbose_name=_("organization"),
        related_name="remedial_sessions",
        on_delete=models.CASCADE,
    )
    student = models.ForeignKey(
        "users.StudentProfile", verbose_name=_("student"), related_name="remedial_sessions",
        on_delete=models.CASCADE,
    )
    attempt = models.ForeignKey(
        "learning.TestAttempt", verbose_name=_("test attempt"), related_name="remedial_sessions",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    game_session = models.ForeignKey(
        "games.GameSession", verbose_name=_("game session"), related_name="remedial_sessions",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    subject = models.ForeignKey(
        "academics.Subject", verbose_name=_("subject"), related_name="+", on_delete=models.CASCADE
    )
    status = models.CharField(_("status"), max_length=20, choices=Status.choices, default=Status.PENDING)
    explanation = models.TextField(_("AI explanation"), blank=True)
    # [{"text": str, "options": [str, ...], "correct_index": int}, ...] — see services.generate_game_questions.
    questions = models.JSONField(_("game questions"), default=list, blank=True)
    score_percent = models.FloatField(_("game score (%)"), null=True, blank=True)
    xp_awarded = models.PositiveSmallIntegerField(_("XP awarded"), null=True, blank=True)
    completed_at = models.DateTimeField(_("completed at"), null=True, blank=True)

    class Meta:
        verbose_name = _("remedial session")
        verbose_name_plural = _("remedial sessions")
        ordering = ("-created_at",)
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.CheckConstraint(
                condition=(
                    models.Q(attempt__isnull=False, game_session__isnull=True)
                    | models.Q(attempt__isnull=True, game_session__isnull=False)
                ),
                name="remedial_exactly_one_source",
            ),
            models.UniqueConstraint(
                fields=["game_session"],
                condition=models.Q(game_session__isnull=False),
                name="unique_remedial_per_game_session",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.student} — {self.subject} ({self.status})"
