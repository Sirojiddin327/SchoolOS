"""Shared model factories for tests. Plain functions — no factory_boy dependency."""

import itertools
from datetime import date, time

from apps.academics.models import Lesson, Subject, TimetableSlot
from apps.organizations.models import Organization, OrganizationMembership
from apps.schools.models import SchoolClass
from apps.users.models import StudentProfile, TeacherProfile, User

_counter = itertools.count(1)

#: The single organization every factory-created user belongs to unless the test
#: says otherwise. Authorization is membership-based, so a user with no
#: membership is nobody — factories must create one or every test would be
#: asserting on a 403.
_DEFAULT_ORGANIZATION_SLUG = "test-school"


def _unique(prefix: str) -> str:
    return f"{prefix}{next(_counter)}"


def default_organization() -> Organization:
    """The shared school organization, created on first use.

    Deliberately not memoized: `TestCase` wraps each test in a transaction that
    is rolled back, so a cached row is gone — and its PK may since have been
    handed to a different organization — by the time the next test asks for it.
    A stale PK here surfaced as "invalid foreign key: active_organization_id
    contains a value 'N'" on the *next* test's user. `get_or_create` is one
    cheap SELECT inside a test, so correctness wins over the saving.
    """
    organization, _created = Organization.objects.get_or_create(
        slug=_DEFAULT_ORGANIZATION_SLUG,
        defaults={"name": "Test School", "type": Organization.Type.SCHOOL},
    )
    return organization


def reset_organization_cache() -> None:
    """Kept for callers that reached for it; there is no cache to clear now."""
    return


def make_organization(name: str | None = None, **kwargs) -> Organization:
    return Organization.objects.create(
        name=name or _unique("Org-"),
        slug=kwargs.pop("slug", None) or _unique("org-"),
        **kwargs,
    )


def add_membership(user: User, organization: Organization | None = None, **kwargs) -> OrganizationMembership:
    """Give a user a membership, and make it their active organization."""
    organization = organization or default_organization()
    membership, _created = OrganizationMembership.objects.get_or_create(
        user=user,
        organization=organization,
        defaults={"role": kwargs.pop("role", _role_for(user)), "status": "ACTIVE"},
    )
    if kwargs:
        for attr, value in kwargs.items():
            setattr(membership, attr, value)
        membership.save()
    if user.active_organization_id != organization.pk:
        user.active_organization = organization
        user.save(update_fields=["active_organization"])
    return membership


def _role_for(user: User) -> str:
    """`User.role` -> the equivalent membership role, for the single-school case."""
    return {
        User.Role.DIRECTOR: OrganizationMembership.Role.DIRECTOR,
        User.Role.TEACHER: OrganizationMembership.Role.TEACHER,
        User.Role.STUDENT: OrganizationMembership.Role.STUDENT,
    }.get(user.role, OrganizationMembership.Role.MEMBER)


def make_user(role: str, **kwargs) -> User:
    tag = _unique("user")
    kwargs.setdefault("username", tag)
    kwargs.setdefault("email", f"{tag}@example.com")
    kwargs.setdefault("first_name", "Test")
    kwargs.setdefault("last_name", "User")
    organization = kwargs.pop("organization", None)
    user = User(role=role, **kwargs)
    user.set_password("pass12345")
    user.save()
    add_membership(user, organization)
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
    name: str | None = None,
    class_teacher: TeacherProfile | None = None,
    organization: Organization | None = None,
) -> SchoolClass:
    return SchoolClass.objects.create(
        name=name or _unique("Class-"),
        class_teacher=class_teacher,
        organization=organization or default_organization(),
    )


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
