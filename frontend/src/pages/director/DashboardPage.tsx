import { useQuery } from "@tanstack/react-query";
import {
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  Medal,
  School,
  Settings,
  Trophy,
  UserX,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";

import { StatCard } from "../../components/StatCard";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { ClassLeaderboardEntry, DirectorDashboard } from "../../types";

const MEDAL_TONE: Record<number, string> = {
  1: "text-amber-500",
  2: "text-slate-400",
  3: "text-orange-600",
};

const QUICK_LINKS = [
  { to: "/director/attendance", label: "Davomat hisoboti", icon: ClipboardCheck },
  { to: "/director/rankings", label: "XP va reyting", icon: Trophy },
  { to: "/director/achievements", label: "Yutuqlar", icon: Award },
  { to: "/director/settings", label: "Sozlamalar", icon: Settings },
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
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Direktor paneli</h1>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}

      {data && (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Maktab statistikasi</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Jami o'quvchilar" value={data.total_students} to="/director/students" icon={Users} tone="brand" />
              <StatCard label="Jami o'qituvchilar" value={data.total_teachers} to="/director/teachers" icon={GraduationCap} tone="violet" />
              <StatCard label="Jami sinflar" value={data.total_classes} to="/director/classes" icon={School} tone="amber" />
              <StatCard label="Bugungi darslar" value={data.today_lessons} to="/director/lessons" icon={CalendarDays} tone="emerald" />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Bugungi davomat</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Keldi" value={data.today_attendance.present} icon={CheckCircle2} tone="emerald" />
              <StatCard label="Kechikdi" value={data.today_attendance.late} icon={Clock} tone="amber" />
              <StatCard label="Kelmadi" value={data.today_attendance.absent} icon={UserX} tone="rose" />
              <StatCard label="Sababli" value={data.today_attendance.excused} icon={ClipboardCheck} tone="brand" />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">O'quv faolligi</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Jami testlar" value={data.total_tests} to="/director/tests" icon={FileText} tone="brand" />
              <StatCard label="Jami topshiriqlar" value={data.total_activities} to="/director/activities" icon={ClipboardList} tone="violet" />
              <StatCard label="Berilgan XP" value={data.total_xp_awarded} to="/director/rankings" icon={Trophy} tone="amber" />
              <StatCard
                label="Yetakchi sinf"
                value={data.top_class ? data.top_class.name : "—"}
                hint={data.top_class ? `${data.top_class.total_xp} XP` : undefined}
                to="/director/rankings"
                icon={BookOpen}
                tone="emerald"
              />
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sinflar reytingi</h2>
              <Link
                to="/director/rankings"
                className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Hammasi <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {topClasses.length === 0 ? (
              <EmptyState title="Hali XP ma'lumoti yo'q" />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                {topClasses.map((entry) => (
                  <div
                    key={entry.rank}
                    className="flex items-center justify-between border-b border-slate-100 px-5 py-3 last:border-0 dark:border-slate-800"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex w-6 justify-center text-slate-500 dark:text-slate-400">
                        {MEDAL_TONE[entry.rank] ? (
                          <Medal className={`h-4 w-4 ${MEDAL_TONE[entry.rank]}`} />
                        ) : (
                          entry.rank
                        )}
                      </span>
                      <span className="font-medium text-slate-800 dark:text-slate-100">{entry.name}</span>
                    </div>
                    <span className="font-semibold text-brand-700 dark:text-brand-400">{entry.total_xp} XP</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Tezkor havolalar</h2>
            <div className="flex flex-wrap gap-2">
              {QUICK_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <link.icon size={15} />
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
