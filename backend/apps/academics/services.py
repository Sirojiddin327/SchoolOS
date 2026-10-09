from datetime import date, time, timedelta

from django.db.models import Q, QuerySet

from apps.common.tenancy import in_organization
from apps.school_config.models import SchoolTimeSettings

from .models import Lesson, TimetableSlot

# One place builds the daily lesson digest, because it has to be right for
# everyone: the Telegram morning push, and anything that renders the same thing
# in-app. Plain text on purpose — `send_telegram_message` posts without
# `parse_mode`, so Telegram would show markdown asterisks literally.
DAILY_SCHEDULE_TITLE = "Bugungi dars jadvalingiz"
NO_LESSONS_BODY = "Bugun sizda dars rejalashtirilmagan."

# "1️⃣" is a digit, U+FE0F and the combining enclosing keycap U+20E3 — only nine
# of them exist, so anything past the ninth lesson falls back to "10.".
_KEYCAP = "\ufe0f\u20e3"


def _ordinal_badge(position: int) -> str:
    if 1 <= position <= 9:
        return f"{position}{_KEYCAP}"
    return f"{position}."


def _person_name(user) -> str:
    """A name a person would recognise themselves by. `User.__str__` is
    "Name <email>", which is fine in the admin and wrong in a chat message."""
    return user.get_full_name().strip() or user.username


def week_monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def generate_lessons_for_week(week_start: date, organization=None) -> list[Lesson]:
    """Create (or reuse) concrete Lesson rows for every TimetableSlot in the week of `week_start`.

    Idempotent: re-running for the same week never creates duplicates, since lessons
    are keyed on (school_class, date, start_time) — the same key Lesson already enforces
    uniqueness on.

    `organization` is the tenant the director is working in. Slots are scoped to
    it so one director's "generate week" cannot fabricate lessons for *every*
    school on the platform as a side effect. With `organization=None` (tests,
    or a caller that has already narrowed the rows) every slot is used.
    """
    monday = week_monday(week_start)
    lessons = []
    slots = (
        TimetableSlot.objects.select_related("subject", "school_class", "teacher", "secondary_teacher")
        .all()
    )
    if organization is not None:
        slots = slots.filter(organization=organization)
    # Slots may span several tenants in the unscoped case, so bell times come from
    # each slot's own organization rather than from a single global settings row.
    settings_by_org = {}

    for slot in slots:
        if slot.organization_id not in settings_by_org:
            settings_by_org[slot.organization_id] = SchoolTimeSettings.get_solo(slot.organization)
        lesson_date = monday + timedelta(days=slot.day_of_week - 1)
        start_time, end_time = settings_by_org[slot.organization_id].period_times(slot.period_number)
        lesson, _created = Lesson.objects.get_or_create(
            school_class=slot.school_class,
            date=lesson_date,
            start_time=start_time,
            defaults={
                "subject": slot.subject,
                "teacher": slot.teacher,
                "secondary_teacher": slot.secondary_teacher,
                "end_time": end_time,
                "room": slot.room,
            },
        )
        # An existing row still carries whatever teacher used to own this
        # period; if the director has since re-assigned the lesson (or its
        # secondary teacher) in the template, re-running the week must pick
        # that up instead of silently keeping the stale assignment.
        if lesson.teacher_id != slot.teacher_id or lesson.secondary_teacher_id != slot.secondary_teacher_id:
            lesson.teacher = slot.teacher
            lesson.secondary_teacher = slot.secondary_teacher
            lesson.subject = slot.subject
            lesson.end_time = end_time
            lesson.room = slot.room
            lesson.save(update_fields=["teacher", "secondary_teacher", "subject", "end_time", "room"])
        lessons.append(lesson)

    return lessons


def lessons_for_user(user, day: date) -> QuerySet[Lesson]:
    """The lessons `user` personally has on `day`, and nothing else.

    The role decides whose day this is. A student's is their class's. A
    teacher's is the lessons they are actually taking, plus the periods of the
    class they lead. A director has none — there is no per-person schedule to
    send them, and inventing a school-wide one here would be a different feature
    wearing this one's clothes, so this returns nothing rather than guessing.
    """
    if user.is_student:
        profile = user.student_profile
        if profile.school_class_id is None:
            return Lesson.objects.none()
        return in_organization(user, Lesson.objects.filter(school_class_id=profile.school_class_id)).filter(
            date=day
        )

    if user.is_teacher:
        return in_organization(user, Lesson.objects.filter(date=day)).filter(
            Q(teacher=user.teacher_profile)
            | Q(secondary_teacher=user.teacher_profile)
            | Q(school_class__class_teacher=user.teacher_profile)
        ).distinct()

    return Lesson.objects.none()


def _minutes_between(start: time, end: time) -> int:
    """Gap in whole minutes. Negative if the day wraps past midnight, which
    simply reads as "no gap" — a school's days don't, but a bad `Lesson` row
    shouldn't produce a negative tanaffus."""
    return (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute)


def _break_minutes(previous: Lesson, following: Lesson, settings_obj: SchoolTimeSettings) -> int:
    """The real gap between two consecutive lessons, or 0 for an ordinary
    between-period gap.

    Measured off the lessons themselves rather than assumed from the period
    numbers, so a swapped or shortened period reports what actually happened.
    `short_break_minutes` is the threshold: anything longer than the normal
    between-period gap is worth telling someone about.
    """
    gap = _minutes_between(previous.end_time, following.start_time)
    if gap <= settings_obj.short_break_minutes:
        return 0
    return gap


def format_daily_schedule(user, day: date) -> str:
    """`user`'s whole day as one block of plain text, in the order it happens.

    Optional details are omitted rather than printed empty — a lesson with no
    room gets no room line, and a teacher is not told their own name back.
    """
    settings_obj = SchoolTimeSettings.get_solo(user.active_organization)
    lessons = list(
        lessons_for_user(user, day)
        .select_related("subject", "school_class", "teacher__user")
        .order_by("start_time")
    )
    if not lessons:
        return NO_LESSONS_BODY

    # A student already knows which class they are in; a teacher is walking into
    # several, and the class is the part they can't infer.
    show_class = user.is_teacher

    lines: list[str] = []
    for position, lesson in enumerate(lessons):
        if position:
            lines.append("")
        heading = f"{lesson.subject.name} · {lesson.school_class.name}" if show_class else lesson.subject.name
        lines.append(f"{_ordinal_badge(position + 1)} {lesson.start_time:%H:%M} — {heading}")

        if not show_class and lesson.teacher_id:
            teacher_name = _person_name(lesson.teacher.user)
            if teacher_name:
                lines.append(f"👨‍🏫 {teacher_name}")
        if lesson.room:
            lines.append(f"🚪 {lesson.room}")

        if position + 1 < len(lessons):
            gap = _break_minutes(lesson, lessons[position + 1], settings_obj)
            if gap:
                lines.append("")
                lines.append(f"☕ {position + 1}-darsdan keyin — {gap} daqiqa tanaffus")

    return "\n".join(lines)

