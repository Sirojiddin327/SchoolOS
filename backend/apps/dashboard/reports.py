"""Class progress reports for teachers and the director, plus an AI-written
summary of them.

The report is computed on the fly from the records every feature already
keeps — graded `TestAttempt`s, finished practice `GameSession`s, `Attendance`
and `XPTransaction`s — so there's nothing new to store or keep in sync.

The AI summary never sees a student's name: each student is sent as a code
(S1, S2, …) and the codes in the reply are swapped back for names on our side.
"""

import hashlib
import logging
import re
from collections import defaultdict
from datetime import datetime, time, timedelta

from django.core.cache import cache
from django.db.models import Count, Q, Sum
from django.utils import timezone

from apps.attendance.models import Attendance
from apps.common.gemini import call_gemini
from apps.common.tenancy import in_organization
from apps.games.models import GameSession
from apps.gamification.models import XPTransaction
from apps.learning.models import TestAttempt
from apps.schools.models import SchoolClass

logger = logging.getLogger(__name__)

PERIOD_CHOICES = (7, 30, 90)
DEFAULT_PERIOD = 30

# Status thresholds — score is the test average (the game average when a
# student has no graded tests in the period), attendance counts late as present.
RISK_SCORE = 50
WATCH_SCORE = 70
RISK_ATTENDANCE = 75
WATCH_ATTENDANCE = 90
# A drop this big between the period's first and second half is worth a look.
WATCH_TREND = -10
WEAK_SUBJECT_SCORE = 60
# A weak subject only raises the status once it's more than a single bad result.
WEAK_SUBJECT_MIN_RESULTS = 2

AI_SUMMARY_CACHE_SECONDS = 6 * 60 * 60


class Status:
    GOOD = "GOOD"
    WATCH = "WATCH"
    RISK = "RISK"
    NO_DATA = "NO_DATA"


def classes_visible_to(user):
    """The same scoping as `SchoolClassViewSet`: the director sees every class,
    a teacher the ones they lead or teach a lesson in."""
    queryset = in_organization(user, SchoolClass.objects.all())
    if user.is_director:
        return queryset
    if user.is_teacher:
        profile = user.teacher_profile
        return queryset.filter(Q(class_teacher=profile) | Q(lessons__teacher=profile)).distinct()
    return queryset.none()


