import { useQuery } from "@tanstack/react-query";
import {
  Award,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Flame,
  Medal,
  Target,
} from "lucide-react";
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";

import { CircularProgress } from "../../components/CircularProgress";
import { GradientActionCard } from "../../components/GradientActionCard";
import { LessonList } from "../../components/LessonList";
import { ProgressBar } from "../../components/ProgressBar";
import { StatCard } from "../../components/StatCard";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { AchievementIcon } from "../../lib/achievementIcons";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { getLevelInfo } from "../../lib/gamification";
import { useCountUp } from "../../lib/useCountUp";
import type {
  Achievement,
  ActivitySummary,
  MyRank,
  Paginated,
  Streak,
  StudentDashboard,
  TestAttempt,
  TestSummary,
  XPTransaction,
} from "../../types";

const XpHistoryChart = lazy(() =>
  import("../../components/charts/XpHistoryChart").then((m) => ({ default: m.XpHistoryChart })),
);

function XpHeroCard({ totalXp }: { totalXp: number }) {
  const animatedXp = useCountUp(totalXp);
  const { level, xpIntoLevel, xpForNextLevel, progressPercent } = getLevelInfo(totalXp);
  const xpToGo = xpForNextLevel - xpIntoLevel;

  return (
    <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-6 lg:col-span-2 dark:border-brand-500/20 dark:from-brand-500/10 dark:to-slate-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
            {level}-daraja
          </p>
          <p className="mt-1 text-4xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
            {animatedXp} <span className="text-lg font-medium text-slate-400 dark:text-slate-500">XP</span>
          </p>
        </div>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-white shadow-sm">
          {level}
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            {xpIntoLevel} / {xpForNextLevel} XP
          </span>
          <span>{level + 1}-darajagacha {xpToGo} XP qoldi</span>
        </div>
        <ProgressBar value={progressPercent} tone="brand" />
      </div>
    </div>
  );
}

function StreakCard({ streak }: { streak: Streak | undefined }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-6 text-center dark:border-amber-500/20 dark:from-amber-500/10 dark:to-slate-900">
      <Flame className="h-10 w-10 text-amber-500" strokeWidth={1.75} />
      <p className="mt-1 text-3xl font-bold tabular-nums text-amber-700 dark:text-amber-400">{streak?.current_streak ?? 0}</p>
      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">kunlik faollik seriyasi</p>
      {streak && streak.longest_streak > streak.current_streak && (
        <p className="mt-1 text-xs text-amber-500 dark:text-amber-500/80">Eng uzuni: {streak.longest_streak} kun</p>
      )}
    </div>
  );
}

interface ChecklistEntry {
  key: string;
  title: string;
  subtitle: string;
  maxXp: number;
  to: string;
  icon: typeof FileText;
}

