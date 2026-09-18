import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { LessonList } from "../../components/LessonList";
import { StatCard } from "../../components/StatCard";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type {
  ActivitySummary,
  Paginated,
  SchoolClass,
  TeacherDashboard,
  TestSummary,
  XPTransaction,
} from "../../types";

const SOURCE_LABEL: Record<XPTransaction["source"], string> = {
  TEST: "Test",
  ACTIVITY: "Topshiriq",
};

export function TeacherDashboardPage() {
  const { user } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "teacher"],
    queryFn: async () => (await api.get<TeacherDashboard>("/dashboard/teacher/")).data,
  });
  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await api.get<Paginated<SchoolClass>>("/classes/")).data,
  });
  const { data: tests } = useQuery({
    queryKey: ["tests", "teacher"],
    queryFn: async () => (await api.get<Paginated<TestSummary>>("/tests/")).data,
  });
  const { data: activities } = useQuery({
    queryKey: ["activities", "teacher"],
    queryFn: async () => (await api.get<Paginated<ActivitySummary>>("/activities/")).data,
  });
  const { data: history } = useQuery({
    queryKey: ["xp-history", "teacher", "recent"],
    queryFn: async () => (await api.get<Paginated<XPTransaction>>("/xp/history/")).data,
  });

  const pendingAttendanceCount = (data?.today_lessons ?? []).filter((l) => !l.attendance_marked).length;
  const recentResults = (history?.results ?? []).slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          Xush kelibsiz, {user?.first_name || user?.username}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Bugungi ish holatingiz.</p>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}

      {data && (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Bugungi darslar</h2>
            <LessonList lessons={data.today_lessons} />
          </section>

          {pendingAttendanceCount > 0 && (
            <Link
              to="/teacher/attendance"
              className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 transition-colors hover:bg-amber-100"
            >
              <p className="text-sm font-medium text-amber-800">
                {pendingAttendanceCount} ta darsda davomat hali belgilanmagan
              </p>
              <span className="text-amber-700">→</span>
            </Link>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Mening sinflarim" value={data.my_classes_count} />
            <StatCard label="Testlarim" value={tests?.results.length ?? 0} />
            <StatCard label="Topshiriqlarim" value={activities?.results.length ?? 0} />
            <StatCard label="O'qilmagan xabarlar" value={data.unread_notifications} />
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">So'nggi o'quvchi natijalari</h2>
              <Link to="/teacher/xp" className="text-xs font-medium text-brand-600 hover:underline">
                Hammasi →
              </Link>
            </div>
            {recentResults.length === 0 ? (
              <EmptyState title="Hali natija yo'q" />
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">O'quvchi</th>
                      <th className="px-4 py-3 font-medium">Manba</th>
                      <th className="px-4 py-3 font-medium text-right">XP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentResults.map((tx) => (
                      <tr key={tx.id}>
                        <td className="px-4 py-3 text-slate-700">{tx.student_name}</td>
                        <td className="px-4 py-3 text-slate-500">{SOURCE_LABEL[tx.source]}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                          +{tx.amount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {classes && classes.results.length === 0 && (
            <EmptyState title="Sizga hali sinf biriktirilmagan" />
          )}
        </>
      )}
    </div>
  );
}
