import json
import logging
import secrets

from django.db import transaction
from django.utils import timezone

from apps.academics.models import Subject
from apps.common.gemini import call_gemini
from apps.gamification.models import XPTransaction
from apps.gamification.services import award_xp
from apps.schools.models import SchoolClass

from . import defense, question_service, racing
from .models import GameSession, PooledQuestion

logger = logging.getLogger(__name__)

GAME_QUESTION_COUNT = 8
MAX_GAME_XP = 25

# Per-game overrides of the two defaults above. Minora qurish has ten floors,
# so ten questions, and 3 XP per floor keeps its per-question reward in line
# with the 8-question games (25 / 8 ≈ 3).
_QUESTION_COUNTS = {
    GameSession.GameType.TOWER_BUILDER: 10,
    GameSession.GameType.CODE_BREAKER: 10,
    GameSession.GameType.TREASURE_HUNT: 10,
    GameSession.GameType.BATTLE_ARENA: 10,
}
_MAX_XP = {
    GameSession.GameType.TOWER_BUILDER: 30,
    GameSession.GameType.CODE_BREAKER: 30,
    GameSession.GameType.TREASURE_HUNT: 30,
    GameSession.GameType.BATTLE_ARENA: 30,
}

# Jang maydoni's balance — the single source of truth; the client only ever
# displays the HP/damage values the server computes from these.
BATTLE_RULES = {
    "player_hp": 100,
    "enemy_hp": 100,
    "hit_damage": 20,
    "miss_damage": 10,
}

# Games with a win condition on top of the score: the percentage that opens
# Kodni buzish's lock / reaches Xazina ovi's treasure.
_UNLOCK_PERCENTS = {
    GameSession.GameType.CODE_BREAKER: 70,
    GameSession.GameType.TREASURE_HUNT: 80,
}

# Kodni buzish's secret code alphabet (no 0/O, 1/I/L look-alikes).
_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

# A pool this low triggers `tasks.refill_low_pools`; one refill call asks Gemini
# for this many new questions at once. Both are pool-wide, not per-student —
# see `refill_pool`.
POOL_LOW_THRESHOLD = 20
POOL_REFILL_BATCH = 30

_GAME_LABELS = {
    GameSession.GameType.TUG_OF_WAR: "arqon tortish",
    GameSession.GameType.QUIZ: "viktorina",
    GameSession.GameType.TOWER_BUILDER: "minora qurish",
    GameSession.GameType.CODE_BREAKER: "kodni buzish",
    GameSession.GameType.TREASURE_HUNT: "xazina ovi",
    GameSession.GameType.BATTLE_ARENA: "jang maydoni",
    GameSession.GameType.TOWER_DEFENSE: "tower defense",
    GameSession.GameType.NEON_RACING: "neon racing",
}

# Games whose answers the server records one by one and reveals the key for
# right after — see `record_live_answer`.
LIVE_KEY_GAMES = {
    GameSession.GameType.TOWER_BUILDER,
    GameSession.GameType.CODE_BREAKER,
    GameSession.GameType.TREASURE_HUNT,
    GameSession.GameType.BATTLE_ARENA,
    GameSession.GameType.TOWER_DEFENSE,
    GameSession.GameType.NEON_RACING,
}

# Games with Easy/Medium/Hard levels → the module holding each one's rules.
_LEVELED_GAMES = {
    GameSession.GameType.TOWER_DEFENSE: defense,
    GameSession.GameType.NEON_RACING: racing,
}


def question_count_for(game_type: str, difficulty: str = "") -> int:
    if game_type in _LEVELED_GAMES:
        return _LEVELED_GAMES[game_type].config_for(difficulty)["questions"]
    return _QUESTION_COUNTS.get(game_type, GAME_QUESTION_COUNT)


def max_xp_for(game_type: str, difficulty: str = "") -> int:
    if game_type in _LEVELED_GAMES:
        # A harder level has more questions, so more to earn at the same 3 XP each.
        return _LEVELED_GAMES[game_type].XP_PER_QUESTION * question_count_for(game_type, difficulty)
    return _MAX_XP.get(game_type, MAX_GAME_XP)


def xp_for(*, game_type: str, correct: int, total: int, difficulty: str = "") -> int:
    """Same partial-scoring formula for every game — `submit_game` awards
    this, and Minora qurish shows the running value live after each floor."""
    if not total:
        return 0
    score_percent = round((correct / total) * 100, 2)
    return round(max_xp_for(game_type, difficulty) * score_percent / 100)


