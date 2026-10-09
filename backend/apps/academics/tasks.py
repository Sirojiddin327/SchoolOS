import logging

from celery import shared_task
from django.db.models import Q
from django.utils import timezone

from apps.notifications.models import Notification
from apps.notifications.services import notify
from apps.organizations.models import OrganizationMembership
from apps.users.models import User

from .models import DailyScheduleDigest
from .services import DAILY_SCHEDULE_TITLE, format_daily_schedule, generate_lessons_for_week, week_monday

logger = logging.getLogger(__name__)


def _digest_recipients(day):
    """Everyone who should get their day, and nobody else.

    Active students with a class and active teachers. Directors are left out on
    purpose: their "schedule" would be a school-wide overview, which is a
    different thing from a personal lesson list, and a director never received
    the old per-lesson reminder either.

    `select_related` keeps this to a couple of queries no matter how big the
    school is, and the profile filters mean `lessons_for_user` can rely on a
    profile existing.

    Selection is by *membership role in the active organization*, not by
    `User.role`: the day sent to someone must be the day they are authorized to
    teach or sit in, which is what `lessons_for_user` then reads back.
    """
    return (
        User.objects.filter(is_active=True)
        .filter(
            Q(
                active_organization__memberships__status=OrganizationMembership.Status.ACTIVE,
                active_organization__memberships__role__in=OrganizationMembership.LEARNER_ROLES,
                student_profile__isnull=False,
            )
            | Q(
                active_organization__memberships__status=OrganizationMembership.Status.ACTIVE,
                active_organization__memberships__role__in=OrganizationMembership.STAFF_ROLES,
                teacher_profile__isnull=False,
            )
        )
        .exclude(daily_schedule_digests__date=day)
        .select_related(
            "active_organization", "student_profile__school_class", "teacher_profile", "telegram_account"
        )
    )


def _send_daily_schedule(user, *, day) -> bool:
    """Send one user's day, at most once. Returns whether it was sent.

    The digest row is written *before* the send. That ordering is the whole
    point: it makes the guard hold even if two runs overlap, the worker is
    restarted mid-send, or this task is fired by hand. The cost is that a user
    whose message genuinely failed to go out is not retried that day — which is
    the right trade for a daily digest, since re-sending it tomorrow is right
    and re-sending it today at 14:00 is not.
    """
    body = format_daily_schedule(user, day)

    # At-most-once, enforced by the unique (user, date) constraint rather than a
    # read-then-write, so a race resolves to one row instead of two messages.
    _digest, created = DailyScheduleDigest.objects.get_or_create(user=user, date=day)
    if not created:
        return False

    notify(
        recipient=user,
        title=DAILY_SCHEDULE_TITLE,
        body=body,
        category=Notification.Category.LESSON_REMINDER,
    )
    return True


@shared_task
def send_daily_schedules() -> int:
    """Sends every student and teacher their complete day as one message.

    Replaces the old per-lesson "~1 hour before" reminder, which sent a separate
    message before every single lesson — four or five a day, each saying less
    than the whole schedule would have said once. One message at 07:00 (see
    CELERY_BEAT_SCHEDULE) answers the same question earlier and in one place.

    Returns how many messages were sent. One user's failure is logged and the
    run continues: a single dead Telegram chat must not cost everyone else
    their morning schedule.
    """
    day = timezone.localdate()
    sent = 0
    skipped = 0

    for user in _digest_recipients(day):
        # `select_related` fetched the link above, so this is a cache read, not a
        # query. `notify` is a silent no-op without a linked chat, but it still
        # writes an in-app Notification row — so check first, or a user who never
        # linked Telegram collects a daily ghost notification nobody will read.
        if not hasattr(user, "telegram_account"):
            skipped += 1
            continue
        try:
            if _send_daily_schedule(user, day=day):
                sent += 1
        except Exception:
            logger.exception("Daily schedule failed for user_id=%s", user.pk)

    logger.info("Daily schedule: %s sent, %s skipped (no Telegram), for %s", sent, skipped, day)
    return sent


@shared_task
def ensure_current_week_lessons() -> int:
    """Generate Lesson rows for the week starting this Monday, idempotently.

    The director can generate a week from the web UI, but nothing happened on
    weeks nobody clicked — students and staff were left looking at "Bugun darslar
    yo'q." in the bot and the morning digest. Running on Monday at 06:00 means
    the week's lessons always exist by the time the 07:00 digest is sent.

    Idempotent by design: lessons are keyed on (school_class, date, start_time),
    so re-running never creates duplicates.
    """
    monday = week_monday(timezone.localdate())
    lessons = generate_lessons_for_week(monday)
    logger.info("Ensured lessons for the week of %s: %s lessons", monday, len(lessons))
    return len(lessons)
