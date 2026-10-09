import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, PartyPopper, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { AchievementUnlockCard } from "../../components/AchievementUnlockCard";
import { PrimaryButton } from "../../components/form";
import { ErrorState, LoadingState } from "../../components/states";
import { markAchievementsCelebrated } from "../../lib/achievementCelebration";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { getLevelInfo } from "../../lib/gamification";
import { useCountUp } from "../../lib/useCountUp";
import type { Achievement, TestAttempt, TestDetail } from "../../types";

function useCountdown(startedAt: string | undefined, timeLimitMinutes: number | null | undefined) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt || !timeLimitMinutes) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [startedAt, timeLimitMinutes]);

  if (!startedAt || !timeLimitMinutes) return null;
  const deadline = new Date(startedAt).getTime() + timeLimitMinutes * 60_000;
  return Math.max(0, Math.round((deadline - nowMs) / 1000));
}

export function StudentTestTakingPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [leveledUp, setLeveledUp] = useState(false);
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);

  const beforeXpRef = useRef(user?.total_xp ?? 0);
  const beforeUnlockedIdsRef = useRef<Set<number> | null>(null);

  useEffect(() => {
    api
      .get<Achievement[]>("/achievements/")
      .then(({ data }) => {
        beforeUnlockedIdsRef.current = new Set(data.filter((a) => a.unlocked).map((a) => a.id));
      })
      .catch(() => {
        beforeUnlockedIdsRef.current = new Set();
      });
  }, []);

  const { data: test, isLoading, isError } = useQuery({
    queryKey: ["test", id],
    queryFn: async () => (await api.get<TestDetail>(`/tests/${id}/`)).data,
    enabled: Boolean(id),
  });

  const startMutation = useMutation({
    mutationFn: async () => (await api.post<TestAttempt>(`/tests/${id}/start/`)).data,
  });

  useEffect(() => {
    if (id) startMutation.mutate();
    // Only once per test id — starting again is a harmless no-op server-side, but
    // re-running on every render would spam the endpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const attempt = startMutation.data;
  const remainingSeconds = useCountdown(attempt?.started_at, test?.time_limit_minutes);

  const submitMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post<TestAttempt>(`/tests/${id}/submit/`, {
          answers: Object.entries(answers).map(([question, selected_option]) => ({
            question: Number(question),
            selected_option,
          })),
        })
      ).data,
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ["my-attempts"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });

      const afterXp = beforeXpRef.current + (result.xp_awarded ?? 0);
      setLeveledUp(getLevelInfo(beforeXpRef.current).level !== getLevelInfo(afterXp).level);

      const beforeIds = beforeUnlockedIdsRef.current;
      if (beforeIds) {
        try {
          const { data: afterAchievements } = await api.get<Achievement[]>("/achievements/");
          const fresh = afterAchievements.filter((a) => a.unlocked && !beforeIds.has(a.id));
          setNewlyUnlocked(fresh);
          markAchievementsCelebrated(fresh.map((a) => a.id));
        } catch {
          // Achievement-unlock celebration is a nice-to-have — a failed refetch
          // here should never block showing the student their test result.
        }
      }
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: unknown } })?.response?.data;
      setError(typeof detail === "string" ? detail : "Yuborishda xatolik yuz berdi.");
    },
  });

  if (isLoading) return <LoadingState />;
  if (isError || !test) return <ErrorState />;

  const finished = submitMutation.data ?? (attempt?.status === "SUBMITTED" ? attempt : null);

  if (finished) {
    return <TestResult test={test} finished={finished} leveledUp={leveledUp} newlyUnlocked={newlyUnlocked} />;
  }

  const allAnswered = test.questions.every((q) => answers[q.id] !== undefined);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">{test.title}</h1>
          {test.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{test.description}</p>}
        </div>
        {remainingSeconds !== null && (
          <div
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold ${
              remainingSeconds === 0
                ? "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            {remainingSeconds === 0
              ? "Vaqt tugadi"
              : `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(
                  remainingSeconds % 60,
                ).padStart(2, "0")}`}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          submitMutation.mutate();
        }}
        className="space-y-5"
      >
        {test.questions.map((question, index) => (
          <div key={question.id} className="card p-5">
            <p className="font-medium text-slate-900 dark:text-slate-50">
              {index + 1}. {question.text}
            </p>
            <div className="mt-3 space-y-2">
              {question.options.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:border-slate-700 dark:hover:bg-slate-800 dark:has-[:checked]:bg-brand-500/10 dark:text-slate-200"
                >
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    checked={answers[question.id] === option.id}
                    onChange={() => setAnswers({ ...answers, [question.id]: option.id })}
                  />
                  {option.text}
                </label>
              ))}
            </div>
          </div>
        ))}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <PrimaryButton type="submit" disabled={!allAnswered || submitMutation.isPending} className="w-full">
          {submitMutation.isPending ? "Yuborilmoqda..." : "Testni yakunlash"}
        </PrimaryButton>
      </form>
    </div>
  );
}

function TestResult({
  test,
  finished,
  leveledUp,
  newlyUnlocked,
}: {
  test: TestDetail;
  finished: TestAttempt;
  leveledUp: boolean;
  newlyUnlocked: Achievement[];
}) {
  const animatedXp = useCountUp(finished.xp_awarded ?? 0, { startFrom: 0 });
  const animatedScore = useCountUp(Math.round(finished.score_percent ?? 0), { startFrom: 0 });

  return (
    <div className="mx-auto max-w-lg space-y-4 text-center">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">{test.title}</h1>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <p className="text-4xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{animatedScore}%</p>
        <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">+{animatedXp} XP qo'lga kiritdingiz!</p>
      </div>

      {finished.remedial_session_id && (
        <div className="animate-pop-in rounded-2xl border border-violet-200 bg-violet-50 p-5 text-left dark:border-violet-500/30 dark:bg-violet-500/10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" />
            <p className="font-semibold text-violet-700 dark:text-violet-300">Bu mavzuni birga mustahkamlaymizmi?</p>
          </div>
          <p className="mt-1 text-sm text-violet-700/80 dark:text-violet-300/80">
            Natijangiz past bo'ldi — AI ustoz mavzuni tushuntirib beradi, keyin arqon tortish o'yinida mashq qilasiz.
          </p>
          <Link
            to={`/student/remedial/${finished.remedial_session_id}`}
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Mashq qilishni boshlash
          </Link>
        </div>
      )}

      {leveledUp && (
        <div className="animate-pop-in rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-500/30 dark:bg-brand-500/10">
          <PartyPopper className="h-8 w-8 text-brand-600 dark:text-brand-400" />
          <p className="mt-1 font-semibold text-brand-700 dark:text-brand-300">Yangi darajaga chiqdingiz!</p>
        </div>
      )}

      {newlyUnlocked.map((achievement, index) => (
        <AchievementUnlockCard
          key={achievement.id}
          achievement={achievement}
          delayMs={(index + 1) * 120}
        />
      ))}

      <Link
        to="/student/tests"
        className="inline-flex items-center gap-0.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        <ChevronLeft className="h-4 w-4" /> Testlar ro'yxatiga qaytish
      </Link>
    </div>
  );
}
