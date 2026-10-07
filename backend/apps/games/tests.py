import json
from datetime import time
from io import StringIO
from unittest.mock import Mock, patch

from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework import status
from rest_framework.test import APITestCase

from apps.academics.models import Subject
from apps.common.testing import (
    default_organization,
    make_director,
    make_lesson,
    make_school_class,
    make_student,
    make_subject,
    make_teacher,
)
from apps.gamification.models import XPTransaction

from .models import GameSession, PooledQuestion
from .services import (
    MAX_GAME_XP,
    POOL_LOW_THRESHOLD,
    check_answer,
    pick_session_questions,
    pool_status,
    record_live_answer,
    refill_pool,
    revealed_code,
    start_game,
    submit_game,
)
from .tasks import refill_low_pools


def _gemini_response(content: str) -> Mock:
    response = Mock()
    response.raise_for_status = Mock()
    response.json.return_value = {"candidates": [{"content": {"parts": [{"text": content}]}}]}
    return response


def _questions_payload(count: int) -> str:
    return json.dumps(
        {
            "questions": [
                {
                    "text": f"Savol {i}",
                    "options": ["a", "b", "c", "d"],
                    "correct_index": i % 4,
                    "explanation": f"Izoh {i}",
                }
                for i in range(count)
            ]
        }
    )


def _seed_pool(*, subject, school_class, count: int, prefix: str = "Savol") -> list[PooledQuestion]:
    """`school_class=None` seeds the subject-wide bank. `prefix` keeps two banks
    of the same subject distinguishable in assertions."""
    organization = school_class.organization if school_class else default_organization()
    return PooledQuestion.objects.bulk_create(
        PooledQuestion(
            subject=subject,
            school_class=school_class,
            organization=organization,
            text=f"{prefix} {i}",
            options=["a", "b", "c", "d"],
            correct_index=i % 4,
            explanation=f"Izoh {i}",
        )
        for i in range(count)
    )


class PoolPickingTests(APITestCase):
    """`pick_session_questions` never talks to Gemini — see GameAPITests for
    the end-to-end proof that a game start doesn't call it either.
    """

    def setUp(self):
        self.subject = make_subject()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)

    def test_picks_eight_questions_from_a_larger_pool(self):
        _seed_pool(subject=self.subject, school_class=self.school_class, count=20)
        session = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)

        questions = pick_session_questions(session)

        self.assertEqual(len(questions), 8)

    def test_plays_a_short_game_rather_than_refusing(self):
        _seed_pool(subject=self.subject, school_class=self.school_class, count=5)
        session = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)

        # A thin bank is topped up with repeats instead of locking the student
        # out of the game — "fewer questions" beats "no game".
        self.assertEqual(len(pick_session_questions(session)), 5)

    def test_student_without_a_class_still_plays_from_the_subject_bank(self):
        _, unassigned_student = make_student(school_class=None)
        _seed_pool(subject=self.subject, school_class=self.school_class, count=20)
        session = start_game(
            student=unassigned_student, subject=self.subject, game_type=GameSession.GameType.QUIZ
        )

        self.assertEqual(len(pick_session_questions(session)), 8)

    def test_falls_back_to_another_class_of_the_same_subject(self):
        other_class = make_school_class()
        _seed_pool(subject=self.subject, school_class=other_class, count=20)
        session = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)

        # The bank belongs to the subject; the class a question was written for
        # only decides which questions are preferred, never whether the student
        # can play. A question written for another class of the same subject is
        # correct and on-topic, so it beats a "no questions" error.
        self.assertEqual(len(pick_session_questions(session)), 8)

    def test_never_serves_another_subjects_questions(self):
        other_subject = make_subject()
        _seed_pool(subject=other_subject, school_class=self.school_class, count=20)
        session = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)

        self.assertIsNone(pick_session_questions(session))

    def test_prefers_the_students_own_class_over_the_subject_wide_bank(self):
        _seed_pool(subject=self.subject, school_class=self.school_class, count=20, prefix="Sinf")
        _seed_pool(subject=self.subject, school_class=None, count=20, prefix="Fan")
        session = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)

        questions = pick_session_questions(session)

        # The own-class bank is large enough on its own, so none of the
        # subject-wide questions ("Fan ...") should be needed.
        self.assertEqual(len(questions), 8)
        self.assertTrue(all(q["text"].startswith("Sinf") for q in questions))

    def test_draws_the_subject_wide_bank_when_the_students_class_is_empty(self):
        _seed_pool(subject=self.subject, school_class=None, count=20)
        session = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)

        self.assertEqual(len(pick_session_questions(session)), 8)

    def test_retired_questions_are_never_served(self):
        _seed_pool(subject=self.subject, school_class=self.school_class, count=20)
        retired = PooledQuestion.objects.filter(subject=self.subject).first()
        retired.is_active = False
        retired.save(update_fields=["is_active"])
        session = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)

        texts = {q["text"] for q in pick_session_questions(session)}

        self.assertNotIn(retired.text, texts)

    def test_avoids_repeats_across_two_games_when_pool_is_large_enough(self):
        _seed_pool(subject=self.subject, school_class=self.school_class, count=16)

        first = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)
        first_questions = pick_session_questions(first)

        second = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)
        second_questions = pick_session_questions(second)

        first_texts = {q["text"] for q in first_questions}
        second_texts = {q["text"] for q in second_questions}
        self.assertEqual(first_texts & second_texts, set())

    def test_falls_back_to_repeats_when_the_pool_is_exhausted(self):
        _seed_pool(subject=self.subject, school_class=self.school_class, count=8)

        first = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)
        pick_session_questions(first)

        second = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)
        second_questions = pick_session_questions(second)

        # Only 8 questions exist total, so a second game for the same student
        # has no choice but to repeat them — better than refusing to play.
        self.assertEqual(len(second_questions), 8)

    def test_idempotent_for_the_same_session(self):
        _seed_pool(subject=self.subject, school_class=self.school_class, count=20)
        session = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)

        first_call = pick_session_questions(session)
        second_call = pick_session_questions(session)

        self.assertEqual(first_call, second_call)


