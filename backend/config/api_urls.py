"""
API URL configuration.

Each new app should register its `urls.py` here, e.g.:

path("", include("apps.users.urls")),
"""

from django.urls import include, path

urlpatterns = [
    path("auth/", include("apps.users.auth_urls")),
    path("", include("apps.users.urls")),
    path("", include("apps.schools.urls")),
    path("", include("apps.academics.urls")),
    path("", include("apps.attendance.urls")),
    path("", include("apps.notifications.urls")),
    path("", include("apps.dashboard.urls")),
    path("", include("apps.school_config.urls")),
    path("", include("apps.telegram_bot.urls")),
    path("", include("apps.learning.urls")),
    path("", include("apps.gamification.urls")),
]
