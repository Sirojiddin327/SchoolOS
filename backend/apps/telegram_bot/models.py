from typing import ClassVar

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.common.models import TimeStampedModel


class TelegramAccount(TimeStampedModel):
    """Links one CRM user to one Telegram chat, identified by Telegram's own chat id."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        verbose_name=_("user"),
        on_delete=models.CASCADE,
        related_name="telegram_account",
    )
    telegram_id = models.BigIntegerField(_("telegram chat id"), unique=True)
    telegram_username = models.CharField(_("telegram username"), max_length=150, blank=True)

    class Meta:
        verbose_name = _("telegram account")
        verbose_name_plural = _("telegram accounts")

    def __str__(self) -> str:
        return f"{self.user} <-> tg:{self.telegram_id}"


class TelegramLinkCode(TimeStampedModel):
    """A short-lived, single-use code the user types into the bot to link their account."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name=_("user"),
        on_delete=models.CASCADE,
        related_name="telegram_link_codes",
    )
    code = models.CharField(_("code"), max_length=8, unique=True)
    expires_at = models.DateTimeField(_("expires at"))
    used_at = models.DateTimeField(_("used at"), null=True, blank=True)

    class Meta:
        verbose_name = _("telegram link code")
        verbose_name_plural = _("telegram link codes")

    def __str__(self) -> str:
        return f"{self.code} for {self.user}"

    def is_valid(self) -> bool:
        return self.used_at is None and timezone.now() < self.expires_at


class ParentTelegramAccount(TimeStampedModel):
    """Links a parent's Telegram chat to their child's profile.

    Parents have no `User` account in this system, so this can't reuse
    `TelegramAccount` — it keys off `StudentProfile` instead. A parent may link
    the same chat to more than one child, and a student may have more than one
    linked parent, so uniqueness is on the (student, telegram_id) pair, not on
    telegram_id alone.
    """

    student = models.ForeignKey(
        "users.StudentProfile",
        verbose_name=_("student"),
        on_delete=models.CASCADE,
        related_name="parent_telegram_accounts",
    )
    telegram_id = models.BigIntegerField(_("telegram chat id"))
    telegram_username = models.CharField(_("telegram username"), max_length=150, blank=True)

    class Meta:
        verbose_name = _("parent telegram account")
        verbose_name_plural = _("parent telegram accounts")
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["student", "telegram_id"], name="unique_parent_telegram_link"
            )
        ]

    def __str__(self) -> str:
        return f"parent of {self.student} <-> tg:{self.telegram_id}"


class ParentLinkCode(TimeStampedModel):
    """A short-lived, single-use code a student generates and shares with their
    parent, who types it into the bot as `/start <code>` to link their chat."""

    student = models.ForeignKey(
        "users.StudentProfile",
        verbose_name=_("student"),
        on_delete=models.CASCADE,
        related_name="parent_link_codes",
    )
    code = models.CharField(_("code"), max_length=8, unique=True)
    expires_at = models.DateTimeField(_("expires at"))
    used_at = models.DateTimeField(_("used at"), null=True, blank=True)

    class Meta:
        verbose_name = _("parent link code")
        verbose_name_plural = _("parent link codes")

    def __str__(self) -> str:
        return f"{self.code} for parent of {self.student}"

    def is_valid(self) -> bool:
        return self.used_at is None and timezone.now() < self.expires_at
