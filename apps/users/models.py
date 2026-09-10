from typing import ClassVar

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _


class User(AbstractUser):
    email = models.EmailField(
        _("email address"),
        unique=True,
        help_text=_("Required. A unique email address."),
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = ["username"]

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")
        ordering: ClassVar[list[str]] = ["-date_joined"]

    def __str__(self) -> str:
        return f"{self.get_full_name() or self.username} <{self.email}>"
