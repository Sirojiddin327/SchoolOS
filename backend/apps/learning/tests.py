import json
from unittest.mock import Mock, patch

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from apps.common.testing import (
    make_director,
    make_school_class,
    make_student,
    make_subject,
    make_teacher,
    make_timetable_slot,
)
from apps.gamification.models import XPTransaction

from .models import Activity, ActivitySubmission, Option, Question, Test, TestAttempt
from .services import grade_attempt, grade_submission


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

    @patch("apps.telegram_bot.services.send_telegram_message")
    def test_notifies_linked_parent_of_the_result(self, mock_send):
        from apps.telegram_bot.models import ParentTelegramAccount

        ParentTelegramAccount.objects.create(student=self.student, telegram_id=111)

        grade_attempt(
            attempt=self._attempt(),
            answers=[{"question": self.q1, "selected_option": self.o1_correct}],
        )

        mock_send.assert_called_once()
        self.assertEqual(mock_send.call_args.args[0], 111)
        self.assertIn("Python asoslari", mock_send.call_args.args[1])


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


class QuestionCapAPITests(APITestCase):
    """A subject that meets ≤2x/week in a class gets a standard 10-question cap."""

    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, self.teacher = make_teacher()
        self.school_class = make_school_class()

    def _add_question(self, test):
        return self.client.post(
            "/api/questions/", {"test": test.id, "text": "Savol?", "order": 1}, format="json"
        )

    def test_capped_at_ten_when_subject_meets_twice_a_week(self):
        make_timetable_slot(
            school_class=self.school_class, subject=self.subject, teacher=self.teacher, period_number=1
        )
        make_timetable_slot(
            school_class=self.school_class, subject=self.subject, teacher=self.teacher, period_number=2
        )
        test = Test.objects.create(
            title="Ona tili", subject=self.subject, school_class=self.school_class, teacher=self.teacher
        )
        for order in range(1, 11):
            Question.objects.create(test=test, text=f"Savol {order}", order=order)

        self.client.force_authenticate(self.teacher_user)
        response = self._add_question(test)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(test.questions.count(), 10)

    def test_no_cap_when_subject_meets_more_than_twice_a_week(self):
        for period in (1, 2, 3):
            make_timetable_slot(
                school_class=self.school_class, subject=self.subject, teacher=self.teacher, period_number=period
            )
        test = Test.objects.create(
            title="Matematika", subject=self.subject, school_class=self.school_class, teacher=self.teacher
        )
        for order in range(1, 11):
            Question.objects.create(test=test, text=f"Savol {order}", order=order)

        self.client.force_authenticate(self.teacher_user)
        response = self._add_question(test)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_no_cap_when_no_timetable_slots_exist_yet(self):
        test = Test.objects.create(
            title="Tarix", subject=self.subject, school_class=self.school_class, teacher=self.teacher
        )
        for order in range(1, 11):
            Question.objects.create(test=test, text=f"Savol {order}", order=order)

        self.client.force_authenticate(self.teacher_user)
        response = self._add_question(test)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


class GradeSubmissionTests(TestCase):
    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, self.teacher = make_teacher()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        self.activity = Activity.objects.create(
            title="100m yugurish",
            subject=self.subject,
            school_class=self.school_class,
            teacher=self.teacher,
            activity_type=Activity.ActivityType.SPORTS,
            max_xp=50,
        )

    def _submission(self):
        return ActivitySubmission.objects.create(
            activity=self.activity, student=self.student, content="14.2 soniya"
        )

    def test_xp_awarded_matches_score_percent_of_max_xp(self):
        result = grade_submission(
            submission=self._submission(), score_percent=90, feedback="Yaxshi", graded_by=self.teacher_user
        )
        self.assertEqual(result.xp_awarded, 45)

    def test_awards_xp_to_student_and_class(self):
        grade_submission(
            submission=self._submission(), score_percent=100, feedback="", graded_by=self.teacher_user
        )
        self.student.refresh_from_db()
        self.school_class.refresh_from_db()
        self.assertEqual(self.student.total_xp, 50)
        self.assertEqual(self.school_class.total_xp, 50)

    def test_creates_an_auditable_xp_transaction(self):
        grade_submission(
            submission=self._submission(), score_percent=50, feedback="", graded_by=self.teacher_user
        )
        transaction = XPTransaction.objects.get(student=self.student)
        self.assertEqual(transaction.source, XPTransaction.Source.ACTIVITY)
        self.assertEqual(transaction.related_object, self.activity)

    def test_cannot_grade_the_same_submission_twice(self):
        submission = self._submission()
        grade_submission(submission=submission, score_percent=50, feedback="", graded_by=self.teacher_user)
        with self.assertRaises(ValueError):
            grade_submission(submission=submission, score_percent=80, feedback="", graded_by=self.teacher_user)

    def test_out_of_range_score_is_rejected(self):
        with self.assertRaises(ValueError):
            grade_submission(
                submission=self._submission(), score_percent=150, feedback="", graded_by=self.teacher_user
            )


