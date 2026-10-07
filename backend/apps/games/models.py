from typing import ClassVar

from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import OrganizationScopedMixin, TimeStampedModel


class PooledQuestion(OrganizationScopedMixin, TimeStampedModel):
    """The universal question bank: one row per question, belonging to a
    **subject**, and served to *any* game (see `question_service.get_questions`).

    A question is content, not gameplay — Arqon tortish, Jang maydoni, Duel and
    any future game all draw from this same table and only differ in how they
    present it, so a teacher never has to enter a question once per game.

    `school_class` narrows a question to one class's level; leaving it empty
    ("butun fanga tegishli") makes it part of the subject-wide bank every
    student of that subject can draw from. It is a *preference*, never a
    requirement — the draw always falls back to the rest of the subject so a
    student is never locked out of a game by a class that simply has no pool
    of its own.

    Pools are pre-generated in batches by AI (`services.refill_pool`) or seeded
    by hand (`manage.py seed_game_questions`) so a game's live start never has
    to wait on — or burn through the rate limit of — a real-time Gemini call.
    """

    organization_source = "school_class.organization"

    organization = models.ForeignKey(
        "organizations.Organization",
        verbose_name=_("organization"),
        related_name="pooled_questions",
        on_delete=models.CASCADE,
    )
    subject = models.ForeignKey(
        "academics.Subject", verbose_name=_("subject"), related_name="pooled_questions", on_delete=models.CASCADE
    )
    school_class = models.ForeignKey(
        "schools.SchoolClass",
        verbose_name=_("class"),
        related_name="pooled_questions",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    text = models.TextField(_("question text"))
    options = models.JSONField(_("options"))
    correct_index = models.PositiveSmallIntegerField(_("correct option index"))
    # One-sentence "why" shown after a wrong answer in games that reveal the
    # key mid-round (Minora qurish). Older pooled questions predate this and
    # simply have none — the UI then shows only the correct option.
    explanation = models.TextField(_("explanation"), blank=True, default="")
    # A retired question stays in place (already-played sessions and their
    # review screens keep referencing it) but is never drawn again — the hook
    # for "this one is wrong, take it out of rotation" without a data loss.
    is_active = models.BooleanField(_("active"), default=True)

    class Meta:
        verbose_name = _("pooled question")
        verbose_name_plural = _("pooled questions")
        indexes: ClassVar[list[models.Index]] = [
            models.Index(fields=["subject", "school_class"]),
            models.Index(fields=["subject", "is_active"]),
        ]

    def __str__(self) -> str:
        scope = self.school_class or _("butun fan")
        return f"{self.subject} — {scope}: {self.text[:50]}"


class PooledQuestionServed(OrganizationScopedMixin, models.Model):
    """Which pooled questions a given student has already played — consulted
    when picking a new game's questions so repeats are avoided wherever the
    pool is large enough to allow it (see `services.pick_session_questions`).
    """

    organization_source = "question.organization"

    organization = models.ForeignKey(
        "organizations.Organization",
        verbose_name=_("organization"),
        related_name="served_pooled_questions",
        on_delete=models.CASCADE,
    )
    student = models.ForeignKey(
        "users.StudentProfile", verbose_name=_("student"), related_name="+", on_delete=models.CASCADE
    )
    question = models.ForeignKey(
        PooledQuestion, verbose_name=_("question"), related_name="+", on_delete=models.CASCADE
    )
    served_at = models.DateTimeField(_("served at"), auto_now_add=True)

    class Meta:
        verbose_name = _("served pooled question")
        verbose_name_plural = _("served pooled questions")
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.UniqueConstraint(
                fields=["organization", "student", "question"],
                name="unique_student_pooled_question_per_org",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.student} saw pooled question {self.question_id}"


class GameSession(OrganizationScopedMixin, TimeStampedModel):
    """A self-serve AI practice game — pick a subject, pick a game, play.
    Unlike `apps.remedial.RemedialSession`, this isn't triggered by a low
    test score and isn't tied to any particular `TestAttempt`; a student can
    start one any time from the "O'yinlar" section. Same question-snapshot
    approach (see that app for why).
    """

    organization_source = "student.organization"

    class GameType(models.TextChoices):
        TUG_OF_WAR = "TUG_OF_WAR", _("Arqon tortish")
        QUIZ = "QUIZ", _("Viktorina")
        TOWER_BUILDER = "TOWER_BUILDER", _("Minora qurish")
        CODE_BREAKER = "CODE_BREAKER", _("Kodni buzish")
        TREASURE_HUNT = "TREASURE_HUNT", _("Xazina ovi")
        BATTLE_ARENA = "BATTLE_ARENA", _("Jang maydoni")
        TOWER_DEFENSE = "TOWER_DEFENSE", _("Tower Defense")
        NEON_RACING = "NEON_RACING", _("Neon Racing")

    class Difficulty(models.TextChoices):
        EASY = "EASY", _("Oson")
        MEDIUM = "MEDIUM", _("O'rta")
        HARD = "HARD", _("Qiyin")

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", _("Active")
        COMPLETED = "COMPLETED", _("Completed")

    organization = models.ForeignKey(
        "organizations.Organization",
        verbose_name=_("organization"),
        related_name="game_sessions",
        on_delete=models.CASCADE,
    )
    student = models.ForeignKey(
        "users.StudentProfile", verbose_name=_("student"), related_name="game_sessions", on_delete=models.CASCADE
    )
    subject = models.ForeignKey(
        "academics.Subject", verbose_name=_("subject"), related_name="+", on_delete=models.CASCADE, null=True, blank=True
    )
    game_type = models.CharField(_("game type"), max_length=20, choices=GameType.choices)
    # Only games that have levels use it (Tower Defense); blank for the rest.
    difficulty = models.CharField(_("difficulty"), max_length=10, choices=Difficulty.choices, blank=True, default="")
    status = models.CharField(_("status"), max_length=20, choices=Status.choices, default=Status.ACTIVE)
    # [{"text": str, "options": [str, ...], "correct_index": int, "explanation": str}, ...] — AI-generated snapshot.
    questions = models.JSONField(_("questions"), default=list, blank=True)
    # {"<question_index>": selected_index} — answers the server has locked in
    # one at a time (see `services.record_live_answer`). Only games that
    # reveal the answer key mid-round use this; the others still submit their
    # answers in one batch at the end.
    answers = models.JSONField(_("answers"), default=dict, blank=True)
    # Kodni buzish only: one character per question, generated at start. Never
    # sent to the client whole — only the segments earned so far, or all of it
    # once the game ends unlocked (see `services.revealed_code`).
    # Neon Racing only: the question indices on which the student fired nitro
    # (validated server-side against the replayed meter, see apps.games.racing).
    nitro_rounds = models.JSONField(_("nitro rounds"), default=list, blank=True)
    secret_code = models.CharField(_("secret code"), max_length=16, blank=True, default="")
    score_percent = models.FloatField(_("score (%)"), null=True, blank=True)
    xp_awarded = models.PositiveSmallIntegerField(_("XP awarded"), null=True, blank=True)
    completed_at = models.DateTimeField(_("completed at"), null=True, blank=True)

    class Meta:
        verbose_name = _("game session")
        verbose_name_plural = _("game sessions")
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.student} — {self.subject} — {self.get_game_type_display()} ({self.status})"
