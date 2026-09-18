from datetime import date, datetime, time, timedelta
from unittest.mock import patch

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.common.testing import (
    make_director,
    make_lesson,
    make_school_class,
    make_student,
    make_subject,
    make_teacher,
    make_timetable_slot,
)
from apps.notifications.models import Notification
from apps.school_config.models import SchoolTimeSettings

from .models import Lesson, LessonReminder
from .services import generate_lessons_for_week
from .tasks import send_lesson_reminders


def _this_weeks_monday() -> date:
    today = timezone.localdate()
    return today - timedelta(days=today.weekday())


class TimetableSlotConstraintTests(TestCase):
    def setUp(self):
        self.subject = make_subject()
        _, self.teacher = make_teacher()
        self.class_a = make_school_class()
        self.class_b = make_school_class()

    def test_double_booking_the_same_class_slot_raises(self):
        make_timetable_slot(
            school_class=self.class_a, subject=self.subject, teacher=self.teacher, period_number=1
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_timetable_slot(
                school_class=self.class_a,
                subject=self.subject,
                teacher=self.teacher,
                period_number=1,
            )

    def test_double_booking_the_same_teacher_slot_raises(self):
        make_timetable_slot(
            school_class=self.class_a, subject=self.subject, teacher=self.teacher, period_number=1
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_timetable_slot(
                school_class=self.class_b,
                subject=self.subject,
                teacher=self.teacher,
                period_number=1,
            )


class GenerateLessonsForWeekTests(TestCase):
    def setUp(self):
        settings_obj = SchoolTimeSettings.get_solo()
        settings_obj.start_time = time(8, 0)
        settings_obj.period_duration_minutes = 45
        settings_obj.short_break_minutes = 5
        settings_obj.long_break_after_period = 4
        settings_obj.long_break_minutes = 20
        settings_obj.save()

        self.subject = make_subject()
        _, self.teacher = make_teacher()
        self.school_class = make_school_class()
        # Wednesday (day_of_week=3), period 1.
        self.slot = make_timetable_slot(
            school_class=self.school_class,
            subject=self.subject,
            teacher=self.teacher,
            day_of_week=3,
            period_number=1,
        )

    def test_generates_lesson_on_correct_date_and_time(self):
        monday = _this_weeks_monday()
        lessons = generate_lessons_for_week(monday)

        self.assertEqual(len(lessons), 1)
        lesson = lessons[0]
        self.assertEqual(lesson.date, monday + timedelta(days=2))
        self.assertEqual(lesson.start_time, time(8, 0))
        self.assertEqual(lesson.end_time, time(8, 45))

    def test_running_twice_for_the_same_week_is_idempotent(self):
        monday = _this_weeks_monday()
        generate_lessons_for_week(monday)
        generate_lessons_for_week(monday)
        self.assertEqual(Lesson.objects.count(), 1)

    def test_any_date_in_the_week_normalizes_to_the_same_monday(self):
        monday = _this_weeks_monday()
        wednesday = monday + timedelta(days=2)
        lessons = generate_lessons_for_week(wednesday)
        self.assertEqual(lessons[0].date, wednesday)

    def test_two_classes_on_the_same_day_and_period_dont_collide(self):
        other_class = make_school_class()
        _, other_teacher = make_teacher()
        make_timetable_slot(
            school_class=other_class,
            subject=self.subject,
            teacher=other_teacher,
            day_of_week=3,
            period_number=1,
        )

        lessons = generate_lessons_for_week(_this_weeks_monday())

        self.assertEqual(len(lessons), 2)
        self.assertEqual(Lesson.objects.filter(school_class=self.school_class).count(), 1)
        self.assertEqual(Lesson.objects.filter(school_class=other_class).count(), 1)


class LessonQuerysetScopingAPITests(APITestCase):
    def setUp(self):
        subject = make_subject()
        self.teacher_a_user, self.teacher_a = make_teacher()
        self.teacher_b_user, self.teacher_b = make_teacher()
        self.class_a = make_school_class(class_teacher=self.teacher_a)
        self.class_b = make_school_class()
        self.student_user, _ = make_student(self.class_a)

        self.lesson_a = make_lesson(school_class=self.class_a, subject=subject, teacher=self.teacher_a)
        self.lesson_b = make_lesson(
            school_class=self.class_b,
            subject=subject,
            teacher=self.teacher_b,
            start_time=time(10, 0),
            end_time=time(10, 45),
        )

    def test_director_sees_all_lessons(self):
        self.client.force_authenticate(make_director())
        response = self.client.get("/api/lessons/")
        self.assertEqual(response.data["count"], 2)

    def test_teacher_sees_only_own_or_led_class_lessons(self):
        self.client.force_authenticate(self.teacher_a_user)
        response = self.client.get("/api/lessons/")
        ids = {row["id"] for row in response.data["results"]}
        self.assertEqual(ids, {self.lesson_a.id})

    def test_student_sees_only_their_class_lessons(self):
        self.client.force_authenticate(self.student_user)
        response = self.client.get("/api/lessons/")
        ids = {row["id"] for row in response.data["results"]}
        self.assertEqual(ids, {self.lesson_a.id})


class SendLessonRemindersTests(TestCase):
    FIXED_NOW = timezone.make_aware(datetime(2026, 9, 21, 8, 0))  # noqa: DTZ001

    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, self.teacher = make_teacher()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)

    def _make_lesson(self, start_time, lesson_date):
        end_time = (datetime.combine(lesson_date, start_time) + timedelta(minutes=45)).time()
        return make_lesson(
            school_class=self.school_class,
            subject=self.subject,
            teacher=self.teacher,
            lesson_date=lesson_date,
            start_time=start_time,
            end_time=end_time,
        )

    @patch("apps.academics.tasks.timezone")
    def test_sends_reminder_for_a_lesson_starting_in_about_an_hour(self, mock_timezone):
        mock_timezone.localtime.return_value = self.FIXED_NOW
        lesson = self._make_lesson(start_time=time(9, 0), lesson_date=date(2026, 9, 21))

        sent = send_lesson_reminders()

        self.assertEqual(sent, 1)
        self.assertTrue(LessonReminder.objects.filter(lesson=lesson).exists())
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.student_user, category=Notification.Category.LESSON_REMINDER
            ).exists()
        )
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.teacher_user, category=Notification.Category.LESSON_REMINDER
            ).exists()
        )

    @patch("apps.academics.tasks.timezone")
    def test_lesson_outside_the_reminder_window_is_not_reminded(self, mock_timezone):
        mock_timezone.localtime.return_value = self.FIXED_NOW
        self._make_lesson(start_time=time(11, 0), lesson_date=date(2026, 9, 21))

        self.assertEqual(send_lesson_reminders(), 0)

    @patch("apps.academics.tasks.timezone")
    def test_lesson_on_a_different_date_is_not_reminded(self, mock_timezone):
        mock_timezone.localtime.return_value = self.FIXED_NOW
        self._make_lesson(start_time=time(9, 0), lesson_date=date(2026, 9, 22))

        self.assertEqual(send_lesson_reminders(), 0)

    @patch("apps.academics.tasks.timezone")
    def test_running_twice_does_not_send_duplicate_reminders(self, mock_timezone):
        mock_timezone.localtime.return_value = self.FIXED_NOW
        self._make_lesson(start_time=time(9, 0), lesson_date=date(2026, 9, 21))

        send_lesson_reminders()
        second_run_sent = send_lesson_reminders()

        self.assertEqual(second_run_sent, 0)
        self.assertEqual(LessonReminder.objects.count(), 1)
