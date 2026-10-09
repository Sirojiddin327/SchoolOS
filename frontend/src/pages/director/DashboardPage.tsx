import { useQuery } from "@tanstack/react-query";
import {
  Award,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  HelpCircle,
  School,
  Settings,
  TrendingUp,
  Trophy,
  UserX,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";

import { ClassGrowthGrid } from "../../components/ClassGrowthGrid";
import { DashboardHero } from "../../components/DashboardHero";
import { StatCard } from "../../components/StatCard";
import { CardTitle, Section, SectionLink } from "../../components/Surface";
import { EmptyState, ErrorState, LoadingState, StatSkeletonGrid } from "../../components/states";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { shortName } from "../../lib/names";
import { TONE_DOT, TONE_TEXT, TONE_WELL, type Tone } from "../../lib/tones";
import type { ClassGrowthSeries, ClassLeaderboardEntry, DirectorDashboard } from "../../types";

/**
 * The director view.
 *
 * Deliberately the calmest of the three dashboards: a neutral canvas, no
 * tinted hero, no game mechanics. Colour is spent on two things only —
 * attendance health (green/amber/red, because a director reads the day's
 * attendance as a traffic light) and leadership indicators. Everything else is
 * type, weight and spacing, so the numbers look like a report.
 */
export function DirectorDashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "director"],
    queryFn: async () => (await api.get<DirectorDashboard>("/dashboard/director/")).data,
  });
  const { data: classLeaderboard } = useQuery({
    queryKey: ["leaderboard", "classes", "preview"],
    queryFn: async () => (await api.get<ClassLeaderboardEntry[]>("/leaderboard/classes/")).data,
  });
  const { data: classGrowth } = useQuery({
    queryKey: ["leaderboard", "classes", "growth"],
    queryFn: async () => (await api.get<ClassGrowthSeries[]>("/leaderboard/classes/growth/")).data,
  });

  const allClasses = classLeaderboard ?? [];
  const attendanceTotal = data
    ? data.today_attendance.present +
      data.today_attendance.late +
      data.today_attendance.absent +
      data.today_attendance.excused
    : 0;
  const attendanceRate =
    attendanceTotal > 0 ? Math.round((data!.today_attendance.present / attendanceTotal) * 100) : null;

  return (
    <div className="space-y-8">
      <DashboardHero
        name={shortName(user)}
        avatarSrc={user?.avatar_url}
        greeting="Xush kelibsiz"
        subtitle="Maktabingizning bugungi holati."
        tone="slate"
        chips={
          data
            ? [
                { label: `${data.total_students} o'quvchi`, tone: "brand" as const },
                { label: `${data.total_teachers} o'qituvchi`, tone: "violet" as const },
                { label: `Bugun ${data.today_lessons} ta dars`, tone: "slate" as const },
              ]
            : []
        }
      />

      {isLoading && <StatSkeletonGrid count={4} />}
      {isError && <ErrorState />}

      {data && (
        <>
          {/* ── School size ──────────────────────────────────────────── */}
          <Section eyebrow="Maktab" title="Umumiy statistika" icon={School} iconTone="brand">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="O'quvchilar"
                value={data.total_students}
                to="/director/students"
                icon={Users}
                tone="brand"
              />
              <StatCard
                label="O'qituvchilar"
                value={data.total_teachers}
                to="/director/teachers"
                icon={GraduationCap}
                tone="violet"
              />
              <StatCard
                label="Sinflar"
                value={data.total_classes}
                to="/director/classes"
                icon={School}
                tone="amber"
              />
              <StatCard
                label="Bugungi darslar"
                value={data.today_lessons}
                to="/director/lessons"
                icon={CalendarDays}
                tone="emerald"
              />
            </div>
          </Section>

          {/* ── Attendance health, as one readable strip ─────────────── */}
          <Section eyebrow="Bugun" title="Davomat holati" icon={ClipboardCheck} iconTone="emerald">
            <div className="grid grid-cols-2 divide-line-soft sm:grid-cols-4 sm:divide-x">
              {(
                [
                  { label: "Keldi", value: data.today_attendance.present, tone: "emerald" as const, icon: CheckCircle2 },
                  { label: "Kechikdi", value: data.today_attendance.late, tone: "amber" as const, icon: Clock },
                  { label: "Kelmadi", value: data.today_attendance.absent, tone: "rose" as const, icon: UserX },
                  { label: "Sababli", value: data.today_attendance.excused, tone: "slate" as const, icon: ClipboardCheck },
                ] as const
              ).map((item) => (
                <div key={item.label} className="flex items-center gap-3 py-3 pr-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_WELL[item.tone]}`}
                  >
                    <item.icon size={17} className={TONE_TEXT[item.tone]} />
                  </span>
                  <div className="min-w-0">
                    <p className="tabular text-xl font-bold leading-none text-ink">{item.value}</p>
                    <p className="mt-1 truncate text-xs text-ink-subtle">{item.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {attendanceRate !== null && (
              <div className="mt-3 flex items-center gap-3">
                <span className="shrink-0 text-xs font-medium text-ink-muted">Davomat darajasi</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                      attendanceRate >= 90
                        ? "bg-emerald-500"
                        : attendanceRate >= 75
                          ? "bg-amber-500"
                          : "bg-rose-500"
                    }`}
                    style={{ width: `${attendanceRate}%` }}
                  />
                </div>
                <span className="tabular shrink-0 text-sm font-bold text-ink">{attendanceRate}%</span>
              </div>
            )}
          </Section>

          {/* ── Academic activity ────────────────────────────────────── */}
          <Section eyebrow="O'quv faolligi" title="Testlar, topshiriqlar va XP" icon={BarChart3} iconTone="violet">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Jami testlar" value={data.total_tests} icon={FileText} tone="brand" />
              <StatCard
                label="Jami topshiriqlar"
                value={data.total_activities}
                icon={ClipboardList}
                tone="violet"
              />
              <StatCard
                label="Berilgan XP"
                value={data.total_xp_awarded}
                to="/director/rankings"
                icon={Trophy}
                tone="amber"
              />
              <StatCard
                label="Yetakchi sinf"
                value={data.top_class ? data.top_class.name : "—"}
                hint={data.top_class ? `${data.top_class.total_xp} XP` : undefined}
                to="/director/rankings"
                icon={BookOpen}
                tone="emerald"
              />
            </div>
          </Section>

          <Section
            eyebrow="Tahlil"
            title="Sinflar o'sishi — so'nggi 14 kun"
            icon={TrendingUp}
            iconTone="emerald"
          >
            {classGrowth ? <ClassGrowthGrid series={classGrowth} /> : <LoadingState />}
          </Section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Section
                eyebrow="Reyting"
                title="Sinflar reytingi"
                action={<SectionLink to="/director/rankings">Batafsil</SectionLink>}
              >
                {allClasses.length === 0 ? (
                  <EmptyState
                    title="Hali XP ma'lumoti yo'q"
                    description="O'quvchilar XP to'plaganda reyting shu yerda shakllanadi."
                    icon={Trophy}
                  />
                ) : (
                  <>
                    {allClasses.map((entry, i) => {
                      const top = allClasses[0]?.total_xp || 1;
                      const pct = Math.max(2, Math.round((entry.total_xp / top) * 100));
                      return (
                        <Link
                          key={entry.rank}
                          to="/director/rankings"
                          className="flex items-center gap-4 border-b border-line-soft py-3 transition-colors last:border-0 hover:bg-surface-raised/60"
                        >
                          <span
                            className={`tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                              entry.rank <= 3
                                ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
                                : "bg-surface-raised text-ink-subtle"
                            }`}
                          >
                            {entry.rank}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {entry.name}
                            </span>
                            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                              <span
                                className={`block h-full rounded-full ${
                                  entry.rank === 1 ? "bg-emerald-500" : "bg-brand-500"
                                } transition-[width] duration-700 ease-out`}
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                          </span>
                          <span className="tabular shrink-0 text-sm font-semibold text-ink">
                            {entry.total_xp} <span className="text-xs text-ink-subtle">XP</span>
                          </span>
                          {i === 0 && (
                            <span className={`hidden h-2 w-2 rounded-full sm:block ${TONE_DOT.emerald}`} />
                          )}
                        </Link>
                      );
                    })}
                  </>
                )}
              </Section>
            </div>

            <div>
              <Section eyebrow="Navigatsiya" title="Tezkor havolalar">
                <div className="space-y-1">
                  {[
                    { to: "/director/attendance", label: "Davomat hisoboti", icon: ClipboardCheck, tone: "emerald" },
                    { to: "/director/rankings", label: "XP va reyting", icon: Trophy, tone: "amber" },
                    { to: "/director/achievements", label: "Yutuqlar", icon: Award, tone: "violet" },
                    { to: "/director/reports", label: "Hisobotlar", icon: BarChart3, tone: "brand" },
                    { to: "/director/settings", label: "Sozlamalar", icon: Settings, tone: "slate" },
                    { to: "/director/guide", label: "Qo'llanma", icon: HelpCircle, tone: "slate" },
                  ].map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      className="hover-card flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[link.tone as Tone]}`}
                      />
                      <link.icon size={16} className="shrink-0 text-ink-muted" />
                      <span className="truncate text-sm font-medium text-ink">{link.label}</span>
                    </Link>
                  ))}
                </div>
              </Section>

              <div className="mt-6">
                <Section eyebrow="Boshqaruv" title="Maktab amaliyoti">
                  <CardTitle icon={School} tone="brand">
                    {data.total_classes} ta sinf
                  </CardTitle>
                  <p className="text-sm text-ink-muted">
                    Har bir sinf o'quvchilari, o'qituvchilari va o'sish ko'rsatkichlari bo'yicha
                    alohida tahlil qilinadi.
                  </p>
                  <Link to="/director/classes" className="btn btn-secondary btn-sm mt-4">
                    Sinflarni ko'rish
                  </Link>
                </Section>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
