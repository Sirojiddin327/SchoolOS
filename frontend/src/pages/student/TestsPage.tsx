import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { Paginated, TestAttempt, TestSummary } from "../../types";

export function StudentTestsPage() {
  const { data: tests, isLoading, isError } = useQuery({
    queryKey: ["tests", "student"],
    queryFn: async () => (await api.get<Paginated<TestSummary>>("/tests/")).data,
  });
  const { data: attempts } = useQuery({
    queryKey: ["my-attempts"],
    queryFn: async () => (await api.get<Paginated<TestAttempt>>("/my-attempts/")).data,
  });

  const attemptByTest = new Map((attempts?.results ?? []).map((a) => [a.test, a]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Testlar</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sinfingiz uchun e'lon qilingan testlar.</p>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {tests && tests.results.length === 0 && (
        <EmptyState title="Hozircha testlar yo'q" description="Yangi test e'lon qilinganda shu yerda ko'rinadi." />
      )}

      {tests && tests.results.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tests.results.map((test) => {
            const attempt = attemptByTest.get(test.id);
            const isDone = attempt?.status === "SUBMITTED";
            return (
              <div key={test.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs font-medium uppercase tracking-wide text-brand-600 dark:text-brand-400">
                  {test.subject_name}
                </p>
                <h2 className="mt-1 font-semibold text-slate-900 dark:text-slate-50">{test.title}</h2>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>{test.question_count} ta savol</span>
                  <span>Maks. {test.max_xp} XP</span>
                  {test.time_limit_minutes && <span>{test.time_limit_minutes} daqiqa</span>}
                </div>

                <div className="mt-4 flex-1" />

                {isDone ? (
                  <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" /> Bajarildi: {attempt.score_percent?.toFixed(0)}% •{" "}
                    {attempt.xp_awarded} XP
                  </div>
                ) : (
                  <Link
                    to={`/student/tests/${test.id}`}
                    className="rounded-md bg-brand-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    {attempt ? "Davom ettirish" : "Boshlash"}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
