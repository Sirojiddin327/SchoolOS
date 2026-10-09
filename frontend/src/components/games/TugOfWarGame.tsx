import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Flag, Swords, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { isNoQuestionsError, NO_QUESTIONS_HINT, NO_QUESTIONS_TITLE } from "../../lib/gameErrors";
import { EmptyState } from "../states";
import type { GameQuestion, GameSession } from "../../types";
import {
  AnimatedNumber,
  GameHeaderBar,
  GameHudStat,
  GameInlineError,
  GameOptionButton,
  GameQuestionCard,
  GameResultScreen,
  type GameResultTone,
} from "./GameUI";
import { RopeArena } from "./RopeArena";

// Must track the backend's `MAX_GAME_XP` / question count (apps/games/services.py) —
// there's no API field for either, so the live in-game estimate is computed the same way.
const MAX_GAME_XP = 25;
const QUESTION_SECONDS = 15;
const PULL_STEP = 11;
const START_POSITION = 50;

type Phase =
  | { kind: "start" }
  | { kind: "countdown"; n: number }
  | { kind: "playing" }
  | { kind: "feedback"; correct: boolean }
  | { kind: "finished" };

export function TugOfWarGame({ session }: { session: GameSession }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>({ kind: "start" });
  const [questionIndex, setQuestionIndex] = useState(0);
  const [position, setPosition] = useState(START_POSITION);
  const [correctCount, setCorrectCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(QUESTION_SECONDS);
  const [answerError, setAnswerError] = useState(false);
  const answersRef = useRef<Record<number, number>>({});

  const questionsQuery = useQuery({
    queryKey: ["game", session.id, "questions"],
    queryFn: async () => (await api.get<GameQuestion[]>(`/games/${session.id}/questions/`)).data,
    enabled: session.status === "ACTIVE",
    retry: false,
  });

  const checkAnswer = useMutation({
    mutationFn: async (vars: { questionIndex: number; selectedIndex: number }) =>
      (
        await api.post<{ correct: boolean }>(`/games/${session.id}/answer/`, {
          question_index: vars.questionIndex,
          selected_index: vars.selectedIndex,
        })
      ).data.correct,
    retry: 1,
  });

  const submitMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post<GameSession>(`/games/${session.id}/submit/`, {
          answers: Object.entries(answersRef.current).map(([question_index, selected_index]) => ({
            question_index: Number(question_index),
            selected_index,
          })),
        })
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
    retry: 2,
  });

  const total = questionsQuery.data?.length ?? 0;

  // Countdown before the first question.
  useEffect(() => {
    if (phase.kind !== "countdown") return;
    if (phase.n === 0) return;
    const t = setTimeout(
      () => setPhase(phase.n === 1 ? { kind: "playing" } : { kind: "countdown", n: phase.n - 1 }),
      700,
    );
    return () => clearTimeout(t);
  }, [phase]);

  // Per-question timer.
  useEffect(() => {
    if (phase.kind !== "playing") return;
    if (timeLeft <= 0) {
      handleAnswer(-1);
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleAnswer is stable for this render's questionIndex
  }, [phase, timeLeft]);

  function handleAnswer(selectedIndex: number) {
    if (phase.kind !== "playing") return;
    setAnswerError(false);
    checkAnswer.mutate(
      { questionIndex, selectedIndex },
      {
        onSuccess: (correct) => {
          answersRef.current[questionIndex] = selectedIndex;
          setCorrectCount((c) => c + (correct ? 1 : 0));
          setPosition((p) => Math.min(100, Math.max(0, p + (correct ? -PULL_STEP : PULL_STEP))));
          setPhase({ kind: "feedback", correct });

          setTimeout(() => {
            const isLast = questionIndex + 1 >= total;
            if (isLast) {
              setPhase({ kind: "finished" });
              submitMutation.mutate();
            } else {
              setQuestionIndex((i) => i + 1);
              setTimeLeft(QUESTION_SECONDS);
              setPhase({ kind: "playing" });
            }
          }, 900);
        },
        onError: () => setAnswerError(true),
      },
    );
  }

  function playAgain() {
    api
      .post<GameSession>("/games/", { subject: session.subject, game_type: session.game_type })
      .then(({ data }) => navigate(`/student/games/${data.id}`, { replace: true }))
      .catch(() => {});
  }

  const liveXp = total > 0 ? Math.round((MAX_GAME_XP * correctCount) / total) : 0;

  if (phase.kind === "start") {
    return (
      <StartScreen
        session={session}
        loading={questionsQuery.isLoading}
        error={questionsQuery.isError}
        onStart={() => setPhase({ kind: "countdown", n: 3 })}
      />
    );
  }

  if (phase.kind === "finished") {
    const tone: GameResultTone = position < START_POSITION ? "win" : position > START_POSITION ? "lose" : "draw";
    const xpAwarded = submitMutation.data?.xp_awarded ?? liveXp;
    return (
      <GameResultScreen
        remedialSessionId={submitMutation.data?.remedial_session_id}
        tone={tone}
        title={RESULT_TITLE[tone]}
        subtitle={RESULT_SUBTITLE[tone]}
        stats={[
          { label: "Natija", value: `${correctCount}/${total || "…"}` },
          {
            label: "Olingan XP",
            value: submitMutation.isPending ? (
              "…"
            ) : submitMutation.isError ? (
              "—"
            ) : (
              <AnimatedNumber value={xpAwarded} prefix="+" />
            ),
            tone: "amber",
          },
        ]}
        errorMessage={
          submitMutation.isError ? "Natijalar saqlanmadi — internet aloqasi uzilgan bo'lishi mumkin." : undefined
        }
        onRetry={() => submitMutation.mutate()}
        onPrimary={playAgain}
      />
    );
  }

  const question = questionsQuery.data?.[questionIndex];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <GameHeaderBar title={`${session.subject_name} · ${session.game_type_display}`} totalXp={user?.total_xp ?? 0} />

      <div className="grid grid-cols-3 items-center gap-2 text-center">
        <GameHudStat
          icon={Swords}
          label="Bosqich"
          value={`${Math.min(questionIndex + 1, total || 1)}/${total || "…"}`}
        />
        <GameHudStat icon={Flag} label="To'g'ri" value={`${correctCount}`} tone="emerald" />
        <GameHudStat icon={Zap} label="Bu o'yinda" value={`+${liveXp} XP`} tone="amber" />
      </div>

      <div className="relative">
        <RopeArena position={position} active={phase.kind === "feedback"} />
        {phase.kind === "countdown" && <CountdownOverlay n={phase.n} />}
      </div>

      <TimerBar timeLeft={timeLeft} playing={phase.kind === "playing"} />

      {questionsQuery.isLoading && (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">O'yin tayyorlanmoqda...</p>
      )}
      {questionsQuery.isError && isNoQuestionsError(questionsQuery.error) && (
        <EmptyState title={NO_QUESTIONS_TITLE} description={NO_QUESTIONS_HINT} />
      )}
      {questionsQuery.isError && !isNoQuestionsError(questionsQuery.error) && (
        <GameInlineError>Savollar hozircha tayyor emas. Birozdan so'ng qayta urinib ko'ring.</GameInlineError>
      )}

      {answerError && (
        <p className="text-center text-xs font-medium text-red-600 dark:text-red-400">
          Javobni yuborishda xatolik yuz berdi, qayta urinib ko'rmoqda...
        </p>
      )}

      {question && (
        <GameQuestionCard>
          <p className="text-base font-semibold text-slate-900 dark:text-slate-50">{question.text}</p>
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {question.options.map((option, i) => {
              const isFeedback = phase.kind === "feedback";
              const wasPicked = isFeedback && answersRef.current[questionIndex] === i;
              const state = wasPicked
                ? phase.kind === "feedback" && phase.correct
                  ? "correct"
                  : "incorrect"
                : "default";
              return (
                <GameOptionButton
                  key={option}
                  index={i}
                  text={option}
                  state={state}
                  disabled={isFeedback}
                  onClick={() => handleAnswer(i)}
                />
              );
            })}
          </div>
        </GameQuestionCard>
      )}
    </div>
  );
}

