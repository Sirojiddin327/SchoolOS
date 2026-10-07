from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.common.testing import (
    default_organization,
    make_school_class,
    make_student,
    make_subject,
    make_teacher,
)
from apps.games.models import PooledQuestion
from apps.gamification.models import XPTransaction
from apps.notifications.models import Notification

from .models import Duel, DuelRating
from .services import answer, create_duel, mark_ready, open_question, rematch, respond


def seed_question_pool(*, subject, school_class, count: int = 15) -> list[PooledQuestion]:
    organization = school_class.organization if school_class else default_organization()
    return PooledQuestion.objects.bulk_create(
        PooledQuestion(
            subject=subject,
            school_class=school_class,
            organization=organization,
            text=f"Savol {i}",
            options=["a", "b", "c", "d"],
            correct_index=i % 4,
            explanation=f"Izoh {i}",
        )
        for i in range(count)
    )


def backdate_match(duel) -> None:
    Duel.objects.filter(pk=duel.pk).update(match_starts_at=timezone.now() - timedelta(seconds=5))


def begin_match(*, duel, challenger, opponent=None) -> None:
    mark_ready(duel=duel, student=challenger)
    if opponent is not None:
        mark_ready(duel=duel, student=opponent)
    backdate_match(duel)


def answer_all(*, duel, student, correct: bool = True) -> None:
    for index in range(duel.question_count):
        open_question(duel=duel, student=student)
        duel.refresh_from_db()
        options = duel.questions[index]["options"]
        correct_index = duel.questions[index]["correct_index"]
        selected = correct_index if correct else (correct_index + 1) % len(options)
        answer(duel=duel, student=student, question_index=index, selected_index=selected)


