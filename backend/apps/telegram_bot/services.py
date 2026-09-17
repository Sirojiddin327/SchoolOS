import logging
import secrets
from datetime import timedelta

import requests
from django.conf import settings
from django.utils import timezone

from .models import TelegramAccount, TelegramLinkCode

logger = logging.getLogger(__name__)

LINK_CODE_TTL = timedelta(minutes=10)
_TELEGRAM_API_URL = "https://api.telegram.org/bot{token}/{method}"


def generate_link_code(user) -> TelegramLinkCode:
    """One active code per user at a time — requesting a new one invalidates the old."""
    TelegramLinkCode.objects.filter(user=user, used_at__isnull=True).delete()
    code = f"{secrets.randbelow(1_000_000):06d}"
    return TelegramLinkCode.objects.create(
        user=user, code=code, expires_at=timezone.now() + LINK_CODE_TTL
    )


def send_telegram_message(chat_id: int, text: str) -> bool:
    """Plain synchronous call to the Bot HTTP API. Never raises — logs and returns False on failure."""
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return False
    url = _TELEGRAM_API_URL.format(token=token, method="sendMessage")
    try:
        response = requests.post(url, json={"chat_id": chat_id, "text": text}, timeout=5)
        response.raise_for_status()
        return True
    except requests.RequestException:
        logger.warning("Failed to deliver Telegram message to chat_id=%s", chat_id)
        return False


def notify_telegram(user, text: str) -> bool:
    """Best-effort push to `user`'s linked Telegram chat, if any."""
    account = TelegramAccount.objects.filter(user=user).first()
    if account is None:
        return False
    return send_telegram_message(account.telegram_id, text)
