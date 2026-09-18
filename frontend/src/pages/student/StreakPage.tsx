import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Flame } from "lucide-react";

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
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Faollik seriyasi</h1>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}

      {data && (
        <>
          <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-8 text-center dark:border-orange-500/20 dark:from-orange-500/10 dark:to-amber-500/10">
            <Flame className="mx-auto h-12 w-12 text-orange-500" strokeWidth={1.75} />
            <p className="mt-2 text-4xl font-bold text-orange-700 dark:text-orange-400">{data.current_streak}</p>
            <p className="mt-1 text-sm text-orange-700 dark:text-orange-400">kunlik joriy seriya</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Eng uzun seriya" value={`${data.longest_streak} kun`} icon={Flame} tone="amber" />
            <StatCard
              label="Oxirgi faollik"
              value={
                data.last_activity_date
                  ? new Date(data.last_activity_date).toLocaleDateString("uz-UZ")
                  : "—"
              }
              icon={CalendarClock}
              tone="brand"
            />
          </div>

          <p className="text-sm text-slate-500 dark:text-slate-400">
            Seriyani davom ettirish uchun har kuni kamida bitta test yoki topshiriqni bajaring.
          </p>
        </>
      )}
    </div>
  );
}