class DuelServiceTests(APITestCase):
    def setUp(self):
        self.subject = make_subject()
        _, self.teacher = make_teacher()
        self.school_class = make_school_class()
        self.a_user, self.a = make_student(self.school_class)
        self.b_user, self.b = make_student(self.school_class)
        self.c_user, self.c = make_student(self.school_class)
        seed_question_pool(subject=self.subject, school_class=self.school_class)

    def test_cannot_duel_yourself(self):
        with self.assertRaises(ValueError):
            create_duel(challenger=self.a, opponent=self.a, subject=self.subject, question_count=5)

    def test_cannot_duel_a_student_in_another_class(self):
        other_class = make_school_class()
        _, outsider = make_student(other_class)
        with self.assertRaises(ValueError):
            create_duel(challenger=self.a, opponent=outsider, subject=self.subject, question_count=5)

    def test_rejects_unsupported_question_count(self):
        with self.assertRaises(ValueError):
            create_duel(challenger=self.a, opponent=self.b, subject=self.subject, question_count=6)

    def test_rejects_unknown_ai_level(self):
        with self.assertRaises(ValueError):
            create_duel(challenger=self.a, ai_level="HACKER", subject=self.subject, question_count=5)

    def test_cannot_start_when_the_subject_has_no_questions_at_all(self):
        empty_subject = make_subject()
        with self.assertRaises(ValueError):
            create_duel(challenger=self.a, opponent=self.b, subject=empty_subject, question_count=5)

    def test_plays_from_the_subject_bank_even_when_the_students_class_has_none(self):
        """The duel draws from the same shared bank as the games, so a class
        with no pool of its own is not locked out of its own subject."""
        empty_class = make_school_class()
        _, x = make_student(empty_class)
        _, y = make_student(empty_class)

        duel = create_duel(challenger=x, opponent=y, subject=self.subject, question_count=5)

        self.assertEqual(len(duel.questions), 5)
        self.assertTrue(all(q["text"].startswith("Savol") for q in duel.questions))

    def test_runs_shorter_than_requested_when_the_bank_is_thin(self):
        thin_subject = make_subject()
        seed_question_pool(subject=thin_subject, school_class=self.school_class, count=3)

        duel = create_duel(challenger=self.a, opponent=self.b, subject=thin_subject, question_count=5)

        # The bank is the source of truth for the question count, so the timer
        # budget, the score and the invite text all stay consistent.
        self.assertEqual(duel.question_count, 3)
        self.assertEqual(len(duel.questions), 3)

    def test_both_players_are_answered_on_the_challengers_subject(self):
        other_subject = make_subject()
        seed_question_pool(subject=other_subject, school_class=self.school_class)
        own = seed_question_pool(subject=self.subject, school_class=self.school_class)

        duel = create_duel(challenger=self.a, opponent=self.b, subject=self.subject, question_count=5)

        # One question set on the duel row — the opponent can never be served a
        # different subject's questions than the challenger.
        self.assertEqual(duel.subject, self.subject)
        self.assertEqual({q["text"] for q in duel.questions} <= {q.text for q in own}, True)

    def test_ai_opponent_gets_the_challengers_subject(self):
        other_subject = make_subject()
        seed_question_pool(subject=other_subject, school_class=self.school_class)
        own = seed_question_pool(subject=self.subject, school_class=self.school_class)

        duel = create_duel(challenger=self.a, ai_level="NOVICE", subject=self.subject, question_count=5)

        self.assertEqual(duel.mode, Duel.Mode.AI)
        self.assertEqual({q["text"] for q in duel.questions} <= {q.text for q in own}, True)

    def test_invite_is_pending_and_notifies_the_opponent(self):
        duel = create_duel(challenger=self.a, opponent=self.b, subject=self.subject, question_count=5)
        self.assertEqual(duel.mode, Duel.Mode.CLASSMATE)
        self.assertEqual(duel.status, Duel.Status.PENDING)
        self.assertEqual(len(duel.questions), 5)
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.b_user, category=Notification.Category.DUEL_INVITE
            ).exists()
        )

    def test_opponent_accepting_starts_the_match(self):
        duel = create_duel(challenger=self.a, opponent=self.b, subject=self.subject, question_count=5)
        respond(duel=duel, student=self.b, accept=True)
        duel.refresh_from_db()
        self.assertEqual(duel.status, Duel.Status.ACTIVE)
        self.assertIsNotNone(duel.accepted_at)

    def test_opponent_can_decline(self):
        duel = create_duel(challenger=self.a, opponent=self.b, subject=self.subject, question_count=5)
        respond(duel=duel, student=self.b, accept=False)
        duel.refresh_from_db()
        self.assertEqual(duel.status, Duel.Status.DECLINED)

    def test_both_ready_sets_the_shared_countdown(self):
        duel = create_duel(challenger=self.a, opponent=self.b, subject=self.subject, question_count=5)
        respond(duel=duel, student=self.b, accept=True)
        mark_ready(duel=duel, student=self.a)
        mark_ready(duel=duel, student=self.b)
        duel.refresh_from_db()
        self.assertIsNotNone(duel.match_starts_at)
        self.assertIsNotNone(duel.challenger_ready_at)
        self.assertIsNotNone(duel.opponent_ready_at)

    def test_ai_duel_starts_active_without_an_opponent(self):
        duel = create_duel(challenger=self.a, ai_level=Duel.AILevel.NOVICE, subject=self.subject, question_count=5)
        self.assertEqual(duel.mode, Duel.Mode.AI)
        self.assertEqual(duel.status, Duel.Status.ACTIVE)
        self.assertIsNone(duel.opponent_id)

    def test_higher_score_wins_and_awards_rating_and_xp(self):
        duel = create_duel(challenger=self.a, opponent=self.b, subject=self.subject, question_count=5)
        respond(duel=duel, student=self.b, accept=True)
        begin_match(duel=duel, challenger=self.a, opponent=self.b)
        answer_all(duel=duel, student=self.a, correct=True)
        answer_all(duel=duel, student=self.b, correct=False)
        duel.refresh_from_db()

        self.assertEqual(duel.status, Duel.Status.COMPLETED)
        self.assertEqual(duel.result, Duel.Result.CHALLENGER)
        self.assertEqual(duel.challenger_score_percent, 100.0)
        self.assertTrue(XPTransaction.objects.filter(student=self.a, source=XPTransaction.Source.DUEL).exists())

        a_rating = DuelRating.objects.get(student=self.a)
        b_rating = DuelRating.objects.get(student=self.b)
        self.assertGreater(a_rating.rating, DuelRating.DEFAULT_RATING)
        self.assertLess(b_rating.rating, DuelRating.DEFAULT_RATING)
        self.assertEqual(a_rating.wins, 1)
        self.assertEqual(b_rating.losses, 1)

    def test_faster_participant_wins_on_a_score_tie(self):
        duel = create_duel(challenger=self.a, opponent=self.b, subject=self.subject, question_count=5)
        respond(duel=duel, student=self.b, accept=True)
        begin_match(duel=duel, challenger=self.a, opponent=self.b)

        # Start-angled: a answers every question correctly but slowly...
        for index in range(duel.question_count):
            open_question(duel=duel, student=self.a)
            duel.refresh_from_db()
            answer(duel=duel, student=self.a, question_index=index, selected_index=duel.questions[index]["correct_index"])
        duel.refresh_from_db()
        log = duel.challenger_log
        for index in log["answers"]:
            log["answers"][index][1] = 5000
        duel.challenger_log = log
        duel.save(update_fields=["challenger_log", "updated_at"])

        # ...while b answers everything quickly.
        answer_all(duel=duel, student=self.b, correct=True)
        duel.refresh_from_db()

        self.assertEqual(duel.status, Duel.Status.COMPLETED)
        self.assertEqual(duel.result, Duel.Result.OPPONENT)
        self.assertEqual(duel.opponent_score_percent, 100.0)

    def test_cannot_answer_the_same_question_twice(self):
        duel = create_duel(challenger=self.a, opponent=self.b, subject=self.subject, question_count=5)
        respond(duel=duel, student=self.b, accept=True)
        begin_match(duel=duel, challenger=self.a, opponent=self.b)
        open_question(duel=duel, student=self.a)
        duel.refresh_from_db()
        answer(duel=duel, student=self.a, question_index=0, selected_index=0)
        with self.assertRaises(ValueError):
            answer(duel=duel, student=self.a, question_index=0, selected_index=0)

    def test_cannot_answer_before_the_match_starts(self):
        duel = create_duel(challenger=self.a, opponent=self.b, subject=self.subject, question_count=5)
        respond(duel=duel, student=self.b, accept=True)
        # Only one side is ready — the match has not begun.
        mark_ready(duel=duel, student=self.a)
        with self.assertRaises(ValueError):
            open_question(duel=duel, student=self.a)

    def test_ai_duel_completes_and_awards_xp(self):
        duel = create_duel(challenger=self.a, ai_level=Duel.AILevel.NOVICE, subject=self.subject, question_count=5)
        mark_ready(duel=duel, student=self.a)
        backdate_match(duel)
        answer_all(duel=duel, student=self.a, correct=True)
        duel.refresh_from_db()

        self.assertEqual(duel.status, Duel.Status.COMPLETED)
        self.assertIsNotNone(duel.result)
        self.assertTrue(XPTransaction.objects.filter(student=self.a, source=XPTransaction.Source.DUEL).exists())

    def test_rematch_links_to_the_previous_duel(self):
        first = create_duel(challenger=self.a, opponent=self.b, subject=self.subject, question_count=5)
        respond(duel=first, student=self.b, accept=True)
        begin_match(duel=first, challenger=self.a, opponent=self.b)
        answer_all(duel=first, student=self.a, correct=True)
        answer_all(duel=first, student=self.b, correct=False)
        first.refresh_from_db()

        second = rematch(duel=first, student=self.a)
        self.assertEqual(second.rematch_of, first)
        self.assertEqual(second.status, Duel.Status.PENDING)
        self.assertEqual(second.question_count, first.question_count)

    def test_rematch_requires_a_completed_duel(self):
        duel = create_duel(challenger=self.a, opponent=self.b, subject=self.subject, question_count=5)
        with self.assertRaises(ValueError):
            rematch(duel=duel, student=self.a)


