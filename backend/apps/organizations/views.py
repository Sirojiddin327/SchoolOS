from typing import ClassVar

from django.contrib.auth import get_user_model
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from . import services
from .models import Organization, OrganizationMembership
from .serializers import (
    CreateOrganizationSerializer,
    MembershipCreateSerializer,
    OrganizationMembershipSerializer,
    OrganizationSerializer,
    SwitchOrganizationSerializer,
)

User = get_user_model()


class MyOrganizationsView(APIView):
    """Every organization the caller belongs to, and which one is active.

    The frontend calls this on login to populate the organization switcher,
    which is why it returns the active one explicitly rather than making the
    client infer it from the list order.
    """

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated]

    def get(self, request):
        memberships = services.active_memberships(request.user)
        active_membership = request.user.active_membership
        return Response(
            {
                "active_organization": (
                    OrganizationSerializer(active_membership.organization).data
                    if active_membership
                    else None
                ),
                "active_role": active_membership.role if active_membership else None,
                "organizations": OrganizationSerializer(
                    [m.organization for m in memberships], many=True
                ).data,
                "memberships": OrganizationMembershipSerializer(memberships, many=True).data,
            }
        )


class SwitchOrganizationView(APIView):
    """Move the caller into another organization they belong to.

    Returns a fresh token pair carrying the new `org_id`, so the next request is
    authorized in the new organization without a re-login.
    """

    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated]

    def post(self, request):
        serializer = SwitchOrganizationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        organization = services.switch_organization(
            request.user, serializer.validated_data["organization"]
        )

        refresh = RefreshToken.for_user(request.user)
        refresh["org_id"] = organization.pk
        access = refresh.access_token
        access["org_id"] = organization.pk

        return Response(
            {
                "organization": OrganizationSerializer(organization).data,
                "access": str(access),
                "refresh": str(refresh),
            }
        )


class OrganizationViewSet(viewsets.ModelViewSet):
    """Organizations and their rosters.

    A member sees only the organizations they belong to; only a director of an
    organization may change it or read its roster. The data isolation itself is
    enforced by every other app's queryset scoping — this viewset only decides
    who may manage whom.
    """

    serializer_class = OrganizationSerializer
    permission_classes: ClassVar[list[type[BasePermission]]] = [IsAuthenticated]
    search_fields = ("name", "slug")
    ordering_fields = ("name", "type")

    def get_queryset(self):
        return Organization.objects.filter(
            pk__in=services.active_memberships(self.request.user).values_list(
                "organization_id", flat=True
            )
        )

    def get_serializer_class(self):
        if self.action == "create":
            return CreateOrganizationSerializer
        return OrganizationSerializer

    def perform_create(self, serializer):
        services.create_organization_with_owner(
            **serializer.validated_data,
            owner=self.request.user,
        )

    def _require_director_of(self, instance: Organization) -> None:
        """Managing an organization requires being a director *of it* — being a
        director elsewhere grants nothing here."""
        membership = self.request.user.active_membership
        if (
            membership is None
            or membership.organization_id != instance.pk
            or not self.request.user.is_org_director
        ):
            raise PermissionDenied("Faqat shu tashkilotning direktorligi buni boshqara oladi.")

    def perform_update(self, serializer):
        self._require_director_of(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._require_director_of(instance)
        instance.delete()

    @action(detail=True, methods=["get"])
    def members(self, request, pk=None):
        organization = self.get_object()
        self._require_director_of(organization)

        queryset = OrganizationMembership.objects.filter(
            organization=organization
        ).select_related("user", "organization")
        role = request.query_params.get("role")
        if role:
            queryset = queryset.filter(role=role)
        return Response(OrganizationMembershipSerializer(queryset, many=True).data)

    @action(detail=True, methods=["post"])
    def add_member(self, request, pk=None):
        organization = self.get_object()
        self._require_director_of(organization)

        serializer = MembershipCreateSerializer(
            data={**request.data, "organization": organization.pk}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(
            OrganizationMembershipSerializer(serializer.instance).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["delete"], url_path=r"members/(?P<user_id>\d+)")
    def remove_member(self, request, pk=None, user_id=None):
        organization = self.get_object()
        self._require_director_of(organization)

        if request.user.pk == int(user_id) and organization.memberships.filter(
            user_id=user_id, role=OrganizationMembership.Role.OWNER
        ).exists():
            raise serializers.ValidationError(
                {"detail": "Tashkilot egasi o'z a'zoligini olib qo'yolmaydi."}
            )

        deleted, _ = organization.memberships.filter(user_id=user_id).delete()
        if not deleted:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
