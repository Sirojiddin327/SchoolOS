import { useQuery } from "@tanstack/react-query";

import { StatCard } from "../../components/StatCard";
import { ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { Streak } from "../../types";

export function StudentStreakPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["streak", "me"],
    queryFn: async () => (await api.get<Streak>("/streaks/me/")).data,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Faollik seriyasi</h1>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}

      {data && (
        <>
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-8 text-center">
            <p className="text-5xl">🔥</p>
            <p className="mt-2 text-4xl font-bold text-orange-700">{data.current_streak}</p>
            <p className="mt-1 text-sm text-orange-700">kunlik joriy seriya</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Eng uzun seriya" value={`${data.longest_streak} kun`} />
            <StatCard
              label="Oxirgi faollik"
              value={
                data.last_activity_date
                  ? new Date(data.last_activity_date).toLocaleDateString("uz-UZ")
                  : "—"
              }
            />
          </div>

          <p className="text-sm text-slate-500">
            Seriyani davom ettirish uchun har kuni kamida bitta test yoki topshiriqni bajaring.
          </p>
        </>
      )}
    </div>
  );
}
