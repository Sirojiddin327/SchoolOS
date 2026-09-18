import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { StatCard } from "../../components/StatCard";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { ClassLeaderboardEntry, DirectorDashboard } from "../../types";

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

const QUICK_LINKS = [
  { to: "/director/attendance", label: "Davomat hisoboti" },
  { to: "/director/rankings", label: "XP va reyting" },
  { to: "/director/achievements", label: "Yutuqlar" },
  { to: "/director/settings", label: "Sozlamalar" },
];

export function DirectorDashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "director"],
    queryFn: async () => (await api.get<DirectorDashboard>("/dashboard/director/")).data,
  });
  const { data: classLeaderboard } = useQuery({
    queryKey: ["leaderboard", "classes", "preview"],
    queryFn: async () => (await api.get<ClassLeaderboardEntry[]>("/leaderboard/classes/")).data,
  });

  const topClasses = (classLeaderboard ?? []).slice(0, 3);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold text-slate-900">Direktor paneli</h1>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}

      {data && (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Maktab statistikasi</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Jami o'quvchilar" value={data.total_students} to="/director/students" />
              <StatCard label="Jami o'qituvchilar" value={data.total_teachers} to="/director/teachers" />
              <StatCard label="Jami sinflar" value={data.total_classes} to="/director/classes" />
              <StatCard label="Bugungi darslar" value={data.today_lessons} to="/director/lessons" />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Bugungi davomat</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Keldi" value={data.today_attendance.present} />
              <StatCard label="Kechikdi" value={data.today_attendance.late} />
              <StatCard label="Kelmadi" value={data.today_attendance.absent} />
              <StatCard label="Sababli" value={data.today_attendance.excused} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">O'quv faolligi</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Jami testlar" value={data.total_tests} to="/director/tests" />
              <StatCard label="Jami topshiriqlar" value={data.total_activities} to="/director/activities" />
              <StatCard label="Berilgan XP" value={data.total_xp_awarded} to="/director/rankings" />
              <StatCard
                label="Yetakchi sinf"
                value={data.top_class ? data.top_class.name : "—"}
                hint={data.top_class ? `${data.top_class.total_xp} XP` : undefined}
                to="/director/rankings"
              />
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Sinflar reytingi</h2>
              <Link to="/director/rankings" className="text-xs font-medium text-brand-600 hover:underline">
                Hammasi →
              </Link>
            </div>
            {topClasses.length === 0 ? (
              <EmptyState title="Hali XP ma'lumoti yo'q" />
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {topClasses.map((entry) => (
                  <div
                    key={entry.rank}
                    className="flex items-center justify-between border-b border-slate-100 px-5 py-3 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center">{MEDAL[entry.rank] ?? entry.rank}</span>
                      <span className="font-medium text-slate-800">{entry.name}</span>
                    </div>
                    <span className="font-semibold text-brand-700">{entry.total_xp} XP</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Tezkor havolalar</h2>
            <div className="flex flex-wrap gap-2">
              {QUICK_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
