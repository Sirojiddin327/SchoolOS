from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Count, QuerySet
from django.utils import timezone

from apps.academics.models import Lesson
from apps.notifications.models import Notification
from apps.notifications.services import notify

from .models import Attendance

ATTENDANCE_GRACE_MINUTES = 5


def count_by_status(queryset: QuerySet) -> dict[str, int]:
    """Status -> record count for an Attendance queryset, zero-filled for missing statuses."""
    counts = dict.fromkeys(Attendance.Status.values, 0)
    for row in queryset.values("status").annotate(count=Count("id")):
        counts[row["status"]] = row["count"]
    return counts


STATUS_ICON = {
    Attendance.Status.PRESENT: "✅",
    Attendance.Status.LATE: "🕐",
    Attendance.Status.ABSENT: "❌",
    Attendance.Status.EXCUSED: "📄",
}
STATUS_LABEL_UZ = {
    Attendance.Status.PRESENT: "keldi",
    Attendance.Status.LATE: "kechikdi",
    Attendance.Status.ABSENT: "kelmadi",
    Attendance.Status.EXCUSED: "sababli",
}


def can_mark_attendance(user, lesson: Lesson) -> bool:
    """Directors and the lesson/class teacher may mark attendance — but only for
    a lesson that belongs to the caller's active organization. `Lesson` is a
    writable FK in the serializer, so without this a director could mark
    attendance on another school's lesson by id."""
    active_org = user.active_organization_id
    if active_org is None or lesson.organization_id != active_org:
        return False
    if user.is_director:
        return True
    profile = getattr(user, "teacher_profile", None)
    if profile is None:
        return False
    return (
        profile.pk == lesson.teacher_id
        or profile.pk == lesson.secondary_teacher_id
        or profile.pk == lesson.school_class.class_teacher_id
    )


def _aware(d, t):
    naive = datetime.combine(d, t)
    return timezone.make_aware(naive) if timezone.is_naive(naive) else naive


def attendance_window_opens_at(lesson: Lesson):
    """A lesson's attendance may only be marked once it's been running a while,
    so a teacher can't mark students absent before they've had a chance to walk in."""
    return _aware(lesson.date, lesson.start_time) + timedelta(minutes=ATTENDANCE_GRACE_MINUTES)


def attendance_window_closes_at(lesson: Lesson):
    """Attendance locks the moment the lesson ends — no editing a class's
    attendance after the fact from the ordinary teacher UI."""
    return _aware(lesson.date, lesson.end_time)


def is_attendance_window_open(user, lesson: Lesson) -> bool:
    """Directors may backfill/correct attendance at any time; teachers must wait
    out the grace period so early marking doesn't unfairly mark late arrivals
    absent, and lose access again the instant the lesson is over."""
    if user.is_director:
        return True
    now = timezone.now()
    return attendance_window_opens_at(lesson) <= now < attendance_window_closes_at(lesson)


@transaction.atomic
def mark_lesson_attendance(*, lesson: Lesson, records: list[dict], marked_by) -> list[Attendance]:
    """Upsert attendance for a lesson, then notify the class teacher if relevant.

    `records` is a list of {"student": StudentProfile, "status": Attendance.Status}.
    """
    attendances = []
    for record in records:
        attendance, _created = Attendance.objects.update_or_create(
            lesson=lesson,
            student=record["student"],
            defaults={"status": record["status"], "marked_by": marked_by},
        )
        attendances.append(attendance)

    _notify_class_teacher_if_needed(lesson, marked_by)
    _notify_parents_if_needed(lesson, attendances)
    return attendances


def _notify_class_teacher_if_needed(lesson: Lesson, marked_by) -> None:
    class_teacher = lesson.school_class.class_teacher
    if class_teacher is None:
        return

    marked_by_profile = getattr(marked_by, "teacher_profile", None)
    if marked_by_profile is not None and marked_by_profile.pk == class_teacher.pk:
        # The class teacher marked their own class's attendance — no need to notify themselves.
        return

    counts = count_by_status(Attendance.objects.filter(lesson=lesson))

    lines = [
        f"{STATUS_ICON[status]} {counts[status]} {STATUS_LABEL_UZ[status]}"
        for status in Attendance.Status.values
        if counts[status] or status != Attendance.Status.EXCUSED
    ]

    body = (
        f"Dars: {lesson.subject.name}\n"
        f"O'qituvchi: {marked_by.get_full_name() or marked_by.username}\n\n" + "\n".join(lines)
    )

    notify(
        recipient=class_teacher.user,
        title=f"{lesson.school_class.name} davomat",
        body=body,
        category=Notification.Category.ATTENDANCE,
    )


def _notify_parents_if_needed(lesson: Lesson, attendances: list[Attendance]) -> None:
    """Pushes an ABSENT/LATE alert straight to a student's linked parent chats —
    the case parents actually want to know about in real time."""
    from apps.telegram_bot.services import notify_parents

    for attendance in attendances:
        if attendance.status not in (Attendance.Status.ABSENT, Attendance.Status.LATE):
            continue
        text = (
            f"{STATUS_ICON[attendance.status]} Farzandingiz {lesson.subject.name} darsiga "
            f"{STATUS_LABEL_UZ[attendance.status]} ({lesson.date:%d.%m.%Y}, "
            f"{lesson.start_time:%H:%M})."
        )
        notify_parents(attendance.student, text)
