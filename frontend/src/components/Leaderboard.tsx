import { useQuery } from "@tanstack/react-query";
import { Medal } from "lucide-react";
import { useState } from "react";

import { api } from "../lib/api";
import type { ClassLeaderboardEntry, StudentLeaderboardEntry } from "../types";
import { EmptyState, ErrorState, LoadingState } from "./states";

const MEDAL_TONE: Record<number, string> = {
  1: "text-amber-500",
  2: "text-slate-400",
  3: "text-orange-600",
};

function RankBadge({ rank }: { rank: number }) {
  const tone = MEDAL_TONE[rank];
  return (
    <span className="inline-flex w-8 justify-center font-semibold text-slate-500 dark:text-slate-400">
      {tone ? <Medal className={`h-4 w-4 ${tone}`} /> : rank}
    </span>
  );
}

export function Leaderboard() {
  const [tab, setTab] = useState<"students" | "classes">("students");

  const studentsQuery = useQuery({
    queryKey: ["leaderboard", "students"],
    queryFn: async () => (await api.get<StudentLeaderboardEntry[]>("/leaderboard/students/")).data,
    enabled: tab === "students",
  });
  const classesQuery = useQuery({
    queryKey: ["leaderboard", "classes"],
    queryFn: async () => (await api.get<ClassLeaderboardEntry[]>("/leaderboard/classes/")).data,
    enabled: tab === "classes",
  });

  const query = tab === "students" ? studentsQuery : classesQuery;

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm dark:border-slate-800 dark:bg-slate-900">
        {(["students", "classes"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              tab === value
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {value === "students" ? "O'quvchilar" : "Sinflar"}
          </button>
        ))}
      </div>

      {query.isLoading && <LoadingState />}
      {query.isError && <ErrorState />}
      {query.data && query.data.length === 0 && <EmptyState title="Reyting hali bo'sh" />}

      {query.data && query.data.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">O'rin</th>
                <th className="px-4 py-3 font-medium">Nomi</th>
                {tab === "students" && <th className="px-4 py-3 font-medium">Sinf</th>}
                <th className="px-4 py-3 font-medium text-right">XP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {tab === "students"
                ? (studentsQuery.data ?? []).map((entry) => (
                    <tr key={entry.rank}>
                      <td className="px-4 py-3">
                        <RankBadge rank={entry.rank} />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{entry.name}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{entry.school_class_name ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-brand-700 dark:text-brand-300">
                        {entry.total_xp}
                      </td>
                    </tr>
                  ))
                : (classesQuery.data ?? []).map((entry) => (
                    <tr key={entry.rank}>
                      <td className="px-4 py-3">
                        <RankBadge rank={entry.rank} />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{entry.name}</td>
                      <td className="px-4 py-3 text-right font-semibold text-brand-700 dark:text-brand-300">
                        {entry.total_xp}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