class DuelAPITests(APITestCase):
    def setUp(self):
        self.subject = make_subject()
        self.teacher_user, _ = make_teacher()
        self.school_class = make_school_class()
        self.a_user, self.a = make_student(self.school_class)
        self.b_user, self.b = make_student(self.school_class)
        self.c_user, self.c = make_student(self.school_class)
        seed_question_pool(subject=self.subject, school_class=self.school_class)

    def _create(self, user, **payload):
        self.client.force_authenticate(user)
        return self.client.post("/api/duels/", payload, format="json")

    def _answer_match(self, user, duel, *, correct: bool):
        self.client.force_authenticate(user)
        saved = Duel.objects.get(pk=duel["id"])
        for _ in range(duel["question_count"]):
            question_response = self.client.get(f"/api/duels/{duel['id']}/question/")
            self.assertEqual(question_response.status_code, status.HTTP_200_OK)
            index = question_response.data["index"]
            options = saved.questions[index]["options"]
            correct_index = saved.questions[index]["correct_index"]
            selected = correct_index if correct else (correct_index + 1) % len(options)
            answer_response = self.client.post(
                f"/api/duels/{duel['id']}/answer/",
                {"question_index": index, "selected_index": selected},
                format="json",
            )
            self.assertEqual(answer_response.status_code, status.HTTP_200_OK)
            self.assertIn("correct_index", answer_response.data)

    def test_student_can_create_a_classmate_duel(self):
        response = self._create(self.a_user, opponent=self.b.id, subject=self.subject.id, question_count=5)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["my_role"], "challenger")
        self.assertEqual(response.data["status"], Duel.Status.PENDING)

    def test_teacher_cannot_create_a_duel(self):
        response = self._create(self.teacher_user, opponent=self.b.id, subject=self.subject.id, question_count=5)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_requires_a_subject(self):
        response = self._create(self.a_user, opponent=self.b.id, question_count=5)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_bystander_cannot_see_a_duel_they_are_not_in(self):
        create_response = self._create(self.a_user, opponent=self.b.id, subject=self.subject.id, question_count=5)
        duel_id = create_response.data["id"]
        self.client.force_authenticate(self.c_user)
        response = self.client.get(f"/api/duels/{duel_id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_opponents_lists_classmates_and_marks_open_duels(self):
        self._create(self.a_user, opponent=self.b.id, subject=self.subject.id, question_count=5)
        self.client.force_authenticate(self.b_user)
        response = self.client.get("/api/duels/opponents/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        by_id = {o["id"]: o for o in response.data}
        self.assertEqual(set(by_id), {self.a.id, self.c.id})
        self.assertTrue(by_id[self.a.id]["has_open_duel"])
        self.assertFalse(by_id[self.c.id]["has_open_duel"])

    def test_full_classmate_flow_via_api(self):
        create_response = self._create(self.a_user, opponent=self.b.id, subject=self.subject.id, question_count=5)
        duel_id = create_response.data["id"]

        self.client.force_authenticate(self.b_user)
        accept_response = self.client.post(f"/api/duels/{duel_id}/accept/")
        self.assertEqual(accept_response.status_code, status.HTTP_200_OK)
        self.assertEqual(accept_response.data["status"], Duel.Status.ACTIVE)

        for user in (self.a_user, self.b_user):
            self.client.force_authenticate(user)
            ready_response = self.client.post(f"/api/duels/{duel_id}/ready/")
            self.assertEqual(ready_response.status_code, status.HTTP_200_OK)
        Duel.objects.filter(pk=duel_id).update(match_starts_at=timezone.now() - timedelta(seconds=5))

        first_detail = self.client.get(f"/api/duels/{duel_id}/")
        self.assertEqual(first_detail.status_code, status.HTTP_200_OK)
        self._answer_match(self.a_user, first_detail.data, correct=True)
        self._answer_match(self.b_user, first_detail.data, correct=False)

        final = self.client.get(f"/api/duels/{duel_id}/")
        self.assertEqual(final.status_code, status.HTTP_200_OK)
        self.assertEqual(final.data["status"], Duel.Status.COMPLETED)
        self.assertIsNotNone(final.data["outcome"])
        self.assertIsNotNone(final.data["battle"])

        self.client.force_authenticate(self.a_user)
        stats = self.client.get("/api/duels/stats/")
        self.assertEqual(stats.status_code, status.HTTP_200_OK)
        self.assertEqual(stats.data["played"], 1)
        self.assertGreater(stats.data["rating"], DuelRating.DEFAULT_RATING)

    def test_ai_duel_via_api(self):
        create_response = self._create(
            self.a_user, ai_level=Duel.AILevel.NOVICE, subject=self.subject.id, question_count=5
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        duel_id = create_response.data["id"]
        self.assertEqual(create_response.data["mode"], Duel.Mode.AI)

        self.client.force_authenticate(self.a_user)
        ready_response = self.client.post(f"/api/duels/{duel_id}/ready/")
        self.assertEqual(ready_response.status_code, status.HTTP_200_OK)
        Duel.objects.filter(pk=duel_id).update(match_starts_at=timezone.now() - timedelta(seconds=5))

        detail = self.client.get(f"/api/duels/{duel_id}/")
        self._answer_match(self.a_user, detail.data, correct=True)

        final = self.client.get(f"/api/duels/{duel_id}/")
        self.assertEqual(final.status_code, status.HTTP_200_OK)
        self.assertEqual(final.data["status"], Duel.Status.COMPLETED)
        self.assertTrue(final.data["opponent_player"]["is_ai"])

    def test_leaderboard_is_empty_before_any_duel(self):
        self.client.force_authenticate(self.a_user)
        response = self.client.get("/api/duels/leaderboard/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_leaderboard_orders_after_a_win(self):
        create_response = self._create(self.a_user, opponent=self.b.id, subject=self.subject.id, question_count=5)
        duel_id = create_response.data["id"]
        self.client.force_authenticate(self.b_user)
        self.client.post(f"/api/duels/{duel_id}/accept/")
        for user in (self.a_user, self.b_user):
            self.client.force_authenticate(user)
            self.client.post(f"/api/duels/{duel_id}/ready/")
        Duel.objects.filter(pk=duel_id).update(match_starts_at=timezone.now() - timedelta(seconds=5))
        detail = self.client.get(f"/api/duels/{duel_id}/")
        self._answer_match(self.a_user, detail.data, correct=True)
        self._answer_match(self.b_user, detail.data, correct=False)

        self.client.force_authenticate(self.a_user)
        response = self.client.get("/api/duels/leaderboard/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual({entry["student_id"] for entry in response.data}, {self.a.id, self.b.id})
        winner = next(entry for entry in response.data if entry["student_id"] == self.a.id)
        self.assertGreater(winner["rating"], DuelRating.DEFAULT_RATING)