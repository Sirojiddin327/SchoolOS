"""Membership resolution and switching.

Every authorization decision in the project goes through `resolve_membership`
so there is exactly one place that decides "which organization is this request
acting in, and may this user act there at all".
"""

from django.db import transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import Organization, OrganizationMembership


def active_memberships(user):
    """Every organization the user may currently sign in to."""
    if not user.is_authenticated:
        return OrganizationMembership.objects.none()
    return user.organization_memberships.filter(
        status=OrganizationMembership.Status.ACTIVE,
        organization__is_active=True,
    ).select_related("organization")


def resolve_membership(user, organization_id=None):
    """The membership authorizing this request, or raise.

    `organization_id` is the value carried by the request — the `org_id` JWT
    claim, set by the login/switch-org endpoints. When absent, the user's
    `active_organization` decides.

    Raises `PermissionDenied` when the user has no membership at all, and
    `ValidationError` when they named an organization they are not a member of
    (distinct messages, so a client can tell "pick an org" from "not yours").
    """
    if not user.is_authenticated:
        raise PermissionDenied("Authentication credentials were not provided.")

    queryset = active_memberships(user)
    if organization_id is not None:
        membership = queryset.filter(organization_id=organization_id).first()
        if membership is None:
            raise PermissionDenied(
                "Siz bu tashkilotga a'zo emas yoki u faol emas."
            )
        return membership

    membership = user.active_membership
    if membership is None:
        if queryset.exists():
            raise ValidationError(
                {
                    "organization": (
                        "Siz bir nechta tashkiltda a'zosiz. Davom etish uchun "
                        "aktiv tashkilotni tanlang."
                    )
                }
            )
        raise PermissionDenied("Siz hech qanday tashkilotga a'zo emas.")
    return membership


def switch_organization(user, organization):
    """Make `organization` the user's active one. Returns the new access token
    pair minted by the caller."""
    # `pk=organization.pk` here compared a *membership* primary key against an
    # organization id, so it only ever matched by coincidence and every switch
    # to a real second organization was denied.
    if not active_memberships(user).filter(organization=organization).exists():
        raise PermissionDenied("Siz bu tashkilotga a'zo emas yoki u faol emas.")
    user.active_organization = organization
    user.save(update_fields=["active_organization"])
    return organization


def create_organization_with_owner(*, name, slug, type, timezone, owner):
    """Create an organization and its first owner in one transaction.

    Used by the director "add organization" flow. The owner is the requesting
    user, so nobody can create an organization they don't belong to.
    """
    if not owner.active_membership or not owner.is_org_director:
        raise PermissionDenied("Faqat direktor yangi tashkilot yarata oladi.")

    with transaction.atomic():
        organization = Organization.objects.create(
            name=name, slug=slug, type=type, timezone=timezone
        )
        OrganizationMembership.objects.create(
            user=owner,
            organization=organization,
            role=OrganizationMembership.Role.OWNER,
            status=OrganizationMembership.Status.ACTIVE,
        )
        if owner.active_organization_id != organization.pk:
            owner.active_organization = organization
            owner.save(update_fields=["active_organization"])
    return organization