class PoolRefillTests(APITestCase):
    def setUp(self):
        self.subject = make_subject()
        self.school_class = make_school_class()

    @patch("apps.common.gemini.settings.GEMINI_API_KEY", "test-key")
    @patch("apps.common.gemini.requests.post")
    def test_refill_adds_valid_questions_and_skips_malformed_ones(self, mock_post):
        payload = json.dumps(
            {
                "questions": [
                    {"text": "Yaxshi savol", "options": ["a", "b", "c", "d"], "correct_index": 1},
                    {"text": "", "options": ["a", "b"], "correct_index": 0},  # empty text
                    {"text": "Noto'g'ri indeks", "options": ["a", "b"], "correct_index": 5},  # out of range
                    {"text": "Kam variant", "options": ["a"], "correct_index": 0},  # < 2 options
                ]
            }
        )
        mock_post.return_value = _gemini_response(payload)

        added = refill_pool(subject=self.subject, school_class=self.school_class, batch_size=4)

        self.assertEqual(added, 1)
        self.assertEqual(PooledQuestion.objects.count(), 1)

    @patch("apps.common.gemini.settings.GEMINI_API_KEY", "")
    @patch("apps.common.gemini.settings.GROQ_API_KEY", "")
    def test_refill_returns_zero_when_gemini_is_unavailable(self):
        # No API key configured for either provider — call_gemini short-circuits to None.
        added = refill_pool(subject=self.subject, school_class=self.school_class)

        self.assertEqual(added, 0)
        self.assertEqual(PooledQuestion.objects.count(), 0)

    def test_pool_status_reports_counts_per_subject_and_class(self):
        other_class = make_school_class()
        _seed_pool(subject=self.subject, school_class=self.school_class, count=3)
        _seed_pool(subject=self.subject, school_class=other_class, count=5)

        rows = {(r["school_class"], r["count"]) for r in pool_status()}

        self.assertIn((self.school_class.id, 3), rows)
        self.assertIn((other_class.id, 5), rows)


class RefillLowPoolsTaskTests(APITestCase):
    """Regression: `refill_low_pools` used to fetch each low pool's Subject
    and SchoolClass with two separate `.get()` calls per row (N+1) — this
    also guards that the batch-fetched dict lookup doesn't mix up which
    subject/class pair gets refilled."""

    @patch("apps.common.gemini.settings.GEMINI_API_KEY", "test-key")
    @patch("apps.common.gemini.requests.post")
    def test_refills_every_low_pool_and_keeps_subject_class_pairs_correct(self, mock_post):
        subject_a, class_a = make_subject(), make_school_class()
        subject_b, class_b = make_subject(), make_school_class()
        _seed_pool(subject=subject_a, school_class=class_a, count=5)
        _seed_pool(subject=subject_b, school_class=class_b, count=5)
        # Not low — must be left alone.
        subject_c, class_c = make_subject(), make_school_class()
        _seed_pool(subject=subject_c, school_class=class_c, count=POOL_LOW_THRESHOLD)

        payload = json.dumps(
            {
                "questions": [
                    {"text": f"Savol {i}", "options": ["a", "b", "c", "d"], "correct_index": 0}
                    for i in range(30)
                ]
            }
        )
        mock_post.return_value = _gemini_response(payload)

        refilled = refill_low_pools()

        self.assertEqual(refilled, 2)
        self.assertGreater(PooledQuestion.objects.filter(subject=subject_a, school_class=class_a).count(), 5)
        self.assertGreater(PooledQuestion.objects.filter(subject=subject_b, school_class=class_b).count(), 5)
        self.assertEqual(PooledQuestion.objects.filter(subject=subject_c, school_class=class_c).count(), 20)


class GameServiceTests(APITestCase):
    def setUp(self):
        self.subject = make_subject()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)

    def test_submit_scores_and_awards_xp(self):
        _seed_pool(subject=self.subject, school_class=self.school_class, count=8)
        session = start_game(
            student=self.student, subject=self.subject, game_type=GameSession.GameType.TUG_OF_WAR
        )
        pick_session_questions(session)

        answers = {i: q["correct_index"] for i, q in enumerate(session.questions)}
        session = submit_game(session=session, answers=answers)

        self.assertEqual(session.score_percent, 100.0)
        self.assertEqual(session.status, GameSession.Status.COMPLETED)
        self.assertTrue(
            XPTransaction.objects.filter(student=self.student, source=XPTransaction.Source.GAME).exists()
        )

    def test_cannot_submit_before_questions_exist(self):
        session = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)
        with self.assertRaises(ValueError):
            submit_game(session=session, answers={0: 0})

    def test_check_answer_never_reveals_other_questions(self):
        _seed_pool(subject=self.subject, school_class=self.school_class, count=8)
        session = start_game(
            student=self.student, subject=self.subject, game_type=GameSession.GameType.TUG_OF_WAR
        )
        pick_session_questions(session)

        correct_index = session.questions[0]["correct_index"]
        self.assertTrue(check_answer(session=session, question_index=0, selected_index=correct_index))
        self.assertFalse(check_answer(session=session, question_index=0, selected_index=(correct_index + 1) % 4))
        # A timeout sends -1, which never matches any option index.
        self.assertFalse(check_answer(session=session, question_index=0, selected_index=-1))

    def test_check_answer_rejects_out_of_range_question(self):
        session = start_game(
            student=self.student, subject=self.subject, game_type=GameSession.GameType.TUG_OF_WAR
        )
        session.questions = [{"text": "Q", "options": ["a", "b"], "correct_index": 0}]
        with self.assertRaises(ValueError):
            check_answer(session=session, question_index=5, selected_index=0)


