import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronRight, ClipboardCheck, ClipboardList, FileText, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { GradientActionCard } from "../../components/GradientActionCard";
import { LessonList } from "../../components/LessonList";
import { StatCard } from "../../components/StatCard";
import { Table, Tbody, Td, Th, Thead, Tr } from "../../components/table";
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
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
          Xush kelibsiz, {user?.first_name || user?.username}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Bugungi ish holatingiz.</p>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}

      {data && (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Bugungi darslar</h2>
            <LessonList lessons={data.today_lessons} />
          </section>

          {pendingAttendanceCount > 0 && (
            <GradientActionCard
              icon={ClipboardCheck}
              title={`${pendingAttendanceCount} ta darsda davomat hali belgilanmagan`}
              subtitle="Davomatni belgilash uchun bosing"
              to="/teacher/attendance"
              tone="amber"
            />
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Mening sinflarim" value={data.my_classes_count} icon={Users} tone="brand" />
            <StatCard label="Testlarim" value={tests?.results.length ?? 0} icon={FileText} tone="violet" />
            <StatCard label="Topshiriqlarim" value={activities?.results.length ?? 0} icon={ClipboardList} tone="amber" />
            <StatCard label="O'qilmagan xabarlar" value={data.unread_notifications} icon={Bell} tone="rose" />
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">So'nggi o'quvchi natijalari</h2>
              <Link
                to="/teacher/xp"
                className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Hammasi <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {recentResults.length === 0 ? (
              <EmptyState title="Hali natija yo'q" />
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
                      <Td className="text-slate-700 dark:text-slate-200">{tx.student_name}</Td>
                      <Td>{SOURCE_LABEL[tx.source]}</Td>
                      <Td className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        +{tx.amount}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
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
