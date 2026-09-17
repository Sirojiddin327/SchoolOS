import { useQuery } from "@tanstack/react-query";

import { LessonList } from "../../components/LessonList";
import { StatCard } from "../../components/StatCard";
import { ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { TeacherDashboard } from "../../types";

export function TeacherDashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "teacher"],
    queryFn: async () => (await api.get<TeacherDashboard>("/dashboard/teacher/")).data,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">O'qituvchi paneli</h1>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <StatCard label="Bugungi darslar" value={data.today_lessons.length} />
            <StatCard label="Mening sinflarim" value={data.my_classes_count} />
            <StatCard label="O'qilmagan bildirishnomalar" value={data.unread_notifications} />
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
