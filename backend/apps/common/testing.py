"""Shared model factories for tests. Plain functions — no factory_boy dependency."""

import itertools
from datetime import date, time

from apps.academics.models import Lesson, Subject, TimetableSlot
from apps.schools.models import SchoolClass
from apps.users.models import StudentProfile, TeacherProfile, User

_counter = itertools.count(1)


def _unique(prefix: str) -> str:
    return f"{prefix}{next(_counter)}"


def make_user(role: str, **kwargs) -> User:
    tag = _unique("user")
    kwargs.setdefault("username", tag)
    kwargs.setdefault("email", f"{tag}@example.com")
    kwargs.setdefault("first_name", "Test")
    kwargs.setdefault("last_name", "User")
    user = User(role=role, **kwargs)
    user.set_password("pass12345")
    user.save()
    return user


def make_director(**kwargs) -> User:
    return make_user(User.Role.DIRECTOR, **kwargs)


def make_teacher(**kwargs) -> tuple[User, TeacherProfile]:
    user = make_user(User.Role.TEACHER, **kwargs)
    profile = TeacherProfile.objects.create(user=user)
    return user, profile


def make_student(school_class: SchoolClass | None = None, **kwargs) -> tuple[User, StudentProfile]:
    user = make_user(User.Role.STUDENT, **kwargs)
    profile = StudentProfile.objects.create(user=user, school_class=school_class)
    return user, profile


def make_school_class(
    name: str | None = None, class_teacher: TeacherProfile | None = None
) -> SchoolClass:
    return SchoolClass.objects.create(name=name or _unique("Class-"), class_teacher=class_teacher)


def make_subject(name: str | None = None) -> Subject:
    return Subject.objects.create(name=name or _unique("Subject-"))


def make_lesson(
    *,
    school_class: SchoolClass,
    subject: Subject,
    teacher: TeacherProfile,
    lesson_date: date = date(2026, 9, 21),
    start_time: time = time(9, 0),
    end_time: time = time(9, 45),
    **kwargs,
) -> Lesson:
    return Lesson.objects.create(
        school_class=school_class,
        subject=subject,
        teacher=teacher,
        date=lesson_date,
        start_time=start_time,
        end_time=end_time,
        **kwargs,
    )


def make_timetable_slot(
    *,
    school_class: SchoolClass,
    subject: Subject,
    teacher: TeacherProfile,
    day_of_week: int = 1,
    period_number: int = 1,
    **kwargs,
) -> TimetableSlot:
    return TimetableSlot.objects.create(
        school_class=school_class,
        subject=subject,
        teacher=teacher,
        day_of_week=day_of_week,
        period_number=period_number,
        **kwargs,
    )