const RESULT_TITLE: Record<GameResultTone, string> = {
  win: "G'alaba!",
  draw: "Durang",
  lose: "Mag'lubiyat",
  neutral: "Yakunlandi",
};

const RESULT_SUBTITLE: Record<GameResultTone, string> = {
  win: "Arqonni o'zingizga tortib oldingiz.",
  draw: "Arqon markazda to'xtadi — teng kuchda o'yin bo'ldi.",
  lose: "AI bu safar kuchliroq chiqdi. Yana urinib ko'ring!",
  neutral: "",
};

function TimerBar({ timeLeft, playing }: { timeLeft: number; playing: boolean }) {
  const percent = Math.max(0, Math.min(100, (timeLeft / QUESTION_SECONDS) * 100));
  const urgent = timeLeft <= 5;
  return (
    <div className="flex items-center gap-2">
      <Clock size={14} className={urgent ? "text-red-500" : "text-slate-400 dark:text-slate-500"} />
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
            urgent ? "bg-red-500" : "bg-brand-500"
          }`}
          style={{ width: playing ? `${percent}%` : "100%" }}
        />
      </div>
    </div>
  );
}

function CountdownOverlay({ n }: { n: number }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/70">
      <span key={n} className="animate-pop-in text-6xl font-black text-white">
        {n === 0 ? "Boshla!" : n}
      </span>
    </div>
  );
}

function StartScreen({
  session,
  loading,
  error,
  onStart,
}: {
  session: GameSession;
  loading: boolean;
  error: boolean;
  onStart: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg space-y-5 text-center">
      <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 p-8">
        <Swords className="mx-auto h-10 w-10 text-white/80" />
        <h1 className="mt-3 text-2xl font-bold text-white">Arqon tortish</h1>
        <p className="mt-1 text-sm text-slate-400">
          {session.subject_name} bo'yicha savollarga to'g'ri javob berib, arqonni AI raqibingizdan torting.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 text-left sm:grid-cols-3">
        <Rule text="To'g'ri javob — arqonni o'zingizga torting" tone="emerald" />
        <Rule text="Noto'g'ri javob yoki vaqt tugashi — AI ustunlik oladi" tone="amber" />
        <Rule text="8 bosqichdan so'ng ko'proq tortgan g'olib bo'ladi" tone="brand" />
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Savollar hozircha tayyor emas. Sahifani yangilab qayta urinib ko'ring.
        </p>
      )}
      <button
        onClick={onStart}
        disabled={loading || error}
        className="w-full rounded-xl bg-brand-600 py-3 text-sm font-bold text-white shadow-sm transition-transform hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Tayyorlanmoqda..." : "Boshlash"}
      </button>
    </div>
  );
}

function Rule({ text, tone }: { text: string; tone: "emerald" | "amber" | "brand" }) {
  const dot = { emerald: "bg-emerald-500", amber: "bg-amber-500", brand: "bg-brand-500" }[tone];
  return (
    <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <p className="text-xs text-slate-600 dark:text-slate-300">{text}</p>
    </div>
  );
}
