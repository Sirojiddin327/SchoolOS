from rest_framework import status
from rest_framework.test import APITestCase

from apps.common.testing import (
    make_director,
    make_school_class,
    make_student,
    make_subject,
    make_teacher,
)
from apps.gamification.models import XPTransaction
from apps.gamification.services import award_xp
from apps.learning.models import Activity, Test
from apps.schools.models import SchoolClass


class DirectorDashboardTests(APITestCase):
    def setUp(self):
        self.subject = make_subject()
        _, self.teacher = make_teacher()
        self.school_class = make_school_class()
        _, self.student = make_student(self.school_class)

    def test_reports_test_activity_and_xp_totals(self):
        Test.objects.create(
            title="T1", subject=self.subject, school_class=self.school_class, teacher=self.teacher
        )
        Activity.objects.create(
            title="A1", subject=self.subject, school_class=self.school_class, teacher=self.teacher,
            activity_type=Activity.ActivityType.ASSIGNMENT,
        )
        award_xp(
            student=self.student, amount=30, source=XPTransaction.Source.TEST,
            related_object=None, reason="x",
        )

        self.client.force_authenticate(make_director())
        response = self.client.get("/api/dashboard/director/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_tests"], 1)
        self.assertEqual(response.data["total_activities"], 1)
        self.assertEqual(response.data["total_xp_awarded"], 30)
        self.assertEqual(response.data["top_class"]["name"], self.school_class.name)
        self.assertEqual(response.data["top_class"]["total_xp"], 30)

    def test_reports_null_top_class_when_no_classes_exist(self):
        SchoolClass.objects.all().delete()

        self.client.force_authenticate(make_director())
        response = self.client.get("/api/dashboard/director/")

        self.assertIsNone(response.data["top_class"])

    def test_teacher_cannot_access_director_dashboard(self):
        teacher_user, _profile = make_teacher()
        self.client.force_authenticate(teacher_user)
        response = self.client.get("/api/dashboard/director/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
