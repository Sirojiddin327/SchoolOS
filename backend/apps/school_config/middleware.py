from django.http import JsonResponse
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

from .models import SchoolTimeSettings

# Students must always be able to authenticate — otherwise they could never even
# reach the point of being told the platform is locked.
EXEMPT_PATH_PREFIXES = (
    "/api/auth/login",
    "/api/auth/refresh",
    "/api/schema",
    "/api/docs",
    "/api/redoc",
)


class SchoolTimeLockMiddleware:
    """Blocks STUDENT accounts from using the web API during school hours.

    Runs as plain Django middleware (not a DRF permission) so every current and
    future API view is covered automatically, with no per-view wiring required.
    Director and Teacher accounts are never affected.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.jwt_authenticator = JWTAuthentication()

    def __call__(self, request):
        settings_obj = self._locked_settings(request)
        if settings_obj is not None:
            return JsonResponse(
                {
                    "detail": (
                        "Iltimos, darsga qatnashing. Platformadan foydalanish "
                        f"soat {settings_obj.end_time:%H:%M} dan keyin ochiladi."
                    )
                },
                status=423,
            )
        return self.get_response(request)

    def _locked_settings(self, request) -> SchoolTimeSettings | None:
        """The student's own organization's settings, if they're locked out.

        Returns the settings row rather than a bool so the lock message can name
        that organization's bell time — timings are per organization, and
        reusing another school's would tell a student the wrong hour.
        """
        if not request.path.startswith("/api/"):
            return None
        if request.path.startswith(EXEMPT_PATH_PREFIXES):
            return None

        user = self._authenticate(request)
        if user is None or not user.is_authenticated or not user.is_student:
            return None

        organization = user.active_organization
        if organization is None:
            return None

        settings_obj = SchoolTimeSettings.get_solo(organization)
        return settings_obj if settings_obj.is_locked_at(timezone.localtime().time()) else None

    def _authenticate(self, request):
        try:
            result = self.jwt_authenticator.authenticate(request)
        except (InvalidToken, TokenError, AuthenticationFailed):
            return None
        return result[0] if result else None