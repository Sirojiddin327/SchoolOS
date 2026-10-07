import json
from unittest.mock import Mock, patch

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APITestCase

from apps.common.testing import make_school_class, make_student, make_subject, make_teacher
from apps.gamification.models import XPTransaction
from apps.learning.models import Option, Question, Test, TestAttempt
from apps.learning.services import grade_attempt

from .models import RemedialSession
from .services import (
    generate_explanation,
    generate_game_questions,
    maybe_start_remedial_session,
    submit_game,
)


def _gemini_response(content: str) -> Mock:
    response = Mock()
    response.raise_for_status = Mock()
    response.json.return_value = {"candidates": [{"content": {"parts": [{"text": content}]}}]}
    return response


def _make_test_with_questions(*, school_class, subject, teacher, count: int, max_xp=100) -> Test:
    test = Test.objects.create(
        title="Sinov testi", subject=subject, school_class=school_class, teacher=teacher, max_xp=max_xp
    )
    for index in range(count):
        question = Question.objects.create(test=test, text=f"Savol {index + 1}?", order=index + 1)
        Option.objects.create(question=question, text="To'g'ri", is_correct=True)
        Option.objects.create(question=question, text="Xato", is_correct=False)
    return test


class MaybeStartRemedialSessionTests(TestCase):
    def setUp(self):
        self.subject = make_subject()
        _, self.teacher = make_teacher()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        self.test = _make_test_with_questions(
            school_class=self.school_class, subject=self.subject, teacher=self.teacher, count=4
        )

    def _attempt_with_score(self, correct_count: int) -> TestAttempt:
        attempt, _ = TestAttempt.objects.get_or_create(test=self.test, student=self.student)
        questions = list(self.test.questions.all())
        answers = []
        for index, question in enumerate(questions):
            option = question.options.get(is_correct=(index < correct_count))
            answers.append({"question": question, "selected_option": option})
        return grade_attempt(attempt=attempt, answers=answers)

    def test_low_score_creates_a_session(self):
        attempt = self._attempt_with_score(1)  # 25%
        session = maybe_start_remedial_session(attempt)
        self.assertIsNotNone(session)
        self.assertEqual(session.student, self.student)
        self.assertEqual(session.subject, self.subject)

    def test_high_score_creates_nothing(self):
        attempt = self._attempt_with_score(4)  # 100%
        self.assertIsNone(maybe_start_remedial_session(attempt))

    def test_is_idempotent_per_attempt(self):
        attempt = self._attempt_with_score(1)
        first = maybe_start_remedial_session(attempt)
        second = maybe_start_remedial_session(attempt)
        self.assertEqual(first.id, second.id)
        self.assertEqual(RemedialSession.objects.filter(attempt=attempt).count(), 1)


class AIServiceTests(TestCase):
    def setUp(self):
        self.subject = make_subject()
        _, self.teacher = make_teacher()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        self.test = _make_test_with_questions(
            school_class=self.school_class, subject=self.subject, teacher=self.teacher, count=4
        )
        attempt, _ = TestAttempt.objects.get_or_create(test=self.test, student=self.student)
        wrong_answers = [
            {"question": q, "selected_option": q.options.get(is_correct=False)}
            for q in self.test.questions.all()
        ]
        self.attempt = grade_attempt(attempt=attempt, answers=wrong_answers)
        self.session = maybe_start_remedial_session(self.attempt)

    @patch("apps.common.gemini.settings.GEMINI_API_KEY", "test-key")
    @patch("apps.common.gemini.requests.post")
    def test_generate_explanation_success(self, mock_post):
        mock_post.return_value = _gemini_response("Bu mavzuni tushunish uchun...")
        explanation = generate_explanation(self.session)
        self.assertEqual(explanation, "Bu mavzuni tushunish uchun...")
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, RemedialSession.Status.EXPLAINED)

    @patch("apps.common.gemini.settings.GEMINI_API_KEY", "")
    @patch("apps.common.gemini.settings.GROQ_API_KEY", "")
    def test_generate_explanation_without_api_key_fails_quietly(self):
        self.assertIsNone(generate_explanation(self.session))
        self.session.refresh_from_db()
        self.assertEqual(self.session.explanation, "")

    @patch("apps.common.gemini.settings.GEMINI_API_KEY", "test-key")
    @patch("apps.common.gemini.requests.post")
    def test_generate_explanation_is_cached(self, mock_post):
        mock_post.return_value = _gemini_response("Birinchi tushuntirish")
        generate_explanation(self.session)
        mock_post.return_value = _gemini_response("Ikkinchi tushuntirish")
        second_call = generate_explanation(self.session)
        self.assertEqual(second_call, "Birinchi tushuntirish")
        mock_post.assert_called_once()

    @patch("apps.common.gemini.settings.GEMINI_API_KEY", "test-key")
    @patch("apps.common.gemini.requests.post")
    def test_generate_game_questions_success(self, mock_post):
        self.session.explanation = "Tushuntirish"
        self.session.save()
        payload = {
            "questions": [
                {"text": f"Savol {i}", "options": ["a", "b", "c", "d"], "correct_index": 1} for i in range(6)
            ]
        }
        mock_post.return_value = _gemini_response(json.dumps(payload))
        questions = generate_game_questions(self.session)
        self.assertEqual(len(questions), 6)
        self.session.refresh_from_db()
        self.assertEqual(len(self.session.questions), 6)

    @patch("apps.common.gemini.settings.GEMINI_API_KEY", "test-key")
    @patch("apps.common.gemini.requests.post")
    def test_generate_game_questions_malformed_json_fails_quietly(self, mock_post):
        self.session.explanation = "Tushuntirish"
        self.session.save()
        mock_post.return_value = _gemini_response("this is not json")
        self.assertIsNone(generate_game_questions(self.session))