function TaskChecklistCard({ entries }: { entries: ChecklistEntry[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <Target size={16} className="text-brand-600 dark:text-brand-400" />
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Yaqin vazifalar</h2>
      </div>
      {entries.length === 0 ? (
        <EmptyState title="Hozircha yangi vazifa yo'q" />
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.key}>
              <Link
                to={entry.to}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 transition-colors hover:border-brand-200 hover:bg-brand-50/40 dark:border-slate-800 dark:hover:border-brand-500/30 dark:hover:bg-brand-500/5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <entry.icon size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{entry.title}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{entry.subtitle}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  +{entry.maxXp} XP
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StudentDashboardPage() {
  const { user } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "student"],
    queryFn: async () => (await api.get<StudentDashboard>("/dashboard/student/")).data,
  });
  const { data: streak } = useQuery({
    queryKey: ["streak", "me"],
    queryFn: async () => (await api.get<Streak>("/streaks/me/")).data,
  });
  const { data: rank } = useQuery({
    queryKey: ["rank", "me"],
    queryFn: async () => (await api.get<MyRank>("/leaderboard/me/")).data,
  });
  const { data: achievements } = useQuery({
    queryKey: ["achievements"],
    queryFn: async () => (await api.get<Achievement[]>("/achievements/")).data,
  });
  const { data: xpHistory } = useQuery({
    queryKey: ["xp-history", "me"],
    queryFn: async () => (await api.get<Paginated<XPTransaction>>("/xp/history/")).data,
  });
  const { data: tests } = useQuery({
    queryKey: ["tests", "student"],
    queryFn: async () => (await api.get<Paginated<TestSummary>>("/tests/")).data,
  });
  const { data: attempts } = useQuery({
    queryKey: ["my-attempts"],
    queryFn: async () => (await api.get<Paginated<TestAttempt>>("/my-attempts/")).data,
  });
  const { data: activities } = useQuery({
    queryKey: ["activities", "student"],
    queryFn: async () => (await api.get<Paginated<ActivitySummary>>("/activities/")).data,
  });

  const attemptedTestIds = new Set((attempts?.results ?? []).map((a) => a.test));
  const upcomingTests = (tests?.results ?? []).filter((t) => !attemptedTestIds.has(t.id)).slice(0, 3);
  const completedTestCount = (attempts?.results ?? []).filter((a) => a.status === "SUBMITTED").length;
  const totalTestCount = tests?.results.length ?? 0;
  const completionPercent = totalTestCount > 0 ? (completedTestCount / totalTestCount) * 100 : 0;

  const attendancePercent =
    data && data.attendance_summary.total > 0
      ? Math.round((data.attendance_summary.present / data.attendance_summary.total) * 100)
      : null;

  const unlockedAchievements = [...(achievements ?? [])]
    .filter((a) => a.unlocked)
    .sort((a, b) => (b.unlocked_at ?? "").localeCompare(a.unlocked_at ?? ""))
    .slice(0, 3);

  const upcomingActivities = (activities?.results ?? []).slice(0, 3);
  const checklistEntries: ChecklistEntry[] = [
    ...upcomingTests.map((test) => ({
      key: `test-${test.id}`,
      title: test.title,
      subtitle: test.subject_name,
      maxXp: test.max_xp,
      to: `/student/tests/${test.id}`,
      icon: FileText,
    })),
    ...upcomingActivities.map((activity) => ({
      key: `activity-${activity.id}`,
      title: activity.title,
      subtitle: activity.subject_name,
      maxXp: activity.max_xp,
      to: "/student/activities",
      icon: ClipboardList,
    })),
  ].slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
          Salom, {user?.first_name || user?.username}!
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Bugun ham bilim sari bir qadam.</p>
        {data && (data.school_class || attendancePercent !== null) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.school_class && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {data.school_class}
              </span>
            )}
            {attendancePercent !== null && (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                Davomat {attendancePercent}%
              </span>
            )}
          </div>
        )}
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <XpHeroCard totalXp={user?.total_xp ?? 0} />
        <StreakCard streak={streak} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Sinf reytingi"
          value={rank?.class_rank ? `#${rank.class_rank}` : "—"}
          hint={rank ? `${rank.total_classes} sinfdan` : undefined}
          icon={Medal}
          tone="violet"
        />
        <StatCard
          label="Umumiy reyting"
          value={rank?.rank ? `#${rank.rank}` : "—"}
          hint={rank ? `${rank.total_students} o'quvchidan` : undefined}
          icon={BarChart3}
          tone="brand"
        />
        <StatCard label="Bajarilgan testlar" value={completedTestCount} icon={CheckCircle2} tone="emerald" />
        <StatCard label="O'qilmagan xabarlar" value={data?.unread_notifications ?? 0} icon={Bell} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {upcomingTests.length > 0 && (
          <GradientActionCard
            icon={FileText}
            title={`Sizda ${upcomingTests.length} ta ochiq test bor`}
            subtitle="Hoziroq ishlab, natijangizni oshiring"
            to="/student/tests"
            tone="brand"
          />
        )}
        {data && data.today_lessons.length > 0 && (
          <GradientActionCard
            icon={CalendarDays}
            title={`Bugun ${data.today_lessons.length} ta darsingiz bor`}
            subtitle="Dars jadvalini ko'rib chiqing"
            to="/student/lessons"
            tone="amber"
          />
        )}
      </div>

      {data && !data.school_class && (
        <EmptyState
          title="Siz hali biror sinfga biriktirilmagansiz"
          description="Direktor sizni sinfga qo'shgach, darslaringiz shu yerda ko'rinadi."
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {data && data.school_class && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Bugungi darslar</h2>
              <LessonList lessons={data.today_lessons} />
            </section>
          )}

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">So'nggi yutuqlar</h2>
              <Link
                to="/student/achievements"
                className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Hammasi <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {unlockedAchievements.length === 0 ? (
              <EmptyState
                title="Hali yutuqlar yo'q"
                description="Test yoki topshiriqni bajarib birinchi yutuqingizni oching."
              />
            ) : (
              <div className="flex flex-wrap gap-3">
                {unlockedAchievements.map((achievement) => (
                  <div
                    key={achievement.id}
                    className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                      <AchievementIcon icon={achievement.icon} className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{achievement.name}</p>
                      {achievement.unlocked_at && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(achievement.unlocked_at).toLocaleDateString("uz-UZ")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">XP tarixi (so'nggi 7 kun)</h2>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              {xpHistory ? (
                <Suspense fallback={<LoadingState label="Yuklanmoqda..." />}>
                  <XpHistoryChart transactions={xpHistory.results} />
                </Suspense>
              ) : (
                <LoadingState label="Yuklanmoqda..." />
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <TaskChecklistCard entries={checklistEntries} />

          {totalTestCount > 0 && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-center dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-1 flex items-center gap-2 self-start">
                <Award size={16} className="text-brand-600 dark:text-brand-400" />
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">O'zlashtirish</h2>
              </div>
              <CircularProgress value={completionPercent} label="testlar" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {completedTestCount} / {totalTestCount} test bajarildi
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
