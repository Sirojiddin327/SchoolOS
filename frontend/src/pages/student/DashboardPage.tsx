import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";

import { LessonList } from "../../components/LessonList";
import { ProgressBar } from "../../components/ProgressBar";
import { StatCard } from "../../components/StatCard";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
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
    <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-6 lg:col-span-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            {level}-daraja
          </p>
          <p className="mt-1 text-4xl font-bold tabular-nums text-slate-900">
            {animatedXp} <span className="text-lg font-medium text-slate-400">XP</span>
          </p>
        </div>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-white">
          {level}
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs text-slate-500">
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-amber-100 bg-amber-50/60 p-6 text-center">
      <p className="text-4xl">🔥</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-amber-700">{streak?.current_streak ?? 0}</p>
      <p className="text-xs font-medium text-amber-700">kunlik faollik seriyasi</p>
      {streak && streak.longest_streak > streak.current_streak && (
        <p className="mt-1 text-xs text-amber-500">Eng uzuni: {streak.longest_streak} kun</p>
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

  const unlockedAchievements = [...(achievements ?? [])]
    .filter((a) => a.unlocked)
    .sort((a, b) => (b.unlocked_at ?? "").localeCompare(a.unlocked_at ?? ""))
    .slice(0, 3);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Salom, {user?.first_name || user?.username}!{" "}
          <span className="inline-block origin-[70%_70%] animate-wave">👋</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">Bugun ham bilim sari bir qadam.</p>
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
        />
        <StatCard
          label="Umumiy reyting"
          value={rank?.rank ? `#${rank.rank}` : "—"}
          hint={rank ? `${rank.total_students} o'quvchidan` : undefined}
        />
        <StatCard label="Bajarilgan testlar" value={completedTestCount} />
        <StatCard label="O'qilmagan xabarlar" value={data?.unread_notifications ?? 0} />
      </div>

      {data && !data.school_class && (
        <EmptyState
          title="Siz hali biror sinfga biriktirilmagansiz"
          description="Direktor sizni sinfga qo'shgach, darslaringiz shu yerda ko'rinadi."
        />
      )}

      {data && data.school_class && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Bugungi darslar</h2>
          <LessonList lessons={data.today_lessons} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Yaqin testlar</h2>
            <Link to="/student/tests" className="text-xs font-medium text-brand-600 hover:underline">
              Hammasi →
            </Link>
          </div>
          {upcomingTests.length === 0 ? (
            <EmptyState title="Hozircha yangi test yo'q" />
          ) : (
            <div className="space-y-2">
              {upcomingTests.map((test) => (
                <Link
                  key={test.id}
                  to={`/student/tests/${test.id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-brand-200"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{test.title}</p>
                    <p className="text-xs text-slate-500">
                      {test.subject_name} · maks {test.max_xp} XP
                    </p>
                  </div>
                  <span className="text-brand-600">→</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Yaqin topshiriqlar</h2>
            <Link to="/student/activities" className="text-xs font-medium text-brand-600 hover:underline">
              Hammasi →
            </Link>
          </div>
          {(activities?.results.length ?? 0) === 0 ? (
            <EmptyState title="Hozircha topshiriq yo'q" />
          ) : (
            <div className="space-y-2">
              {(activities?.results ?? []).slice(0, 3).map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{activity.title}</p>
                    <p className="text-xs text-slate-500">
                      {activity.subject_name} · maks {activity.max_xp} XP
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">So'nggi yutuqlar</h2>
          <Link to="/student/achievements" className="text-xs font-medium text-brand-600 hover:underline">
            Hammasi →
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
                className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3"
              >
                <span className="text-2xl">{achievement.icon || "🏆"}</span>
                <div>
                  <p className="text-sm font-medium text-slate-800">{achievement.name}</p>
                  {achievement.unlocked_at && (
                    <p className="text-xs text-slate-500">
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
        <h2 className="mb-3 text-sm font-semibold text-slate-700">XP tarixi (so'nggi 7 kun)</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
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
  );
}