class ActivityAPITests(APITestCase):
    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, self.teacher = make_teacher()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        self.activity = Activity.objects.create(
            title="Loyiha topshirig'i",
            subject=self.subject,
            school_class=self.school_class,
            teacher=self.teacher,
            activity_type=Activity.ActivityType.ASSIGNMENT,
            max_xp=100,
        )

    def test_draft_activity_is_invisible_to_students(self):
        self.client.force_authenticate(self.student_user)
        response = self.client.get(f"/api/activities/{self.activity.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_student_can_submit_after_publish(self):
        self.client.force_authenticate(self.teacher_user)
        publish_response = self.client.post(f"/api/activities/{self.activity.id}/publish/")
        self.assertEqual(publish_response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(self.student_user)
        submit_response = self.client.post(
            f"/api/activities/{self.activity.id}/submit/", {"content": "Bajarildi"}, format="json"
        )
        self.assertEqual(submit_response.status_code, status.HTTP_201_CREATED)

    def test_student_cannot_submit_twice(self):
        self.activity.status = Activity.Status.PUBLISHED
        self.activity.save()
        self.client.force_authenticate(self.student_user)
        payload = {"content": "Bajarildi"}
        self.client.post(f"/api/activities/{self.activity.id}/submit/", payload, format="json")
        second = self.client.post(f"/api/activities/{self.activity.id}/submit/", payload, format="json")
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_empty_submission_is_rejected(self):
        self.activity.status = Activity.Status.PUBLISHED
        self.activity.save()
        self.client.force_authenticate(self.student_user)
        response = self.client.post(f"/api/activities/{self.activity.id}/submit/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_teacher_can_grade_via_api(self):
        self.activity.status = Activity.Status.PUBLISHED
        self.activity.save()
        submission = ActivitySubmission.objects.create(
            activity=self.activity, student=self.student, content="Bajarildi"
        )

        self.client.force_authenticate(self.teacher_user)
        response = self.client.post(
            f"/api/activity-submissions/{submission.id}/grade/",
            {"score_percent": 80, "feedback": "Zo'r!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["result"]["xp_awarded"], 80)

    def test_unrelated_teacher_cannot_grade(self):
        self.activity.status = Activity.Status.PUBLISHED
        self.activity.save()
        submission = ActivitySubmission.objects.create(
            activity=self.activity, student=self.student, content="Bajarildi"
        )
        other_teacher_user, _other_teacher_profile = make_teacher()

        self.client.force_authenticate(other_teacher_user)
        response = self.client.post(
            f"/api/activity-submissions/{submission.id}/grade/", {"score_percent": 80}, format="json"
        )
        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))

    def test_student_cannot_see_another_students_submission(self):
        self.activity.status = Activity.Status.PUBLISHED
        self.activity.save()
        submission = ActivitySubmission.objects.create(
            activity=self.activity, student=self.student, content="Bajarildi"
        )
        other_student_user, _other_student = make_student(self.school_class)

        self.client.force_authenticate(other_student_user)
        response = self.client.get(f"/api/activity-submissions/{submission.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


def _gemini_response(content: str) -> Mock:
    response = Mock()
    response.raise_for_status = Mock()
    response.json.return_value = {"candidates": [{"content": {"parts": [{"text": content}]}}]}
    return response


class AITestGenerationAPITests(APITestCase):
    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, self.teacher = make_teacher()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        self.payload = {
            "title": "Kasrlar",
            "subject": self.subject.id,
            "school_class": self.school_class.id,
            "topic": "Oddiy kasrlar",
            "question_count": 5,
        }
        self.ai_payload = json.dumps(
            {
                "questions": [
                    {"text": f"Savol {i}", "options": ["a", "b", "c", "d"], "correct_index": i % 4}
                    for i in range(5)
                ]
            }
        )

    @patch("apps.common.gemini.settings.GEMINI_API_KEY", "test-key")
    @patch("apps.common.gemini.requests.post")
    def test_teacher_can_generate_a_test(self, mock_post):
        mock_post.return_value = _gemini_response(self.ai_payload)
        self.client.force_authenticate(self.teacher_user)
        response = self.client.post("/api/tests/generate/", self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["title"], "Kasrlar")
        self.assertFalse(response.data["is_published"])
        self.assertEqual(len(response.data["questions"]), 5)

        test = Test.objects.get(id=response.data["id"])
        self.assertEqual(test.teacher, self.teacher)
        self.assertEqual(test.questions.count(), 5)
        first_question = test.questions.order_by("order").first()
        self.assertEqual(first_question.options.count(), 4)
        self.assertEqual(first_question.options.get(is_correct=True).text, "a")

    @patch("apps.common.gemini.settings.GEMINI_API_KEY", "")
    @patch("apps.common.gemini.settings.GROQ_API_KEY", "")
    def test_generation_fails_gracefully_without_an_api_key(self, *_):
        self.client.force_authenticate(self.teacher_user)
        response = self.client.post("/api/tests/generate/", self.payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Test.objects.exists())

    @patch("apps.common.gemini.settings.GEMINI_API_KEY", "test-key")
    @patch("apps.common.gemini.requests.post")
    def test_director_can_generate_a_test_for_a_chosen_teacher(self, mock_post):
        mock_post.return_value = _gemini_response(self.ai_payload)
        self.client.force_authenticate(make_director())
        response = self.client.post(
            "/api/tests/generate/", {**self.payload, "teacher": self.teacher.id}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        test = Test.objects.get(id=response.data["id"])
        self.assertEqual(test.teacher, self.teacher)

    @patch("apps.common.gemini.settings.GEMINI_API_KEY", "test-key")
    def test_director_must_choose_a_teacher(self, *_):
        self.client.force_authenticate(make_director())
        response = self.client.post("/api/tests/generate/", self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Test.objects.exists())

    @patch("apps.common.gemini.settings.GEMINI_API_KEY", "test-key")
    def test_student_cannot_generate_a_test(self, *_):
        self.client.force_authenticate(self.student_user)
        response = self.client.post("/api/tests/generate/", self.payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch("apps.common.gemini.settings.GEMINI_API_KEY", "test-key")
    @patch("apps.common.gemini.requests.post")
    def test_question_count_is_capped_for_a_low_frequency_subject(self, mock_post):
        make_timetable_slot(
            school_class=self.school_class, subject=self.subject, teacher=self.teacher, period_number=1
        )
        make_timetable_slot(
            school_class=self.school_class, subject=self.subject, teacher=self.teacher, period_number=2
        )
        big_payload = json.dumps(
            {
                "questions": [
                    {"text": f"Savol {i}", "options": ["a", "b", "c", "d"], "correct_index": 0}
                    for i in range(20)
                ]
            }
        )
        mock_post.return_value = _gemini_response(big_payload)

        self.client.force_authenticate(self.teacher_user)
        response = self.client.post(
            "/api/tests/generate/", {**self.payload, "question_count": 20}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        test = Test.objects.get(id=response.data["id"])
        self.assertEqual(test.questions.count(), 10)
