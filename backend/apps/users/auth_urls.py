from django.urls import path

from apps.organizations.auth_views import (
    MyMembershipsView,
    OrganizationTokenObtainPairView,
    OrganizationTokenRefreshView,
)

from .views import AvatarView, ChangePasswordView, MeView, ParentContactView

urlpatterns = [
    path("login/", OrganizationTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("refresh/", OrganizationTokenRefreshView.as_view(), name="token_refresh"),
    path("me/", MeView.as_view(), name="me"),
    path("my-memberships/", MyMembershipsView.as_view(), name="my-memberships"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("avatar/", AvatarView.as_view(), name="avatar"),
    path("parent-contact/", ParentContactView.as_view(), name="parent-contact"),
]
