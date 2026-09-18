from django.db import transaction
from django.utils import timezone

from apps.gamification.models import XPTransaction
from apps.gamification.services import award_xp
from apps.notifications.models import Notification
from apps.notifications.services import notify

from .models import ActivityResult, ActivitySubmission, TestAnswer, TestAttempt


@transaction.atomic
def grade_attempt(*, attempt: TestAttempt, answers: list[dict]) -> TestAttempt:
    """Scores an attempt from the student's answers and awards XP for it.

    `answers` is `[{"question": Question, "selected_option": Option}, ...]`
    (already resolved + cross-validated by `TestSubmitSerializer`). The score
    is computed purely from `Option.is_correct` here — the client never sends
    a score or an XP amount, so there is nothing for it to manipulate.
    """
    if attempt.status == TestAttempt.Status.SUBMITTED:
        raise ValueError("This attempt has already been submitted.")

    questions = list(attempt.test.questions.all())
    answer_map = {answer["question"].id: answer["selected_option"] for answer in answers}

    correct = 0
    for question in questions:
        selected_option = answer_map.get(question.id)
        if selected_option is None:
            continue
        TestAnswer.objects.update_or_create(
            attempt=attempt, question=question, defaults={"selected_option": selected_option}
        )
        if selected_option.is_correct:
            correct += 1

    total = len(questions)
    score_percent = round((correct / total) * 100, 2) if total else 0.0
    xp_awarded = round(attempt.test.max_xp * score_percent / 100)

    attempt.status = TestAttempt.Status.SUBMITTED
    attempt.submitted_at = timezone.now()
    attempt.score_percent = score_percent
    attempt.xp_awarded = xp_awarded
    attempt.save(
        update_fields=["status", "submitted_at", "score_percent", "xp_awarded", "updated_at"]
    )

    award_xp(
        student=attempt.student,
        amount=xp_awarded,
        source=XPTransaction.Source.TEST,
        related_object=attempt.test,
        reason=f"Test: {attempt.test.title}",
    )

    notify(
        recipient=attempt.student.user,
        title=f"{attempt.test.title} — natija",
        body=f"Siz {score_percent:.0f}% to'plabsiz va {xp_awarded} XP oldingiz.",
        category=Notification.Category.TEST_RESULT,
    )

    return attempt


def notify_class_of_new_test(test) -> None:
    """Tells every student in the class a new test is available to take."""
    for student in test.school_class.students.select_related("user"):
        notify(
            recipient=student.user,
            title="Yangi test e'lon qilindi",
            body=f"{test.subject.name}: \"{test.title}\" — endi topshirishingiz mumkin.",
            category=Notification.Category.TEST_PUBLISHED,
        )


@transaction.atomic
def grade_submission(
    *, submission: ActivitySubmission, score_percent: float, feedback: str, graded_by
) -> ActivityResult:
    """Grades a submission and awards XP for it — same "server computes XP,
    never trusts a number from the client" rule as `grade_attempt`, except
    here the score itself is a teacher's judgment call rather than an
    auto-graded multiple-choice tally.
    """
    if hasattr(submission, "result"):
        raise ValueError("This submission has already been graded.")
    if not 0 <= score_percent <= 100:
        raise ValueError("score_percent must be between 0 and 100.")

    xp_awarded = round(submission.activity.max_xp * score_percent / 100)

    result = ActivityResult.objects.create(
        submission=submission,
        score_percent=score_percent,
        xp_awarded=xp_awarded,
        feedback=feedback,
        graded_by=graded_by,
    )

    award_xp(
        student=submission.student,
        amount=xp_awarded,
        source=XPTransaction.Source.ACTIVITY,
        related_object=submission.activity,
        reason=f"Activity: {submission.activity.title}",
    )

    notify(
        recipient=submission.student.user,
        title=f"{submission.activity.title} — baholandi",
        body=f"Siz {score_percent:.0f}% to'plabsiz va {xp_awarded} XP oldingiz.",
        category=Notification.Category.ACTIVITY_RESULT,
    )

    return result


def notify_class_of_new_activity(activity) -> None:
    """Tells every student in the class a new activity is available."""
    for student in activity.school_class.students.select_related("user"):
        notify(
            recipient=student.user,
            title="Yangi topshiriq e'lon qilindi",
            body=f"{activity.subject.name}: \"{activity.title}\" — endi bajarishingiz mumkin.",
            category=Notification.Category.ACTIVITY_PUBLISHED,
        )