def arena_state(session: GameSession) -> dict | None:
    """The replayed fight for games that can end early (Jang maydoni's
    knockout, Tower Defense's victory or fallen base); None for the others."""
    return battle_state(session) or defense.defense_state(session)


def recorded_answers(session: GameSession) -> dict[int, int]:
    return {int(index): selected for index, selected in (session.answers or {}).items()}


def correct_answer_count(session: GameSession, answers: dict[int, int]) -> int:
    return sum(
        1
        for index, question in enumerate(session.questions)
        if answers.get(index) == question.get("correct_index")
    )


def start_game(*, student, subject, game_type: str, difficulty: str = "") -> GameSession:
    secret_code = ""
    if game_type == GameSession.GameType.CODE_BREAKER:
        secret_code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(question_count_for(game_type)))
    if game_type in _LEVELED_GAMES:
        if difficulty not in GameSession.Difficulty.values:
            difficulty = _LEVELED_GAMES[game_type].DEFAULT_DIFFICULTY
    else:
        difficulty = ""
    return GameSession.objects.create(
        student=student, subject=subject, game_type=game_type, secret_code=secret_code, difficulty=difficulty
    )


def unlock_percent_for(game_type: str) -> int | None:
    return _UNLOCK_PERCENTS.get(game_type)


def battle_state(session: GameSession) -> dict | None:
    """Jang maydoni's HP/combo state, replayed from the server's own recorded
    answers in order — never from anything the client sends. `over` once
    either side is out of HP or every round has been played."""
    if session.game_type != GameSession.GameType.BATTLE_ARENA:
        return None
    rules = BATTLE_RULES
    player_hp, enemy_hp = rules["player_hp"], rules["enemy_hp"]
    combo = max_combo = 0
    answers = recorded_answers(session)
    rounds = 0
    for index, question in enumerate(session.questions):
        if index not in answers:
            break
        rounds += 1
        if answers[index] == question.get("correct_index"):
            enemy_hp -= rules["hit_damage"]
            combo += 1
            max_combo = max(max_combo, combo)
        else:
            player_hp -= rules["miss_damage"]
            combo = 0
        if enemy_hp <= 0 or player_hp <= 0:
            break
    total = len(session.questions) or question_count_for(session.game_type)
    return {
        "player_hp": max(0, player_hp),
        "enemy_hp": max(0, enemy_hp),
        "combo": combo,
        "max_combo": max_combo,
        "rounds_played": rounds,
        "over": enemy_hp <= 0 or player_hp <= 0 or rounds >= total,
        "victory": enemy_hp <= 0,
        "rules": rules,
    }


def _scored_state(session: GameSession) -> dict | None:
    return defense.defense_state(session) or racing.race_state(session)


def personal_record(session: GameSession) -> dict | None:
    """For a finished Tower Defense / Neon Racing game: the student's best score
    in that game before this one (replayed from their other finished games,
    never stored) and whether this game beat it — "new personal record"."""
    state = _scored_state(session)
    if state is None or session.status != GameSession.Status.COMPLETED:
        return None
    previous = GameSession.objects.filter(
        student_id=session.student_id,
        game_type=session.game_type,
        status=GameSession.Status.COMPLETED,
    ).exclude(pk=session.pk)
    best_before = max((_scored_state(game)["score"] for game in previous), default=None)
    is_record = state["score"] > best_before if best_before is not None else is_goal_reached(session)
    return {"score": state["score"], "best_before": best_before, "is_record": is_record}


def is_goal_reached(session: GameSession) -> bool:
    """Kodni buzish's lock opened / Xazina ovi's treasure found / Jang
    maydoni's opponent defeated — decided only from the server's own record,
    never before the game ends."""
    if session.game_type in (GameSession.GameType.BATTLE_ARENA, GameSession.GameType.TOWER_DEFENSE):
        state = arena_state(session)
        return session.status == GameSession.Status.COMPLETED and bool(state and state["victory"])
    if session.game_type == GameSession.GameType.NEON_RACING:
        race = racing.race_state(session)
        return session.status == GameSession.Status.COMPLETED and bool(race and race["position"] == 1)
    threshold = unlock_percent_for(session.game_type)
    return (
        threshold is not None
        and session.status == GameSession.Status.COMPLETED
        and session.score_percent is not None
        and session.score_percent >= threshold
    )