class SubmitGameTests(TestCase):
    def setUp(self):
        self.subject = make_subject()
        _, self.teacher = make_teacher()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        self.test = _make_test_with_questions(
            school_class=self.school_class, subject=self.subject, teacher=self.teacher, count=4
        )
        attempt, _ = TestAttempt.objects.get_or_create(test=self.test, student=self.student)
        wrong_answers = [
            {"question": q, "selected_option": q.options.get(is_correct=False)}
            for q in self.test.questions.all()
        ]
        self.attempt = grade_attempt(attempt=attempt, answers=wrong_answers)
        self.session = maybe_start_remedial_session(self.attempt)
        self.session.explanation = "Tushuntirish"
        self.session.questions = [
            {"text": "1+1?", "options": ["1", "2", "3", "4"], "correct_index": 1},
            {"text": "2+2?", "options": ["3", "4", "5", "6"], "correct_index": 1},
        ]
        self.session.save()

    def test_scores_and_awards_xp(self):
        session = submit_game(session=self.session, answers={0: 1, 1: 1})
        self.assertEqual(session.score_percent, 100.0)
        self.assertEqual(session.status, RemedialSession.Status.COMPLETED)
        self.assertTrue(
            XPTransaction.objects.filter(
                student=self.student, source=XPTransaction.Source.REMEDIAL_GAME
            ).exists()
        )

    def test_no_xp_for_a_zero_score(self):
        submit_game(session=self.session, answers={0: 0, 1: 0})
        self.assertFalse(
            XPTransaction.objects.filter(
                student=self.student, source=XPTransaction.Source.REMEDIAL_GAME
            ).exists()
        )

    def test_cannot_submit_twice(self):
        submit_game(session=self.session, answers={0: 1, 1: 1})
        with self.assertRaises(ValueError):
            submit_game(session=self.session, answers={0: 1, 1: 1})


