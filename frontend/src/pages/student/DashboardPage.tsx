import { useQuery } from "@tanstack/react-query";
import {
  Award,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardList,
  FileText,
  Flame,
  Medal,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";

import { CircularProgress } from "../../components/CircularProgress";
import { DashboardHero } from "../../components/DashboardHero";
import { GradientActionCard } from "../../components/GradientActionCard";
import { LeaderboardPodium } from "../../components/Leaderboard";
import { LessonList } from "../../components/LessonList";
import { ProgressBar } from "../../components/ProgressBar";
import { StatCard } from "../../components/StatCard";
import { Card, CardTitle, Section, SectionLink } from "../../components/Surface";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { AchievementIcon } from "../../lib/achievementIcons";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { getLevelInfo } from "../../lib/gamification";
import { fullName } from "../../lib/names";
import { useCountUp } from "../../lib/useCountUp";
import { TONE_CHIP, TONE_DOT, type Tone } from "../../lib/tones";
import type {
  Achievement,
  ActivitySummary,
  MyRank,
  Paginated,
  Streak,
  StudentDashboard,
  StudentLeaderboardEntry,
  TestAttempt,
  TestSummary,
  XPTransaction,
} from "../../types";

const XpHistoryChart = lazy(() =>
  import("../../components/charts/XpHistoryChart").then((m) => ({ default: m.XpHistoryChart })),
);

/**
 * Level and XP. The one card on this page allowed a tinted plane, because XP
 * is the metric the whole student experience is built around. Amber carries XP
 * consistently — top bar, history chart, task list.
 */
function XpHeroCard({ totalXp, xpToNextLevel }: { totalXp: number; xpToNextLevel: number | null }) {
  const animatedXp = useCountUp(totalXp);
  const { level, xpIntoLevel, xpForNextLevel, progressPercent } = getLevelInfo(totalXp);

  return (
    <Card tone="amber" className="relative overflow-hidden p-5 sm:p-6 lg:col-span-2">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="section-eyebrow">Umumiy XP</p>
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className="tabular text-4xl font-bold leading-none tracking-tight text-ink">
              {animatedXp}
            </span>
            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">XP</span>
          </p>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-xl font-bold text-white shadow-raise">
            {level}
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
            daraja
          </span>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-ink-muted">
          <span className="tabular">
            {xpIntoLevel} / {xpForNextLevel} XP
          </span>
          {xpToNextLevel !== null && (
            <span className="tabular">{level + 1}-darajagacha {xpToNextLevel} XP qoldi</span>
          )}
        </div>
        <ProgressBar value={progressPercent} tone="amber" size="lg" />
      </div>
    </Card>
  );
}

function StreakCard({ streak }: { streak: Streak | undefined }) {
  const current = streak?.current_streak ?? 0;
  const best = streak?.longest_streak ?? 0;
  return (
    <Card tone="orange" className="flex flex-col items-center justify-center p-5 text-center sm:p-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/12">
        <Flame size={24} className="text-orange-500" strokeWidth={1.9} />
      </div>
      <p className="tabular mt-2 text-3xl font-bold leading-none text-ink">{current}</p>
      <p className="mt-1.5 text-xs font-medium text-ink-muted">kunlik seriya</p>
      {best > current && <p className="tabular mt-1 text-[11px] text-ink-subtle">Rekor: {best} kun</p>}
    </Card>
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
  const totalXp = entries.reduce((sum, entry) => sum + entry.maxXp, 0);

  return (
    <section className="min-w-0">
      <CardTitle icon={Target} tone="violet">Yaqin vazifalar</CardTitle>
      {entries.length === 0 ? (
        <EmptyState
          title="Hozircha yangi vazifa yo'q"
          description="Yangi test yoki topshiriq qo'shilsa, shu yerda ko'rinadi."
        />
      ) : (
        <>
          <ul className="space-y-1.5">
            {entries.map((entry) => (
              <li key={entry.key}>
                <Link
                  to={entry.to}
                  className="hover-card flex items-center justify-between gap-3 rounded-xl border border-transparent px-2.5 py-2 hover:border-line hover:bg-surface-raised/60"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Circle size={15} className="shrink-0 text-ink-subtle" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{entry.title}</p>
                      <p className="truncate text-xs text-ink-subtle">{entry.subtitle}</p>
                    </div>
                  </div>
                  <span className="chip shrink-0 bg-amber-500/12 text-amber-700 dark:text-amber-300">
                    <span className="tabular">+{entry.maxXp}</span> XP
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line-soft pt-3 text-xs text-ink-subtle">
            <span className="tabular font-semibold text-ink-muted">{entries.length}</span> ta vazifa
            qoldi — jami{" "}
            <span className="tabular font-semibold text-amber-600 dark:text-amber-400">
              {totalXp} XP
            </span>{" "}
            to'plashingiz mumkin.
          </p>
        </>
      )}
    </section>
  );
}

function TopStudentsCard({ entries }: { entries: StudentLeaderboardEntry[] }) {
  return (
    <section className="min-w-0">
      <CardTitle
        icon={Trophy}
        tone="amber"
        action={
          <Link to="/student/leaderboard" className="link-more">
            Reyting
          </Link>
        }
      >
        Reyting yetakchilari
      </CardTitle>
      <LeaderboardPodium entries={entries} />
    </section>
  );
}

function AchievementsRow({ items }: { items: Achievement[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((achievement, i) => (
        <div
          key={achievement.id}
          className="rise card flex items-center gap-3 p-3.5"
          style={{ "--i": i } as React.CSSProperties}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/12">
            <AchievementIcon icon={achievement.icon} className="h-[18px] w-[18px] text-amber-500" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{achievement.name}</p>
            {achievement.unlocked_at && (
              <p className="text-[11px] text-ink-subtle">
                {new Date(achievement.unlocked_at).toLocaleDateString("uz-UZ")}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Rank/trophies block — violet, because ranking is the student's own progress. */
function RankCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Medal;
  tone: Tone;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${TONE_CHIP[tone]}`}>
          <Icon size={15} />
        </span>
        <p className="text-xs font-medium text-ink-muted">{label}</p>
      </div>
      <p className="tabular mt-2 text-2xl font-bold leading-none text-ink">{value}</p>
      {hint && <p className="mt-1.5 text-[11px] text-ink-subtle">{hint}</p>}
    </Card>
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
  const { data: topStudents } = useQuery({
    queryKey: ["leaderboard", "students"],
    queryFn: async () => (await api.get<StudentLeaderboardEntry[]>("/leaderboard/students/")).data,
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

  const { xpIntoLevel, xpForNextLevel } = getLevelInfo(user?.total_xp ?? 0);

  return (
    <div className="space-y-6">
      <DashboardHero
        name={fullName(user)}
        avatarSrc={user?.avatar_url}
        subtitle="Bugun ham bilim sari bir qadam."
        tone="violet"
        chips={[
          ...(data?.school_class ? [{ label: data.school_class, tone: "slate" as const }] : []),
          ...(attendancePercent !== null
            ? [{ label: `Davomat ${attendancePercent}%`, tone: "emerald" as const }]
            : []),
          ...(streak?.current_streak
            ? [{ label: `${streak.current_streak} kunlik seriya`, tone: "amber" as const }]
            : []),
        ]}
      />

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}

      {/* Row 1 — the number that matters, plus the daily streak and ranks. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <XpHeroCard
          totalXp={user?.total_xp ?? 0}
          xpToNextLevel={xpForNextLevel > xpIntoLevel ? xpForNextLevel - xpIntoLevel : null}
        />
        <StreakCard streak={streak} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <RankCard
          label="Sinf reytingi"
          value={rank?.class_rank ? `#${rank.class_rank}` : "—"}
          hint={rank ? `${rank.total_classes} sinfdan` : undefined}
          icon={Medal}
          tone="violet"
        />
        <RankCard
          label="Umumiy reyting"
          value={rank?.rank ? `#${rank.rank}` : "—"}
          hint={rank ? `${rank.total_students} o'quvchidan` : undefined}
          icon={BarChart3}
          tone="brand"
        />
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Testlar" value={`${completedTestCount}/${totalTestCount}`} icon={CheckCircle2} tone="emerald" />
          <StatCard label="Xabarlar" value={data?.unread_notifications ?? 0} icon={Bell} tone="amber" />
        </div>
      </div>

      {(upcomingTests.length > 0 || (data && data.today_lessons.length > 0)) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {upcomingTests.length > 0 && (
            <GradientActionCard
              icon={FileText}
              title={`${upcomingTests.length} ta ochiq test bor`}
              subtitle="Hoziroq ishlab, natijangizni oshiring"
              to="/student/tests"
              tone="brand"
            />
          )}
          {data && data.today_lessons.length > 0 && (
            <GradientActionCard
              icon={CalendarDays}
              title={`Bugun ${data.today_lessons.length} ta dars`}
              subtitle="Dars jadvalini ko'rib chiqing"
              to="/student/lessons"
              tone="violet"
            />
          )}
        </div>
      )}

      {data && !data.school_class && (
        <EmptyState
          title="Siz hali biror sinfga biriktirilmagansiz"
          description="Direktor sizni sinfga qo'shgach, darslaringiz shu yerda ko'rinadi."
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {data && data.school_class && (
            <Section title="Bugungi darslar" eyebrow="Jadval" icon={CalendarDays} iconTone="emerald">
              <LessonList lessons={data.today_lessons} />
            </Section>
          )}

          <Section
            title="So'nggi yutuqlar"
            eyebrow="Yutuqlar"
            icon={Award}
            iconTone="amber"
            action={<SectionLink to="/student/achievements">Hammasi</SectionLink>}
          >
            {unlockedAchievements.length === 0 ? (
              <EmptyState
                title="Hali yutuqlar yo'q"
                description="Test yoki topshiriqni bajarib birinchi yutuqingizni oching."
                icon={Sparkles}
                tone="violet"
              />
            ) : (
              <AchievementsRow items={unlockedAchievements} />
            )}
          </Section>

          <Section title="XP tarixi" eyebrow="So'nggi 7 kun" icon={Trophy} iconTone="amber">
            {xpHistory ? (
              <Suspense fallback={<LoadingState />}>
                <XpHistoryChart transactions={xpHistory.results} />
              </Suspense>
            ) : (
              <LoadingState />
            )}
          </Section>
        </div>

        <div className="space-y-6">
          {topStudents && topStudents.length > 0 && <TopStudentsCard entries={topStudents} />}

          <TaskChecklistCard entries={checklistEntries} />

          {totalTestCount > 0 && (
            <section className="flex flex-col items-center gap-3 text-center">
              <h3 className="flex w-full items-center gap-2 text-sm font-semibold text-ink">
                <Target size={16} className={TONE_DOT.brand} />
                Testlar
              </h3>
              <CircularProgress value={completionPercent} size={112} strokeWidth={10}>
                <span className="tabular text-2xl font-bold leading-none text-ink">
                  {completedTestCount}
                </span>
                <span className="mt-0.5 text-[10px] text-ink-subtle">/{totalTestCount} test</span>
              </CircularProgress>
              <p className="text-xs text-ink-muted">Testlarni o'zlashtirish darajasi</p>
            </section>
          )}

          {/* Next milestone — a quiet, non-numeric goal. */}
          <section className="min-w-0">
            <CardTitle icon={Sparkles} tone="violet">
              Keyingi maqsad
            </CardTitle>
            <p className="text-sm text-ink-muted">
              {rank?.class_rank === 1
                ? "Siz sinfda birinchisiz. Reytingni saqlash uchun kunlik faollikni davom ettiring."
                : "Har kuni kamida bitta test yoki topshiriq bajaring — XP reytingni tez ko'taradi."}
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-ink-subtle">
              <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT.violet}`} />
              Kunlik seriya: <span className="tabular font-semibold text-ink">{streak?.current_streak ?? 0}</span> kun
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