def revealed_code(session: GameSession) -> list[str | None]:
    """Kodni buzish's code as the student may currently see it: segment *i*
    is revealed only by a correct answer to question *i*, and the whole code
    only once the game has ended unlocked. `None` marks a still-locked segment.
    """
    if not session.secret_code:
        return []
    if is_goal_reached(session):
        return list(session.secret_code)
    answers = recorded_answers(session)
    return [
        char
        if index < len(session.questions) and answers.get(index) == session.questions[index].get("correct_index")
        else None
        for index, char in enumerate(session.secret_code)
    ]


def answer_review(session: GameSession) -> list[dict] | None:
    """Every question with the student's answer, the key and its explanation —
    only once a live-key game is over, for the result screen's "where did I go wrong"."""
    if session.game_type not in LIVE_KEY_GAMES or session.status != GameSession.Status.COMPLETED:
        return None
    answers = recorded_answers(session)
    return [
        {
            "text": question["text"],
            "options": question["options"],
            "selected_index": answers.get(index, -1),
            "correct_index": question["correct_index"],
            "explanation": question.get("explanation", ""),
        }
        for index, question in enumerate(session.questions)
    ]


def pick_session_questions(session: GameSession) -> list[dict] | None:
    """The subject's questions for this session, drawn by the shared
    `question_service` — every game gets its questions from the one bank the
    same way, so this function only owns the *session* half: deciding how many
    the game needs and making the draw happen exactly once.

    Idempotent per session, same contract as before. Returns `None` when there
    is genuinely nothing to draw from — a subject with no questions in the bank
    at all — and the caller shows a real empty state; it never falls back to a
    live AI call, so a game start can't risk the Gemini rate limit.

    `select_for_update` + a re-check under the lock guards against two
    near-simultaneous requests for the same session (a double-click, a
    duplicate tab) both picking their own question set — without it, both would
    mark their draw "served" via `PooledQuestionServed` before either save won,
    quietly burning pool capacity for a set of questions nobody ever played.
    """
    if session.questions:
        # Validate that existing questions match the session's subject (if any)
        if session.questions and session.subject:
            expected_subject_id = session.subject_id
            for q in session.questions:
                if q.get("subject_id") and q["subject_id"] != expected_subject_id:
                    # Questions don't match subject - clear them to re-draw
                    session.questions = []
                    break
        if session.questions:
            return session.questions

    with transaction.atomic():
        # A separate, lock-held copy — `session` (the caller's object) is kept
        # in sync below rather than rebound, since callers rely on it being
        # mutated in place (e.g. reading `session.questions` right after this
        # call without using the return value).
        locked = GameSession.objects.select_for_update().select_related("student", "subject").get(pk=session.pk)
        if locked.questions:
            session.questions = locked.questions
            return locked.questions

        needed = question_count_for(locked.game_type, locked.difficulty)
        try:
            if locked.subject:
                questions = question_service.get_questions(
                    subject=locked.subject,
                    amount=needed,
                    game_type=locked.game_type,
                    difficulty=locked.difficulty,
                    student=locked.student,
                )
            else:
                # "All subjects" mode: draw questions from all subjects
                questions = question_service.get_questions_all_subjects(
                    amount=needed,
                    game_type=locked.game_type,
                    difficulty=locked.difficulty,
                    student=locked.student,
                )
        except question_service.NoQuestionsAvailable:
            return None

        # Double-check: all questions must belong to the session's subject (if any)
        if locked.subject:
            expected_subject_id = locked.subject_id
            for q in questions:
                if q.get("subject_id") and q["subject_id"] != expected_subject_id:
                    # This should never happen if question_service is correct, but guard anyway
                    return None

        locked.questions = questions
        locked.save(update_fields=["questions", "updated_at"])
        session.questions = questions
        return questions