class RemedialAPITests(APITestCase):
    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, self.teacher = make_teacher()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        self.other_user, self.other_student = make_student(self.school_class)
        self.test = _make_test_with_questions(
            school_class=self.school_class, subject=self.subject, teacher=self.teacher, count=4
        )
        self.test.is_published = True
        self.test.save()

    def _submit(self, *, correct_count: int):
        self.client.force_authenticate(self.student_user)
        self.client.post(f"/api/tests/{self.test.id}/start/")
        questions = list(self.test.questions.all())
        answers = [
            {
                "question": q.id,
                "selected_option": q.options.get(is_correct=(i < correct_count)).id,
            }
            for i, q in enumerate(questions)
        ]
        return self.client.post(f"/api/tests/{self.test.id}/submit/", {"answers": answers}, format="json")

    def test_low_score_response_includes_remedial_session_id(self):
        response = self._submit(correct_count=1)
        self.assertIsNotNone(response.data["remedial_session_id"])

    def test_high_score_response_has_no_remedial_session(self):
        response = self._submit(correct_count=4)
        self.assertIsNone(response.data["remedial_session_id"])

    @patch("apps.common.gemini.settings.GEMINI_API_KEY", "test-key")
    @patch("apps.common.gemini.requests.post")
    def test_full_flow_via_api(self, mock_post):
        submit_response = self._submit(correct_count=0)
        session_id = submit_response.data["remedial_session_id"]

        mock_post.return_value = _gemini_response("Qisqa tushuntirish.")
        explain_response = self.client.post(f"/api/remedial-sessions/{session_id}/explain/")
        self.assertEqual(explain_response.status_code, status.HTTP_200_OK)

        payload = {
            "questions": [
                {"text": f"Savol {i}", "options": ["a", "b", "c", "d"], "correct_index": 0} for i in range(6)
            ]
        }
        mock_post.return_value = _gemini_response(json.dumps(payload))
        game_response = self.client.get(f"/api/remedial-sessions/{session_id}/game/")
        self.assertEqual(game_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(game_response.data), 6)
        self.assertNotIn("correct_index", game_response.data[0])

        # Options are shuffled on the way in — answer with the stored key.
        stored = RemedialSession.objects.get(pk=session_id).questions
        answers = [{"question_index": i, "selected_index": q["correct_index"]} for i, q in enumerate(stored)]
        submit_game_response = self.client.post(
            f"/api/remedial-sessions/{session_id}/submit/", {"answers": answers}, format="json"
        )
        self.assertEqual(submit_game_response.status_code, status.HTTP_200_OK)
        self.assertEqual(submit_game_response.data["score_percent"], 100.0)

    def test_another_student_cannot_see_someone_elses_session(self):
        submit_response = self._submit(correct_count=0)
        session_id = submit_response.data["remedial_session_id"]

        self.client.force_authenticate(self.other_user)
        response = self.client.get(f"/api/remedial-sessions/{session_id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_teacher_cannot_access_remedial_sessions(self):
        self.client.force_authenticate(self.teacher_user)
        response = self.client.get("/api/remedial-sessions/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class GameRemedialTests(APITestCase):
    """A low practice-game score opens the same AI-tutor flow as a low test score."""

    def setUp(self):
        from apps.common.testing import make_school_class, make_student, make_subject
        from apps.games.models import PooledQuestion

        self.subject = make_subject()
        school_class = make_school_class()
        self.user, self.student = make_student(school_class)
        PooledQuestion.objects.bulk_create(
            PooledQuestion(
                subject=self.subject, school_class=school_class, organization=school_class.organization,
                text=f"Savol {i}", options=["a", "b", "c", "d"], correct_index=i % 4,
            )
            for i in range(12)
        )
        self.client.force_authenticate(self.user)

    def _play_quiz(self, *, correct: int):
        from apps.games.models import GameSession

        session_id = self.client.post(
            "/api/games/", {"subject": self.subject.id, "game_type": "QUIZ"}, format="json"
        ).data["id"]
        self.client.get(f"/api/games/{session_id}/questions/")
        questions = GameSession.objects.get(pk=session_id).questions
        answers = [
            {"question_index": i, "selected_index": q["correct_index"] if i < correct else (q["correct_index"] + 1) % 4}
            for i, q in enumerate(questions)
        ]
        return self.client.post(f"/api/games/{session_id}/submit/", {"answers": answers}, format="json")

    def test_low_game_score_opens_a_remedial_session(self):
        response = self._play_quiz(correct=2)

        self.assertIsNotNone(response.data["remedial_session_id"])
        remedial = RemedialSession.objects.get(pk=response.data["remedial_session_id"])
        self.assertEqual(remedial.game_session_id, response.data["id"])
        self.assertIsNone(remedial.attempt_id)

    def test_good_game_score_does_not(self):
        response = self._play_quiz(correct=7)

        self.assertIsNone(response.data["remedial_session_id"])
        self.assertFalse(RemedialSession.objects.exists())

    @patch("apps.remedial.services.call_gemini", return_value="Tushuntirish matni")
    def test_explanation_is_about_the_missed_game_questions(self, mock_gemini):
        remedial_id = self._play_quiz(correct=2).data["remedial_session_id"]

        response = self.client.post(f"/api/remedial-sessions/{remedial_id}/explain/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["source"], "GAME")
        self.assertEqual(response.data["test_title"], "Viktorina")
        prompt = mock_gemini.call_args.kwargs["prompt"]
        self.assertIn("mashq o'yinini", prompt)
        self.assertEqual(prompt.count("- Savol"), 6)
