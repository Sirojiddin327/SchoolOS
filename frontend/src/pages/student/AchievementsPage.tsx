import { useQuery } from "@tanstack/react-query";

import { ErrorState, LoadingState } from "../../components/states";
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
        <h1 className="text-xl font-bold text-slate-900">Yutuqlarim</h1>
        {data && (
          <p className="mt-1 text-sm text-slate-500">
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
              className={`rounded-xl border p-5 text-center ${
                achievement.unlocked
                  ? "border-amber-200 bg-amber-50"
                  : "border-slate-200 bg-slate-50 opacity-60"
              }`}
            >
              <p className="text-3xl">{achievement.unlocked ? achievement.icon || "🏆" : "🔒"}</p>
              <p className="mt-2 font-semibold text-slate-900">{achievement.name}</p>
              <p className="mt-1 text-xs text-slate-500">{achievement.description}</p>
              {achievement.unlocked && achievement.unlocked_at && (
                <p className="mt-2 text-xs text-amber-700">
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
