from rest_framework import permissions

from apps.organizations.models import OrganizationMembership

#: Membership roles allowed to manage an organization's people and settings.
MANAGER_ROLES = OrganizationMembership.MANAGER_ROLES
#: Membership roles allowed to teach, coach or otherwise deliver content.
STAFF_ROLES = OrganizationMembership.STAFF_ROLES
#: Membership roles that sit in classes and are taught.
LEARNER_ROLES = OrganizationMembership.LEARNER_ROLES


class IsAuthenticatedOrReadOnly(permissions.IsAuthenticatedOrReadOnly):
    """Allow anonymous read access, require auth for writes."""

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_authenticated


class _IsOrgRole(permissions.BasePermission):
    """Base for organization-scoped role checks.

    Authorization reads the caller's membership in the *active organization*,
    never `User.role`. A school director is not a club admin precisely because
    their club membership — if they have one — says MEMBER, and this is the line
    that enforces it.
    """

    allowed_roles: tuple[str, ...] = ()

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not (user and user.is_authenticated):
            return False
        return user.active_role in self.allowed_roles

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)


class IsOrgMember(_IsOrgRole):
    """Any active member of the organization the request is acting in."""

    allowed_roles = tuple(OrganizationMembership.Role.values)


class IsOrgManager(_IsOrgRole):
    """Owner, admin or director — may manage people and settings."""

    allowed_roles = MANAGER_ROLES


class IsOrgDirector(_IsOrgRole):
    """Owner, admin or director. The school equivalent of the old `IsDirector`."""

    allowed_roles = (
        OrganizationMembership.Role.OWNER,
        OrganizationMembership.Role.ADMIN,
        OrganizationMembership.Role.DIRECTOR,
    )


class IsOrgTeacher(_IsOrgRole):
    """Teaching roles only — teachers and coaches.

    Managers are deliberately *not* included: this mirrors the old
    `user.role == TEACHER` check, and silently letting directors into
    teacher-only endpoints would be a widening of access, not a relocation.
    """

    allowed_roles = (
        OrganizationMembership.Role.TEACHER,
        OrganizationMembership.Role.COACH,
    )


class IsOrgStaff(_IsOrgRole):
    """Anyone who delivers content: owner, admin, director, teacher, coach."""

    allowed_roles = STAFF_ROLES


class IsOrgStudent(_IsOrgRole):
    """Learners: student or member."""

    allowed_roles = LEARNER_ROLES


# The original three names are kept because they are referenced across the
# codebase, but they now mean "in the active organization". `user.is_director` &
# friends on the model still read the denormalized `User.role` and are only for
# display and legacy defaults.
IsDirector = IsOrgDirector
IsTeacher = IsOrgTeacher
IsStudent = IsOrgStudent


class IsDirectorOrReadOnly(permissions.BasePermission):
    """Any authenticated member can read; only a director can write.

    Read access is not a grant — it is narrowed per-view by the queryset, which
    filters to the active organization. This class only decides who may write.
    """

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not (user and user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return user.active_role in tuple(OrganizationMembership.Role.values)
        return user.active_role in IsDirector.allowed_roles
