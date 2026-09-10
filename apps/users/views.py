from django.contrib.auth import get_user_model
from rest_framework import viewsets

from .serializers import UserSerializer

User = get_user_model()


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only endpoint for users."""

    serializer_class = UserSerializer
    queryset = User.objects.all()
    filterset_fields = ("is_active", "is_staff")
    search_fields = ("email", "username", "first_name", "last_name")
    ordering_fields = ("email", "username", "date_joined")
