"""
API URL configuration.

Each new app should register its `urls.py` here, e.g.:

path("", include("apps.users.urls")),
"""

from django.urls import include, path

urlpatterns = [
    path("", include("apps.users.urls")),
]
