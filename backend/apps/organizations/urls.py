from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    MyOrganizationsView,
    OrganizationViewSet,
    SwitchOrganizationView,
)

router = DefaultRouter()
router.register("organizations", OrganizationViewSet, basename="organization")

urlpatterns = [
    path("my-organizations/", MyOrganizationsView.as_view(), name="my-organizations"),
    path("switch-organization/", SwitchOrganizationView.as_view(), name="switch-organization"),
    *router.urls,
]
