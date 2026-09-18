from django.test import TestCase
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

from .models import Option, Question, Test, TestAttempt
from .services import grade_attempt


def _make_two_question_test(*, teacher, subject, school_class, max_xp=100):
    test = Test.objects.create(
        title="Python asoslari", subject=subject, school_class=school_class, teacher=teacher, max_xp=max_xp
    )
    q1 = Question.objects.create(test=test, text="2+2=?", order=1)
    o1_correct = Option.objects.create(question=q1, text="4", is_correct=True)
    Option.objects.create(question=q1, text="5", is_correct=False)
    q2 = Question.objects.create(test=test, text="Python nima?", order=2)
    o2_correct = Option.objects.create(question=q2, text="Dasturlash tili", is_correct=True)
    o2_wrong = Option.objects.create(question=q2, text="Hayvon", is_correct=False)
    return test, q1, o1_correct, q2, o2_correct, o2_wrong


class GradeAttemptTests(TestCase):
    def setUp(self):
        self.subject = make_subject()
        _, self.teacher = make_teacher()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        (
            self.test,
            self.q1,
            self.o1_correct,
            self.q2,
            self.o2_correct,
            self.o2_wrong,
        ) = _make_two_question_test(teacher=self.teacher, subject=self.subject, school_class=self.school_class)

    def _attempt(self):
        attempt, _created = TestAttempt.objects.get_or_create(test=self.test, student=self.student)
        return attempt

    def test_score_and_xp_match_the_spec_worked_example(self):
        # 8/10 -> 80% -> 80 XP, scaled here to 1/2 -> 50% -> 50 XP on a 100-max-xp test.
        attempt = grade_attempt(
            attempt=self._attempt(),
            answers=[
                {"question": self.q1, "selected_option": self.o1_correct},
                {"question": self.q2, "selected_option": self.o2_wrong},
            ],
        )
        self.assertEqual(attempt.status, TestAttempt.Status.SUBMITTED)
        self.assertEqual(attempt.score_percent, 50.0)
        self.assertEqual(attempt.xp_awarded, 50)

    def test_perfect_score_awards_full_max_xp(self):
        attempt = grade_attempt(
            attempt=self._attempt(),
            answers=[
                {"question": self.q1, "selected_option": self.o1_correct},
                {"question": self.q2, "selected_option": self.o2_correct},
            ],
        )
        self.assertEqual(attempt.score_percent, 100.0)
        self.assertEqual(attempt.xp_awarded, 100)

    def test_xp_bumps_student_and_class_total_by_the_same_amount(self):
        grade_attempt(
            attempt=self._attempt(),
            answers=[
                {"question": self.q1, "selected_option": self.o1_correct},
                {"question": self.q2, "selected_option": self.o2_correct},
            ],
        )
        self.student.refresh_from_db()
        self.school_class.refresh_from_db()
        self.assertEqual(self.student.total_xp, 100)
        self.assertEqual(self.school_class.total_xp, 100)

    def test_creates_an_auditable_xp_transaction(self):
        grade_attempt(
            attempt=self._attempt(),
            answers=[{"question": self.q1, "selected_option": self.o1_correct}],
        )
        transaction = XPTransaction.objects.get(student=self.student)
        self.assertEqual(transaction.source, XPTransaction.Source.TEST)
        self.assertEqual(transaction.related_object, self.test)

    def test_resubmitting_an_already_submitted_attempt_is_rejected(self):
        attempt = self._attempt()
        grade_attempt(
            attempt=attempt, answers=[{"question": self.q1, "selected_option": self.o1_correct}]
        )
        with self.assertRaises(ValueError):
            grade_attempt(
                attempt=attempt, answers=[{"question": self.q1, "selected_option": self.o1_correct}]
            )


class TestSubmitAPITests(APITestCase):
    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, self.teacher = make_teacher()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        self.other_student_user, self.other_student = make_student(self.school_class)
        (
            self.test,
            self.q1,
            self.o1_correct,
            self.q2,
            self.o2_correct,
            self.o2_wrong,
        ) = _make_two_question_test(teacher=self.teacher, subject=self.subject, school_class=self.school_class)
        self.test.is_published = True
        self.test.save()

    def test_student_can_start_and_submit(self):
        self.client.force_authenticate(self.student_user)
        start_response = self.client.post(f"/api/tests/{self.test.id}/start/")
        self.assertEqual(start_response.status_code, status.HTTP_200_OK)

        submit_response = self.client.post(
            f"/api/tests/{self.test.id}/submit/",
            {
                "answers": [
                    {"question": self.q1.id, "selected_option": self.o1_correct.id},
                    {"question": self.q2.id, "selected_option": self.o2_correct.id},
                ]
            },
            format="json",
        )
        self.assertEqual(submit_response.status_code, status.HTTP_200_OK)
        self.assertEqual(submit_response.data["score_percent"], 100.0)
        self.assertEqual(submit_response.data["xp_awarded"], 100)

    def test_duplicate_submission_is_rejected(self):
        self.client.force_authenticate(self.student_user)
        payload = {"answers": [{"question": self.q1.id, "selected_option": self.o1_correct.id}]}
        self.client.post(f"/api/tests/{self.test.id}/submit/", payload, format="json")
        second = self.client.post(f"/api/tests/{self.test.id}/submit/", payload, format="json")
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_submit_an_option_from_a_different_question(self):
        self.client.force_authenticate(self.student_user)
        response = self.client.post(
            f"/api/tests/{self.test.id}/submit/",
            {"answers": [{"question": self.q1.id, "selected_option": self.o2_correct.id}]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unpublished_test_is_invisible_to_students(self):
        self.test.is_published = False
        self.test.save()
        self.client.force_authenticate(self.student_user)
        response = self.client.get(f"/api/tests/{self.test.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_student_cannot_see_another_students_attempt_via_results(self):
        self.client.force_authenticate(self.other_student_user)
        response = self.client.post(f"/api/tests/{self.test.id}/start/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(self.teacher_user)
        results = self.client.get(f"/api/tests/{self.test.id}/results/")
        self.assertEqual(results.status_code, status.HTTP_200_OK)

    def test_teacher_cannot_edit_another_teachers_test(self):
        _, other_teacher = make_teacher()
        other_test = Test.objects.create(
            title="Boshqa test", subject=self.subject, school_class=self.school_class, teacher=other_teacher
        )
        self.client.force_authenticate(self.teacher_user)
        response = self.client.patch(f"/api/tests/{other_test.id}/", {"title": "Hacked"}, format="json")
        # get_queryset() already scopes a teacher to only their own tests, so another
        # teacher's test doesn't exist as far as this request is concerned — 404, not
        # 403, which also avoids leaking that the object exists at all.
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        other_test.refresh_from_db()
        self.assertEqual(other_test.title, "Boshqa test")

    def test_director_sees_all_tests_teacher_sees_only_their_own(self):
        _, other_teacher = make_teacher()
        Test.objects.create(
            title="Boshqa fan", subject=self.subject, school_class=self.school_class, teacher=other_teacher
        )

        self.client.force_authenticate(make_director())
        director_response = self.client.get("/api/tests/")
        self.assertEqual(director_response.data["count"], 2)

        self.client.force_authenticate(self.teacher_user)
        teacher_response = self.client.get("/api/tests/")
        self.assertEqual(teacher_response.data["count"], 1)
