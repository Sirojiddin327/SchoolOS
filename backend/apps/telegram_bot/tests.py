from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.common.testing import make_teacher

from .models import TelegramAccount, TelegramLinkCode
from .services import generate_link_code


class LinkCodeServiceTests(TestCase):
    def setUp(self):
        self.user, _ = make_teacher()

    def test_generate_link_code_creates_a_valid_code(self):
        link_code = generate_link_code(self.user)
        self.assertTrue(link_code.is_valid())
        self.assertEqual(link_code.user, self.user)

    def test_requesting_a_new_code_invalidates_the_previous_one(self):
        first = generate_link_code(self.user)
        generate_link_code(self.user)
        self.assertFalse(TelegramLinkCode.objects.filter(pk=first.pk).exists())

    def test_used_code_is_not_valid(self):
        link_code = generate_link_code(self.user)
        link_code.used_at = timezone.now()
        link_code.save(update_fields=["used_at"])
        self.assertFalse(link_code.is_valid())

    def test_expired_code_is_not_valid(self):
        link_code = generate_link_code(self.user)
        link_code.expires_at = timezone.now() - timedelta(seconds=1)
        link_code.save(update_fields=["expires_at"])
        self.assertFalse(link_code.is_valid())


class TelegramLinkCodeAPITests(APITestCase):
    def setUp(self):
        self.user, _ = make_teacher()

    def test_authenticated_user_can_request_a_link_code(self):
        self.client.force_authenticate(self.user)
        response = self.client.post("/api/telegram/link-code/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("code", response.data)

    def test_anonymous_user_cannot_request_a_link_code(self):
        response = self.client.post("/api/telegram/link-code/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class TelegramStatusAndUnlinkAPITests(APITestCase):
    def setUp(self):
        self.user, _ = make_teacher()

    def test_status_reports_unlinked_by_default(self):
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/telegram/status/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["linked"])

    def test_status_reports_linked_after_account_created(self):
        TelegramAccount.objects.create(user=self.user, telegram_id=123456)
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/telegram/status/")
        self.assertTrue(response.data["linked"])

    def test_unlink_removes_the_account(self):
        TelegramAccount.objects.create(user=self.user, telegram_id=123456)
        self.client.force_authenticate(self.user)
        response = self.client.delete("/api/telegram/unlink/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(TelegramAccount.objects.filter(user=self.user).exists())