def build_school_report(*, days: int = DEFAULT_PERIOD) -> dict:
    """Whole-school student progress report (director only)."""
    now = timezone.now()
    since_date = timezone.localdate() - timedelta(days=days - 1)
    since = timezone.make_aware(datetime.combine(since_date, time.min))
    midpoint = since + (now - since) / 2

    from apps.users.models import StudentProfile

    students = list(
        StudentProfile.objects.select_related("user", "school_class")
        .order_by("school_class__name", "user__first_name", "user__last_name")
    )
    student_ids = [s.id for s in students]

    tests_by_student: dict[int, list[tuple]] = defaultdict(list)
    for row in TestAttempt.objects.filter(
        student_id__in=student_ids,
        status=TestAttempt.Status.SUBMITTED,
        submitted_at__gte=since,
        score_percent__isnull=False,
    ).values("student_id", "score_percent", "submitted_at", "test__subject__name"):
        tests_by_student[row["student_id"]].append(
            (row["score_percent"], row["submitted_at"], row["test__subject__name"])
        )

    games_by_student: dict[int, list[tuple]] = defaultdict(list)
    for row in GameSession.objects.filter(
        student_id__in=student_ids,
        status=GameSession.Status.COMPLETED,
        completed_at__gte=since,
        score_percent__isnull=False,
    ).values("student_id", "score_percent", "subject__name"):
        games_by_student[row["student_id"]].append((row["score_percent"], row["subject__name"]))

    attendance_by_student: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for row in (
        Attendance.objects.filter(student_id__in=student_ids, lesson__date__gte=since_date)
        .values("student_id", "status")
        .annotate(n=Count("id"))
    ):
        attendance_by_student[row["student_id"]][row["status"]] = row["n"]

    xp_by_student = {
        row["student_id"]: row["total"]
        for row in XPTransaction.objects.filter(student_id__in=student_ids, created_at__gte=since)
        .values("student_id")
        .annotate(total=Sum("amount"))
    }

    class_subject_scores: dict[str, list[float]] = defaultdict(list)
    rows = []
    for student in students:
        tests = tests_by_student[student.id]
        games = games_by_student[student.id]
        test_scores = [score for score, _, _ in tests]
        game_scores = [score for score, _ in games]

        first_half = [score for score, at, _ in tests if at < midpoint]
        second_half = [score for score, at, _ in tests if at >= midpoint]
        trend = (
            round(_avg(second_half) - _avg(first_half), 1) if first_half and second_half else None
        )

        subject_scores: dict[str, list[float]] = defaultdict(list)
        for score, _, subject in tests:
            subject_scores[subject].append(score)
        for score, subject in games:
            subject_scores[subject].append(score)
        for subject, scores in subject_scores.items():
            class_subject_scores[subject].extend(scores)
        weak_subjects = sorted(
            (
                {"subject": subject, "avg": _avg(scores), "results": len(scores)}
                for subject, scores in subject_scores.items()
                if (_avg(scores) or 0) < WEAK_SUBJECT_SCORE
            ),
            key=lambda item: item["avg"],
        )[:3]

        att = attendance_by_student[student.id]
        attended = att[Attendance.Status.PRESENT] + att[Attendance.Status.LATE]
        counted = attended + att[Attendance.Status.ABSENT]
        attendance_rate = round(attended / counted * 100) if counted else None

        test_avg = _avg(test_scores)
        game_avg = _avg(game_scores)
        score = test_avg if test_avg is not None else game_avg
        rows.append(
            {
                "id": student.id,
                "full_name": student.user.get_full_name() or student.user.username,
                "school_class": student.school_class.name if student.school_class else "—",
                "status": _status(
                    score,
                    trend,
                    attendance_rate,
                    weak_subject=any(w["results"] >= WEAK_SUBJECT_MIN_RESULTS for w in weak_subjects),
                ),
                "test_avg": test_avg,
                "tests_taken": len(test_scores),
                "test_trend": trend,
                "game_avg": game_avg,
                "games_played": len(game_scores),
                "attendance_rate": attendance_rate,
                "absences": att[Attendance.Status.ABSENT],
                "late": att[Attendance.Status.LATE],
                "xp_gained": xp_by_student.get(student.id, 0),
                "weak_subjects": weak_subjects,
            }
        )

    all_test_scores = [score for scores in tests_by_student.values() for score, _, _ in scores]
    all_game_scores = [score for scores in games_by_student.values() for score, _ in scores]
    attended_total = sum(
        att[Attendance.Status.PRESENT] + att[Attendance.Status.LATE] for att in attendance_by_student.values()
    )
    counted_total = attended_total + sum(att[Attendance.Status.ABSENT] for att in attendance_by_student.values())

    return {
        "period_days": days,
        "summary": {
            "students": len(students),
            "test_avg": _avg(all_test_scores),
            "tests_taken": len(all_test_scores),
            "game_avg": _avg(all_game_scores),
            "games_played": len(all_game_scores),
            "attendance_rate": round(attended_total / counted_total * 100) if counted_total else None,
            "xp_gained": sum(xp_by_student.values()),
            "at_risk": sum(1 for row in rows if row["status"] == Status.RISK),
            "watch": sum(1 for row in rows if row["status"] == Status.WATCH),
        },
        "subjects": sorted(
            (
                {"subject": subject, "avg": _avg(scores), "results": len(scores)}
                for subject, scores in class_subject_scores.items()
            ),
            key=lambda item: item["avg"],
        ),
        "students": rows,
    }


