from datetime import timedelta
from unittest.mock import patch

from asgiref.sync import async_to_sync
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.attendance.models import Attendance
from apps.attendance.services import mark_lesson_attendance
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
from apps.users.models import User

from .management.commands.runbot import (
    STUDENT_MENU,
    TEACHER_MENU,
    available_tests_text,
    class_xp_text,
    get_linked_user,
    menu_for,
    my_achievements_text,
    my_xp_text,
    parent_attendance_text,
    parent_progress_text,
    prime_role_cache,
    today_lessons_text,
)
from .models import ParentLinkCode, ParentTelegramAccount, TelegramAccount, TelegramLinkCode
from .services import generate_link_code, generate_parent_link_code, notify_parents


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


class ParentLinkCodeServiceTests(TestCase):
    def setUp(self):
        self.school_class = make_school_class()
        _, self.student = make_student(self.school_class)

    def test_generate_parent_link_code_creates_a_valid_code(self):
        link_code = generate_parent_link_code(self.student)
        self.assertTrue(link_code.is_valid())
        self.assertEqual(link_code.student, self.student)

    def test_requesting_a_new_code_invalidates_the_previous_one(self):
        first = generate_parent_link_code(self.student)
        generate_parent_link_code(self.student)
        self.assertFalse(ParentLinkCode.objects.filter(pk=first.pk).exists())

    def test_used_code_is_not_valid(self):
        link_code = generate_parent_link_code(self.student)
        link_code.used_at = timezone.now()
        link_code.save(update_fields=["used_at"])
        self.assertFalse(link_code.is_valid())

    def test_expired_code_is_not_valid(self):
        link_code = generate_parent_link_code(self.student)
        link_code.expires_at = timezone.now() - timedelta(seconds=1)
        link_code.save(update_fields=["expires_at"])
        self.assertFalse(link_code.is_valid())


