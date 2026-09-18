from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from apps.notifications.models import Notification
from apps.notifications.services import notify

from .models import Lesson, LessonReminder

# Celery Beat re-runs this task on a fixed interval (see CELERY_BEAT_SCHEDULE
# in settings); this window just needs to be wider than that interval so a
# lesson's start time is never skipped between two runs. LessonReminder is
# what actually prevents sending the same lesson's reminder twice.
REMINDER_LEAD_TIME = timedelta(minutes=60)
REMINDER_WINDOW = timedelta(minutes=10)


@shared_task
def send_lesson_reminders() -> int:
    """Notifies every student in the class + the lesson's teacher ~1 hour
    before each lesson starts. Returns how many lessons were reminded this run.
    """
    now = timezone.localtime()
    target = now + REMINDER_LEAD_TIME
    window_start = target.time()
    window_end = (target + REMINDER_WINDOW).time()

    lessons = (
        Lesson.objects.filter(date=now.date(), start_time__gte=window_start, start_time__lt=window_end)
        .exclude(reminder__isnull=False)
        .select_related("subject", "school_class", "teacher__user")
    )

    sent = 0
    for lesson in lessons:
        title = f"🔔 1 soatdan keyin {lesson.subject.name} darsi"
        body = (
            f"🏫 Xona: {lesson.room or '—'}\n"
            f"⏰ {lesson.start_time:%H:%M}–{lesson.end_time:%H:%M}\n\n"
            "📚 Bugun darsga kech qolmang!"
        )

        for student in lesson.school_class.students.select_related("user"):
            notify(
                recipient=student.user,
                title=title,
                body=body,
                category=Notification.Category.LESSON_REMINDER,
            )
        notify(
            recipient=lesson.teacher.user,
            title=title,
            body=body,
            category=Notification.Category.LESSON_REMINDER,
        )

        LessonReminder.objects.create(lesson=lesson)
        sent += 1

    return sent
