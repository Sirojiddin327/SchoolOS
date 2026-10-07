from typing import ClassVar

"""Tenancy core: an `Organization` is any place the platform is used, and a
`OrganizationMembership` is one person's role *inside* one of them.

`users.User` stays a global identity on purpose — the same person can teach at a
school and run a club, so which role they hold must never live on the user row.
It lives here, per organization, which is what makes "a school director is not
automatically a club admin" fall out of the data model instead of being a rule
somewhere in a view.
"""

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.models import TimeStampedModel

#: Slug of the organization every existing row is backfilled into. Kept as a
#: constant (not a setting) because migrations must resolve it deterministically.
DEFAULT_SCHOOL_SLUG = "main-school"


class Organization(TimeStampedModel):
    """A school, a club, or a course. The isolation boundary for all data."""

    class Type(models.TextChoices):
        SCHOOL = "SCHOOL", _("School")
        CLUB = "CLUB", _("Club")
        COURSE = "COURSE", _("Course")

    type = models.CharField(_("type"), max_length=10, choices=Type.choices, default=Type.SCHOOL)
    name = models.CharField(_("name"), max_length=150)
    slug = models.SlugField(_("slug"), max_length=150, unique=True)
    timezone = models.CharField(
        _("timezone"),
        max_length=64,
        default="Asia/Tashkent",
        help_text=_("IANA name. Drives this organization's clock and notifications."),
    )
    is_active = models.BooleanField(
        _("is active"),
        default=True,
        help_text=_("Inactive organizations keep their data but nobody can sign in to them."),
    )

    class Meta:
        verbose_name = _("organization")
        verbose_name_plural = _("organizations")
        ordering = ("type", "name")

    def __str__(self) -> str:
        return self.name


class OrganizationMembership(TimeStampedModel):
    """One person's role inside one organization.

    Uniqueness on `(user, organization)` is what lets a user belong to several
    organizations while holding a different role in each.
    """

    class Role(models.TextChoices):
        OWNER = "OWNER", _("Owner")
        ADMIN = "ADMIN", _("Administrator")
        DIRECTOR = "DIRECTOR", _("Director")
        TEACHER = "TEACHER", _("Teacher")
        COACH = "COACH", _("Coach")
        STUDENT = "STUDENT", _("Student")
        MEMBER = "MEMBER", _("Member")

    #: Roles that may administer an organization's content. Deliberately does
    #: NOT include STUDENT/MEMBER.
    STAFF_ROLES = (Role.OWNER, Role.ADMIN, Role.DIRECTOR, Role.TEACHER, Role.COACH)
    #: Roles that manage people and settings but don't teach.
    MANAGER_ROLES = (Role.OWNER, Role.ADMIN, Role.DIRECTOR)
    #: Roles that sit in classes and are taught. Mirrors
    #: `apps.common.permissions.IsOrgStudent`.
    LEARNER_ROLES = (Role.STUDENT, Role.MEMBER)

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", _("Active")
        INVITED = "INVITED", _("Invited")
        SUSPENDED = "SUSPENDED", _("Suspended")

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("user"),
        related_name="organization_memberships",
        on_delete=models.CASCADE,
    )
    organization = models.ForeignKey(
        Organization,
        verbose_name=_("organization"),
        related_name="memberships",
        on_delete=models.CASCADE,
    )
    role = models.CharField(_("role"), max_length=20, choices=Role.choices)
    status = models.CharField(
        _("status"), max_length=10, choices=Status.choices, default=Status.ACTIVE
    )
    joined_at = models.DateTimeField(_("joined at"), null=True, blank=True)

    class Meta:
        verbose_name = _("organization membership")
        verbose_name_plural = _("organization memberships")
        ordering = ("organization__type", "organization__name", "role", "user__email")
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["user", "organization"], name="unique_user_organization_membership"
            )
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["organization", "role"], name="org_membership_role_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.user} @ {self.organization} ({self.role})"

    @property
    def is_active_member(self) -> bool:
        return self.status == self.Status.ACTIVE
