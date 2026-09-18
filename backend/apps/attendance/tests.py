from datetime import time

from django.db import IntegrityError, transaction
from django.test import TestCase
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

from .models import Attendance
from .services import can_mark_attendance, mark_lesson_attendance


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
        self.school_class = make_school_class(class_teacher=self.class_teacher)
        self.lesson = make_lesson(
            school_class=self.school_class, subject=self.subject, teacher=self.own_teacher
        )
        self.director = make_director()
        self.student_user, _ = make_student(self.school_class)

    def test_director_can_always_mark(self):
        self.assertTrue(can_mark_attendance(self.director, self.lesson))

    def test_lessons_own_teacher_can_mark(self):
        self.assertTrue(can_mark_attendance(self.own_teacher_user, self.lesson))

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
        self.lesson = make_lesson(
            school_class=self.school_class, subject=self.subject, teacher=self.teacher
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
        self.assertEqual(response.data["late"], 0)

    def test_unrelated_teacher_forbidden(self):
        self.client.force_authenticate(self.other_teacher_user)
        response = self._get()
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_can_view_own_class_summary(self):
        self.client.force_authenticate(self.student_user)
        response = self._get()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
