from .models import Notification


def notify(
    *, recipient, title: str, body: str, category: str = Notification.Category.GENERAL
) -> Notification:
    """Create a web notification for `recipient`, and push it to Telegram if they're linked.

    This stays the single entry point every feature calls to notify a user,
    regardless of channel — callers never need to know whether Telegram is involved.
    """
    notification = Notification.objects.create(
        recipient=recipient,
        title=title,
        body=body,
        category=category,
    )

    from apps.telegram_bot.services import notify_telegram

    notify_telegram(recipient, f"🔔 {title}\n\n{body}")

    return notification