class GameAPITests(APITestCase):
    def setUp(self):
        self.subject = make_subject()
        _, self.teacher = make_teacher()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        self.teacher_user = self.teacher.user

    def test_teacher_cannot_start_a_game(self):
        self.client.force_authenticate(self.teacher_user)
        response = self.client.post(
            "/api/games/", {"subject": self.subject.id, "game_type": "QUIZ"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_can_start_a_game(self):
        self.client.force_authenticate(self.student_user)
        response = self.client.post(
            "/api/games/", {"subject": self.subject.id, "game_type": "TUG_OF_WAR"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "ACTIVE")

    @patch("apps.games.services.call_gemini")
    def test_full_flow_never_calls_gemini(self, mock_gemini):
        """The core promise of the pool system: a game's live start is pure DB reads."""
        _seed_pool(subject=self.subject, school_class=self.school_class, count=8)
        self.client.force_authenticate(self.student_user)
        create_response = self.client.post(
            "/api/games/", {"subject": self.subject.id, "game_type": "QUIZ"}, format="json"
        )
        session_id = create_response.data["id"]

        questions_response = self.client.get(f"/api/games/{session_id}/questions/")
        self.assertEqual(questions_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(questions_response.data), 8)
        self.assertNotIn("correct_index", questions_response.data[0])

        answer_response = self.client.post(
            f"/api/games/{session_id}/answer/", {"question_index": 0, "selected_index": 0}, format="json"
        )
        self.assertEqual(answer_response.status_code, status.HTTP_200_OK)
        self.assertIn("correct", answer_response.data)

        answers = [{"question_index": i, "selected_index": 0} for i in range(8)]
        submit_response = self.client.post(
            f"/api/games/{session_id}/submit/", {"answers": answers}, format="json"
        )
        self.assertEqual(submit_response.status_code, status.HTTP_200_OK)
        self.assertEqual(submit_response.data["status"], "COMPLETED")

        mock_gemini.assert_not_called()

    @patch("apps.games.services.call_gemini")
    def test_questions_endpoint_returns_503_when_pool_is_empty(self, mock_gemini):
        self.client.force_authenticate(self.student_user)
        create_response = self.client.post(
            "/api/games/", {"subject": self.subject.id, "game_type": "QUIZ"}, format="json"
        )
        session_id = create_response.data["id"]

        response = self.client.get(f"/api/games/{session_id}/questions/")

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        mock_gemini.assert_not_called()

    def test_submitting_a_timed_out_question_is_accepted(self):
        """Regression: the frontend always includes every question in the
        submit payload, including ones the student timed out on (selected_index
        -1) — the "answer" endpoint has always accepted -1 for a timeout, but
        the submit serializer rejected it with min_value=0, so any game where
        the student let the clock run out on even one question could never
        be submitted at all (400 on every attempt, no XP, no saved result)."""
        _seed_pool(subject=self.subject, school_class=self.school_class, count=8)
        self.client.force_authenticate(self.student_user)
        create_response = self.client.post(
            "/api/games/", {"subject": self.subject.id, "game_type": "TUG_OF_WAR"}, format="json"
        )
        session_id = create_response.data["id"]
        self.client.get(f"/api/games/{session_id}/questions/")

        answers = [{"question_index": 0, "selected_index": -1}] + [
            {"question_index": i, "selected_index": 0} for i in range(1, 8)
        ]
        submit_response = self.client.post(
            f"/api/games/{session_id}/submit/", {"answers": answers}, format="json"
        )

        self.assertEqual(submit_response.status_code, status.HTTP_200_OK)
        self.assertEqual(submit_response.data["status"], "COMPLETED")

    def test_student_cannot_access_another_students_session(self):
        self.client.force_authenticate(self.student_user)
        create_response = self.client.post(
            "/api/games/", {"subject": self.subject.id, "game_type": "QUIZ"}, format="json"
        )
        session_id = create_response.data["id"]

        other_user, _other = make_student(self.school_class)
        self.client.force_authenticate(other_user)
        response = self.client.get(f"/api/games/{session_id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class QuestionPoolAPITests(APITestCase):
    def setUp(self):
        self.subject = make_subject()
        self.school_class = make_school_class()
        self.director_user = make_director()
        _, self.teacher = make_teacher()
        self.student_user, _ = make_student(self.school_class)

    def test_student_cannot_list_or_refill_pools(self):
        self.client.force_authenticate(self.student_user)
        self.assertEqual(self.client.get("/api/question-pools/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.post(
                "/api/question-pools/refill/",
                {"subject": self.subject.id, "school_class": self.school_class.id},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_teacher_cannot_list_or_refill_pools(self):
        self.client.force_authenticate(self.teacher.user)
        self.assertEqual(self.client.get("/api/question-pools/").status_code, status.HTTP_403_FORBIDDEN)

    def test_director_can_list_pools(self):
        _seed_pool(subject=self.subject, school_class=self.school_class, count=6)
        self.client.force_authenticate(self.director_user)

        response = self.client.get("/api/question-pools/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["count"], 6)

    @patch("apps.common.gemini.settings.GEMINI_API_KEY", "test-key")
    @patch("apps.common.gemini.requests.post")
    def test_director_can_refill_a_pool(self, mock_post):
        mock_post.return_value = _gemini_response(_questions_payload(10))
        self.client.force_authenticate(self.director_user)

        response = self.client.post(
            "/api/question-pools/refill/",
            {"subject": self.subject.id, "school_class": self.school_class.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["added"], 10)
        self.assertEqual(PooledQuestion.objects.count(), 10)


class TowerBuilderTests(APITestCase):
    """Minora qurish: ten questions, answers locked in one at a time server-side,
    the key revealed only after the answer is recorded, XP via the shared formula.
    """

    def setUp(self):
        self.subject = make_subject()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        _seed_pool(subject=self.subject, school_class=self.school_class, count=20)
        self.session = start_game(
            student=self.student, subject=self.subject, game_type=GameSession.GameType.TOWER_BUILDER
        )
        pick_session_questions(self.session)

    def _answer(self, index, *, correct):
        key = self.session.questions[index]["correct_index"]
        return record_live_answer(
            session=self.session, question_index=index, selected_index=key if correct else (key + 1) % 4
        )

    def test_picks_ten_questions(self):
        self.assertEqual(len(self.session.questions), 10)

    def test_other_games_still_pick_eight(self):
        quiz = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)
        self.assertEqual(len(pick_session_questions(quiz)), 8)

    def test_correct_answer_builds_a_floor_and_reports_running_xp(self):
        result = self._answer(0, correct=True)

        self.assertTrue(result["correct"])
        self.assertEqual(result["correct_count"], 1)
        self.assertEqual(result["answered_count"], 1)
        self.assertEqual(result["xp_earned"], 3)

    def test_wrong_answer_reveals_key_and_explanation_but_adds_no_floor(self):
        result = self._answer(0, correct=False)

        self.assertFalse(result["correct"])
        self.assertEqual(result["correct_index"], self.session.questions[0]["correct_index"])
        self.assertEqual(result["explanation"], self.session.questions[0]["explanation"])
        self.assertEqual(result["correct_count"], 0)
        self.assertEqual(result["xp_earned"], 0)

    def test_an_answer_cannot_be_changed_once_recorded(self):
        self._answer(0, correct=False)
        with self.assertRaises(ValueError):
            self._answer(0, correct=True)

    def test_questions_must_be_answered_in_order(self):
        with self.assertRaises(ValueError):
            self._answer(3, correct=True)

    def test_rejects_an_out_of_range_option(self):
        with self.assertRaises(ValueError):
            record_live_answer(session=self.session, question_index=0, selected_index=9)

    def test_other_game_types_cannot_record_answers(self):
        quiz = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)
        pick_session_questions(quiz)
        with self.assertRaises(ValueError):
            record_live_answer(session=quiz, question_index=0, selected_index=0)

    def test_submit_scores_the_recorded_answers_not_the_payload(self):
        for i in range(10):
            self._answer(i, correct=i < 7)
        self.session.refresh_from_db()

        # The client claims a perfect game — the server's own record wins.
        claimed = {i: q["correct_index"] for i, q in enumerate(self.session.questions)}
        session = submit_game(session=self.session, answers=claimed)

        self.assertEqual(session.score_percent, 70.0)
        self.assertEqual(session.xp_awarded, 21)
        transaction = XPTransaction.objects.get(student=self.student, source=XPTransaction.Source.GAME)
        self.assertEqual(transaction.amount, 21)

    def test_cannot_submit_before_every_question_is_answered(self):
        self._answer(0, correct=True)
        self.session.refresh_from_db()
        with self.assertRaises(ValueError):
            submit_game(session=self.session, answers={0: 0})

    def test_cannot_answer_after_completion(self):
        for i in range(10):
            self._answer(i, correct=True)
        self.session.refresh_from_db()
        submit_game(session=self.session, answers={0: 0})
        with self.assertRaises(ValueError):
            record_live_answer(session=self.session, question_index=0, selected_index=0)

    def test_api_flow_hides_the_key_until_answered_and_reports_progress(self):
        self.client.force_authenticate(self.student_user)
        questions = self.client.get(f"/api/games/{self.session.id}/questions/").data
        self.assertEqual(len(questions), 10)
        self.assertNotIn("correct_index", questions[0])
        self.assertNotIn("explanation", questions[0])

        response = self.client.post(
            f"/api/games/{self.session.id}/answer/", {"question_index": 0, "selected_index": -1}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["correct"])
        self.assertIn("correct_index", response.data)

        repeat = self.client.post(
            f"/api/games/{self.session.id}/answer/", {"question_index": 0, "selected_index": 0}, format="json"
        )
        self.assertEqual(repeat.status_code, status.HTTP_400_BAD_REQUEST)

        detail = self.client.get(f"/api/games/{self.session.id}/").data
        self.assertEqual(detail["answered_count"], 1)
        self.assertEqual(detail["question_count"], 10)
        self.assertEqual(detail["max_xp"], 30)

    def test_refill_stores_explanations(self):
        with (
            patch("apps.common.gemini.settings.GEMINI_API_KEY", "test-key"),
            patch("apps.common.gemini.requests.post", return_value=_gemini_response(_questions_payload(3))),
        ):
            other_class = make_school_class(name="7-B")
            refill_pool(subject=self.subject, school_class=other_class, batch_size=3)

        self.assertEqual(
            sorted(PooledQuestion.objects.filter(school_class=other_class).values_list("explanation", flat=True)),
            ["Izoh 0", "Izoh 1", "Izoh 2"],
        )


class CodeBreakerTests(APITestCase):
    """Kodni buzish: a per-session secret code, one segment per correctly
    answered question, the full code only after an unlocked (>= 70%) finish,
    and XP awarded exactly once.
    """

    def setUp(self):
        self.subject = make_subject()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        _seed_pool(subject=self.subject, school_class=self.school_class, count=20)
        self.session = start_game(
            student=self.student, subject=self.subject, game_type=GameSession.GameType.CODE_BREAKER
        )
        pick_session_questions(self.session)

    def _play(self, correct_upto: int):
        for i, question in enumerate(self.session.questions):
            key = question["correct_index"]
            record_live_answer(
                session=self.session, question_index=i, selected_index=key if i < correct_upto else (key + 1) % 4
            )
        self.session.refresh_from_db()

    def test_each_session_gets_its_own_ten_character_code(self):
        other = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.CODE_BREAKER)
        self.assertEqual(len(self.session.secret_code), 10)
        self.assertNotEqual(self.session.secret_code, other.secret_code)

    def test_other_games_have_no_code(self):
        quiz = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)
        self.assertEqual(quiz.secret_code, "")
        self.assertEqual(revealed_code(quiz), [])

    def test_correct_answer_unlocks_only_its_own_segment(self):
        key = self.session.questions[0]["correct_index"]
        result = record_live_answer(session=self.session, question_index=0, selected_index=key)

        self.assertEqual(result["code_segment"], self.session.secret_code[0])
        self.session.refresh_from_db()
        self.assertEqual(revealed_code(self.session), [self.session.secret_code[0]] + [None] * 9)

    def test_wrong_answer_unlocks_nothing(self):
        key = self.session.questions[0]["correct_index"]
        result = record_live_answer(session=self.session, question_index=0, selected_index=(key + 1) % 4)

        self.assertIsNone(result["code_segment"])
        self.assertEqual(revealed_code(self.session), [None] * 10)

    def test_seventy_percent_unlocks_the_whole_code(self):
        self._play(correct_upto=7)
        session = submit_game(session=self.session, answers={0: 0})

        self.assertEqual(session.score_percent, 70.0)
        self.assertEqual(revealed_code(session), list(session.secret_code))

    def test_below_seventy_percent_keeps_unanswered_segments_locked(self):
        self._play(correct_upto=6)
        session = submit_game(session=self.session, answers={0: 0})

        code = revealed_code(session)
        self.assertEqual(code[:6], list(session.secret_code[:6]))
        self.assertEqual(code[6:], [None] * 4)

    def test_api_never_sends_the_full_code_before_unlocking(self):
        self.client.force_authenticate(self.student_user)
        detail = self.client.get(f"/api/games/{self.session.id}/").data

        self.assertNotIn("secret_code", detail)
        self.assertEqual(detail["revealed_code"], [None] * 10)
        self.assertIsNone(detail["review"])

    def test_locked_result_includes_review_with_explanations(self):
        self._play(correct_upto=5)
        self.client.force_authenticate(self.student_user)
        response = self.client.post(
            f"/api/games/{self.session.id}/submit/",
            {"answers": [{"question_index": 0, "selected_index": 0}]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["goal_reached"])
        wrong = [r for r in response.data["review"] if r["selected_index"] != r["correct_index"]]
        self.assertEqual(len(wrong), 5)
        self.assertTrue(all(r["explanation"] for r in wrong))

    def test_xp_is_awarded_once_even_if_submit_is_repeated(self):
        self._play(correct_upto=10)
        self.client.force_authenticate(self.student_user)
        url = f"/api/games/{self.session.id}/submit/"
        payload = {"answers": [{"question_index": 0, "selected_index": 0}]}

        first = self.client.post(url, payload, format="json")
        second = self.client.post(url, payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(XPTransaction.objects.filter(student=self.student, source=XPTransaction.Source.GAME).count(), 1)
        self.assertEqual(first.data["xp_awarded"], 30)

    def test_a_stale_session_object_cannot_award_twice(self):
        """Two requests that loaded the session before either completed it."""
        self._play(correct_upto=10)
        stale = GameSession.objects.get(pk=self.session.pk)
        submit_game(session=self.session, answers={0: 0})

        with self.assertRaises(ValueError):
            submit_game(session=stale, answers={0: 0})
        self.assertEqual(XPTransaction.objects.filter(student=self.student, source=XPTransaction.Source.GAME).count(), 1)


class TreasureHuntTests(APITestCase):
    """Xazina ovi: same server-authoritative live-answer flow; the treasure is
    reached at 80% and only once the game is over."""

    def setUp(self):
        self.subject = make_subject()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        _seed_pool(subject=self.subject, school_class=self.school_class, count=20)
        self.session = start_game(
            student=self.student, subject=self.subject, game_type=GameSession.GameType.TREASURE_HUNT
        )
        pick_session_questions(self.session)

    def _play(self, correct_upto: int):
        for i, question in enumerate(self.session.questions):
            key = question["correct_index"]
            record_live_answer(
                session=self.session, question_index=i, selected_index=key if i < correct_upto else (key + 1) % 4
            )
        self.session.refresh_from_db()

    def _submit(self):
        self.client.force_authenticate(self.student_user)
        return self.client.post(
            f"/api/games/{self.session.id}/submit/",
            {"answers": [{"question_index": 0, "selected_index": 0}]},
            format="json",
        )

    def test_ten_questions_and_no_secret_code(self):
        self.assertEqual(len(self.session.questions), 10)
        self.assertEqual(self.session.secret_code, "")

    def test_answers_are_locked_in_like_the_other_live_games(self):
        self._play(correct_upto=3)
        with self.assertRaises(ValueError):
            record_live_answer(session=self.session, question_index=0, selected_index=0)

    def test_eighty_percent_reaches_the_treasure(self):
        self._play(correct_upto=8)
        response = self._submit()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["goal_reached"])
        self.assertEqual(response.data["unlock_percent"], 80)
        self.assertEqual(response.data["xp_awarded"], 24)

    def test_seventy_percent_completes_the_journey_without_the_treasure(self):
        self._play(correct_upto=7)
        response = self._submit()

        self.assertFalse(response.data["goal_reached"])
        self.assertEqual(response.data["correct_count"], 7)
        self.assertEqual(response.data["xp_awarded"], 21)

    def test_goal_is_never_reported_before_the_game_ends(self):
        self._play(correct_upto=10)
        self.client.force_authenticate(self.student_user)
        detail = self.client.get(f"/api/games/{self.session.id}/").data
        self.assertFalse(detail["goal_reached"])

    def test_xp_is_awarded_once(self):
        self._play(correct_upto=10)
        self.assertEqual(self._submit().status_code, status.HTTP_200_OK)
        self.assertEqual(self._submit().status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(XPTransaction.objects.filter(student=self.student, source=XPTransaction.Source.GAME).count(), 1)

    def test_other_games_have_no_win_threshold(self):
        quiz = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)
        self.client.force_authenticate(self.student_user)
        detail = self.client.get(f"/api/games/{quiz.id}/").data
        self.assertIsNone(detail["unlock_percent"])
        self.assertFalse(detail["goal_reached"])


class BattleArenaTests(APITestCase):
    """Jang maydoni: HP, combo and victory are replayed server-side from the
    recorded answers; a battle can end early and is scored over rounds fought."""

    def setUp(self):
        self.subject = make_subject()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        _seed_pool(subject=self.subject, school_class=self.school_class, count=20)
        self.session = start_game(
            student=self.student, subject=self.subject, game_type=GameSession.GameType.BATTLE_ARENA
        )
        pick_session_questions(self.session)

    def _answer(self, index, *, correct):
        key = self.session.questions[index]["correct_index"]
        return record_live_answer(
            session=self.session, question_index=index, selected_index=key if correct else (key + 1) % 4
        )

    def _submit(self):
        self.client.force_authenticate(self.student_user)
        return self.client.post(
            f"/api/games/{self.session.id}/submit/",
            {"answers": [{"question_index": 0, "selected_index": 0}]},
            format="json",
        )

    def test_correct_answer_damages_the_enemy_and_builds_combo(self):
        self._answer(0, correct=True)
        result = self._answer(1, correct=True)

        self.assertEqual(result["battle"]["enemy_hp"], 60)
        self.assertEqual(result["battle"]["player_hp"], 100)
        self.assertEqual(result["battle"]["combo"], 2)

    def test_wrong_answer_damages_the_player_and_resets_combo(self):
        self._answer(0, correct=True)
        result = self._answer(1, correct=False)

        self.assertEqual(result["battle"]["player_hp"], 90)
        self.assertEqual(result["battle"]["combo"], 0)
        self.assertEqual(result["battle"]["max_combo"], 1)

    def test_five_hits_win_early_and_no_more_answers_are_accepted(self):
        for i in range(5):
            result = self._answer(i, correct=True)

        self.assertTrue(result["battle"]["over"])
        self.assertTrue(result["battle"]["victory"])
        with self.assertRaises(ValueError):
            self._answer(5, correct=True)

    def test_running_xp_only_grows_with_hits(self):
        first = self._answer(0, correct=True)
        second = self._answer(1, correct=False)
        self.assertEqual(first["xp_earned"], 3)
        self.assertEqual(second["xp_earned"], 3)

    def test_early_victory_is_scored_over_rounds_fought_and_credits_the_rest(self):
        self._answer(0, correct=False)
        for i in range(1, 6):
            self._answer(i, correct=True)
        response = self._submit()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["goal_reached"])
        self.assertEqual(response.data["score_percent"], 83.33)
        # 5 hits + 4 rounds the knockout made unnecessary = 9/10 of 30 XP.
        self.assertEqual(response.data["xp_awarded"], 27)
        self.assertEqual(response.data["battle"]["rounds_played"], 6)

    def test_cannot_submit_while_the_battle_is_still_going(self):
        self._answer(0, correct=True)
        self.assertEqual(self._submit().status_code, status.HTTP_400_BAD_REQUEST)

    def test_all_rounds_without_a_knockout_ends_without_victory(self):
        for i in range(10):
            self._answer(i, correct=i < 4)
        response = self._submit()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["goal_reached"])
        self.assertEqual(response.data["xp_awarded"], 12)
        self.assertEqual(response.data["battle"]["enemy_hp"], 20)
        self.assertEqual(response.data["battle"]["player_hp"], 40)

    def test_xp_is_awarded_once(self):
        for i in range(5):
            self._answer(i, correct=True)
        self.assertEqual(self._submit().status_code, status.HTTP_200_OK)
        self.assertEqual(self._submit().status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(XPTransaction.objects.filter(student=self.student, source=XPTransaction.Source.GAME).count(), 1)

    def test_other_games_report_no_battle(self):
        quiz = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ)
        self.client.force_authenticate(self.student_user)
        self.assertIsNone(self.client.get(f"/api/games/{quiz.id}/").data["battle"])


class TowerDefenseTests(APITestCase):
    """Tower Defense: difficulty sets the length and the fight; waves, enemy HP,
    shields, base HP, combo boosts and the outcome are all replayed server-side."""

    def setUp(self):
        self.subject = make_subject()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        _seed_pool(subject=self.subject, school_class=self.school_class, count=20)

    def _start(self, difficulty="EASY"):
        session = start_game(
            student=self.student,
            subject=self.subject,
            game_type=GameSession.GameType.TOWER_DEFENSE,
            difficulty=difficulty,
        )
        pick_session_questions(session)
        return session

    def _answer(self, session, index, *, correct):
        key = session.questions[index]["correct_index"]
        return record_live_answer(
            session=session, question_index=index, selected_index=key if correct else (key + 1) % 4
        )

    def _submit(self, session):
        self.client.force_authenticate(self.student_user)
        return self.client.post(
            f"/api/games/{session.id}/submit/",
            {"answers": [{"question_index": 0, "selected_index": 0}]},
            format="json",
        )

    def test_difficulty_sets_the_number_of_questions_and_xp(self):
        for difficulty, count in (("EASY", 10), ("MEDIUM", 12), ("HARD", 14)):
            session = self._start(difficulty)
            self.assertEqual(len(session.questions), count)
            self.assertEqual(session.difficulty, difficulty)

    def test_other_games_ignore_difficulty(self):
        quiz = start_game(
            student=self.student, subject=self.subject, game_type=GameSession.GameType.QUIZ, difficulty="HARD"
        )
        self.assertEqual(quiz.difficulty, "")

    def test_a_hit_damages_the_front_enemy_and_a_miss_damages_the_base(self):
        session = self._start("EASY")
        hit = self._answer(session, 0, correct=True)["defense"]
        self.assertEqual(hit["last_event"]["kind"], "hit")
        self.assertTrue(hit["last_event"]["killed"])  # 40 damage vs a 25 HP scout
        self.assertEqual(hit["enemies_defeated"], 1)

        miss = self._answer(session, 1, correct=False)["defense"]
        self.assertEqual(miss["last_event"]["kind"], "base_hit")
        self.assertEqual(miss["base_hp"], 90)
        self.assertEqual(miss["combo"], 0)

    def test_shields_soak_damage_before_hp(self):
        session = self._start("EASY")
        self._answer(session, 0, correct=True)
        self._answer(session, 1, correct=True)  # wave 1 cleared → wave 2: one shielded enemy
        state = self._answer(session, 2, correct=True)["defense"]
        shielded = state["enemies"][0]
        self.assertEqual(shielded["type"], "shield")
        self.assertEqual(shielded["shield"], 0)
        self.assertEqual(shielded["hp"], 20)  # 40 damage: 20 into the shield, 20 into 40 HP
        self.assertTrue(state["last_event"]["shield_hit"])

    def test_a_combo_of_five_powers_up_the_tower(self):
        session = self._start("HARD")
        for i in range(5):
            state = self._answer(session, i, correct=True)["defense"]
        self.assertEqual(state["boost"], "POWER_BOOST")
        self.assertEqual(state["last_event"]["damage"], 66)  # 44 × 1.5

    def test_clearing_every_wave_is_a_victory_with_the_boss_last(self):
        session = self._start("EASY")
        seen_boss = False
        for i in range(10):
            state = self._answer(session, i, correct=True)["defense"]
            seen_boss = seen_boss or state["boss_wave"]
            if state["over"]:
                break
        self.assertTrue(state["victory"])
        self.assertTrue(seen_boss)
        with self.assertRaises(ValueError):
            self._answer(session, i + 1, correct=True)

        response = self._submit(session)
        self.assertTrue(response.data["goal_reached"])
        self.assertEqual(response.data["xp_awarded"], 30)  # 3 XP × 10 questions, unplayed rounds credited
        self.assertTrue(response.data["personal_record"]["is_record"])

    def test_a_fallen_base_ends_the_game_without_victory(self):
        session = self._start("HARD")
        for i in range(14):
            state = self._answer(session, i, correct=False)["defense"]
            if state["over"]:
                break
        self.assertEqual(state["base_hp"], 0)
        self.assertFalse(state["victory"])
        response = self._submit(session)
        self.assertFalse(response.data["goal_reached"])
        self.assertEqual(response.data["xp_awarded"], 0)

    def test_cannot_submit_mid_battle_and_xp_is_awarded_once(self):
        session = self._start("EASY")
        self._answer(session, 0, correct=True)
        self.assertEqual(self._submit(session).status_code, status.HTTP_400_BAD_REQUEST)
        for i in range(1, 10):
            if self._answer(session, i, correct=True)["defense"]["over"]:
                break
        self.assertEqual(self._submit(session).status_code, status.HTTP_200_OK)
        self.assertEqual(self._submit(session).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            XPTransaction.objects.filter(student=self.student, source=XPTransaction.Source.GAME).count(), 1
        )

    def test_personal_record_compares_with_earlier_games(self):
        first = self._start("EASY")
        for i in range(10):
            if self._answer(first, i, correct=True)["defense"]["over"]:
                break
        self._submit(first)

        second = self._start("EASY")
        for i in range(10):
            if self._answer(second, i, correct=i % 2 == 0)["defense"]["over"]:
                break
        record = self._submit(second).data["personal_record"]
        self.assertIsNotNone(record["best_before"])
        self.assertFalse(record["is_record"])

    def test_api_accepts_a_difficulty(self):
        self.client.force_authenticate(self.student_user)
        response = self.client.post(
            "/api/games/",
            {"subject": self.subject.id, "game_type": "TOWER_DEFENSE", "difficulty": "HARD"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["difficulty"], "HARD")
        self.assertEqual(response.data["question_count"], 14)
        self.assertEqual(response.data["max_xp"], 42)
        self.assertEqual(response.data["defense"]["waves_total"], 4)


class NeonRacingTests(APITestCase):
    """Neon Racing: distances, position, nitro, laps and checkpoints are replayed
    server-side; nitro is only accepted when the replayed meter is full."""

    def setUp(self):
        self.subject = make_subject()
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        _seed_pool(subject=self.subject, school_class=self.school_class, count=20)

    def _start(self, difficulty="EASY"):
        session = start_game(
            student=self.student, subject=self.subject, game_type=GameSession.GameType.NEON_RACING, difficulty=difficulty
        )
        pick_session_questions(session)
        return session

    def _answer(self, session, index, *, correct, nitro=False):
        key = session.questions[index]["correct_index"]
        return record_live_answer(
            session=session, question_index=index, selected_index=key if correct else (key + 1) % 4, nitro=nitro
        )

    def _submit(self, session):
        self.client.force_authenticate(self.student_user)
        return self.client.post(
            f"/api/games/{session.id}/submit/",
            {"answers": [{"question_index": 0, "selected_index": 0}]},
            format="json",
        )

    def test_difficulty_sets_questions_laps_and_field(self):
        for difficulty, count, laps in (("EASY", 10, 2), ("MEDIUM", 12, 3), ("HARD", 14, 3)):
            session = self._start(difficulty)
            self.client.force_authenticate(self.student_user)
            race = self.client.get(f"/api/games/{session.id}/").data["race"]
            self.assertEqual(len(session.questions), count)
            self.assertEqual(race["laps"], laps)
            self.assertEqual(race["field_size"], 4)

    def test_correct_answers_drive_further_and_fill_nitro(self):
        session = self._start()
        right = self._answer(session, 0, correct=True)["race"]
        wrong = self._answer(session, 1, correct=False)["race"]
        self.assertEqual(right["racers"][0]["distance"], 10.0)
        self.assertEqual(right["nitro"], 34)
        self.assertEqual(wrong["racers"][0]["distance"], 14.5)
        self.assertEqual(wrong["combo"], 0)

    def test_nitro_is_refused_until_the_meter_is_full(self):
        session = self._start()
        with self.assertRaises(ValueError):
            self._answer(session, 0, correct=True, nitro=True)
        for i in range(3):
            state = self._answer(session, i, correct=True)["race"]
        self.assertTrue(state["nitro_ready"])
        fired = self._answer(session, 3, correct=True, nitro=True)["race"]
        self.assertTrue(fired["last"]["nitro"])
        self.assertEqual(fired["nitro_used"], 1)
        self.assertLess(fired["nitro"], 100)

    def test_the_race_is_the_same_on_every_replay(self):
        session = self._start()
        for i in range(4):
            self._answer(session, i, correct=i != 2)
        self.client.force_authenticate(self.student_user)
        first = self.client.get(f"/api/games/{session.id}/").data["race"]
        second = self.client.get(f"/api/games/{session.id}/").data["race"]
        self.assertEqual(first["racers"], second["racers"])

    def test_a_perfect_race_with_nitro_wins_and_awards_full_xp_once(self):
        session = self._start("HARD")
        ready = False
        for i in range(14):
            ready = self._answer(session, i, correct=True, nitro=ready)["race"]["nitro_ready"]
        session.refresh_from_db()
        response = self._submit(session)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["race"]["position"], 1)
        self.assertTrue(response.data["goal_reached"])
        self.assertEqual(response.data["xp_awarded"], 42)
        self.assertEqual(self._submit(session).status_code, status.HTTP_400_BAD_REQUEST)

    def test_every_question_must_be_raced_before_submitting(self):
        session = self._start()
        self._answer(session, 0, correct=True)
        self.assertEqual(self._submit(session).status_code, status.HTTP_400_BAD_REQUEST)

    def test_laps_and_checkpoints_follow_race_time(self):
        session = self._start("EASY")  # 10 questions, 2 laps, 3 checkpoints
        for i in range(5):
            state = self._answer(session, i, correct=True)["race"]
        self.assertEqual(state["lap"], 2)
        self.assertTrue(state["final_lap"])
        self.assertEqual(state["checkpoints_passed"], 2)

    def test_nitro_flag_is_ignored_by_other_games(self):
        quiz = start_game(student=self.student, subject=self.subject, game_type=GameSession.GameType.TOWER_BUILDER)
        pick_session_questions(quiz)
        self.client.force_authenticate(self.student_user)
        response = self.client.post(
            f"/api/games/{quiz.id}/answer/", {"question_index": 0, "selected_index": 0, "nitro": True}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        quiz.refresh_from_db()
        self.assertEqual(quiz.nitro_rounds, [])


class UniversalSubjectQuestionBankTests(APITestCase):
    """The architecture this app is built around: ONE question bank per subject,
    drawn from by every game through one shared service.

    These are the acceptance tests for that promise — every game type against
    several subjects, and the two invariants that matter most (a session only
    ever sees its own subject, and XP is untouched by any of it).
    """

    # Every game, so adding a new GameType without covering it here fails loudly
    # rather than silently shipping a game that can't be played.
    ALL_GAMES = tuple(GameSession.GameType.values)
    SAMPLE_SUBJECTS = ("Adabiyot", "Matematika", "Fizika")

    def setUp(self):
        self.school_class = make_school_class()
        self.student_user, self.student = make_student(self.school_class)
        self.subjects = {name: make_subject(name) for name in self.SAMPLE_SUBJECTS}
        # A subject-wide bank ("school_class=None") is the universal one: one
        # set of questions, usable by every class and every game.
        for subject in self.subjects.values():
            _seed_pool(subject=subject, school_class=None, count=30, prefix=subject.name)

    def _questions_for(self, *, subject, game_type, difficulty=None):
        session = start_game(
            student=self.student, subject=subject, game_type=game_type, difficulty=difficulty or ""
        )
        self.client.force_authenticate(self.student_user)
        response = self.client.get(f"/api/games/{session.id}/questions/")
        return session, response

    def test_every_game_gets_questions_for_every_subject(self):
        for name, subject in self.subjects.items():
            for game_type in self.ALL_GAMES:
                difficulty = "EASY" if game_type in ("TOWER_DEFENSE", "NEON_RACING") else ""
                with self.subTest(subject=name, game=game_type):
                    _session, response = self._questions_for(
                        subject=subject, game_type=game_type, difficulty=difficulty
                    )
                    self.assertEqual(response.status_code, status.HTTP_200_OK)
                    self.assertTrue(response.data, f"{game_type} returned no questions for {name}")
                    # Whatever the game, the questions are the selected subject's.
                    self.assertTrue(
                        all(q["text"].startswith(name) for q in response.data),
                        f"{game_type} served a question outside {name}",
                    )

    def test_a_session_never_receives_another_subjects_questions(self):
        literature = self.subjects["Adabiyot"]
        _seed_pool(subject=make_subject("Biologiya"), school_class=None, count=30, prefix="Biologiya")

        for game_type in self.ALL_GAMES:
            with self.subTest(game=game_type):
                _, response = self._questions_for(subject=literature, game_type=game_type)
                self.assertTrue(all(q["text"].startswith("Adabiyot") for q in response.data))

    def test_questions_are_reshuffled_so_answers_do_not_sit_in_one_slot(self):
        subject = self.subjects["Matematika"]
        _, first = self._questions_for(subject=subject, game_type=GameSession.GameType.QUIZ)
        _, second = self._questions_for(subject=subject, game_type=GameSession.GameType.QUIZ)

        # Same bank, but option order must not be identical question-for-question,
        # or a student could answer from muscle memory instead of reading.
        self.assertNotEqual(
            [q["options"] for q in first.data], [q["options"] for q in second.data]
        )

    def test_the_same_question_serves_different_games(self):
        """One authored question, two games — the whole point of a shared bank."""
        subject = self.subjects["Fizika"]
        bank_text = {q.text for q in PooledQuestion.objects.filter(subject=subject)}

        _, rope = self._questions_for(subject=subject, game_type=GameSession.GameType.TUG_OF_WAR)
        _, arena = self._questions_for(subject=subject, game_type=GameSession.GameType.BATTLE_ARENA)

        self.assertTrue({q["text"] for q in rope.data} <= bank_text)
        self.assertTrue({q["text"] for q in arena.data} <= bank_text)

    def test_repeats_are_avoided_while_the_bank_allows_it(self):
        subject = self.subjects["Adabiyot"]
        _, first = self._questions_for(subject=subject, game_type=GameSession.GameType.QUIZ)
        _, second = self._questions_for(subject=subject, game_type=GameSession.GameType.QUIZ)

        self.assertEqual({q["text"] for q in first.data} & {q["text"] for q in second.data}, set())

    def test_empty_subject_reports_a_proper_empty_state_not_a_generic_error(self):
        unstocked = make_subject("Kimyo")

        _session, response = self._questions_for(subject=unstocked, game_type=GameSession.GameType.QUIZ)

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["code"], "no_questions_for_subject")
        self.assertEqual(response.data["subject"], unstocked.id)
        # The message has to name the subject, so the student knows what to pick
        # differently — "something went wrong" is exactly what it replaces.
        self.assertIn("savol", response.data["detail"].lower())

    def test_subject_availability_endpoint_flags_unstocked_subjects(self):
        make_subject("Kimyo")
        self.client.force_authenticate(self.student_user)

        response = self.client.get("/api/games/subjects/")
        counts = {row["name"]: row["question_count"] for row in response.data}

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(counts["Matematika"], 30)
        self.assertEqual(counts["Kimyo"], 0)

    def test_xp_is_unaffected_by_the_subject_draw(self):
        """Same answers, same XP — the subject only decides *which* questions,
        never what a correct one is worth."""
        subject = self.subjects["Adabiyot"]

        session = start_game(student=self.student, subject=subject, game_type=GameSession.GameType.QUIZ)
        pick_session_questions(session)
        total = len(session.questions)
        # Every answer correct.
        submit_game(
            session=session,
            answers={index: session.questions[index]["correct_index"] for index in range(total)},
        )
        session.refresh_from_db()

        self.assertEqual(session.score_percent, 100.0)
        self.assertEqual(session.xp_awarded, MAX_GAME_XP)
        transaction = XPTransaction.objects.get(student=self.student, source=XPTransaction.Source.GAME)
        self.assertEqual(transaction.amount, MAX_GAME_XP)

    def test_an_existing_session_keeps_the_questions_it_already_played(self):
        """Sessions created before this change (or before a question is retired)
        must not be rewritten — a student resuming sees the same set."""
        subject = self.subjects["Matematika"]
        session = start_game(student=self.student, subject=subject, game_type=GameSession.GameType.QUIZ)
        first = pick_session_questions(session)

        self.client.force_authenticate(self.student_user)
        response = self.client.get(f"/api/games/{session.id}/questions/")

        self.assertEqual([q["text"] for q in response.data], [q["text"] for q in first])

    def test_retiring_a_question_does_not_break_an_answered_session(self):
        subject = self.subjects["Fizika"]
        session = start_game(student=self.student, subject=subject, game_type=GameSession.GameType.TUG_OF_WAR)
        pick_session_questions(session)
        PooledQuestion.objects.filter(subject=subject).update(is_active=False)

        self.client.force_authenticate(self.student_user)
        response = self.client.get(f"/api/games/{session.id}/questions/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 8)

    def test_subject_wide_bank_needs_no_class(self):
        """A subject stocked once is playable by a student who isn't in any class."""
        _, unassigned = make_student(school_class=None)
        session = start_game(
            student=unassigned, subject=self.subjects["Adabiyot"], game_type=GameSession.GameType.QUIZ
        )

        self.assertEqual(len(pick_session_questions(session)), 8)


class SeedQuestionBankCommandTests(APITestCase):
    """The command that actually fills the production bank — the step that
    decides whether students can play a subject at all, so its default scope
    matters as much as the draw logic."""

    def _run(self, *args) -> str:
        out = StringIO()
        # The subject-wide bank has no class to inherit a tenant from, so the
        # command needs its owner named.
        call_command(
            "seed_game_questions",
            *args,
            "--organization",
            default_organization().slug,
            stdout=out,
        )
        return out.getvalue()

    def test_defaults_to_the_subject_wide_bank(self):
        subject = make_subject("Matematika")
        make_school_class()
        make_school_class()

        self._run()

        # Written once, with no class attached, so one authored question serves
        # every class — not a private copy per class.
        self.assertEqual(
            PooledQuestion.objects.filter(subject=subject, school_class__isnull=True).count(), 20
        )
        self.assertEqual(PooledQuestion.objects.filter(subject=subject).count(), 20)

    def test_seeded_bank_makes_every_game_playable_for_any_class(self):
        for name in ("Adabiyot", "Matematika", "Fizika"):
            make_subject(name)
        self._run()

        school_class = make_school_class()
        _, student = make_student(school_class)

        for name in ("Adabiyot", "Matematika", "Fizika"):
            subject = Subject.objects.get(name=name)
            session = start_game(
                student=student, subject=subject, game_type=GameSession.GameType.QUIZ
            )
            with self.subTest(subject=name):
                self.assertEqual(len(pick_session_questions(session)), 8)

    def test_running_twice_does_not_duplicate_questions(self):
        make_subject("Fizika")

        self._run()
        first = PooledQuestion.objects.count()
        self._run()

        self.assertEqual(PooledQuestion.objects.count(), first)

    def test_school_class_flag_scopes_the_seed_to_that_class(self):
        subject = make_subject("Informatika")
        target = make_school_class()
        make_school_class()

        self._run("--school-class", target.name)

        self.assertEqual(
            PooledQuestion.objects.filter(subject=subject, school_class=target).count(), 18
        )
        self.assertEqual(PooledQuestion.objects.filter(subject=subject).count(), 18)

    def test_dry_run_reports_the_plan_without_writing(self):
        make_subject("Geografiya")

        output = self._run("--dry-run")

        self.assertIn("Geografiya", output)
        self.assertIn("+16", output)
        self.assertEqual(PooledQuestion.objects.count(), 0)

    def test_every_subject_a_school_actually_uses_gets_a_bank(self):
        """Guards the data, not the code: a school picks subject names, and the
        bank is keyed by name, so a subject whose name does not reach a bank key
        silently becomes an unplayable subject."""
        _, teacher = make_teacher()
        school_class = make_school_class()
        for slot, name in enumerate(
            ("Algebra", "Geometriya", "O'zbekiston tarixi", "Jahon tarixi")
        ):
            make_lesson(
                subject=make_subject(name),
                school_class=school_class,
                teacher=teacher,
                start_time=time(8 + slot, 0),
                end_time=time(8 + slot, 45),
            )

        self._run()

        for subject in Subject.objects.all():
            with self.subTest(subject=subject.name):
                self.assertGreater(
                    PooledQuestion.objects.filter(subject=subject).count(),
                    0,
                    f"{subject.name} is a real subject of the school but has no questions",
                )

    def test_unknown_subject_filter_is_rejected_with_the_available_list(self):
        with self.assertRaises(CommandError) as caught:
            self._run("--subject", "Astronomiya")

        self.assertIn("matematika", str(caught.exception))
