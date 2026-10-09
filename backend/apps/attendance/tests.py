from datetime import datetime, time, timedelta

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.common.testing import (
    make_director,
    make_lesson,
    make_school_class,
    make_student,
    make_subject,
    make_teacher,
)
from apps.notifications.models import Notification

from .models import Attendance, AttendanceReminder
from .services import can_mark_attendance, is_attendance_window_open, mark_lesson_attendance
from .tasks import remind_unmarked_attendance


class AttendanceUniqueConstraintTests(TestCase):
    def setUp(self):
        self.subject = make_subject()
        _, self.teacher = make_teacher()
        self.school_class = make_school_class()
        _, self.student = make_student(self.school_class)
        self.lesson = make_lesson(
            school_class=self.school_class, subject=self.subject, teacher=self.teacher
        )

    def test_duplicate_attendance_for_same_lesson_and_student_raises(self):
        Attendance.objects.create(
            lesson=self.lesson, student=self.student, status=Attendance.Status.PRESENT
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            Attendance.objects.create(
                lesson=self.lesson, student=self.student, status=Attendance.Status.ABSENT
            )

    def test_mark_lesson_attendance_updates_instead_of_duplicating(self):
        director = make_director()
        mark_lesson_attendance(
            lesson=self.lesson,
            records=[{"student": self.student, "status": Attendance.Status.PRESENT}],
            marked_by=director,
        )
        mark_lesson_attendance(
            lesson=self.lesson,
            records=[{"student": self.student, "status": Attendance.Status.LATE}],
            marked_by=director,
        )

        records = Attendance.objects.filter(lesson=self.lesson, student=self.student)
        self.assertEqual(records.count(), 1)
        self.assertEqual(records.get().status, Attendance.Status.LATE)


class CanMarkAttendanceTests(TestCase):
    def setUp(self):
        self.subject = make_subject()
        self.own_teacher_user, self.own_teacher = make_teacher()
        self.class_teacher_user, self.class_teacher = make_teacher()
        self.other_teacher_user, self.other_teacher = make_teacher()
        self.secondary_user, self.secondary_teacher = make_teacher()
        self.school_class = make_school_class(class_teacher=self.class_teacher)
        self.lesson = make_lesson(
            school_class=self.school_class,
            subject=self.subject,
            teacher=self.own_teacher,
            secondary_teacher=self.secondary_teacher,
        )
        self.director = make_director()
        self.student_user, _ = make_student(self.school_class)

    def test_director_can_always_mark(self):
        self.assertTrue(can_mark_attendance(self.director, self.lesson))

    def test_lessons_own_teacher_can_mark(self):
        self.assertTrue(can_mark_attendance(self.own_teacher_user, self.lesson))

    def test_secondary_teacher_can_mark(self):
        self.assertTrue(can_mark_attendance(self.secondary_user, self.lesson))

    def test_class_teacher_can_mark_even_when_not_teaching_the_lesson(self):
        self.assertTrue(can_mark_attendance(self.class_teacher_user, self.lesson))

    def test_unrelated_teacher_cannot_mark(self):
        self.assertFalse(can_mark_attendance(self.other_teacher_user, self.lesson))

    def test_student_cannot_mark(self):
        self.assertFalse(can_mark_attendance(self.student_user, self.lesson))


class ClassTeacherNotificationTests(TestCase):
    def setUp(self):
        self.subject = make_subject()
        self.own_teacher_user, self.own_teacher = make_teacher()
        self.class_teacher_user, self.class_teacher = make_teacher()
        self.school_class = make_school_class(class_teacher=self.class_teacher)
        _, self.student = make_student(self.school_class)
        self.lesson = make_lesson(
            school_class=self.school_class, subject=self.subject, teacher=self.own_teacher
        )

    def _mark(self, marked_by):
        mark_lesson_attendance(
            lesson=self.lesson,
            records=[{"student": self.student, "status": Attendance.Status.PRESENT}],
            marked_by=marked_by,
        )

    def test_substitute_marking_notifies_class_teacher(self):
        self._mark(self.own_teacher_user)

        notifications = Notification.objects.filter(recipient=self.class_teacher_user)
        self.assertEqual(notifications.count(), 1)
        self.assertEqual(notifications.get().category, Notification.Category.ATTENDANCE)

    def test_class_teacher_marking_own_class_does_not_notify_self(self):
        self._mark(self.class_teacher_user)

        self.assertEqual(Notification.objects.filter(recipient=self.class_teacher_user).count(), 0)

    def test_class_without_class_teacher_does_not_crash(self):
        school_class = make_school_class()  # no class_teacher
        _, student = make_student(school_class)
        lesson = make_lesson(
            school_class=school_class,
            subject=self.subject,
            teacher=self.own_teacher,
            start_time=time(10, 0),
            end_time=time(10, 45),
        )
        mark_lesson_attendance(
            lesson=lesson,
            records=[{"student": student, "status": Attendance.Status.PRESENT}],
            marked_by=self.own_teacher_user,
        )
        self.assertEqual(Notification.objects.count(), 0)


class BulkMarkAttendanceAPITests(APITestCase):
    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, self.teacher = make_teacher()
        self.other_teacher_user, _ = make_teacher()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        # Started 15 minutes ago, 45-minute lesson — safely inside the
        # attendance window (past the grace period, well before it ends), so
        # these tests isolate authorization rather than window timing.
        start = timezone.localtime() - timedelta(minutes=15)
        self.lesson = make_lesson(
            school_class=self.school_class,
            subject=self.subject,
            teacher=self.teacher,
            lesson_date=start.date(),
            start_time=start.time(),
            end_time=(start + timedelta(minutes=45)).time(),
        )

    def _payload(self, status_value=Attendance.Status.PRESENT):
        return {
            "lesson": self.lesson.id,
            "records": [{"student": self.student.id, "status": status_value}],
        }

    def test_authorized_teacher_marks_attendance(self):
        self.client.force_authenticate(self.teacher_user)
        response = self.client.post("/api/attendance/bulk-mark/", self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Attendance.objects.filter(lesson=self.lesson).count(), 1)

    def test_unrelated_teacher_forbidden(self):
        self.client.force_authenticate(self.other_teacher_user)
        response = self.client.post("/api/attendance/bulk-mark/", self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_unauthorized(self):
        response = self.client.post("/api/attendance/bulk-mark/", self._payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class AttendanceWindowTests(TestCase):
    """A lesson's attendance can't be marked until it's been running a while, so
    a teacher can't mark students absent before they've had a chance to walk in."""

    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, self.teacher = make_teacher()
        self.director = make_director()
        self.school_class = make_school_class()

    def _lesson(self, minutes_ago):
        start = timezone.localtime() - timedelta(minutes=minutes_ago)
        return make_lesson(
            school_class=self.school_class,
            subject=self.subject,
            teacher=self.teacher,
            lesson_date=start.date(),
            start_time=start.time(),
            end_time=(start + timedelta(minutes=45)).time(),
        )

    def test_closed_within_grace_period(self):
        lesson = self._lesson(minutes_ago=2)
        self.assertFalse(is_attendance_window_open(self.teacher_user, lesson))

    def test_open_after_grace_period(self):
        lesson = self._lesson(minutes_ago=11)
        self.assertTrue(is_attendance_window_open(self.teacher_user, lesson))

    def test_closed_after_lesson_ends(self):
        # The lesson in _lesson() runs 45 minutes; well past that, it's over.
        lesson = self._lesson(minutes_ago=60)
        self.assertFalse(is_attendance_window_open(self.teacher_user, lesson))

    def test_director_bypasses_grace_period(self):
        lesson = self._lesson(minutes_ago=0)
        self.assertTrue(is_attendance_window_open(self.director, lesson))

    def test_director_bypasses_lesson_end(self):
        lesson = self._lesson(minutes_ago=60)
        self.assertTrue(is_attendance_window_open(self.director, lesson))


class BulkMarkAttendanceWindowAPITests(APITestCase):
    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, self.teacher = make_teacher()
        self.director = make_director()
        self.school_class = make_school_class()
        _, self.student = make_student(self.school_class)

    def _lesson(self, minutes_ago):
        start = timezone.localtime() - timedelta(minutes=minutes_ago)
        return make_lesson(
            school_class=self.school_class,
            subject=self.subject,
            teacher=self.teacher,
            lesson_date=start.date(),
            start_time=start.time(),
            end_time=(start + timedelta(minutes=45)).time(),
        )

    def _payload(self, lesson):
        return {
            "lesson": lesson.id,
            "records": [{"student": self.student.id, "status": Attendance.Status.PRESENT}],
        }

    def test_teacher_blocked_within_grace_period(self):
        lesson = self._lesson(minutes_ago=2)
        self.client.force_authenticate(self.teacher_user)
        response = self.client.post(
            "/api/attendance/bulk-mark/", self._payload(lesson), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Attendance.objects.filter(lesson=lesson).count(), 0)

    def test_teacher_blocked_after_lesson_ends(self):
        lesson = self._lesson(minutes_ago=60)
        self.client.force_authenticate(self.teacher_user)
        response = self.client.post(
            "/api/attendance/bulk-mark/", self._payload(lesson), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Attendance.objects.filter(lesson=lesson).count(), 0)

    def test_teacher_allowed_after_grace_period(self):
        lesson = self._lesson(minutes_ago=11)
        self.client.force_authenticate(self.teacher_user)
        response = self.client.post(
            "/api/attendance/bulk-mark/", self._payload(lesson), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_director_bypasses_grace_period(self):
        lesson = self._lesson(minutes_ago=0)
        self.client.force_authenticate(self.director)
        response = self.client.post(
            "/api/attendance/bulk-mark/", self._payload(lesson), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class ClassSummaryAPITests(APITestCase):
    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, self.teacher = make_teacher()
        self.other_teacher_user, _ = make_teacher()
        self.school_class = make_school_class()
        self.student_user, self.student_a = make_student(self.school_class)
        _, self.student_b = make_student(self.school_class)
        self.lesson = make_lesson(
            school_class=self.school_class, subject=self.subject, teacher=self.teacher
        )
        Attendance.objects.create(
            lesson=self.lesson, student=self.student_a, status=Attendance.Status.PRESENT
        )
        Attendance.objects.create(
            lesson=self.lesson, student=self.student_b, status=Attendance.Status.ABSENT
        )
        _, self.student_c = make_student(self.school_class)
        Attendance.objects.create(
            lesson=self.lesson, student=self.student_c, status=Attendance.Status.LATE
        )

    def _get(self):
        return self.client.get(
            "/api/attendance/class-summary/",
            {"school_class": self.school_class.id, "date": self.lesson.date.isoformat()},
        )

    def test_counts_are_correct(self):
        self.client.force_authenticate(self.teacher_user)
        response = self._get()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["present"], 1)
        self.assertEqual(response.data["absent"], 1)
        self.assertEqual(response.data["late"], 1)

    def test_unrelated_teacher_forbidden(self):
        self.client.force_authenticate(self.other_teacher_user)
        response = self._get()
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_can_view_own_class_summary(self):
        self.client.force_authenticate(self.student_user)
        response = self._get()
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_absent_and_late_students_are_named(self):
        self.client.force_authenticate(self.teacher_user)
        response = self._get()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([s["id"] for s in response.data["absent_students"]], [self.student_b.id])
        self.assertEqual([s["id"] for s in response.data["late_students"]], [self.student_c.id])
        self.assertIn("full_name", response.data["absent_students"][0])

    def test_teacher_sees_parent_phone_number_in_roster(self):
        self.student_b.parent_phone_number = "+998901234567"
        self.student_b.save()

        self.client.force_authenticate(self.teacher_user)
        response = self._get()

        self.assertEqual(
            response.data["absent_students"][0]["parent_phone_number"], "+998901234567"
        )

    def test_director_sees_parent_phone_number_in_roster(self):
        self.student_b.parent_phone_number = "+998901234567"
        self.student_b.save()

        self.client.force_authenticate(make_director())
        response = self._get()

        self.assertEqual(
            response.data["absent_students"][0]["parent_phone_number"], "+998901234567"
        )

    def test_student_does_not_see_parent_phone_number_in_roster(self):
        self.student_b.parent_phone_number = "+998901234567"
        self.student_b.save()

        self.client.force_authenticate(self.student_user)
        response = self._get()

        self.assertNotIn("parent_phone_number", response.data["absent_students"][0])


class AttendanceDailySummaryAPITests(APITestCase):
    def setUp(self):
        self.director = make_director()
        self.subject = make_subject()
        _, self.teacher = make_teacher()
        self.class_6a = make_school_class(name="6-A")
        self.class_9b = make_school_class(name="9-B")
        _, self.student_6a = make_student(self.class_6a)
        _, self.student_9b = make_student(self.class_9b)

        self.today = timezone.localdate()
        self.yesterday = self.today - timedelta(days=1)

    def _lesson(self, school_class, lesson_date, start_time=time(9, 0)):
        end = (datetime.combine(lesson_date, start_time) + timedelta(minutes=45)).time()
        return make_lesson(
            school_class=school_class,
            subject=self.subject,
            teacher=self.teacher,
            lesson_date=lesson_date,
            start_time=start_time,
            end_time=end,
        )

    def test_counts_are_grouped_by_day_across_the_whole_school(self):
        lesson_today = self._lesson(self.class_6a, self.today)
        lesson_yesterday = self._lesson(self.class_9b, self.yesterday)
        Attendance.objects.create(
            lesson=lesson_today, student=self.student_6a, status=Attendance.Status.PRESENT
        )
        Attendance.objects.create(
            lesson=lesson_yesterday, student=self.student_9b, status=Attendance.Status.ABSENT
        )

        self.client.force_authenticate(self.director)
        response = self.client.get("/api/attendance/daily-summary/", {"days": 7})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 7)
        by_date = {row["date"]: row for row in response.data}
        self.assertEqual(by_date[self.today.isoformat()]["present"], 1)
        self.assertEqual(by_date[self.yesterday.isoformat()]["absent"], 1)
        # A day with no records at all still appears, zero-filled.
        self.assertEqual(by_date[self.today.isoformat()]["late"], 0)

    def test_grade_filter_only_counts_matching_classes(self):
        lesson_6a = self._lesson(self.class_6a, self.today, start_time=time(9, 0))
        lesson_9b = self._lesson(self.class_9b, self.today, start_time=time(10, 0))
        Attendance.objects.create(
            lesson=lesson_6a, student=self.student_6a, status=Attendance.Status.PRESENT
        )
        Attendance.objects.create(
            lesson=lesson_9b, student=self.student_9b, status=Attendance.Status.PRESENT
        )

        self.client.force_authenticate(self.director)
        response = self.client.get("/api/attendance/daily-summary/", {"days": 1, "grade": "6"})

        self.assertEqual(response.data[0]["present"], 1)

    def test_non_director_forbidden(self):
        self.client.force_authenticate(self.teacher.user)
        response = self.client.get("/api/attendance/daily-summary/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_days_parameter_is_clamped(self):
        self.client.force_authenticate(self.director)
        response = self.client.get("/api/attendance/daily-summary/", {"days": 9999})
        self.assertEqual(len(response.data), 60)


class AttendanceReminderTaskTests(TestCase):
    """The lesson's teacher gets one nudge ~10 minutes before the lesson ends
    when its attendance was never taken — and only once per lesson."""

    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, self.teacher = make_teacher()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)

    def _lesson_ending_at(self, minutes_from_now: int):
        end = timezone.localtime() + timedelta(minutes=minutes_from_now)
        start = end - timedelta(minutes=45)
        return make_lesson(
            school_class=self.school_class,
            subject=self.subject,
            teacher=self.teacher,
            lesson_date=end.date(),
            start_time=start.time(),
            end_time=end.time(),
        )

    def test_lesson_about_to_end_unmarked_notifies_teacher_once(self):
        # Ends ~11 minutes from now — safely inside the [10, 15) minute window
        # even if the task's `now` ticks a couple of seconds past the test's.
        lesson = self._lesson_ending_at(11)

        self.assertEqual(remind_unmarked_attendance(), 1)
        self.assertEqual(AttendanceReminder.objects.filter(lesson=lesson).count(), 1)
        notifications = Notification.objects.filter(recipient=self.teacher_user)
        self.assertEqual(notifications.count(), 1)
        self.assertEqual(notifications.get().category, Notification.Category.ATTENDANCE)

        now_count = Notification.objects.count()
        self.assertEqual(remind_unmarked_attendance(), 0)
        self.assertEqual(Notification.objects.count(), now_count)

    def test_lesson_with_attendance_taken_gets_no_reminder(self):
        lesson = self._lesson_ending_at(11)
        Attendance.objects.create(
            lesson=lesson, student=self.student, status=Attendance.Status.PRESENT
        )

        self.assertEqual(remind_unmarked_attendance(), 0)
        self.assertEqual(Notification.objects.count(), 0)

    def test_lesson_outside_reminder_window_gets_no_reminder(self):
        # Already ended half an hour ago.
        self._lesson_ending_at(-30)
        # Still an hour away — the reminder only fires in the last 10 minutes.
        self._lesson_ending_at(60)

        self.assertEqual(remind_unmarked_attendance(), 0)
        self.assertEqual(Notification.objects.count(), 0)

    def test_lesson_without_students_gets_no_reminder(self):
        other_class = make_school_class()
        end = timezone.localtime() + timedelta(minutes=11)
        start = end - timedelta(minutes=45)
        make_lesson(
            school_class=other_class,
            subject=self.subject,
            teacher=self.teacher,
            lesson_date=end.date(),
            start_time=start.time(),
            end_time=end.time(),
        )

        self.assertEqual(remind_unmarked_attendance(), 0)
        self.assertEqual(Notification.objects.count(), 0)


class LessonSummaryAPITests(APITestCase):
    def setUp(self):
        self.director = make_director()
        self.teacher_user, self.teacher = make_teacher()
        self.teacher_user_b, _ = make_teacher()
        self.class_6a = make_school_class(name="6-A", class_teacher=self.teacher)
        self.class_9d = make_school_class(name="9-D")
        self.subject = make_subject()
        self.student_user, self.student = make_student(self.class_6a)
        self.today = timezone.localdate()

        self.lesson_6a = make_lesson(
            school_class=self.class_6a,
            subject=self.subject,
            teacher=self.teacher,
            lesson_date=self.today,
            start_time=time(9, 0),
            end_time=time(9, 45),
        )
        self.lesson_9d = make_lesson(
            school_class=self.class_9d,
            subject=self.subject,
            teacher=self.teacher,
            lesson_date=self.today,
            start_time=time(10, 0),
            end_time=time(10, 45),
        )
        Attendance.objects.create(
            lesson=self.lesson_6a, student=self.student, status=Attendance.Status.PRESENT
        )

    def _get(self, **params):
        return self.client.get("/api/attendance/lesson-summary/", params)

    def test_director_sees_every_lesson_with_attendance_flags(self):
        self.client.force_authenticate(self.director)
        response = self._get(date=self.today.isoformat())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        by_id = {row["id"]: row for row in response.data}
        self.assertTrue(by_id[self.lesson_6a.id]["attendance_marked"])
        self.assertEqual(by_id[self.lesson_6a.id]["marked_count"], 1)
        self.assertFalse(by_id[self.lesson_9d.id]["attendance_marked"])
        self.assertEqual(by_id[self.lesson_9d.id]["marked_count"], 0)

    def test_director_filters_by_class(self):
        self.client.force_authenticate(self.director)
        response = self._get(date=self.today.isoformat(), school_class=self.class_6a.id)
        self.assertEqual([row["id"] for row in response.data], [self.lesson_6a.id])

    def test_student_only_sees_own_class_lessons(self):
        self.client.force_authenticate(self.student_user)
        response = self._get(date=self.today.isoformat())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row["id"] for row in response.data], [self.lesson_6a.id])
        self.assertTrue(response.data[0]["attendance_marked"])

    def test_teacher_sees_own_and_led_class_lessons(self):
        self.client.force_authenticate(self.teacher_user)
        response = self._get(date=self.today.isoformat())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        lesson_ids = {row["id"] for row in response.data}
        self.assertIn(self.lesson_6a.id, lesson_ids)
        self.assertIn(self.lesson_9d.id, lesson_ids)
        # An unrelated teacher sees nothing.
        self.client.force_authenticate(self.teacher_user_b)
        self.assertEqual(self._get(date=self.today.isoformat()).data, [])

    def test_default_date_is_today(self):
        self.client.force_authenticate(self.director)
        self.assertEqual(len(self._get().data), 2)