def ai_school_summary(report: dict, *, refresh: bool = False) -> str | None:
    """AI summary for the whole-school report (director only)."""
    students = report["students"]
    names = {f"S{i}": row["full_name"] for i, row in enumerate(students, start=1)}
    status_words = {Status.GOOD: "yaxshi", Status.WATCH: "e'tibor kerak", Status.RISK: "xavf", Status.NO_DATA: "ma'lumot yo'q"}
    student_lines = [
        f"S{i}: {row['school_class']} — holat={status_words[row['status']]}, test o'rtacha={_fmt(row['test_avg'], '%')} ({row['tests_taken']} ta), "
        f"test trendi={_fmt(row['test_trend'])}, o'yin o'rtacha={_fmt(row['game_avg'], '%')} "
        f"({row['games_played']} ta), davomat={_fmt(row['attendance_rate'], '%')} "
        f"(qoldirgan: {row['absences']}, kechikkan: {row['late']}), XP=+{row['xp_gained']}, "
        f"zaif fanlar={', '.join(f'{w['subject']} {w['avg']}%' for w in row['weak_subjects']) or 'yo‘q'}"
        for i, row in enumerate(students, start=1)
    ]
    summary = report["summary"]
    subject_lines = [f"{s['subject']}: {s['avg']}% ({s['results']} ta natija)" for s in report["subjects"]]

    data = "\n".join(
        [
            f"Davr: oxirgi {report['period_days']} kun. Barcha o'quvchilar: {summary['students']}.",
            (
                f"Maktab bo'yicha: test o'rtacha={_fmt(summary['test_avg'], '%')}, "
                f"o'yin o'rtacha={_fmt(summary['game_avg'], '%')}, "
                f"davomat={_fmt(summary['attendance_rate'], '%')}."
            ),
            "Fanlar (eng pastidan):",
            *subject_lines,
            "O'quvchilar:",
            *student_lines,
        ]
    )

    cache_key = "school-report-ai:" + hashlib.sha1(data.encode()).hexdigest()
    if not refresh:
        cached = cache.get(cache_key)
        if cached:
            return cached

    prompt = (
        "Sen tajribali maktab direktori metodistis. Quyida maktab bo'yicha barcha o'quvchilarning o'quv natijalari berilgan. "
        "O'quvchilar faqat kodlar bilan (S1, S2, ...) va ularning sinflari bilan ko'rsatilgan.\n\n"
        f"{data}\n\n"
        "Direktor uchun O'ZBEK TILIDA qisqa hisobot yoz, quyidagi to'rt bo'lim bilan "
        "(har bo'lim nomini alohida qatorda yoz, markdown belgilarisiz):\n"
        "Umumiy holat — 2-3 jumla.\n"
        "E'tibor kerak bo'lgan o'quvchilar — har biri alohida qatorda '- ' bilan, kodi, sinfi va qisqa sababi.\n"
        "Zaif fanlar — '- ' bilan ro'yxat.\n"
        "Tavsiyalar — 3-4 ta aniq, amaliy qadam, '- ' bilan.\n"
        "O'quvchini faqat kodining o'zi bilan ata (masalan: 'S3 — ...'), 'kod' so'zini yozma va ism o'ylab topma. "
        "Ma'lumot bo'lmagan narsani taxmin qilma. "
        "Iliq va professional ohangda yoz."
    )

    content = call_gemini(prompt=prompt)
    if content is None:
        return None

    text = re.sub(r"\bS(\d+)\b", lambda m: names.get(m.group(0), m.group(0)), content.strip())
    text = text.replace("**", "").replace("##", "")
    cache.set(cache_key, text, AI_SUMMARY_CACHE_SECONDS)
    return text


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


def _status(
    score: float | None, trend: float | None, attendance_rate: float | None, *, weak_subject: bool = False
) -> str:
    if score is None and attendance_rate is None:
        return Status.NO_DATA
    if (score is not None and score < RISK_SCORE) or (attendance_rate is not None and attendance_rate < RISK_ATTENDANCE):
        return Status.RISK
    if (
        (score is not None and score < WATCH_SCORE)
        or (trend is not None and trend <= WATCH_TREND)
        or (attendance_rate is not None and attendance_rate < WATCH_ATTENDANCE)
        or weak_subject
    ):
        return Status.WATCH
    return Status.GOOD


