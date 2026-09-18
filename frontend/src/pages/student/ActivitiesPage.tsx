import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Hourglass } from "lucide-react";
import { useState } from "react";

import { AchievementUnlockCard } from "../../components/AchievementUnlockCard";
import { PrimaryButton } from "../../components/form";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { useNewlyUnlockedAchievements } from "../../lib/achievementCelebration";
import { useNewlyGradedSubmissions } from "../../lib/activityResultCelebration";
import { api } from "../../lib/api";
import { useCountUp } from "../../lib/useCountUp";
import type { Achievement, ActivitySubmission, ActivitySummary, Paginated } from "../../types";

const TYPE_LABEL: Record<ActivitySummary["activity_type"], string> = {
  ASSIGNMENT: "Topshiriq",
  CHALLENGE: "Chellenj",
  TYPING: "Tez yozish",
  PRACTICAL: "Amaliy ish",
  SPORTS: "Sport",
};

function GradedCelebrationBanner({ submission, delayMs = 0 }: { submission: ActivitySubmission; delayMs?: number }) {
  const xp = useCountUp(submission.result?.xp_awarded ?? 0, { startFrom: 0 });

  return (
    <div
      className="animate-pop-in flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-500/30 dark:bg-emerald-500/10"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div>
        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">"{submission.activity_title}" baholandi!</p>
        <p className="text-xs text-emerald-600 dark:text-emerald-400">{submission.result?.score_percent.toFixed(0)}% ball</p>
      </div>
      <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">+{xp} XP</p>
    </div>
  );
}

function SubmissionForm({ activityId, onDone }: { activityId: number; onDone: () => void }) {
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      if (content) formData.append("content", content);
      if (file) formData.append("attachment", file);
      return (await api.post(`/activities/${activityId}/submit/`, formData)).data;
    },
    onSuccess: onDone,
    onError: () => setError("Topshirishda xatolik. Matn yoki fayl kiriting."),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        submit.mutate();
      }}
      className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800"
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Javobingizni shu yerga yozing..."
        rows={3}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-xs text-slate-500 dark:text-slate-400"
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <PrimaryButton type="submit" disabled={submit.isPending} className="w-full">
        {submit.isPending ? "Yuborilmoqda..." : "Topshirish"}
      </PrimaryButton>
    </form>
  );
}

export function StudentActivitiesPage() {
  const queryClient = useQueryClient();

  const { data: activities, isLoading, isError } = useQuery({
    queryKey: ["activities", "student"],
    queryFn: async () => (await api.get<Paginated<ActivitySummary>>("/activities/")).data,
  });
  const { data: submissions } = useQuery({
    queryKey: ["my-activity-submissions"],
    queryFn: async () =>
      (await api.get<Paginated<ActivitySubmission>>("/my-activity-submissions/")).data,
  });
  const { data: achievements } = useQuery({
    queryKey: ["achievements"],
    queryFn: async () => (await api.get<Achievement[]>("/achievements/")).data,
  });

  const newlyGraded = useNewlyGradedSubmissions(submissions?.results);
  const newlyUnlocked = useNewlyUnlockedAchievements(achievements);

  const submissionByActivity = new Map((submissions?.results ?? []).map((s) => [s.activity, s]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Topshiriqlar</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sinfingiz uchun e'lon qilingan topshiriq va challenjlar.</p>
      </div>

      {newlyGraded.length > 0 && (
        <div className="space-y-2">
          {newlyGraded.map((submission, index) => (
            <GradedCelebrationBanner key={submission.id} submission={submission} delayMs={index * 120} />
          ))}
        </div>
      )}
      {newlyUnlocked.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {newlyUnlocked.map((achievement, index) => (
            <AchievementUnlockCard key={achievement.id} achievement={achievement} delayMs={index * 120} />
          ))}
        </div>
      )}

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {activities && activities.results.length === 0 && (
        <EmptyState title="Hozircha topshiriq yo'q" />
      )}

      {activities && activities.results.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activities.results.map((activity) => {
            const submission = submissionByActivity.get(activity.id);
            return (
              <div key={activity.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs font-medium uppercase tracking-wide text-brand-600 dark:text-brand-400">
                  {TYPE_LABEL[activity.activity_type]} · {activity.subject_name}
                </p>
                <h2 className="mt-1 font-semibold text-slate-900 dark:text-slate-50">{activity.title}</h2>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Maks. {activity.max_xp} XP</p>

                {submission ? (
                  submission.result ? (
                    <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" /> {submission.result.score_percent.toFixed(0)}% •{" "}
                        {submission.result.xp_awarded} XP
                      </span>
                      {submission.result.feedback && (
                        <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">"{submission.result.feedback}"</p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                      <Hourglass className="h-4 w-4" /> Topshirildi, baholanmoqda
                    </div>
                  )
                ) : (
                  <SubmissionForm
                    activityId={activity.id}
                    onDone={() =>
                      queryClient.invalidateQueries({ queryKey: ["my-activity-submissions"] })
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
