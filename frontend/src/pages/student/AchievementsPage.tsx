import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";

import { ErrorState, LoadingState } from "../../components/states";
import { AchievementIcon } from "../../lib/achievementIcons";
import { api } from "../../lib/api";
import type { Achievement } from "../../types";

export function StudentAchievementsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["achievements"],
    queryFn: async () => (await api.get<Achievement[]>("/achievements/")).data,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Yutuqlarim</h1>
        {data && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {data.filter((a) => a.unlocked).length} / {data.length} yutuq ochilgan
          </p>
        )}
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}

      {data && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((achievement) => (
            <div
              key={achievement.id}
              className={`rounded-2xl border p-5 text-center ${
                achievement.unlocked
                  ? "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
                  : "border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-800/60"
              }`}
            >
              <span
                className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
                  achievement.unlocked
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                    : "bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500"
                }`}
              >
                {achievement.unlocked ? (
                  <AchievementIcon icon={achievement.icon} className="h-6 w-6" />
                ) : (
                  <Lock className="h-5 w-5" />
                )}
              </span>
              <p className="mt-2 font-semibold text-slate-900 dark:text-slate-50">{achievement.name}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{achievement.description}</p>
              {achievement.unlocked && achievement.unlocked_at && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  {new Date(achievement.unlocked_at).toLocaleDateString("uz-UZ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
