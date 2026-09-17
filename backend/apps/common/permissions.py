from rest_framework import permissions


class IsAuthenticatedOrReadOnly(permissions.IsAuthenticatedOrReadOnly):
    """Allow anonymous read access, require auth for writes."""

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_authenticated


class IsDirector(permissions.BasePermission):
    """Grants access to authenticated users with the DIRECTOR role."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_director)


class IsTeacher(permissions.BasePermission):
    """Grants access to authenticated users with the TEACHER role."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_teacher)


class IsStudent(permissions.BasePermission):
    """Grants access to authenticated users with the STUDENT role."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_student)


class IsDirectorOrReadOnly(permissions.BasePermission):
    """Any authenticated user can read; only the director can write."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_director
