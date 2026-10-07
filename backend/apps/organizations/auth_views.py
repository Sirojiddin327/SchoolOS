"""Login, refresh and logout — each mints tokens that name the active
organization, so every subsequent request is authorized in it without a second
round trip.
"""

from typing import ClassVar

from rest_framework import serializers
from rest_framework.authentication import get_authorization_header
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenViewBase

from apps.organizations import services
from apps.organizations.authentication import ORG_CLAIM
from apps.organizations.models import OrganizationMembership


def _with_organization(token: RefreshToken, organization) -> RefreshToken:
    token[ORG_CLAIM] = organization.pk
    return token


def _resolve_for_login(user, requested_organization_id):
    """Which organization is this login acting in?

    Falls back to the user's single membership so the common one-organization
    case needs no client input at all. A user with several memberships and no
    `organization` in the request body gets a 400 telling them to choose —
    silently picking one would hand them the wrong permissions.
    """
    if requested_organization_id not in (None, ""):
        try:
            requested_organization_id = int(requested_organization_id)
        except (TypeError, ValueError):
            raise serializers.ValidationError({"organization": "Noto'g'ri tashkilot ID."})
        membership = services.resolve_membership(user, requested_organization_id)
        return membership

    membership = user.active_membership
    if membership is not None:
        return membership

    if services.active_memberships(user).exists():
        raise serializers.ValidationError(
            {"organization": "Siz bir nechta tashkiltda a'zosiz. Tanlang."}
        )
    raise serializers.ValidationError({"organization": "Siz hech qanday tashkilotga a'zo emas."})


class OrganizationTokenObtainPairView(TokenObtainPairView):
    """`/api/auth/login/` — accepts an optional `organization` and stamps the
    returned tokens with it."""

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]

        membership = _resolve_for_login(user, request.data.get("organization"))

        refresh = self.get_refresh_token()
        _with_organization(refresh, membership.organization)
        access = self.get_access_token()
        _with_organization(access, membership.organization)

        data = {
            "refresh": str(refresh),
            "access": str(access),
            "organization": {
                "id": membership.organization_id,
                "name": membership.organization.name,
                "slug": membership.organization.slug,
                "type": membership.organization.type,
            },
            "role": membership.role,
        }
        return Response(data, status=200)


class OrganizationTokenRefreshView(TokenViewBase):
    """`/api/auth/refresh/` — carries the old token's `org_id` into the new one,
    unless the request asks for a different organization, in which case that
    one is validated as a real membership first."""

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated]

    @staticmethod
    def _extract_refresh_token(request):
        body_token = request.data.get("refresh") if hasattr(request, "data") else None
        if body_token:
            return str(body_token)
        header = get_authorization_header(request).split()
        if len(header) == 2 and header[0].lower() == b"bearer":
            return header[1].decode()
        return None

    def post(self, request, *args, **kwargs):
        refresh_token = self._extract_refresh_token(request)

        if not refresh_token:
            return Response({"detail": "Refresh token topilmadi."}, status=400)

        try:
            token = RefreshToken(str(refresh_token))
        except TokenError as e:
            return Response({"detail": str(e)}, status=401)

        user = token.user
        requested = request.data.get("organization")
        if requested in (None, ""):
            membership = services.resolve_membership(user, token.get(ORG_CLAIM))
        else:
            membership = _resolve_for_login(user, requested)

        _with_organization(token, membership.organization)
        return Response(
            {
                "access": str(token.access_token),
                "refresh": str(token),
                "organization": {
                    "id": membership.organization_id,
                    "name": membership.organization.name,
                    "slug": membership.organization.slug,
                    "type": membership.organization.type,
                },
                "role": membership.role,
            }
        )


class MyMembershipsView(APIView):
    """The caller's memberships, without a switch. Lets a client show which
    organizations are available without changing the active one."""

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated]

    def get(self, request):
        return Response(
            {
                "role": request.user.active_role,
                "memberships": [
                    {
                        "organization_id": m.organization_id,
                        "organization_name": m.organization.name,
                        "organization_type": m.organization.type,
                        "role": m.role,
                        "status": m.status,
                    }
                    for m in services.active_memberships(request.user)
                ],
                "manageable": (
                    OrganizationMembership.STAFF_ROLES
                    if request.user.active_role in OrganizationMembership.STAFF_ROLES
                    else ()
                ),
            }
        )
