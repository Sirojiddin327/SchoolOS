import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Send,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";

import { DashboardHero } from "../../components/DashboardHero";
import { GradientActionCard } from "../../components/GradientActionCard";
import { LessonList } from "../../components/LessonList";
import { StatCard } from "../../components/StatCard";
import { Section, SectionLink } from "../../components/Surface";
import { Table, Tbody, Td, TdStrong, Th, Thead, Tr } from "../../components/table";
import { EmptyState, ErrorState, StatSkeletonGrid } from "../../components/states";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { shortName } from "../../lib/names";
import { TONE_DOT, TONE_WELL, type Tone } from "../../lib/tones";
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

const SOURCE_TONE: Record<XPTransaction["source"], Tone> = {
  TEST: "brand",
  ACTIVITY: "violet",
};

/**
 * The teacher view.
 *
 * Built around the two questions a teacher opens the app with: what am I
 * teaching today, and what still needs me? Attendance that hasn't been taken
 * is an amber call-to-action, not a statistic; the daily schedule is a
 * timeline; and the results feed shows XP as a green gain because a gain is
 * what it is. There's no gamification chrome here — that's the student's
 * world, and keeping them visually distinct is part of the product feeling
 * like one serious suite rather than one template.
 */
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
  const recentResults = (history?.results ?? []).slice(0, 6);

  return (
    <div className="space-y-8">
      <DashboardHero
        name={shortName(user)}
        avatarSrc={user?.avatar_url}
        subtitle="Bugungi ish holatingiz."
        tone="emerald"
        chips={
          data
            ? [
                { label: `${data.my_classes_count} ta sinf`, tone: "brand" as const },
                { label: `Bugun ${data.today_lessons.length} ta dars`, tone: "slate" as const },
                ...(pendingAttendanceCount > 0
                  ? [
                      {
                        label: `${pendingAttendanceCount} ta davomat kutilmoqda`,
                        tone: "amber" as const,
                      },
                    ]
                  : []),
              ]
            : []
        }
      />

      {isLoading && <StatSkeletonGrid count={4} />}
      {isError && <ErrorState />}

      {data && (
        <>
          {pendingAttendanceCount > 0 && (
            <GradientActionCard
              icon={ClipboardCheck}
              title={`${pendingAttendanceCount} ta darsda davomat hali belgilanmagan`}
              subtitle="Davomatni belgilash uchun bosing"
              to="/teacher/attendance"
              tone="amber"
            />
          )}

          <Section eyebrow="Kun tartibi" title="Bugungi darslar" icon={CalendarDays} iconTone="emerald">
            <LessonList lessons={data.today_lessons} />
          </Section>

          <Section eyebrow="Umumiy" title="Mening ko'rsatkichlarim">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Sinflarim"
                value={data.my_classes_count}
                to="/teacher/classes"
                icon={Users}
                tone="brand"
              />
              <StatCard
                label="Testlarim"
                value={tests?.results.length ?? 0}
                to="/teacher/tests"
                icon={FileText}
                tone="violet"
              />
              <StatCard
                label="Topshiriqlarim"
                value={activities?.results.length ?? 0}
                to="/teacher/activities"
                icon={ClipboardList}
                tone="amber"
              />
              <StatCard
                label="Xabarlar"
                value={data.unread_notifications}
                to="/teacher/notifications"
                icon={Bell}
                tone="rose"
              />
            </div>
          </Section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Section
                eyebrow="Natija"
                title="So'nggi o'quvchi natijalari"
                icon={Trophy}
                iconTone="emerald"
                action={<SectionLink to="/teacher/xp">Hammasi</SectionLink>}
              >
                {recentResults.length === 0 ? (
                  <EmptyState
                    title="Hali natija yo'q"
                    description="O'quvchilar topshiriq yoki test bajarganida XP harakatlari shu yerda chiqadi."
                    icon={Sparkles}
                    tone="emerald"
                  />
                ) : (
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>O'quvchi</Th>
                        <Th>Manba</Th>
                        <Th className="text-right">XP</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {recentResults.map((tx) => (
                        <Tr key={tx.id}>
                          <TdStrong>{tx.student_name}</TdStrong>
                          <Td>
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[SOURCE_TONE[tx.source]]}`} />
                              {SOURCE_LABEL[tx.source]}
                            </span>
                          </Td>
                          <Td className="text-right">
                            <span className="tabular inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                              <BarChart3 size={13} />+{tx.amount}
                            </span>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                )}
              </Section>
            </div>

            <div className="space-y-3">
              <Section eyebrow="Havola" title="Tezkor amallar">
                <div className="space-y-1">
                  {[
                    { to: "/teacher/attendance", label: "Davomat olish", icon: ClipboardCheck, tone: "emerald" as Tone },
                    { to: "/teacher/tasks", label: "Vazifa berish", icon: Send, tone: "violet" as Tone },
                    { to: "/teacher/tests", label: "Test yaratish", icon: FileText, tone: "brand" as Tone },
                    { to: "/teacher/reports", label: "Hisobotlar", icon: BarChart3, tone: "amber" as Tone },
                  ].map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      className="hover-card flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE_WELL[link.tone]}`}
                      >
                        <link.icon size={15} />
                      </span>
                      <span className="truncate text-sm font-medium text-ink">{link.label}</span>
                    </Link>
                  ))}
                </div>
              </Section>

              {classes && classes.results.length === 0 && (
                <EmptyState
                  title="Sizga hali sinf biriktirilmagan"
                  description="Direktor sinf biriktirgach, o'quvchilar va darslar shu yerda paydo bo'ladi."
                  icon={Users}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
