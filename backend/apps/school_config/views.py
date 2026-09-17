from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import IsAuthenticated

from apps.common.permissions import IsDirector

from .models import SchoolTimeSettings
from .serializers import SchoolTimeSettingsSerializer


class SchoolTimeSettingsView(RetrieveUpdateAPIView):
    """Anyone authenticated can read the school hours; only the director can change them."""

    serializer_class = SchoolTimeSettingsSerializer
    http_method_names = ("get", "patch")

    def get_permissions(self):
        if self.request.method == "PATCH":
            return [IsDirector()]
        return [IsAuthenticated()]

    def get_object(self):
        return SchoolTimeSettings.get_solo()