def build_class_report(school_class: SchoolClass, *, days: int = DEFAULT_PERIOD) -> dict:
    now = timezone.now()
    since_date = timezone.localdate() - timedelta(days=days - 1)
    since = timezone.make_aware(datetime.combine(since_date, time.min))
    midpoint = since + (now - since) / 2

    students = list(
        school_class.students.select_related("user").order_by("user__first_name", "user__last_name")
    )
    student_ids = [s.id for s in students]

    tests_by_student: dict[int, list[tuple]] = defaultdict(list)
    for row in TestAttempt.objects.filter(
        student_id__in=student_ids,
        status=TestAttempt.Status.SUBMITTED,
        submitted_at__gte=since,
        score_percent__isnull=False,
    ).values("student_id", "score_percent", "submitted_at", "test__subject__name"):
        tests_by_student[row["student_id"]].append(
            (row["score_percent"], row["submitted_at"], row["test__subject__name"])
        )

    games_by_student: dict[int, list[tuple]] = defaultdict(list)
    for row in GameSession.objects.filter(
        student_id__in=student_ids,
        status=GameSession.Status.COMPLETED,
        completed_at__gte=since,
        score_percent__isnull=False,
    ).values("student_id", "score_percent", "subject__name"):
        games_by_student[row["student_id"]].append((row["score_percent"], row["subject__name"]))

    attendance_by_student: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for row in (
        Attendance.objects.filter(student_id__in=student_ids, lesson__date__gte=since_date)
        .values("student_id", "status")
        .annotate(n=Count("id"))
    ):
        attendance_by_student[row["student_id"]][row["status"]] = row["n"]

    xp_by_student = {
        row["student_id"]: row["total"]
        for row in XPTransaction.objects.filter(student_id__in=student_ids, created_at__gte=since)
        .values("student_id")
        .annotate(total=Sum("amount"))
    }

    class_subject_scores: dict[str, list[float]] = defaultdict(list)
    rows = []
    for student in students:
        tests = tests_by_student[student.id]
        games = games_by_student[student.id]
        test_scores = [score for score, _, _ in tests]
        game_scores = [score for score, _ in games]

        first_half = [score for score, at, _ in tests if at < midpoint]
        second_half = [score for score, at, _ in tests if at >= midpoint]
        trend = (
            round(_avg(second_half) - _avg(first_half), 1) if first_half and second_half else None  # type: ignore[operator]
        )

        subject_scores: dict[str, list[float]] = defaultdict(list)
        for score, _, subject in tests:
            subject_scores[subject].append(score)
        for score, subject in games:
            subject_scores[subject].append(score)
        for subject, scores in subject_scores.items():
            class_subject_scores[subject].extend(scores)
        weak_subjects = sorted(
            (
                {"subject": subject, "avg": _avg(scores), "results": len(scores)}
                for subject, scores in subject_scores.items()
                if (_avg(scores) or 0) < WEAK_SUBJECT_SCORE
            ),
            key=lambda item: item["avg"],
        )[:3]

        att = attendance_by_student[student.id]
        attended = att[Attendance.Status.PRESENT] + att[Attendance.Status.LATE]
        counted = attended + att[Attendance.Status.ABSENT]
        attendance_rate = round(attended / counted * 100) if counted else None

        test_avg = _avg(test_scores)
        game_avg = _avg(game_scores)
        score = test_avg if test_avg is not None else game_avg
        rows.append(
            {
                "id": student.id,
                "full_name": student.user.get_full_name() or student.user.username,
                "status": _status(
                    score,
                    trend,
                    attendance_rate,
                    weak_subject=any(w["results"] >= WEAK_SUBJECT_MIN_RESULTS for w in weak_subjects),
                ),
                "test_avg": test_avg,
                "tests_taken": len(test_scores),
                "test_trend": trend,
                "game_avg": game_avg,
                "games_played": len(game_scores),
                "attendance_rate": attendance_rate,
                "absences": att[Attendance.Status.ABSENT],
                "late": att[Attendance.Status.LATE],
                "xp_gained": xp_by_student.get(student.id, 0),
                "weak_subjects": weak_subjects,
            }
        )

    all_test_scores = [score for scores in tests_by_student.values() for score, _, _ in scores]
    all_game_scores = [score for scores in games_by_student.values() for score, _ in scores]
    attended_total = sum(
        att[Attendance.Status.PRESENT] + att[Attendance.Status.LATE] for att in attendance_by_student.values()
    )
    counted_total = attended_total + sum(att[Attendance.Status.ABSENT] for att in attendance_by_student.values())

    return {
        "school_class": {"id": school_class.id, "name": school_class.name},
        "period_days": days,
        "summary": {
            "students": len(students),
            "test_avg": _avg(all_test_scores),
            "tests_taken": len(all_test_scores),
            "game_avg": _avg(all_game_scores),
            "games_played": len(all_game_scores),
            "attendance_rate": round(attended_total / counted_total * 100) if counted_total else None,
            "xp_gained": sum(xp_by_student.values()),
            "at_risk": sum(1 for row in rows if row["status"] == Status.RISK),
            "watch": sum(1 for row in rows if row["status"] == Status.WATCH),
        },
        "subjects": sorted(
            (
                {"subject": subject, "avg": _avg(scores), "results": len(scores)}
                for subject, scores in class_subject_scores.items()
            ),
            key=lambda item: item["avg"],
        ),
        "students": rows,
    }


