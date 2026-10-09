"""Narrowing a queryset to the tenant a request is acting in.

Authorization decides *whether* a caller may act; it does not decide *which rows*
they may see. That is the queryset's job, and every view that returns another
organization's rows is a data leak no matter how strict the permission class is.
These helpers keep that scoping in one place so it can't be forgotten per-view.
"""

from django.db.models import Q, QuerySet


def organization_of(user) -> object | None:
    """The organization `user` is currently signed in to, or None.

    None means "no tenant" — an anonymous user, or an account whose active
    organization was cleared. Callers must treat that as *see nothing*, never
    as *see everything*: falling back to an unscoped queryset is exactly the bug
    this module exists to prevent.
    """
    if not (user and user.is_authenticated):
        return None
    return user.active_organization


def request_active_organization(request) -> object | None:
    """`organization_of` for a DRF request, None for anonymous/bare requests.

    Serializer `validate_*` methods run with `self.context["request"]` present,
    so this is the one-liner that keeps a writable foreign key from being
    another school's row: if there is no tenant, the write is refused.
    """
    return organization_of(getattr(request, "user", None))


def in_organization(user, queryset: QuerySet, *, field: str = "organization") -> QuerySet:
    """`queryset` restricted to `user`'s active organization.

    Models that carry a denormalized `organization` column (see
    `apps.common.models.OrganizationScopedMixin`) are filtered on it directly. A
    user with no active organization gets `none()`, so an unassigned account
    cannot read across tenants by accident.
    """
    organization = organization_of(user)
    if organization is None:
        return queryset.none()
    return queryset.filter(**{field: organization})


def students_in_organization(user, queryset: QuerySet) -> QuerySet:
    """`StudentProfile` rows belonging to `user`'s active organization.

    `StudentProfile` has no `organization` column — a student is placed in a
    tenant by their class, or, while unplaced, by the organization their account
    is signed in to (the same rule `StudentProfile.organization` applies). Both
    halves of that are matched here so a roster or leaderboard cannot drift from
    the tenant that owns the students in it.
    """
    organization = organization_of(user)
    if organization is None:
        return queryset.none()
    return queryset.filter(
        Q(school_class__organization=organization)
        | Q(school_class__isnull=True, user__active_organization=organization)
    )