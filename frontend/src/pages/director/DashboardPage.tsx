import { useQuery } from "@tanstack/react-query";

import { StatCard } from "../../components/StatCard";
import { ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { DirectorDashboard } from "../../types";

export function DirectorDashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "director"],
    queryFn: async () => (await api.get<DirectorDashboard>("/dashboard/director/")).data,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Direktor paneli</h1>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Jami o'quvchilar" value={data.total_students} />
            <StatCard label="Jami o'qituvchilar" value={data.total_teachers} />
            <StatCard label="Jami sinflar" value={data.total_classes} />
            <StatCard label="Bugungi darslar" value={data.today_lessons} />
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Bugungi davomat</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Keldi" value={data.today_attendance.present} />
              <StatCard label="Kechikdi" value={data.today_attendance.late} />
              <StatCard label="Kelmadi" value={data.today_attendance.absent} />
              <StatCard label="Sababli" value={data.today_attendance.excused} />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">O'quv va motivatsiya</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Jami testlar" value={data.total_tests} />
              <StatCard label="Jami topshiriqlar" value={data.total_activities} />
              <StatCard label="Berilgan XP" value={data.total_xp_awarded} />
              <StatCard
                label="Yetakchi sinf"
                value={data.top_class ? data.top_class.name : "—"}
                hint={data.top_class ? `${data.top_class.total_xp} XP` : undefined}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
