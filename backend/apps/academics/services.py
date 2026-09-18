from datetime import date, timedelta

from apps.school_config.models import SchoolTimeSettings

from .models import Lesson, TimetableSlot


def week_monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def generate_lessons_for_week(week_start: date) -> list[Lesson]:
    """Create (or reuse) concrete Lesson rows for every TimetableSlot in the week of `week_start`.

    Idempotent: re-running for the same week never creates duplicates, since lessons
    are keyed on (school_class, date, start_time) — the same key Lesson already enforces
    uniqueness on.
    """
    monday = week_monday(week_start)
    settings_obj = SchoolTimeSettings.get_solo()
    lessons = []

    for slot in TimetableSlot.objects.select_related("subject", "school_class", "teacher"):
        lesson_date = monday + timedelta(days=slot.day_of_week - 1)
        start_time, end_time = settings_obj.period_times(slot.period_number)
        lesson, _created = Lesson.objects.get_or_create(
            school_class=slot.school_class,
            date=lesson_date,
            start_time=start_time,
            defaults={
                "subject": slot.subject,
                "teacher": slot.teacher,
                "end_time": end_time,
                "room": slot.room,
            },
        )
        lessons.append(lesson)

    return lessons
