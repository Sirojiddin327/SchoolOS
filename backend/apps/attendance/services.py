from django.db import transaction
from django.db.models import Count, QuerySet

from apps.academics.models import Lesson
from apps.notifications.models import Notification
from apps.notifications.services import notify

from .models import Attendance


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
    if user.is_director:
        return True
    profile = getattr(user, "teacher_profile", None)
    if profile is None:
        return False
    return profile.pk == lesson.teacher_id or profile.pk == lesson.school_class.class_teacher_id


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
