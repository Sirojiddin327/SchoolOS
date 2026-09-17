"""Place custom permission classes used across the project here."""

from rest_framework.permissions import BasePermission


class IsOwnerOrReadOnly(BasePermission):
    """Allow write access only to the object owner and staff users."""

    message = "Only the owner can modify this resource."

    def has_object_permission(self, request, view, obj):
        if request.method in {"GET", "HEAD", "OPTIONS"}:
            return True
        return request.user.is_staff or obj.user_id == request.user.id
