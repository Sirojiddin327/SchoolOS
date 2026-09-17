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
