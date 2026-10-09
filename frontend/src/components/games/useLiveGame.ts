import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { api } from "../../lib/api";
import { isNoQuestionsError } from "../../lib/gameErrors";
import type { GameQuestion, GameSession, LiveAnswerResult } from "../../types";
import type { GameOptionState } from "./GameUI";

export type LiveGamePhase = "start" | "playing" | "finished";

export interface LiveFeedback {
  selectedIndex: number;
  result: LiveAnswerResult;
  xpGained: number;
}

const DEFAULT_ADVANCE_MS = 1500;

/** Shared engine for the games whose answers the server locks in one at a
 * time (Minora qurish, Kodni buzish, Xazina ovi, Jang maydoni): question loading, the
 * answer → feedback → next loop, the stopwatch, resume-after-reload, and the
 * final submit. Each game only supplies its own stage and reacts to answers
 * through `onAnswered`.
 *
 * Everything that counts (correctness, running totals, XP) comes from the
 * server's `/answer/` response; nothing is scored client-side. */
export function useLiveGame(
  session: GameSession,
  options: {
    onAnswered?: (result: LiveAnswerResult, questionIndex: number, xpGained: number) => void;
    /** How long a correct answer's feedback stays before moving on. */
    advanceMs?: number;
    /** For games that can end before the last question (Jang maydoni's knockout). */
    isGameOver?: (result: LiveAnswerResult) => boolean;
    /** The game was already over when loaded (e.g. the submit was lost). */
    initiallyOver?: boolean;
    /** Extra fields sent with each answer (Neon Racing's `nitro`), read at answer time. */
    answerExtras?: () => Record<string, unknown>;
  } = {},
) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { onAnswered, advanceMs = DEFAULT_ADVANCE_MS, isGameOver, initiallyOver = false, answerExtras } = options;

  const total = session.question_count;
  const [phase, setPhase] = useState<LiveGamePhase>(session.status === "COMPLETED" ? "finished" : "start");
  const [questionIndex, setQuestionIndex] = useState(session.answered_count);
  const [correctCount, setCorrectCount] = useState(session.correct_count);
  const [xpEarned, setXpEarned] = useState(
    total > 0 ? Math.round((session.max_xp * session.correct_count) / total) : 0,
  );
  const [feedback, setFeedback] = useState<LiveFeedback | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [over, setOver] = useState(initiallyOver);
  const answersRef = useRef<Record<number, number>>({});

  const questionsQuery = useQuery({
    queryKey: ["game", session.id, "questions"],
    queryFn: async () => (await api.get<GameQuestion[]>(`/games/${session.id}/questions/`)).data,
    enabled: session.status === "ACTIVE",
    retry: false,
  });

  const answerMutation = useMutation({
    mutationFn: async (vars: { questionIndex: number; selectedIndex: number; extras?: Record<string, unknown> }) =>
      (
        await api.post<LiveAnswerResult>(`/games/${session.id}/answer/`, {
          question_index: vars.questionIndex,
          selected_index: vars.selectedIndex,
          ...vars.extras,
        })
      ).data,
  });

  const submitMutation = useMutation({
    // The server scores the answers it already recorded and ignores this
    // payload for these games — it's only sent because the shared submit
    // endpoint requires a non-empty list.
    mutationFn: async () => {
      const known = Object.entries(answersRef.current).map(([question_index, selected_index]) => ({
        question_index: Number(question_index),
        selected_index,
      }));
      return (
        await api.post<GameSession>(`/games/${session.id}/submit/`, {
          answers: known.length > 0 ? known : [{ question_index: 0, selected_index: -1 }],
        })
      ).data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["games"] });
      queryClient.setQueryData(["game", session.id], result);
    },
    retry: 2,
  });

  useEffect(() => {
    if (phase !== "playing") return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // A correct answer moves on by itself; a wrong one waits for the student to
  // read the explanation and press "Keyingi savol".
  useEffect(() => {
    if (!feedback?.result.correct) return;
    const t = setTimeout(goNext, advanceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goNext only reads state captured for this feedback
  }, [feedback]);

  function finish() {
    setPhase("finished");
    submitMutation.mutate();
  }

  function start() {
    // Resuming a game whose every answer was already recorded (e.g. the submit
    // request was lost) — nothing left to play, just score it.
    if (questionIndex >= total || over) {
      finish();
      return;
    }
    setPhase("playing");
    // Start screens can be taller than the viewport — bring the HUD into view.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function answer(selectedIndex: number) {
    if (feedback || answerMutation.isPending) return;
    const index = questionIndex;
    answerMutation.mutate(
      { questionIndex: index, selectedIndex, extras: answerExtras?.() },
      {
        onSuccess: (result) => {
          answersRef.current[index] = selectedIndex;
          const xpGained = Math.max(0, result.xp_earned - xpEarned);
          setFeedback({ selectedIndex, result, xpGained });
          setXpEarned(result.xp_earned);
          setCorrectCount(result.correct_count);
          if (isGameOver?.(result)) setOver(true);
          onAnswered?.(result, index, xpGained);
        },
      },
    );
  }

  function goNext() {
    setFeedback(null);
    answerMutation.reset();
    if (questionIndex + 1 >= total || over) {
      finish();
    } else {
      setQuestionIndex((i) => i + 1);
    }
  }

  /** A fresh game of the same kind (and level). The new page skips its
   * intro and starts straight away — see `autoStart`. */
  function playAgain() {
    api
      .post<GameSession>("/games/", {
        subject: session.subject,
        game_type: session.game_type,
        ...(session.difficulty ? { difficulty: session.difficulty } : {}),
      })
      .then(({ data }) => navigate(`/student/games/${data.id}`, { replace: true, state: { autoStart: true } }))
      .catch(() => {});
  }

  function optionState(index: number): GameOptionState {
    if (!feedback) {
      return answerMutation.isPending && answerMutation.variables?.selectedIndex === index ? "selected" : "default";
    }
    if (index === feedback.result.correct_index) return "correct";
    if (index === feedback.selectedIndex) return "incorrect";
    return "default";
  }

  /** The completed session to show on the result screen, once the server has scored it. */
  const finalSession = submitMutation.data ?? (session.status === "COMPLETED" ? session : null);

  return {
    total,
    phase,
    start,
    questionsQuery,
    /** The session's subject has no questions in the bank — an empty state to
     * show, not a failure to retry. See `lib/gameErrors`. */
    questionsUnavailable: isNoQuestionsError(questionsQuery.error),
    question: questionsQuery.data?.[questionIndex],
    questionIndex,
    /** Questions answered so far, counting the one whose feedback is showing. */
    answered: questionIndex + (feedback ? 1 : 0),
    isLastQuestion: questionIndex + 1 >= total || over,
    correctCount,
    xpEarned,
    elapsed,
    feedback,
    answer,
    answerPending: answerMutation.isPending,
    answerError: answerMutation.isError,
    optionState,
    goNext,
    submitMutation,
    finalSession,
    playAgain,
    /** Arrived here through "play again" — the game may skip its intro screen. */
    autoStart: Boolean((location.state as { autoStart?: boolean } | null)?.autoStart),
  };
}

/** Seconds a finished game took — the live stopwatch if it was played in this
 * page load, otherwise the server's start→completion span. */
export function playedSeconds(elapsed: number, session: GameSession | null): number {
  if (elapsed > 0 || !session?.completed_at) return elapsed;
  return (new Date(session.completed_at).getTime() - new Date(session.created_at).getTime()) / 1000;
}
