"""Resolves the organization a request is acting in.

DRF gives views a `request`, and everything downstream needs `request.organization`
and `request.organization_membership`. Rather than repeating the lookup in every
view, an authentication class fills it once, in `authenticate()` — which DRF calls
for every request that carries credentials.

The `org_id` claim is the source of truth. It is set at login and re-set by
`/api/switch-organization/`, so switching organizations takes effect on the very
next request instead of waiting for a token to expire. A claim naming an
organization the user isn't an active member of is rejected outright (403) rather
than silently downgraded — a tampered or stale token must not fall back to "any
membership", because with two organizations on one account that would mean
granting the wrong permissions.
"""

from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.organizations import services

#: The JWT claim naming the active organization.
ORG_CLAIM = "org_id"


class OrganizationJWTAuthentication(JWTAuthentication):
    """`JWTAuthentication` plus an active-organization membership on the request."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user, token = result
        claim = token.get(ORG_CLAIM) if hasattr(token, "get") else None
        if claim is not None:
            try:
                claim = int(claim)
            except (TypeError, ValueError):
                raise exceptions.AuthenticationFailed(
                    _("Tokendagi tashkilot ma'lumoti noto'g'ri."), code="invalid_org"
                )

        request.user = user
        request.organization = None
        request.organization_membership = services.resolve_membership(user, claim)
        request.organization = request.organization_membership.organization
        return result


class OrganizationHeaderAuthentication(OrganizationJWTAuthentication):
    """Same as above, but an `X-Organization-Id` header wins over the token claim.

    Lets a client with several organizations act in one without holding several
    tokens. The header is only ever accepted when it names an organization the
    user is genuinely an active member of, so it cannot widen access.
    """

    HEADER = "HTTP_X_ORGANIZATION_ID"

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        user = request.user
        header = request.META.get(self.HEADER)
        if not header:
            return result

        try:
            organization_id = int(header)
        except (TypeError, ValueError):
            raise exceptions.AuthenticationFailed(
                _("X-Organization-Id sarlavhasi noto'g'ri."), code="invalid_org"
            )

        request.organization_membership = services.resolve_membership(user, organization_id)
        request.organization = request.organization_membership.organization
        return result


def organization_for_request(request):
    """`request.organization`, or None when the request was never authenticated
    with organization context (anonymous, or a non-JWT session)."""
    return getattr(request, "organization", None)


def organization_required(request):
    """`request.organization`, raising 403 if absent."""
    organization = organization_for_request(request)
    if organization is None:
        raise exceptions.PermissionDenied(_("Tashkilot konteksti talab qilinadi."))
    return organization


__all__ = [
    "ORG_CLAIM",
    "OrganizationHeaderAuthentication",
    "OrganizationJWTAuthentication",
    "organization_for_request",
    "organization_required",
]