def refill_pool(
    *,
    subject: Subject,
    school_class: SchoolClass | None = None,
    organization=None,
    batch_size: int = POOL_REFILL_BATCH,
) -> int:
    """The *only* place apps.games talks to Gemini — one batched call that tops
    up a subject's bank. Called either by a director's manual "to'ldirish"
    action or by the scheduled `tasks.refill_low_pools`; never from a student's
    game-start request.

    With no `school_class` the questions land in the subject-wide bank, which
    every student of that subject can draw from — the one bank to fill when the
    goal is "make this subject playable in every game", rather than tailoring
    questions to a single class's level.

    Returns how many questions were actually added (0 if Gemini was unavailable
    or returned something unusable — same "fail quiet" contract as
    `call_gemini` itself).

    A class-scoped bank inherits its tenant from that class; the subject-wide
    bank has no class to inherit from, so `organization` is required there.
    `bulk_create` bypasses `save()`, so the column is set explicitly rather than
    left to `PooledQuestion.organization_source`.
    """
    target_organization = organization or (school_class.organization if school_class else None)
    if target_organization is None:
        raise ValueError(
            "refill_pool needs an organization for the subject-wide bank — "
            "a school_class-scoped bank inherits it from the class."
        )

    game_label = "mashq"
    scope = f"{school_class.name} sinf darajasida" if school_class else "barcha sinf darajasida"
    prompt = (
        f'"{subject.name}" fanidan, {scope} {batch_size} ta '
        f"ODDIY va QISQA ko'p variantli {game_label} savoli tuzib ber. Turli mavzu va qiyinlik darajasidan "
        "bo'lsin.\n\n"
        "Faqat quyidagi JSON formatida javob ber, boshqa hech narsa yozma:\n"
        '{"questions": [{"text": "...", "options": ["...", "...", "...", "..."], "correct_index": 0, '
        '"explanation": "..."}]}\n'
        "Har savolda aniq 4 ta variant va faqat bitta to'g'ri javob bo'lsin (correct_index — 0 dan boshlab). "
        "explanation — nega aynan shu javob to'g'riligini bitta qisqa gapda tushuntirsin. "
        "Hammasi o'zbek tilida bo'lsin."
    )

    content = call_gemini(prompt=prompt, json_mode=True)
    if content is None:
        return 0

    try:
        raw_questions = json.loads(content)["questions"]
        if not isinstance(raw_questions, list):
            raise TypeError
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        logger.warning("Could not parse Gemini pool-refill JSON for %s / %s", subject, school_class)
        return 0

    valid = [
        q
        for q in raw_questions
        if isinstance(q, dict)
        and isinstance(q.get("text"), str)
        and q["text"]
        and isinstance(q.get("options"), list)
        and len(q["options"]) >= 2
        and isinstance(q.get("correct_index"), int)
        and 0 <= q["correct_index"] < len(q["options"])
    ]

    created = PooledQuestion.objects.bulk_create(
        PooledQuestion(
            subject=subject,
            school_class=school_class,
            organization=target_organization,
            text=q["text"],
            options=q["options"],
            correct_index=q["correct_index"],
            explanation=q["explanation"] if isinstance(q.get("explanation"), str) else "",
        )
        for q in valid
    )
    return len(created)


def pool_status(organization=None) -> list[dict]:
    """Every (subject, class) bank that has at least one active question, with
    its current size — powers the director's pool-management page. A subject
    with no questions at all simply doesn't appear here; a director bootstraps
    it with the manual refill action instead. An empty class name is the
    subject-wide bank, shared by every student of that subject.
    """
    return question_service.subject_pool_sizes(organization)


def check_answer(*, session: GameSession, question_index: int, selected_index: int) -> bool:
    """Live per-question feedback for the tug-of-war rope — deliberately reveals only
    whether this one answer was right, never the full answer key.
    """
    if not session.questions or not (0 <= question_index < len(session.questions)):
        raise ValueError("Noto'g'ri savol raqami.")
    return session.questions[question_index].get("correct_index") == selected_index


