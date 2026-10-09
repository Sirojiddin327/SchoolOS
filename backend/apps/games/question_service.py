"""The one place questions are drawn from.

Every consumer of questions — the self-serve games in `apps.games.services`,
the AI/classmate duels in `apps.duels.services`, and anything added later —
goes through `get_questions`. A game never owns or filters questions itself; it
only says *how many* it needs and *how* it will present them.

    SUBJECT -> question bank -> this service -> any game -> session -> XP

The subject is the only hard filter. A question written for Literature is only
ever served to a Literature session, whatever else sits in the bank; the class
a question was authored for is a *preference* that picks the most suitable
question first, never a gate — a student whose own class has no pool of its own
still plays, drawing from the rest of their subject's bank.
"""

import logging

from django.db.models import Count, QuerySet

from apps.academics.models import Subject
from apps.common.questions import shuffle_options

from .models import PooledQuestion, PooledQuestionServed

logger = logging.getLogger(__name__)


class NoQuestionsAvailable(Exception):
    """The selected subject has no usable questions at all.

    Deliberately distinct from a pool that is merely *thinner* than a game asks
    for (which still returns a playable, shorter set), so a caller can show a
    real empty state instead of a generic error and can never mistake "this
    subject isn't stocked yet" for a bug.
    """

    def __init__(self, subject) -> None:
        self.subject = subject
        super().__init__(str(getattr(subject, "name", subject)))


def _active_for(subject) -> QuerySet:
    """Every drawable question of one subject. The subject filter is applied
    here and nowhere else, which is what structurally guarantees a game can
    never be served another subject's questions."""
    return PooledQuestion.objects.filter(subject=subject, is_active=True)


def subject_has_questions(subject) -> bool:
    """Whether this subject is stocked at all — the empty-state check."""
    return _active_for(subject).exists()


def subject_pool_sizes(organization=None) -> list[dict]:
    """Per-subject coverage for the director's question-pool page: one row per
    (subject, class) pair, where an empty class means the subject-wide bank
    every student of that subject can draw from.

    Scoped to `organization` because a bank belongs to one tenant: a school
    director has no business seeing how stocked another school's pools are.
    """
    pools = PooledQuestion.objects.filter(is_active=True)
    if organization is not None:
        pools = pools.filter(organization=organization)
    return [
        {
            "subject": row["subject"],
            "subject_name": row["subject__name"],
            "school_class": row["school_class"],
            "school_class_name": row["school_class__name"],
            "count": row["count"],
        }
        for row in pools.values("subject", "subject__name", "school_class", "school_class__name")
        .annotate(count=Count("id"))
        .order_by("subject__name", "school_class__name")
    ]


def subject_availability(organization=None) -> list[dict]:
    """Every subject with how many questions it can currently serve — lets a
    client tell "this subject isn't stocked yet" *before* a session is started,
    instead of letting a student start a game only to hit an error on the
    questions request.

    The count is the whole subject, not one class's share, because that is
    genuinely what a draw can reach (the class tiers are preferences, and the
    subject-wide bank plus the other classes are the fallbacks).

    Scoped to `organization` when given: the question pool is per-tenant, so an
    unscoped count would leak one school's stock levels to every other school's
    students.
    """
    pool = PooledQuestion.objects.filter(is_active=True)
    if organization is not None:
        pool = pool.filter(organization=organization)
    counts = dict(pool.values_list("subject_id").annotate(total=Count("id")))
    return [
        {"id": subject.id, "name": subject.name, "question_count": counts.get(subject.id, 0)}
        for subject in Subject.objects.all()
    ]


def _tiers(*, subject, school_class) -> list[QuerySet]:
    """The subject's questions split into preference tiers, each a partition of
    that one subject: the student's own class first (closest to their level),
    then the subject-wide bank (written for everyone), then other classes — a
    correct question at a slightly wrong level still beats telling a student
    the game is unavailable."""
    base = _active_for(subject)
    subject_wide = base.filter(school_class__isnull=True)
    if school_class is None:
        return [subject_wide, base.exclude(school_class__isnull=True)]
    return [
        base.filter(school_class=school_class),
        subject_wide,
        base.exclude(school_class=school_class).exclude(school_class__isnull=True),
    ]


def _draw(tier: QuerySet, *, served_ids: set[int], needed: int) -> list[PooledQuestion]:
    """Up to `needed` questions from one tier, preferring ones this student has
    not been served before, and only re-serving a question from an *earlier
    game* once the fresh ones are used up (see `PooledQuestionServed`). Each
    question is returned at most once per draw."""
    if needed <= 0:
        return []
    picked = list(tier.exclude(id__in=served_ids).order_by("?")[:needed])
    if len(picked) < needed:
        already = {question.id for question in picked}
        picked += list(
            tier.filter(id__in=served_ids).exclude(id__in=already).order_by("?")[: needed - len(picked)]
        )
    return picked


