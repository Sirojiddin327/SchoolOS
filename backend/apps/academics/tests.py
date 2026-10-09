from datetime import date, datetime, time, timedelta
from unittest.mock import patch

from django.conf import settings
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.common.testing import (
    default_organization,
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
from apps.telegram_bot.models import TelegramAccount
from config.celery import app

from . import tasks
from .models import DailyScheduleDigest, Lesson
from .services import (
    _KEYCAP,
    DAILY_SCHEDULE_TITLE,
    NO_LESSONS_BODY,
    format_daily_schedule,
    generate_lessons_for_week,
    lessons_for_user,
)
from .tasks import send_daily_schedules


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
        settings_obj = SchoolTimeSettings.get_solo(default_organization())
        settings_obj.start_time = time(8, 0)
        settings_obj.period_duration_minutes = 45
        settings_obj.short_break_minutes = 5
        settings_obj.long_break_after_period = 4
        settings_obj.long_break_minutes = 20
        settings_obj.save()

        self.subject = make_subject()
        _, self.teacher = make_teacher()
        _, self.secondary_teacher = make_teacher()
        self.school_class = make_school_class()
        # Wednesday (day_of_week=3), period 1.
        self.slot = make_timetable_slot(
            school_class=self.school_class,
            subject=self.subject,
            teacher=self.teacher,
            secondary_teacher=self.secondary_teacher,
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

    def test_secondary_teacher_is_carried_onto_the_lesson(self):
        lesson = generate_lessons_for_week(_this_weeks_monday())[0]
        self.assertEqual(lesson.secondary_teacher, self.secondary_teacher)

    def test_reassigning_the_slot_secondary_teacher_syncs_the_lesson(self):
        generate_lessons_for_week(_this_weeks_monday())
        _, replacement = make_teacher()
        self.slot.secondary_teacher = replacement
        self.slot.save()

        lesson = generate_lessons_for_week(_this_weeks_monday())[0]
        self.assertEqual(lesson.secondary_teacher, replacement)

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
            secondary_teacher=self.teacher_a,
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
        # `teacher_a` teaches their own class and is the *secondary* teacher of
        # the other lesson — both must show up in their schedule.
        self.assertEqual(ids, {self.lesson_a.id, self.lesson_b.id})

    def test_secondary_teacher_is_exposed_and_validated(self):
        self.client.force_authenticate(self.teacher_a_user)
        response = self.client.get(f"/api/lessons/{self.lesson_b.id}/")
        self.assertEqual(response.data["secondary_teacher"], self.teacher_a.id)
        self.assertEqual(response.data["secondary_teacher_name"], str(self.teacher_a))

    def test_student_sees_only_their_class_lessons(self):
        self.client.force_authenticate(self.student_user)
        response = self.client.get("/api/lessons/")
        ids = {row["id"] for row in response.data["results"]}
        self.assertEqual(ids, {self.lesson_a.id})


class DailyScheduleFormattingTests(TestCase):
    """`format_daily_schedule` is what every recipient actually reads, so it is
    tested as text — the whole point is that the message is legible, and an
    assertion on a list of lesson ids would pass just as happily on a message
    nobody could read."""

    DAY = date(2026, 9, 21)  # a Monday

    def setUp(self):
        self.subject_a = make_subject(name="Matematika")
        self.subject_b = make_subject(name="Adabiyot")
        self.teacher_user, self.teacher = make_teacher(first_name="Alisher", last_name="Karimov")
        self.school_class = make_school_class(name="8-A")
        self.student_user, _ = make_student(self.school_class)

    def _lesson(self, subject, start, end, **kwargs):
        return make_lesson(
            school_class=self.school_class,
            subject=subject,
            teacher=self.teacher,
            lesson_date=self.DAY,
            start_time=start,
            end_time=end,
            **kwargs,
        )

    def test_student_sees_whole_day_in_chronological_order(self):
        # created out of order on purpose: the message must follow the clock
        self._lesson(self.subject_b, time(11, 0), time(11, 45))
        self._lesson(self.subject_a, time(9, 0), time(9, 45))

        body = format_daily_schedule(self.student_user, self.DAY)

        self.assertLess(body.index("09:00"), body.index("11:00"))
        self.assertIn("Matematika", body)
        self.assertIn("Adabiyot", body)

    def test_student_is_told_the_teacher_and_room_when_they_are_known(self):
        self._lesson(self.subject_a, time(9, 0), time(9, 45), room="201")

        body = format_daily_schedule(self.student_user, self.DAY)

        self.assertIn("Alisher Karimov", body)
        self.assertIn("201", body)

    def test_missing_room_is_omitted_rather_than_printed_empty(self):
        self._lesson(self.subject_a, time(9, 0), time(9, 45))

        body = format_daily_schedule(self.student_user, self.DAY)

        self.assertNotIn("🚪", body)
        # no dangling "· " or blank detail line where the room would have been
        self.assertNotIn("·", body)

    def test_teacher_sees_the_class_and_is_not_told_their_own_name(self):
        self._lesson(self.subject_a, time(9, 0), time(9, 45), room="201")

        body = format_daily_schedule(self.teacher_user, self.DAY)

        self.assertIn("8-A", body)
        self.assertNotIn("Alisher Karimov", body)

    def test_day_without_lessons_says_so_and_does_not_raise(self):
        body = format_daily_schedule(self.student_user, self.DAY)

        self.assertEqual(body, NO_LESSONS_BODY)

    def test_ordinary_between_period_gap_is_not_announced_as_a_break(self):
        # The school's own short break is the threshold, so read it rather than
        # hardcoding 5 — a gap of exactly that length is an ordinary pause.
        short = SchoolTimeSettings.get_solo(self.student_user.active_organization).short_break_minutes
        self._lesson(self.subject_a, time(9, 0), time(9, 45))
        resumes = (datetime.combine(self.DAY, time(9, 45)) + timedelta(minutes=short)).time()
        self._lesson(self.subject_b, resumes, time(10, 45))

        body = format_daily_schedule(self.student_user, self.DAY)

        self.assertNotIn("tanaffus", body)

    def test_gap_longer_than_the_configured_break_is_reported_with_its_real_length(self):
        # 09:45 -> 11:00 is 75 minutes. The message must state the gap that is
        # actually on the timetable, not a number pulled from the settings.
        self._lesson(self.subject_a, time(9, 0), time(9, 45))
        self._lesson(self.subject_b, time(11, 0), time(11, 45))

        body = format_daily_schedule(self.student_user, self.DAY)

        self.assertIn("tanaffus", body)
        self.assertIn("75", body)

    def test_lessons_on_another_day_are_not_included(self):
        self._lesson(self.subject_a, time(9, 0), time(9, 45))
        make_lesson(
            school_class=self.school_class,
            subject=self.subject_b,
            teacher=self.teacher,
            lesson_date=self.DAY + timedelta(days=1),
            start_time=time(9, 0),
            end_time=time(9, 45),
        )

        body = format_daily_schedule(self.student_user, self.DAY)

        self.assertIn("Matematika", body)
        self.assertNotIn("Adabiyot", body)

    def test_tenth_and_later_lesson_falls_back_to_a_readable_number(self):
        # Only nine keycap emoji exist. The tenth must degrade to plain text
        # rather than render as a broken glyph in someone's morning message.
        for hour in range(8, 18):
            self._lesson(self.subject_a, time(hour, 0), time(hour, 40))

        body = format_daily_schedule(self.student_user, self.DAY)

        self.assertIn("10. ", body)  # the 10th lesson
        self.assertIn("9️⃣", body)  # the 9th still gets its keycap
        self.assertNotIn(f"10{_KEYCAP}", body)


class DailyScheduleRecipientsTests(TestCase):
    """Who the morning push is allowed to reach."""

    DAY = date(2026, 9, 21)

    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, self.teacher = make_teacher()
        self.school_class = make_school_class(class_teacher=self.teacher)
        self.student_user, _ = make_student(self.school_class)
        self.director = make_director()
        self.make_lesson()

    def make_lesson(self):
        return make_lesson(
            school_class=self.school_class,
            subject=self.subject,
            teacher=self.teacher,
            lesson_date=self.DAY,
        )

    @staticmethod
    def _link(user, telegram_id):
        return TelegramAccount.objects.create(user=user, telegram_id=telegram_id)

    def test_teacher_receives_own_lessons_and_the_class_they_lead(self):
        self._link(self.teacher_user, 5001)

        self.assertEqual(lessons_for_user(self.teacher_user, self.DAY).count(), 1)

    def test_teacher_does_not_receive_another_teachers_lessons(self):
        _other_user, other_teacher = make_teacher()
        other_lesson = make_lesson(
            school_class=make_school_class(),
            subject=self.subject,
            teacher=other_teacher,
            lesson_date=self.DAY,
        )

        lesson_ids = {lesson.id for lesson in lessons_for_user(self.teacher_user, self.DAY)}

        self.assertNotIn(other_lesson.id, lesson_ids)

    def test_secondary_teacher_receives_the_lesson_in_their_schedule(self):
        secondary_user, secondary_teacher = make_teacher()
        self._link(secondary_user, 5002)
        _, primary_teacher = make_teacher()
        other_class = make_school_class()
        make_lesson(
            school_class=other_class,
            subject=self.subject,
            teacher=primary_teacher,
            secondary_teacher=secondary_teacher,
            lesson_date=self.DAY,
        )

        lesson_ids = {lesson.id for lesson in lessons_for_user(secondary_user, self.DAY)}

        self.assertEqual(len(lesson_ids), 1)

    def test_student_without_a_class_has_no_schedule(self):
        orphan_user, _ = make_student(None)
        self._link(orphan_user, 5003)

        self.assertEqual(lessons_for_user(orphan_user, self.DAY).count(), 0)

    def test_director_has_no_personal_schedule(self):
        self._link(self.director, 5004)

        self.assertEqual(lessons_for_user(self.director, self.DAY).count(), 0)


class SendDailySchedulesTests(TestCase):
    """The behaviour of the 07:00 push itself: who hears about it, and the
    promise that they hear about it exactly once."""

    DAY = date(2026, 9, 21)

    def setUp(self):
        self.subject = make_subject(name="Matematika")
        self.teacher_user, self.teacher = make_teacher()
        self.school_class = make_school_class(name="8-A", class_teacher=self.teacher)
        self.student_user, _ = make_student(self.school_class)
        make_lesson(
            school_class=self.school_class,
            subject=self.subject,
            teacher=self.teacher,
            lesson_date=self.DAY,
            start_time=time(9, 0),
            end_time=time(9, 45),
        )

    def _link(self, user, telegram_id):
        return TelegramAccount.objects.create(user=user, telegram_id=telegram_id)

    def _run(self):
        with (
            patch("apps.academics.tasks.timezone.localdate", return_value=self.DAY),
            patch("apps.telegram_bot.services.send_telegram_message") as send,
        ):
            sent = send_daily_schedules()
        return sent, send

    def test_linked_student_gets_one_message_containing_the_whole_day(self):
        self._link(self.student_user, 6001)

        sent, send = self._run()

        self.assertEqual(sent, 1)
        self.assertEqual(send.call_count, 1)
        _chat_id, text = send.call_args[0]
        self.assertIn("Matematika", text)
        self.assertIn("09:00", text)

    def test_running_twice_on_the_same_day_sends_nothing_the_second_time(self):
        self._link(self.student_user, 6002)

        first_sent, _ = self._run()
        second_sent, second_send = self._run()

        self.assertEqual(first_sent, 1)
        self.assertEqual(second_sent, 0)
        self.assertEqual(second_send.call_count, 0)
        self.assertEqual(DailyScheduleDigest.objects.filter(user=self.student_user).count(), 1)

    def test_the_next_day_is_a_new_message(self):
        self._link(self.student_user, 6003)
        self._run()

        with (
            patch("apps.academics.tasks.timezone.localdate", return_value=self.DAY + timedelta(days=1)),
            patch("apps.telegram_bot.services.send_telegram_message") as send,
        ):
            sent = send_daily_schedules()

        self.assertEqual(sent, 1)
        self.assertEqual(send.call_count, 1)
        self.assertEqual(DailyScheduleDigest.objects.filter(user=self.student_user).count(), 2)

    def test_a_user_without_a_linked_chat_gets_no_message_at_all(self):
        sent, send = self._run()  # nobody linked

        self.assertEqual(sent, 0)
        self.assertEqual(send.call_count, 0)
        # and no ghost web notification left behind for a channel they cannot read
        self.assertEqual(Notification.objects.count(), 0)
        self.assertEqual(DailyScheduleDigest.objects.count(), 0)

    def test_student_and_teacher_are_both_served(self):
        self._link(self.student_user, 6004)
        self._link(self.teacher_user, 6005)

        sent, send = self._run()

        self.assertEqual(sent, 2)
        self.assertEqual(send.call_count, 2)

    def test_director_is_not_sent_a_schedule(self):
        director = make_director()
        self._link(director, 6006)

        sent, _ = self._run()

        self.assertEqual(sent, 0)
        self.assertFalse(Notification.objects.filter(recipient=director).exists())

    def test_inactive_user_is_skipped(self):
        self.student_user.is_active = False
        self.student_user.save(update_fields=["is_active"])
        self._link(self.student_user, 6007)

        sent, send = self._run()

        self.assertEqual(sent, 0)
        self.assertEqual(send.call_count, 0)

    def test_a_student_with_no_class_still_gets_the_no_lessons_message(self):
        orphan_user, _ = make_student(None)
        self._link(orphan_user, 6008)

        sent, send = self._run()

        self.assertEqual(sent, 1)
        self.assertIn(NO_LESSONS_BODY, send.call_args[0][1])

    def test_one_failing_user_does_not_stop_the_others(self):
        self._link(self.student_user, 6009)
        self._link(self.teacher_user, 6010)
        broken_user, _ = make_student(self.school_class)
        self._link(broken_user, 6011)

        # the first chat to be attempted fails; the run must carry on regardless
        with (
            patch("apps.academics.tasks.timezone.localdate", return_value=self.DAY),
            patch(
                "apps.telegram_bot.services.send_telegram_message",
                side_effect=[Exception("telegram rejected this chat id"), True, True],
            ),
        ):
            sent = send_daily_schedules()

        # the two healthy users were still served
        self.assertEqual(sent, 2)
        self.assertTrue(
            Notification.objects.filter(recipient__in=[self.student_user, self.teacher_user]).count()
            == 2
        )
        # and the failed user holds a digest too: the guard is written before the
        # send, so a failure cannot be retried into a second message later that day
        self.assertEqual(DailyScheduleDigest.objects.count(), 3)

    def test_message_carries_the_schedule_title_and_lesson_reminder_category(self):
        self._link(self.student_user, 6012)

        self._run()

        notification = Notification.objects.get(recipient=self.student_user)
        self.assertEqual(notification.title, DAILY_SCHEDULE_TITLE)
        self.assertEqual(notification.category, Notification.Category.LESSON_REMINDER)
        self.assertIn("Matematika", notification.body)


class DailyScheduleDigestConstraintTests(TestCase):
    def test_the_same_user_cannot_be_digested_twice_for_one_date(self):
        user = make_student()[0]
        DailyScheduleDigest.objects.create(user=user, date=date(2026, 9, 21))

        with self.assertRaises(IntegrityError), transaction.atomic():
            DailyScheduleDigest.objects.create(user=user, date=date(2026, 9, 21))


class DailyScheduleBeatTests(TestCase):
    """The schedule is half the feature: a correct task that never fires sends
    nothing to anyone."""

    def test_it_is_scheduled_once_daily_at_seven_in_the_school_timezone(self):
        entry = settings.CELERY_BEAT_SCHEDULE["send-daily-schedules"]

        self.assertEqual(entry["task"], "apps.academics.tasks.send_daily_schedules")
        self.assertEqual(set(entry["schedule"].hour), {7})
        self.assertEqual(set(entry["schedule"].minute), {0})

    def test_celery_resolves_the_schedule_in_asia_tashkent(self):
        self.assertEqual(str(app.conf.timezone), "Asia/Tashkent")

    def test_the_per_lesson_reminder_schedule_is_gone(self):
        self.assertNotIn("send-lesson-reminders", settings.CELERY_BEAT_SCHEDULE)
        # the task itself is gone too, not just its Beat entry — otherwise it
        # could still be fired by name and send the old per-lesson messages
        self.assertFalse(hasattr(tasks, "send_lesson_reminders"))
        self.assertTrue(hasattr(tasks, "send_daily_schedules"))

    def test_unrelated_schedules_survived_the_swap(self):
        for key in ("remind-unmarked-attendance", "refill-low-question-pools"):
            self.assertIn(key, settings.CELERY_BEAT_SCHEDULE)
