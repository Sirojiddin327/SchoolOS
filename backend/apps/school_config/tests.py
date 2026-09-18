from datetime import time
from unittest.mock import patch

from django.http import HttpResponse
from django.test import RequestFactory, TestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.common.testing import make_director, make_student, make_teacher

from .middleware import SchoolTimeLockMiddleware
from .models import SchoolTimeSettings


class PeriodTimesTests(TestCase):
    def setUp(self):
        self.settings_obj = SchoolTimeSettings.get_solo()
        self.settings_obj.start_time = time(8, 0)
        self.settings_obj.period_duration_minutes = 45
        self.settings_obj.short_break_minutes = 5
        self.settings_obj.long_break_after_period = 2
        self.settings_obj.long_break_minutes = 20
        self.settings_obj.save()

    def test_first_period_starts_at_school_start_time(self):
        start, end = self.settings_obj.period_times(1)
        self.assertEqual(start, time(8, 0))
        self.assertEqual(end, time(8, 45))

    def test_period_after_long_break_reflects_break_length(self):
        # period1: 08:00-08:45, then a short break (period 1 != long_break_after_period)
        # period2: 08:50-09:35, then the long break (period 2 == long_break_after_period)
        # period3 starts after the 20-minute long break: 09:55
        start, _end = self.settings_obj.period_times(3)
        self.assertEqual(start, time(9, 55))

    def test_singleton_always_returns_the_same_row(self):
        first = SchoolTimeSettings.get_solo()
        second = SchoolTimeSettings.get_solo()
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(SchoolTimeSettings.objects.count(), 1)


class SchoolTimeLockMiddlewareTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.middleware = SchoolTimeLockMiddleware(lambda request: HttpResponse("OK"))
        settings_obj = SchoolTimeSettings.get_solo()
        settings_obj.start_time = time(8, 0)
        settings_obj.end_time = time(13, 10)
        settings_obj.save()

    def _authed_request(self, user, path="/api/dashboard/student/"):
        token = str(RefreshToken.for_user(user).access_token)
        return self.factory.get(path, HTTP_AUTHORIZATION=f"Bearer {token}")

    @patch("apps.school_config.middleware.timezone")
    def test_student_locked_out_during_school_hours(self, mock_timezone):
        mock_timezone.localtime.return_value.time.return_value = time(9, 0)
        student_user, _ = make_student()
        response = self.middleware(self._authed_request(student_user))
        self.assertEqual(response.status_code, 423)

    @patch("apps.school_config.middleware.timezone")
    def test_student_allowed_outside_school_hours(self, mock_timezone):
        mock_timezone.localtime.return_value.time.return_value = time(14, 0)
        student_user, _ = make_student()
        response = self.middleware(self._authed_request(student_user))
        self.assertEqual(response.status_code, 200)

    @patch("apps.school_config.middleware.timezone")
    def test_director_never_blocked(self, mock_timezone):
        mock_timezone.localtime.return_value.time.return_value = time(9, 0)
        director = make_director()
        response = self.middleware(self._authed_request(director))
        self.assertEqual(response.status_code, 200)

    @patch("apps.school_config.middleware.timezone")
    def test_teacher_never_blocked(self, mock_timezone):
        mock_timezone.localtime.return_value.time.return_value = time(9, 0)
        teacher_user, _ = make_teacher()
        response = self.middleware(self._authed_request(teacher_user))
        self.assertEqual(response.status_code, 200)

    def test_login_endpoint_is_always_exempt(self):
        request = self.factory.post("/api/auth/login/")
        response = self.middleware(request)
        self.assertEqual(response.status_code, 200)
