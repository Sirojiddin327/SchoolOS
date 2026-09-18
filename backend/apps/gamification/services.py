from datetime import timedelta

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.notifications.models import Notification
from apps.notifications.services import notify

from .models import Achievement, Streak, StudentAchievement, XPTransaction


def _has_first_test(student, _value) -> bool:
    from apps.learning.models import TestAttempt

    return TestAttempt.objects.filter(
        student=student, status=TestAttempt.Status.SUBMITTED
    ).exists()


def _has_perfect_score(student, _value) -> bool:
    from apps.learning.models import TestAttempt

    return TestAttempt.objects.filter(
        student=student, status=TestAttempt.Status.SUBMITTED, score_percent=100
    ).exists()


def _meets_xp_threshold(student, value) -> bool:
    return student.total_xp >= value


def _meets_streak_length(student, value) -> bool:
    streak = getattr(student, "streak", None)
    return bool(streak and streak.longest_streak >= value)


CONDITION_CHECKS = {
    Achievement.ConditionType.FIRST_TEST: _has_first_test,
    Achievement.ConditionType.PERFECT_SCORE: _has_perfect_score,
    Achievement.ConditionType.XP_THRESHOLD: _meets_xp_threshold,
    Achievement.ConditionType.STREAK_LENGTH: _meets_streak_length,
}


@transaction.atomic
def award_xp(*, student, amount: int, source: str, related_object, reason: str) -> XPTransaction:
    """The single entrypoint every XP-granting feature must call.

    Never mutate `StudentProfile.total_xp` or `SchoolClass.total_xp` anywhere
    else — that's what keeps every XP change auditable back to its source.
    """
    xp_transaction = XPTransaction.objects.create(
        student=student,
        amount=amount,
        source=source,
        reason=reason,
        related_object=related_object,
    )

    type(student).objects.filter(pk=student.pk).update(total_xp=F("total_xp") + amount)
    student.refresh_from_db(fields=["total_xp"])

    if student.school_class_id:
        from apps.schools.models import SchoolClass

        SchoolClass.objects.filter(pk=student.school_class_id).update(
            total_xp=F("total_xp") + amount
        )

    record_streak_activity(student)
    check_achievements(student)

    return xp_transaction


def record_streak_activity(student) -> Streak:
    """Bumps the student's streak for today's activity. Same-day calls are a no-op."""
    streak, _created = Streak.objects.get_or_create(student=student)
    today = timezone.localdate()

    if streak.last_activity_date == today:
        return streak

    if streak.last_activity_date == today - timedelta(days=1):
        streak.current_streak += 1
    else:
        streak.current_streak = 1
    streak.last_activity_date = today

    is_new_record = streak.current_streak > streak.longest_streak
    if is_new_record:
        streak.longest_streak = streak.current_streak
    streak.save(update_fields=["current_streak", "longest_streak", "last_activity_date", "updated_at"])

    if is_new_record and streak.current_streak > 1:
        notify(
            recipient=student.user,
            title="Yangi rekord! 🔥",
            body=f"{streak.current_streak} kunlik faollik seriyasi — bu sizning eng uzun seriyangiz!",
            category=Notification.Category.STREAK,
        )

    return streak


def check_achievements(student) -> list[StudentAchievement]:
    """Unlocks any achievement whose condition the student now satisfies."""
    already_unlocked_ids = set(
        StudentAchievement.objects.filter(student=student).values_list("achievement_id", flat=True)
    )
    newly_unlocked = []

    for achievement in Achievement.objects.filter(is_active=True).exclude(id__in=already_unlocked_ids):
        check = CONDITION_CHECKS.get(achievement.condition_type)
        if check is None or not check(student, achievement.condition_value):
            continue

        student_achievement = StudentAchievement.objects.create(
            student=student, achievement=achievement
        )
        newly_unlocked.append(student_achievement)
        notify(
            recipient=student.user,
            title=f"Yutuq ochildi: {achievement.name} {achievement.icon}".strip(),
            body=achievement.description,
            category=Notification.Category.ACHIEVEMENT_UNLOCKED,
        )

    return newly_unlocked
