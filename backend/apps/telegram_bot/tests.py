from datetime import timedelta

from asgiref.sync import async_to_sync
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.common.testing import (
    make_lesson,
    make_school_class,
    make_student,
    make_subject,
    make_teacher,
)
from apps.gamification.models import Achievement, StudentAchievement, XPTransaction
from apps.gamification.services import award_xp, check_achievements
from apps.learning.models import Test

from .management.commands.runbot import (
    available_tests_text,
    class_xp_text,
    my_achievements_text,
    my_xp_text,
)
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


class BotGamificationTextTests(TestCase):
    """The bot's async handlers are thin text-formatters over already-tested
    queries/services — these confirm the formatting and scoping, called via
    `async_to_sync` the same way the handlers themselves call sync ORM code.
    """

    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, self.teacher = make_teacher()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)

    def test_available_tests_lists_only_published_untaken_tests_for_the_students_class(self):
        Test.objects.create(
            title="Test 1", subject=self.subject, school_class=self.school_class,
            teacher=self.teacher, is_published=True,
        )
        other_class = make_school_class()
        Test.objects.create(
            title="Boshqa sinf testi", subject=self.subject, school_class=other_class,
            teacher=self.teacher, is_published=True,
        )
        Test.objects.create(
            title="Draft test", subject=self.subject, school_class=self.school_class,
            teacher=self.teacher, is_published=False,
        )

        text = async_to_sync(available_tests_text)(self.student_user)

        self.assertIn("Test 1", text)
        self.assertNotIn("Boshqa sinf testi", text)
        self.assertNotIn("Draft test", text)

    def test_my_xp_text_reports_total_xp_and_streak(self):
        award_xp(
            student=self.student, amount=30, source=XPTransaction.Source.TEST,
            related_object=None, reason="x",
        )

        text = async_to_sync(my_xp_text)(self.student_user)

        self.assertIn("30", text)

    def test_my_achievements_text_lists_unlocked_achievements(self):
        Achievement.objects.create(
            name="Bot Test Achievement", description="d",
            condition_type=Achievement.ConditionType.XP_THRESHOLD, condition_value=0,
        )
        check_achievements(self.student)
        self.assertTrue(StudentAchievement.objects.filter(student=self.student).exists())

        text = async_to_sync(my_achievements_text)(self.student_user)

        self.assertIn("Bot Test Achievement", text)

    def test_class_xp_text_lists_teachers_classes_sorted_by_xp_descending(self):
        led_class = make_school_class(class_teacher=self.teacher)
        led_class.total_xp = 40
        led_class.save()

        taught_class = make_school_class()
        taught_class.total_xp = 90
        taught_class.save()
        make_lesson(school_class=taught_class, subject=self.subject, teacher=self.teacher)

        text = async_to_sync(class_xp_text)(self.teacher_user)

        self.assertIn(f"{taught_class.name}: 90 XP", text)
        self.assertIn(f"{led_class.name}: 40 XP", text)
        self.assertLess(text.index(taught_class.name), text.index(led_class.name))
