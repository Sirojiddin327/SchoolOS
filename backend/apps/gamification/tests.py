from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.common.testing import make_director, make_school_class, make_student
from apps.notifications.models import Notification

from .models import Achievement, Streak, StudentAchievement, XPTransaction
from .services import award_xp, check_achievements, record_streak_activity


class AwardXpTests(TestCase):
    def setUp(self):
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)

    def test_awards_xp_to_student_and_class_equally(self):
        award_xp(student=self.student, amount=30, source=XPTransaction.Source.TEST, related_object=None, reason="Test")

        self.student.refresh_from_db()
        self.school_class.refresh_from_db()
        self.assertEqual(self.student.total_xp, 30)
        self.assertEqual(self.school_class.total_xp, 30)

    def test_creates_one_xp_transaction_per_award(self):
        award_xp(student=self.student, amount=10, source=XPTransaction.Source.TEST, related_object=None, reason="A")
        award_xp(student=self.student, amount=15, source=XPTransaction.Source.TEST, related_object=None, reason="B")

        self.assertEqual(XPTransaction.objects.filter(student=self.student).count(), 2)
        self.assertEqual(self.student.__class__.objects.get(pk=self.student.pk).total_xp, 25)

    def test_student_without_a_class_does_not_crash(self):
        _classless_user, classless_student = make_student(school_class=None)
        award_xp(
            student=classless_student, amount=10, source=XPTransaction.Source.TEST, related_object=None, reason="A"
        )
        classless_student.refresh_from_db()
        self.assertEqual(classless_student.total_xp, 10)


class StreakTests(TestCase):
    def setUp(self):
        _, self.student = make_student()

    def test_first_activity_starts_a_one_day_streak(self):
        streak = record_streak_activity(self.student)
        self.assertEqual(streak.current_streak, 1)
        self.assertEqual(streak.longest_streak, 1)

    def test_same_day_activity_is_a_no_op(self):
        record_streak_activity(self.student)
        streak = record_streak_activity(self.student)
        self.assertEqual(streak.current_streak, 1)

    def test_consecutive_day_increments_streak(self):
        streak = Streak.objects.create(
            student=self.student,
            current_streak=3,
            longest_streak=3,
            last_activity_date=timezone.localdate() - timedelta(days=1),
        )
        record_streak_activity(self.student)
        streak.refresh_from_db()
        self.assertEqual(streak.current_streak, 4)
        self.assertEqual(streak.longest_streak, 4)

    def test_gap_resets_streak_to_one(self):
        Streak.objects.create(
            student=self.student,
            current_streak=5,
            longest_streak=5,
            last_activity_date=timezone.localdate() - timedelta(days=3),
        )
        streak = record_streak_activity(self.student)
        self.assertEqual(streak.current_streak, 1)
        self.assertEqual(streak.longest_streak, 5)


class CheckAchievementsTests(TestCase):
    def setUp(self):
        _, self.student = make_student()

    def test_xp_threshold_achievement_unlocks_once_reached(self):
        Achievement.objects.create(
            name="XP Hunter Test", description="d", condition_type=Achievement.ConditionType.XP_THRESHOLD,
            condition_value=100,
        )
        self.student.total_xp = 150
        self.student.save(update_fields=["total_xp"])

        unlocked = check_achievements(self.student)

        self.assertEqual(len(unlocked), 1)
        self.assertTrue(
            StudentAchievement.objects.filter(student=self.student, achievement__name="XP Hunter Test").exists()
        )

    def test_achievement_does_not_unlock_twice(self):
        Achievement.objects.create(
            name="XP Hunter Test 2", description="d", condition_type=Achievement.ConditionType.XP_THRESHOLD,
            condition_value=10,
        )
        self.student.total_xp = 50
        self.student.save(update_fields=["total_xp"])

        check_achievements(self.student)
        second_pass = check_achievements(self.student)

        self.assertEqual(len(second_pass), 0)
        self.assertEqual(
            StudentAchievement.objects.filter(student=self.student, achievement__name="XP Hunter Test 2").count(), 1
        )

    def test_unmet_condition_does_not_unlock(self):
        Achievement.objects.create(
            name="Unreachable", description="d", condition_type=Achievement.ConditionType.XP_THRESHOLD,
            condition_value=99999,
        )
        unlocked = check_achievements(self.student)
        self.assertEqual(len(unlocked), 0)

    def test_unlocking_sends_a_notification(self):
        Achievement.objects.create(
            name="Notify Me", description="You did it.", condition_type=Achievement.ConditionType.XP_THRESHOLD,
            condition_value=0,
        )
        check_achievements(self.student)
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.student.user, category=Notification.Category.ACHIEVEMENT_UNLOCKED
            ).exists()
        )


class LeaderboardAPITests(APITestCase):
    def setUp(self):
        self.class_a = make_school_class(name="9-A-lb")
        self.class_b = make_school_class(name="9-B-lb")
        self.class_a.total_xp = 100
        self.class_a.save()
        self.class_b.total_xp = 50
        self.class_b.save()

        _, self.student_high = make_student(self.class_a)
        self.student_high.total_xp = 200
        self.student_high.save()
        self.student_high_user = self.student_high.user

        _, self.student_low = make_student(self.class_b)
        self.student_low.total_xp = 20
        self.student_low.save()

    def test_student_leaderboard_is_ranked_by_xp_and_hides_private_info(self):
        self.client.force_authenticate(self.student_high_user)
        response = self.client.get("/api/leaderboard/students/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["rank"], 1)
        self.assertEqual(response.data[0]["total_xp"], 200)
        self.assertNotIn("email", response.data[0])

    def test_class_leaderboard_is_ranked_by_xp(self):
        self.client.force_authenticate(self.student_high_user)
        response = self.client.get("/api/leaderboard/classes/")
        self.assertEqual(response.data[0]["name"], self.class_a.name)
        self.assertEqual(response.data[0]["rank"], 1)


class AchievementAndStreakAPITests(APITestCase):
    def setUp(self):
        self.student_user, self.student = make_student()
        Achievement.objects.create(
            name="Catalog Item", description="d", condition_type=Achievement.ConditionType.XP_THRESHOLD,
            condition_value=0,
        )

    def test_achievement_catalog_shows_unlock_status_for_the_caller(self):
        self.client.force_authenticate(self.student_user)
        response = self.client.get("/api/achievements/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(any(item["unlocked"] for item in response.data))

        award_xp(student=self.student, amount=1, source=XPTransaction.Source.TEST, related_object=None, reason="x")
        response = self.client.get("/api/achievements/")
        self.assertTrue(any(item["unlocked"] for item in response.data))

    def test_my_streak_endpoint_requires_student_role(self):
        self.client.force_authenticate(make_director())
        response = self.client.get("/api/streaks/me/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.student_user)
        response = self.client.get("/api/streaks/me/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class XpHistoryAPITests(APITestCase):
    def setUp(self):
        self.student_user, self.student = make_student()
        self.other_user, self.other_student = make_student()
        award_xp(student=self.student, amount=10, source=XPTransaction.Source.TEST, related_object=None, reason="x")
        award_xp(
            student=self.other_student, amount=20, source=XPTransaction.Source.TEST, related_object=None, reason="y"
        )

    def test_student_sees_only_their_own_xp_history(self):
        self.client.force_authenticate(self.student_user)
        response = self.client.get("/api/xp/history/")
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["amount"], 10)

    def test_director_sees_everyones_xp_history(self):
        self.client.force_authenticate(make_director())
        response = self.client.get("/api/xp/history/")
        self.assertEqual(response.data["count"], 2)