class ParentLinkCodeAPITests(APITestCase):
    def setUp(self):
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        self.teacher_user, _ = make_teacher()

    def test_student_can_request_a_parent_link_code(self):
        self.client.force_authenticate(self.student_user)
        response = self.client.post("/api/telegram/parent-link-code/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("code", response.data)

    def test_teacher_cannot_request_a_parent_link_code(self):
        self.client.force_authenticate(self.teacher_user)
        response = self.client.post("/api/telegram/parent-link-code/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_cannot_request_a_parent_link_code(self):
        response = self.client.post("/api/telegram/parent-link-code/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ParentTelegramAccountsAPITests(APITestCase):
    def setUp(self):
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)

    def test_lists_only_own_linked_parent_accounts(self):
        ParentTelegramAccount.objects.create(
            student=self.student, telegram_id=111, telegram_username="ota1"
        )
        _other_student_user, other_student = make_student(self.school_class)
        ParentTelegramAccount.objects.create(student=other_student, telegram_id=222)

        self.client.force_authenticate(self.student_user)
        response = self.client.get("/api/telegram/parent-accounts/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["telegram_username"], "ota1")

    def test_student_can_unlink_own_parent_account(self):
        account = ParentTelegramAccount.objects.create(student=self.student, telegram_id=111)
        self.client.force_authenticate(self.student_user)
        response = self.client.delete(f"/api/telegram/parent-accounts/{account.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ParentTelegramAccount.objects.filter(pk=account.pk).exists())

    def test_student_cannot_unlink_another_students_parent_account(self):
        _other_student_user, other_student = make_student(self.school_class)
        account = ParentTelegramAccount.objects.create(student=other_student, telegram_id=111)
        self.client.force_authenticate(self.student_user)
        response = self.client.delete(f"/api/telegram/parent-accounts/{account.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(ParentTelegramAccount.objects.filter(pk=account.pk).exists())


class NotifyParentsServiceTests(TestCase):
    def setUp(self):
        self.school_class = make_school_class()
        _, self.student = make_student(self.school_class)

    @patch("apps.telegram_bot.services.send_telegram_message")
    def test_pushes_to_every_linked_parent_account(self, mock_send):
        ParentTelegramAccount.objects.create(student=self.student, telegram_id=111)
        ParentTelegramAccount.objects.create(student=self.student, telegram_id=222)

        notify_parents(self.student, "Salom")

        self.assertEqual(mock_send.call_count, 2)
        sent_chat_ids = {call.args[0] for call in mock_send.call_args_list}
        self.assertEqual(sent_chat_ids, {111, 222})

    @patch("apps.telegram_bot.services.send_telegram_message")
    def test_does_nothing_when_no_parent_is_linked(self, mock_send):
        notify_parents(self.student, "Salom")
        mock_send.assert_not_called()


class AttendanceParentNotificationTests(TestCase):
    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, self.teacher = make_teacher()
        self.school_class = make_school_class()
        _, self.student = make_student(self.school_class)
        self.lesson = make_lesson(
            school_class=self.school_class, subject=self.subject, teacher=self.teacher
        )
        ParentTelegramAccount.objects.create(student=self.student, telegram_id=111)

    @patch("apps.telegram_bot.services.send_telegram_message")
    def test_absent_notifies_linked_parent(self, mock_send):
        mark_lesson_attendance(
            lesson=self.lesson,
            records=[{"student": self.student, "status": Attendance.Status.ABSENT}],
            marked_by=self.teacher_user,
        )
        mock_send.assert_called_once()
        self.assertEqual(mock_send.call_args.args[0], 111)
        self.assertIn("kelmadi", mock_send.call_args.args[1])

    @patch("apps.telegram_bot.services.send_telegram_message")
    def test_late_notifies_linked_parent(self, mock_send):
        mark_lesson_attendance(
            lesson=self.lesson,
            records=[{"student": self.student, "status": Attendance.Status.LATE}],
            marked_by=self.teacher_user,
        )
        mock_send.assert_called_once()
        self.assertIn("kechikdi", mock_send.call_args.args[1])

    @patch("apps.telegram_bot.services.send_telegram_message")
    def test_present_does_not_notify_parent(self, mock_send):
        mark_lesson_attendance(
            lesson=self.lesson,
            records=[{"student": self.student, "status": Attendance.Status.PRESENT}],
            marked_by=self.teacher_user,
        )
        mock_send.assert_not_called()


class ParentBotTextTests(TestCase):
    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, self.teacher = make_teacher()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)

    def test_parent_attendance_text_reports_counts_for_each_child(self):
        lesson = make_lesson(
            school_class=self.school_class, subject=self.subject, teacher=self.teacher
        )
        mark_lesson_attendance(
            lesson=lesson,
            records=[{"student": self.student, "status": Attendance.Status.ABSENT}],
            marked_by=self.teacher_user,
        )

        text = async_to_sync(parent_attendance_text)([self.student])

        self.assertIn("❌ Kelmadi: 1", text)

    def test_parent_progress_text_reports_xp_for_each_child(self):
        award_xp(
            student=self.student, amount=25, source=XPTransaction.Source.TEST,
            related_object=None, reason="x",
        )

        text = async_to_sync(parent_progress_text)([self.student])

        self.assertIn("25", text)


class AsyncRoleCacheTests(TestCase):
    """Roles resolve through a synchronous ORM query; async handlers must not run it.

    Regression for the SynchronousOnlyOperation that broke `handle_menu` after
    the tenancy refactor: `menu_for`/`today_lessons_text` read
    `user.is_student`/`is_director`, which read `User.active_membership`.
    Loading the user through `get_linked_user` primes the per-instance cache
    from a worker thread, so every later role read inside the event loop is
    served from memory.
    """

    def test_get_linked_user_primes_the_role_cache_before_any_role_read(self):
        student, _ = make_student()
        TelegramAccount.objects.create(user=student, telegram_id=1001)

        async def scenario():
            user = await get_linked_user(1001)
            # Reads the role inside the event loop: without a primed cache
            # this raises SynchronousOnlyOperation instead of returning.
            return menu_for(user)

        self.assertEqual(async_to_sync(scenario)(), STUDENT_MENU)

    def test_a_user_with_no_membership_is_cached_too(self):
        user = User.objects.create(username="loner", email="loner@example.com")
        TelegramAccount.objects.create(user=user, telegram_id=1002)

        async def scenario():
            user = await get_linked_user(1002)
            return menu_for(user)

        self.assertEqual(async_to_sync(scenario)(), STUDENT_MENU)

    def test_a_teacher_gets_the_teacher_menu(self):
        teacher, _ = make_teacher()
        TelegramAccount.objects.create(user=teacher, telegram_id=1003)

        async def scenario():
            return menu_for(await get_linked_user(1003))

        self.assertEqual(async_to_sync(scenario)(), TEACHER_MENU)


class SecondaryTeacherBotScheduleTests(TestCase):
    """A teacher who only co-teaches a lesson must still see it under
    "Bugungi darslar" — the bot used to filter by `lesson__teacher` only."""

    def test_secondary_teacher_sees_the_lesson_in_today_lessons(self):
        primary_user, primary = make_teacher()
        secondary_user, secondary = make_teacher()
        school_class = make_school_class()
        subject = make_subject(name="Fizika")
        make_lesson(
            school_class=school_class,
            subject=subject,
            teacher=primary,
            secondary_teacher=secondary,
            lesson_date=timezone.localdate(),
        )

        async def text(user):
            await prime_role_cache(user)
            return await today_lessons_text(user)

        self.assertIn("Fizika", async_to_sync(text)(primary_user))
        self.assertIn("Fizika", async_to_sync(text)(secondary_user))
