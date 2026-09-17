import { useQuery } from "@tanstack/react-query";

import { LessonList } from "../../components/LessonList";
import { StatCard } from "../../components/StatCard";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { StudentDashboard } from "../../types";

export function StudentDashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "student"],
    queryFn: async () => (await api.get<StudentDashboard>("/dashboard/student/")).data,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">O'quvchi paneli</h1>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}

      {data && !data.school_class && (
        <EmptyState
          title="Siz hali biror sinfga biriktirilmagansiz"
          description="Direktor sizni sinfga qo'shgach, darslaringiz shu yerda ko'rinadi."
        />
      )}

      {data && data.school_class && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Sinfim" value={data.school_class} />
            <StatCard label="Keldi" value={data.attendance_summary.present} />
            <StatCard label="Kechikdi" value={data.attendance_summary.late} />
            <StatCard label="Kelmadi" value={data.attendance_summary.absent} />
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Bugungi darslar</h2>
            <LessonList lessons={data.today_lessons} />
          </div>
        </>
      )}
    </div>
  );
}
