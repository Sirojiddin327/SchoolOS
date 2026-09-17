from django.urls import path

from .views import TelegramLinkCodeView, TelegramStatusView, TelegramUnlinkView

urlpatterns = [
    path("telegram/link-code/", TelegramLinkCodeView.as_view(), name="telegram-link-code"),
    path("telegram/status/", TelegramStatusView.as_view(), name="telegram-status"),
    path("telegram/unlink/", TelegramUnlinkView.as_view(), name="telegram-unlink"),
]
