from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from apps.common.testing import make_director, make_teacher

from .models import Notification
from .services import notify


class NotifyServiceTests(TestCase):
    def test_notify_creates_a_web_notification(self):
        recipient = make_director()
        notification = notify(recipient=recipient, title="Salom", body="Test xabar")

        self.assertEqual(Notification.objects.count(), 1)
        self.assertEqual(notification.recipient, recipient)
        self.assertEqual(notification.title, "Salom")

    def test_notify_does_not_raise_when_recipient_has_no_linked_telegram_account(self):
        recipient = make_director()
        # No TelegramAccount exists for `recipient` — the Telegram push must be a
        # silent no-op, never an exception that would break the calling feature.
        notify(recipient=recipient, title="Salom", body="Test xabar")


class NotificationMarkReadAPITests(APITestCase):
    def setUp(self):
        self.owner_user, _ = make_teacher()
        self.other_user, _ = make_teacher()
        self.notification = notify(recipient=self.owner_user, title="Salom", body="Test")

    def test_owner_can_mark_their_notification_read(self):
        self.client.force_authenticate(self.owner_user)
        response = self.client.patch(f"/api/notifications/{self.notification.id}/mark-read/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.notification.refresh_from_db()
        self.assertTrue(self.notification.is_read)

    def test_another_user_cannot_see_or_mark_someone_elses_notification(self):
        self.client.force_authenticate(self.other_user)
        response = self.client.patch(f"/api/notifications/{self.notification.id}/mark-read/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
