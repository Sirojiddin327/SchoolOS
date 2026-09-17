from django.urls import path

from .views import SchoolTimeSettingsView

urlpatterns = [
    path("school-config/", SchoolTimeSettingsView.as_view(), name="school-config"),
]
