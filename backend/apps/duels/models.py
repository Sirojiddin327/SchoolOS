from typing import ClassVar

from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import OrganizationScopedMixin, TimeStampedModel


class Duel(OrganizationScopedMixin, TimeStampedModel):
    """A 1-v-1 knowledge battle — against a classmate (an invitation they
    accept, then a synchronized match) or against an AI opponent (starts at
    once). Both sides get the same question snapshot, drawn from the games'
    subject+class question pool; each side's answers are logged server-side
    with timing, and HP, combo, abilities, the speed bonus and the winner are
    all replayed from those logs (see `rules.battle_state`) — nothing about
    the outcome is taken from a client.

    Fields are duplicated challenger_*/opponent_* rather than normalized into
    a participant table, since a duel only ever has exactly two sides. An AI
    duel has no `opponent`; the AI's side is simulated deterministically.
    """

    organization_source = "school_class.organization"

    class Mode(models.TextChoices):
        CLASSMATE = "CLASSMATE", _("Classmate")
        AI = "AI", _("AI opponent")

    class AILevel(models.TextChoices):
        NOVICE = "NOVICE", _("AI Novice")
        SCHOLAR = "SCHOLAR", _("AI Scholar")
        MASTER = "MASTER", _("AI Master")

    class Difficulty(models.TextChoices):
        EASY = "EASY", _("Oson")
        MEDIUM = "MEDIUM", _("O'rta")
        HARD = "HARD", _("Qiyin")

    class Status(models.TextChoices):
        PENDING = "PENDING", _("Waiting for the opponent to accept")
        ACTIVE = "ACTIVE", _("Active")
        COMPLETED = "COMPLETED", _("Completed")
        DECLINED = "DECLINED", _("Declined")
        CANCELLED = "CANCELLED", _("Cancelled")
        EXPIRED = "EXPIRED", _("Expired")

    class Result(models.TextChoices):
        CHALLENGER = "CHALLENGER", _("Challenger won")
        OPPONENT = "OPPONENT", _("Opponent won")
        DRAW = "DRAW", _("Draw")

    organization = models.ForeignKey(
        "organizations.Organization",
        verbose_name=_("organization"),
        related_name="duels",
        on_delete=models.CASCADE,
    )
    mode = models.CharField(_("mode"), max_length=12, choices=Mode.choices, default=Mode.CLASSMATE)
    ai_level = models.CharField(_("AI level"), max_length=10, choices=AILevel.choices, blank=True, default="")
    challenger = models.ForeignKey(
        "users.StudentProfile", verbose_name=_("challenger"), related_name="duels_as_challenger",
        on_delete=models.CASCADE,
    )
    opponent = models.ForeignKey(
        "users.StudentProfile", verbose_name=_("opponent"), related_name="duels_as_opponent",
        on_delete=models.CASCADE, null=True, blank=True,
    )
    school_class = models.ForeignKey(
        "schools.SchoolClass", verbose_name=_("class"), related_name="duels", on_delete=models.CASCADE
    )
    subject = models.ForeignKey(
        "academics.Subject", verbose_name=_("subject"), related_name="+", on_delete=models.CASCADE,
        null=True, blank=True,
    )
    difficulty = models.CharField(
        _("difficulty"), max_length=10, choices=Difficulty.choices, default=Difficulty.MEDIUM
    )
    question_count = models.PositiveSmallIntegerField(_("question count"), default=10)
    # [{"text", "options", "correct_index", "explanation"}, ...] — one snapshot for both sides.
    questions = models.JSONField(_("questions"), default=list, blank=True)
    rematch_of = models.ForeignKey(
        "self", verbose_name=_("rematch of"), related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )

    status = models.CharField(_("status"), max_length=20, choices=Status.choices, default=Status.PENDING)
    result = models.CharField(_("result"), max_length=20, choices=Result.choices, null=True, blank=True)
    accepted_at = models.DateTimeField(_("accepted at"), null=True, blank=True)
    # Set once both sides are ready: the moment question 1 opens (a short countdown ahead).
    match_starts_at = models.DateTimeField(_("match starts at"), null=True, blank=True)

    challenger_ready_at = models.DateTimeField(_("challenger ready at"), null=True, blank=True)
    # {"opened": {"<index>": epoch_ms}, "answers": {"<index>": [selected, elapsed_ms, answered_epoch_ms]}}
    challenger_log = models.JSONField(_("challenger log"), default=dict, blank=True)
    challenger_submitted_at = models.DateTimeField(_("challenger finished at"), null=True, blank=True)
    challenger_score_percent = models.FloatField(_("challenger accuracy (%)"), null=True, blank=True)

    opponent_ready_at = models.DateTimeField(_("opponent ready at"), null=True, blank=True)
    opponent_log = models.JSONField(_("opponent log"), default=dict, blank=True)
    opponent_submitted_at = models.DateTimeField(_("opponent finished at"), null=True, blank=True)
    opponent_score_percent = models.FloatField(_("opponent accuracy (%)"), null=True, blank=True)

    completed_at = models.DateTimeField(_("completed at"), null=True, blank=True)

    class Meta:
        verbose_name = _("duel")
        verbose_name_plural = _("duels")
        ordering = ("-created_at",)

    def __str__(self) -> str:
        opponent = self.get_ai_level_display() if self.mode == self.Mode.AI else self.opponent
        return f"{self.challenger} vs {opponent} ({self.status})"

    def role_of(self, student_profile) -> str | None:
        if student_profile is None:
            return None
        if student_profile.pk == self.challenger_id:
            return "challenger"
        if self.opponent_id and student_profile.pk == self.opponent_id:
            return "opponent"
        return None


class DuelRating(OrganizationScopedMixin, TimeStampedModel):
    """A student's duel ELO-lite rating and win/loss/draw tally — separate from
    `StudentProfile` the same way `Streak` is. The rating only moves on
    classmate duels; the tallies count every finished duel.

    Like `Streak`, this is per (organization, student): a student who duels at
    school must not carry that rating into a club's ranking.
    """

    organization_source = "student.organization"

    DEFAULT_RATING = 1000

    organization = models.ForeignKey(
        "organizations.Organization",
        verbose_name=_("organization"),
        related_name="duel_ratings",
        on_delete=models.CASCADE,
    )
    student = models.ForeignKey(
        "users.StudentProfile", verbose_name=_("student"), related_name="duel_ratings", on_delete=models.CASCADE
    )
    rating = models.PositiveIntegerField(_("rating"), default=DEFAULT_RATING)
    wins = models.PositiveIntegerField(_("wins"), default=0)
    losses = models.PositiveIntegerField(_("losses"), default=0)
    draws = models.PositiveIntegerField(_("draws"), default=0)

    class Meta:
        verbose_name = _("duel rating")
        verbose_name_plural = _("duel ratings")
        ordering = ("-rating",)
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(
                fields=["organization", "student"], name="unique_duel_rating_per_student_org"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.student} @ {self.organization} — {self.rating}"
