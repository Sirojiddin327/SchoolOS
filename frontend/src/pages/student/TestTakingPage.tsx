import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { PrimaryButton } from "../../components/form";
import { ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { TestAttempt, TestDetail } from "../../types";

function useCountdown(startedAt: string | undefined, timeLimitMinutes: number | null | undefined) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!startedAt || !timeLimitMinutes) {
      setRemainingSeconds(null);
      return;
    }
    const deadline = new Date(startedAt).getTime() + timeLimitMinutes * 60_000;
    const tick = () => setRemainingSeconds(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, timeLimitMinutes]);

  return remainingSeconds;
}

export function StudentTestTakingPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-attempts"] });
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
    return (
      <div className="mx-auto max-w-lg space-y-4 text-center">
        <h1 className="text-xl font-bold text-slate-900">{test.title}</h1>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8">
          <p className="text-4xl font-bold text-emerald-700">{finished.score_percent?.toFixed(0)}%</p>
          <p className="mt-2 text-sm text-emerald-700">+{finished.xp_awarded} XP qo'lga kiritdingiz!</p>
        </div>
        <Link to="/student/tests" className="text-sm font-medium text-brand-600 hover:underline">
          ← Testlar ro'yxatiga qaytish
        </Link>
      </div>
    );
  }

  const allAnswered = test.questions.every((q) => answers[q.id] !== undefined);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{test.title}</h1>
          {test.description && <p className="mt-1 text-sm text-slate-500">{test.description}</p>}
        </div>
        {remainingSeconds !== null && (
          <div
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold ${
              remainingSeconds === 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
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
          <div key={question.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="font-medium text-slate-900">
              {index + 1}. {question.text}
            </p>
            <div className="mt-3 space-y-2">
              {question.options.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
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

        {error && <p className="text-sm text-red-600">{error}</p>}

        <PrimaryButton type="submit" disabled={!allAnswered || submitMutation.isPending} className="w-full">
          {submitMutation.isPending ? "Yuborilmoqda..." : "Testni yakunlash"}
        </PrimaryButton>
      </form>
    </div>
  );
}
