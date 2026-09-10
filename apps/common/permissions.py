from rest_framework import permissions


class IsAuthenticatedOrReadOnly(permissions.IsAuthenticatedOrReadOnly):
    """Allow anonymous read access, require auth for writes."""

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_authenticated
