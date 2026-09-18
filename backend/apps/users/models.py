from typing import ClassVar

from django.contrib.auth.models import AbstractUser
from django.contrib.auth.models import UserManager as DjangoUserManager
from django.db import models
from django.utils.translation import gettext_lazy as _


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

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = ["username"]

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")
        ordering: ClassVar[list[str]] = ["-date_joined"]

    def __str__(self) -> str:
        return f"{self.get_full_name() or self.username} <{self.email}>"

    @property
    def is_director(self) -> bool:
        return self.role == self.Role.DIRECTOR

    @property
    def is_teacher(self) -> bool:
        return self.role == self.Role.TEACHER

    @property
    def is_student(self) -> bool:
        return self.role == self.Role.STUDENT


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