def mark_served(*, student, questions: list[PooledQuestion]) -> None:
    """Record that this student was handed these questions, so the next game
    prefers others. `ignore_conflicts` keeps two near-simultaneous draws (a
    double-click, two tabs) from failing on the (student, question) unique
    constraint."""
    if not questions:
        return
    # bulk_create() never calls save(), so the tenant is copied from each
    # question here rather than by OrganizationScopedMixin.organization_source.
    PooledQuestionServed.objects.bulk_create(
        (
            PooledQuestionServed(
                student=student, question=question, organization=question.organization
            )
            for question in questions
        ),
        ignore_conflicts=True,
    )


def get_questions(
    *,
    subject,
    amount: int,
    game_type: str = "",
    difficulty: str = "",
    student=None,
) -> list[dict]:
    """`amount` questions for `subject`, in the shape a game stores on its
    session (`text` / `options` / `correct_index` / `explanation`).

    `game_type` and `difficulty` are accepted so a game with a genuinely special
    requirement can be served differently later, but the default is identical
    for every game: a game's mechanics decide how many questions it wants, never
    which subject's questions it gets.

    Options are re-shuffled on each draw, so a question served again never keeps
    its answer in the same slot.

    Raises `NoQuestionsAvailable` when the subject's bank is empty. When the bank
    exists but is thinner than `amount`, the question set comes back shorter
    rather than padded: every question handed to one game is a distinct
    question, because being asked the same thing twice in a single round is
    worse than a shorter round. The caller stores the length it actually got, so
    timers, scores and progress stay honest.
    """
    if amount <= 0:
        return []

    school_class = student.school_class if student is not None and student.school_class_id else None
    tiers = _tiers(subject=subject, school_class=school_class)
    if not any(tier.exists() for tier in tiers):
        raise NoQuestionsAvailable(subject)

    served_ids: set[int] = set()
    if student is not None:
        served_ids = set(
            PooledQuestionServed.objects.filter(
                student=student, question__subject=subject, question__is_active=True
            ).values_list("question_id", flat=True)
        )

    needed = amount
    picked: list[PooledQuestion] = []
    for tier in tiers:
        picked += _draw(tier, served_ids=served_ids, needed=needed)
        needed -= len(picked)
        if needed <= 0:
            break

    if student is not None:
        mark_served(student=student, questions=picked)

    return [
        shuffle_options(
            {
                "text": question.text,
                "options": question.options,
                "correct_index": question.correct_index,
                "explanation": question.explanation,
                "subject_id": question.subject_id,
            }
        )
        for question in picked
    ]


def get_questions_all_subjects(
    *,
    amount: int,
    game_type: str = "",
    difficulty: str = "",
    student=None,
) -> list[dict]:
    """`amount` questions drawn from ALL subjects (mixed).
    
    Used for "Hamma fanlar" mode where the student gets a mix of questions
    from different subjects in a single game.
    """
    if amount <= 0:
        return []

    school_class = student.school_class if student is not None and student.school_class_id else None

    # Get all active questions across all subjects
    base_qs = PooledQuestion.objects.filter(is_active=True)
    if school_class:
        # Prefer questions from student's class, then subject-wide, then other classes
        class_qs = base_qs.filter(school_class=school_class)
        subject_wide_qs = base_qs.filter(school_class__isnull=True)
        other_qs = base_qs.exclude(school_class=school_class).exclude(school_class__isnull=True)
        tiers = [class_qs, subject_wide_qs, other_qs]
    else:
        subject_wide_qs = base_qs.filter(school_class__isnull=True)
        class_qs = base_qs.exclude(school_class__isnull=True)
        tiers = [subject_wide_qs, class_qs]

    if not any(tier.exists() for tier in tiers):
        raise NoQuestionsAvailable(None)

    served_ids: set[int] = set()
    if student is not None:
        served_ids = set(
            PooledQuestionServed.objects.filter(
                student=student, question__is_active=True
            ).values_list("question_id", flat=True)
        )

    needed = amount
    picked: list[PooledQuestion] = []
    for tier in tiers:
        picked += _draw(tier, served_ids=served_ids, needed=needed)
        needed -= len(picked)
        if needed <= 0:
            break

    if student is not None:
        mark_served(student=student, questions=picked)

    return [
        shuffle_options(
            {
                "text": question.text,
                "options": question.options,
                "correct_index": question.correct_index,
                "explanation": question.explanation,
                "subject_id": question.subject_id,
            }
        )
        for question in picked
    ]


__all__ = [
    "NoQuestionsAvailable",
    "get_questions",
    "get_questions_all_subjects",
    "mark_served",
    "subject_availability",
    "subject_has_questions",
    "subject_pool_sizes",
]