def _fmt(value, suffix: str = "") -> str:
    return "—" if value is None else f"{value}{suffix}"


def ai_class_summary(report: dict, *, refresh: bool = False) -> str | None:
    """A short Uzbek write-up of `report` for the teacher: how the class is
    doing, who needs attention and why, weak subjects, concrete next steps.

    Students go to the AI only as codes; names are restored in the reply.
    Cached per identical report data, so re-opening the page doesn't spend
    another AI call — `refresh` forces a new one. Returns None if the AI is
    unavailable (same fail-quiet contract as `call_gemini`).
    """
    students = report["students"]
    names = {f"S{i}": row["full_name"] for i, row in enumerate(students, start=1)}
    status_words = {Status.GOOD: "yaxshi", Status.WATCH: "e'tibor kerak", Status.RISK: "xavf", Status.NO_DATA: "ma'lumot yo'q"}
    student_lines = [
        f"S{i}: holat={status_words[row['status']]}, test o'rtacha={_fmt(row['test_avg'], '%')} ({row['tests_taken']} ta), "
        f"test trendi={_fmt(row['test_trend'])}, o'yin o'rtacha={_fmt(row['game_avg'], '%')} "
        f"({row['games_played']} ta), davomat={_fmt(row['attendance_rate'], '%')} "
        f"(qoldirgan: {row['absences']}, kechikkan: {row['late']}), XP=+{row['xp_gained']}, "
        f"zaif fanlar={', '.join(f'{w['subject']} {w['avg']}%' for w in row['weak_subjects']) or 'yo‘q'}"
        for i, row in enumerate(students, start=1)
    ]
    summary = report["summary"]
    subject_lines = [f"{s['subject']}: {s['avg']}% ({s['results']} ta natija)" for s in report["subjects"]]

    data = "\n".join(
        [
            f"Davr: oxirgi {report['period_days']} kun. O'quvchilar: {summary['students']}.",
            (
                f"Sinf bo'yicha: test o'rtacha={_fmt(summary['test_avg'], '%')}, "
                f"o'yin o'rtacha={_fmt(summary['game_avg'], '%')}, "
                f"davomat={_fmt(summary['attendance_rate'], '%')}."
            ),
            "Fanlar (eng pastidan):",
            *subject_lines,
            "O'quvchilar:",
            *student_lines,
        ]
    )

    cache_key = "class-report-ai:" + hashlib.sha1(data.encode()).hexdigest()
    if not refresh:
        cached = cache.get(cache_key)
        if cached:
            return cached

    prompt = (
        "Sen tajribali maktab metodistisan. Quyida bitta sinfning o'quv natijalari berilgan. "
        "O'quvchilar faqat kodlar bilan (S1, S2, ...) ko'rsatilgan.\n\n"
        f"{data}\n\n"
        "O'qituvchi uchun O'ZBEK TILIDA qisqa hisobot yoz, quyidagi to'rt bo'lim bilan "
        "(har bo'lim nomini alohida qatorda yoz, markdown belgilarisiz):\n"
        "Umumiy holat — 2-3 jumla.\n"
        "E'tibor kerak bo'lgan o'quvchilar — har biri alohida qatorda '- ' bilan, kodi va qisqa sababi.\n"
        "Zaif fanlar — '- ' bilan ro'yxat.\n"
        "Tavsiyalar — 3-4 ta aniq, amaliy qadam, '- ' bilan.\n"
        "O'quvchini faqat kodining o'zi bilan ata (masalan: 'S3 — ...'), 'kod' so'zini yozma va ism o'ylab topma. "
        "Ma'lumot bo'lmagan narsani taxmin qilma. "
        "Iliq va professional ohangda yoz."
    )

    content = call_gemini(prompt=prompt)
    if content is None:
        return None

    text = re.sub(r"\bS(\d+)\b", lambda m: names.get(m.group(0), m.group(0)), content.strip())
    text = text.replace("**", "").replace("##", "")
    cache.set(cache_key, text, AI_SUMMARY_CACHE_SECONDS)
    return text
