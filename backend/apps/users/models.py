from typing import ClassVar

from django.contrib.auth.models import AbstractUser
from django.contrib.auth.models import UserManager as DjangoUserManager
from django.db import models
from django.utils.translation import gettext_lazy as _

# No import cycle: apps.organizations.models refers to the user model by
# `settings.AUTH_USER_MODEL` string and never imports apps.users.
from apps.organizations.models import OrganizationMembership


class UserManager(DjangoUserManager):
    """`createsuperuser` always creates a director account."""

    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault("role", User.Role.DIRECTOR)
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    class Role(models.TextChoices):
        DIRECTOR = "DIRECTOR", _("Director")
        TEACHER = "TEACHER", _("Teacher")
        STUDENT = "STUDENT", _("Student")

    email = models.EmailField(
        _("email address"),
        unique=True,
        help_text=_("Required. A unique email address."),
    )
    role = models.CharField(
        _("role"),
        max_length=20,
        choices=Role.choices,
        default=Role.STUDENT,
    )
    must_change_password = models.BooleanField(
        _("must change password"),
        default=False,
        help_text=_("Set when a temporary password was issued (e.g. bulk import)."),
    )
    avatar = models.ImageField(_("avatar"), upload_to="avatars/", null=True, blank=True)
    active_organization = models.ForeignKey(
        "organizations.Organization",
        verbose_name=_("active organization"),
        related_name="active_users",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text=_(
            "Which organization this user is currently working in. NULL means the "
            "user has no membership yet and the platform falls back to their only "
            "membership, or to no organization at all."
        ),
    )

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = ["username"]

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")
        ordering: ClassVar[list[str]] = ["-date_joined"]

    def __str__(self) -> str:
        return f"{self.get_full_name() or self.username} <{self.email}>"

    def get_active_membership(self):
        """The membership that authorizes this request, or None.

        Resolution order:
          1. `active_organization`, if it is still an ACTIVE membership
          2. the user's single membership, if they only have one
          3. otherwise None — the caller must pick a switch target

        Never falls back to "any membership": with two organizations on the
        same account, guessing would hand the user the wrong permissions.
        """
        if not self.is_authenticated:
            return None

        if self.active_organization_id:
            membership = self.organization_memberships.filter(
                organization_id=self.active_organization_id,
                status=OrganizationMembership.Status.ACTIVE,
            ).first()
            if membership is not None:
                return membership

        memberships = self.organization_memberships.filter(
            status=OrganizationMembership.Status.ACTIVE
        ).order_by("organization_id")
        if len(memberships) == 1:
            return memberships[0]
        return None

    @property
    def active_membership(self):
        cached = getattr(self, "_active_membership_cache", None)
        if cached is not None:
            return cached
        membership = self.get_active_membership()
        self._active_membership_cache = membership
        return membership

    @property
    def active_role(self) -> str | None:
        """The role to authorize this user with, inside the active organization.

        This — not `self.role` — is what access control must use. `User.role`
        stays as a denormalized "primary role" for the current single-school
        deployment and for the login defaults; reading it to decide what someone
        may see or do would grant a school director the powers of a club admin
        they only ever agreed to.
        """
        membership = self.active_membership
        return membership.role if membership is not None else None

    @property
    def is_director(self) -> bool:
        """Director of the *active* organization — not of the account.

        Delegating rather than duplicating: this used to read `User.role`, which
        is one flag for the whole account, so a director of one school was a
        director of every school. `is_teacher`/`is_student` had the same flaw.
        """
        return self.is_org_director

    @property
    def is_teacher(self) -> bool:
        """Teaches in the active organization. Managers are not teachers.

        Mirrors `apps.common.permissions.IsOrgTeacher`: admitting directors here
        would be a widening of access, not a relocation of it.
        """
        return self.is_org_teacher

    @property
    def is_student(self) -> bool:
        """Learns in the active organization."""
        return self.is_org_student

    @property
    def is_org_director(self) -> bool:
        return self.active_role in (
            OrganizationMembership.Role.OWNER,
            OrganizationMembership.Role.ADMIN,
            OrganizationMembership.Role.DIRECTOR,
        )

    @property
    def is_org_teacher(self) -> bool:
        return self.active_role in (
            OrganizationMembership.Role.TEACHER,
            OrganizationMembership.Role.COACH,
        )

    @property
    def is_org_staff(self) -> bool:
        """Anyone who delivers content here — teacher, coach or manager."""
        return self.active_role in OrganizationMembership.STAFF_ROLES

    @property
    def is_org_student(self) -> bool:
        return self.active_role in (
            OrganizationMembership.Role.STUDENT,
            OrganizationMembership.Role.MEMBER,
        )


class TeacherProfile(models.Model):
    """Extra data for users with role=TEACHER."""

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="teacher_profile",
        limit_choices_to={"role": User.Role.TEACHER},
    )
    phone_number = models.CharField(_("phone number"), max_length=20, blank=True)
    bio = models.TextField(_("bio"), blank=True)

    class Meta:
        verbose_name = _("teacher profile")
        verbose_name_plural = _("teacher profiles")

    def __str__(self) -> str:
        return str(self.user)


class StudentProfile(models.Model):
    """Extra data for users with role=STUDENT."""

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="student_profile",
        limit_choices_to={"role": User.Role.STUDENT},
    )
    school_class = models.ForeignKey(
        "schools.SchoolClass",
        verbose_name=_("class"),
        related_name="students",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    birth_date = models.DateField(_("birth date"), null=True, blank=True)
    phone_number = models.CharField(_("phone number"), max_length=20, blank=True)
    parent_phone_number = models.CharField(_("parent phone number"), max_length=20, blank=True)
    total_xp = models.PositiveIntegerField(
        _("total XP"),
        default=0,
        help_text=_("Never edit directly — only apps.gamification.services.award_xp may change this."),
    )

    class Meta:
        verbose_name = _("student profile")
        verbose_name_plural = _("student profiles")

    def __str__(self) -> str:
        return str(self.user)

    @property
    def organization(self):
        """The tenant this student belongs to.

        Their class's organization when they're placed in one, otherwise the
        organization their account is currently signed in to. Used by
        `OrganizationScopedMixin` to stamp rows that hang off a student.
        """
        if self.school_class_id:
            return self.school_class.organization
        return self.user.active_organization