def record_live_answer(
    *, session: GameSession, question_index: int, selected_index: int, nitro: bool = False
) -> dict:
    """The live-key games' (Minora, Kod, Xazina, Jang) server-authoritative answer step. Questions must be
    answered strictly in order and each exactly once — the answer is locked in
    *before* the key is revealed, so a student can't peek at the correct
    option and then re-answer. Returns the feedback the game screen shows:
    correctness, the key + explanation, the running correct/XP totals, and —
    for Kodni buzish — the code segment this answer unlocked, if any.
    `selected_index` -1 means the student gave up on the question (never correct).
    """
    with transaction.atomic():
        locked = GameSession.objects.select_for_update().get(pk=session.pk)
        if locked.game_type not in LIVE_KEY_GAMES:
            raise ValueError("Bu o'yin turi javoblarni birma-bir qabul qilmaydi.")
        if locked.status == GameSession.Status.COMPLETED:
            raise ValueError("Bu o'yin allaqachon yakunlangan.")
        if not locked.questions:
            raise ValueError("Savollar hali tayyor emas.")

        arena = arena_state(locked)
        if arena and arena["over"]:
            raise ValueError("Jang allaqachon tugagan.")

        answers = recorded_answers(locked)
        if question_index != len(answers) or question_index >= len(locked.questions):
            raise ValueError("Noto'g'ri savol raqami.")

        question = locked.questions[question_index]
        if not (-1 <= selected_index < len(question["options"])):
            raise ValueError("Noto'g'ri javob varianti.")

        # Neon Racing: nitro can ride along with an answer, but only if the
        # replayed meter says it's actually full right now.
        if nitro and locked.game_type == GameSession.GameType.NEON_RACING:
            if not racing.race_state(locked)["nitro_ready"]:
                raise ValueError("Nitro hali tayyor emas.")
            locked.nitro_rounds = [*(locked.nitro_rounds or []), question_index]

        answers[question_index] = selected_index
        locked.answers = {str(index): selected for index, selected in answers.items()}
        locked.save(update_fields=["answers", "nitro_rounds", "updated_at"])

    session.answers = locked.answers
    total = len(locked.questions)
    correct_count = correct_answer_count(locked, answers)
    correct = selected_index == question["correct_index"]
    return {
        "correct": correct,
        "code_segment": locked.secret_code[question_index] if correct and locked.secret_code else None,
        "correct_index": question["correct_index"],
        "explanation": question.get("explanation", ""),
        "answered_count": len(answers),
        "correct_count": correct_count,
        "xp_earned": xp_for(
            game_type=locked.game_type, correct=correct_count, total=total, difficulty=locked.difficulty
        ),
        "battle": battle_state(locked),
        "defense": defense.defense_state(locked),
        "race": racing.race_state(locked),
    }


def submit_game(*, session: GameSession, answers: dict[int, int]) -> GameSession:
    """`answers` is {question_index: selected_option_index}. For a game that
    records answers server-side as it goes (Minora qurish, Kodni buzish), the
    client's payload is ignored and the locked-in answers are scored instead.

    The row is locked and its status re-checked under the lock, so two
    near-simultaneous submits (double-click, a retried request, two tabs) can
    never both pass the "already completed" check and award XP twice.
    """
    with transaction.atomic():
        locked = GameSession.objects.select_for_update().select_related("subject", "student").get(pk=session.pk)
        _score_and_award(locked, answers)

    for field in ("score_percent", "xp_awarded", "status", "completed_at", "updated_at"):
        setattr(session, field, getattr(locked, field))
    return session


def _score_and_award(session: GameSession, answers: dict[int, int]) -> None:
    if session.status == GameSession.Status.COMPLETED:
        raise ValueError("Bu o'yin allaqachon yakunlangan.")
    if not session.questions:
        raise ValueError("Savollar hali tayyor emas.")

    total = len(session.questions)
    scored_rounds = total
    xp_credit = 0
    if session.game_type in LIVE_KEY_GAMES:
        answers = recorded_answers(session)
        arena = arena_state(session)
        if arena is not None:
            # A battle can end before the last round (an HP bar hits 0, the
            # last wave falls). Accuracy is over the rounds actually fought,
            # and a win credits the rounds it made unnecessary — so a quick
            # win is worth as much XP as winning them all, never less.
            if not arena["over"]:
                raise ValueError("Jang hali tugamagan.")
            scored_rounds = arena["rounds_played"]
            if arena["victory"]:
                xp_credit = total - scored_rounds
        elif len(answers) < total:
            raise ValueError("Hali barcha savollarga javob berilmagan.")
    else:
        # Batch-submitted games keep what was sent, so a low score can later be
        # explained question by question (see apps.remedial).
        session.answers = {str(index): selected for index, selected in answers.items() if 0 <= index < total}

    correct = correct_answer_count(session, answers)
    score_percent = round((correct / scored_rounds) * 100, 2) if scored_rounds else 0.0
    xp_awarded = xp_for(
        game_type=session.game_type, correct=correct + xp_credit, total=total, difficulty=session.difficulty
    )

    session.score_percent = score_percent
    session.xp_awarded = xp_awarded
    session.status = GameSession.Status.COMPLETED
    session.completed_at = timezone.now()
    session.save(
        update_fields=["score_percent", "xp_awarded", "status", "completed_at", "answers", "updated_at"]
    )

    if xp_awarded > 0:
        game_label = _GAME_LABELS.get(session.game_type, "o'yin")
        award_xp(
            student=session.student,
            amount=xp_awarded,
            source=XPTransaction.Source.GAME,
            related_object=session,
            reason=f"{session.subject.name} — {game_label}",
        )
