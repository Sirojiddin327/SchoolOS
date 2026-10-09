import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, CalendarDays, CheckCircle2, ClipboardCheck, History, Phone, Users, X } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

import { Badge } from "../../components/Badge";
import { Field, Input, Select } from "../../components/form";
import { FilterPills } from "../../components/FilterPills";
import { PageHeader } from "../../components/PageHeader";
import { Section } from "../../components/Surface";
import { StatCard } from "../../components/StatCard";
import { EmptyState, ErrorState, Legend, LoadingState, TableSkeleton } from "../../components/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "../../components/table";
import { api } from "../../lib/api";
import { distinctGrades } from "../../lib/classGrade";
import { todayISODate } from "../../lib/schoolTime";
import type { Tone } from "../../lib/tones";
import type {
  AttendanceDailyCount,
  AttendanceRecord,
  AttendanceRosterStudent,
  AttendanceStatus,
  ClassAttendanceSummary,
  DirectorDashboard,
  LessonAttendanceStatus,
  Paginated,
  SchoolClass,
} from "../../types";

const AttendanceDailyChart = lazy(() =>
  import("../../components/charts/AttendanceDailyChart").then((m) => ({ default: m.AttendanceDailyChart })),
);

const DAY_RANGE_OPTIONS = [
  { value: 7, label: "Oxirgi 7 kun" },
  { value: 14, label: "Oxirgi 14 kun" },
  { value: 30, label: "Oxirgi 30 kun" },
];

const STATUS_LABEL: Record<string, string> = {
  PRESENT: "Keldi",
  LATE: "Kechikdi",
  ABSENT: "Kelmadi",
  EXCUSED: "Sababli",
};

const STATUS_TONE: Record<AttendanceStatus, Tone> = {
  PRESENT: "emerald",
  LATE: "amber",
  ABSENT: "rose",
  EXCUSED: "slate",
};

function todayIso() {
  return todayISODate();
}

/** Re-renders every 30 seconds so "davomat olinmagan" flips off the moment a
 * lesson is marked, without a manual refresh. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

type LessonStatus = { label: string; tone: Tone };

function unmarkedLessonStatus(lesson: LessonAttendanceStatus, now: number): LessonStatus | null {
  const end = new Date(`${lesson.date}T${lesson.end_time}`).getTime();
  const start = new Date(`${lesson.date}T${lesson.start_time}`).getTime();
  if (now < start) return null; // hasn't happened yet — nothing missing
  if (now < end) return { label: "Kutilmoqda", tone: "amber" };
  return { label: "Davomat olinmagan", tone: "rose" };
}

type RosterFilter = "PRESENT" | "LATE" | "ABSENT" | null;

function StudentRosterList({ students }: { students: AttendanceRosterStudent[] }) {
  if (students.length === 0) {
    return <p className="py-4 text-sm text-ink-subtle">Ro'yxat bo'sh.</p>;
  }
  return (
    <div className="divide-y divide-line-soft">
      {students.map((student) => (
        <div key={student.id} className="flex items-center justify-between gap-3 py-3">
          <span className="font-medium text-ink">{student.full_name}</span>
          {student.parent_phone_number ? (
            <a
              href={`tel:${student.parent_phone_number}`}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              <Phone className="h-3.5 w-3.5" /> {student.parent_phone_number}
            </a>
          ) : (
            <span className="text-sm text-slate-400 dark:text-slate-500">
              Ota-ona raqami kiritilmagan
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function AttendancePage() {
  const [selectedClass, setSelectedClass] = useState("");
  const [date, setDate] = useState(todayIso());
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>(null);
  const [dayRange, setDayRange] = useState(14);
  const [gradeFilter, setGradeFilter] = useState<number | "all">("all");
  const now = useNow();

  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await api.get<Paginated<SchoolClass>>("/classes/")).data,
  });

  const { data: dashboard } = useQuery({
    queryKey: ["dashboard", "director"],
    queryFn: async () => (await api.get<DirectorDashboard>("/dashboard/director/")).data,
  });

  const dailyQuery = useQuery({
    queryKey: ["attendance", "daily-summary", dayRange, gradeFilter],
    queryFn: async () =>
      (
        await api.get<AttendanceDailyCount[]>("/attendance/daily-summary/", {
          params: { days: dayRange, grade: gradeFilter === "all" ? undefined : gradeFilter },
        })
      ).data,
  });

  const grades = distinctGrades((classes?.results ?? []).map((c) => c.name));

  const summaryQuery = useQuery({
    queryKey: ["attendance", "class-summary", selectedClass, date],
    enabled: Boolean(selectedClass),
    queryFn: async () =>
      (
        await api.get<ClassAttendanceSummary>("/attendance/class-summary/", {
          params: { school_class: selectedClass, date },
        })
      ).data,
  });

  const historyQuery = useQuery({
    queryKey: ["attendance", "history", selectedClass, date],
    queryFn: async () =>
      (
        await api.get<Paginated<AttendanceRecord>>("/attendance/", {
          params: { school_class: selectedClass || undefined, date: date || undefined },
        })
      ).data,
  });

  const unmarkedQuery = useQuery({
    queryKey: ["attendance", "lesson-status", selectedClass, date],
    queryFn: async () =>
      (
        await api.get<LessonAttendanceStatus[]>("/attendance/lesson-summary/", {
          params: { date: date || undefined, school_class: selectedClass || undefined },
        })
      ).data,
  });

  // Lessons that already happened (or are running) but never got attendance.
  const unmarkedRows =
    (unmarkedQuery.data ?? [])
      .map((lesson) => ({ lesson, status: unmarkedLessonStatus(lesson, now) }))
      .filter((row): row is { lesson: LessonAttendanceStatus; status: LessonStatus } => row.status !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Davomat"
        icon={ClipboardCheck}
        tone="emerald"
        subtitle="Maktab bo'yicha kelish, kechikish va kelmaslik holati"
      />

      <Section eyebrow="Bugun" title="Maktab bo'yicha davomat" icon={CalendarDays} iconTone="brand">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard
            label="Jami o'quvchilar"
            value={dashboard?.total_students ?? "—"}
            icon={Users}
            tone="brand"
          />
          <StatCard label="Keldi" value={dashboard?.today_attendance.present ?? "—"} tone="emerald" />
          <StatCard label="Kechikdi" value={dashboard?.today_attendance.late ?? "—"} tone="amber" />
          <StatCard label="Kelmadi" value={dashboard?.today_attendance.absent ?? "—"} tone="rose" />
          <StatCard label="Sababli" value={dashboard?.today_attendance.excused ?? "—"} tone="slate" />
        </div>
      </Section>

      <Section
        eyebrow="Tahlil"
        title="Kunlik davomat — necha o'quvchi darsga keldi"
        icon={BarChart3}
        iconTone="brand"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <FilterPills value={dayRange} onChange={setDayRange} options={DAY_RANGE_OPTIONS} />
          <FilterPills
            value={gradeFilter}
            onChange={setGradeFilter}
            options={[
              { value: "all" as const, label: "Barcha maktab" },
              ...grades.map((grade) => ({ value: grade, label: `${grade}-sinflar` })),
            ]}
          />
        </div>
        {dailyQuery.isLoading && <LoadingState />}
        {dailyQuery.isError && <ErrorState />}
        {dailyQuery.data && (
          <Suspense fallback={<LoadingState />}>
            <AttendanceDailyChart data={dailyQuery.data} />
          </Suspense>
        )}
        <div className="mt-3">
          <Legend
            items={[
              { label: "Keldi", tone: "emerald" },
              { label: "Kechikdi", tone: "amber" },
              { label: "Kelmadi", tone: "rose" },
              { label: "Sababli", tone: "slate" },
            ]}
          />
        </div>
      </Section>

      <div className="flex flex-wrap gap-3">
        <Field label="Sinf">
          <Select
            value={selectedClass}
            onChange={(e) => {
              setSelectedClass(e.target.value);
              setRosterFilter(null);
            }}
            className="min-w-[160px]"
          >
            <option value="">Barcha sinflar</option>
            {classes?.results.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sana">
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setRosterFilter(null);
            }}
            className="min-w-[160px]"
          />
        </Field>
      </div>

      {selectedClass && summaryQuery.isLoading && <LoadingState />}
      {selectedClass && summaryQuery.isError && <ErrorState />}
      {selectedClass && summaryQuery.data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Jami o'quvchi" value={summaryQuery.data.total_students} tone="brand" />
            <StatCard
              label="Keldi"
              value={summaryQuery.data.present}
              tone="emerald"
              onClick={() => setRosterFilter(rosterFilter === "PRESENT" ? null : "PRESENT")}
              hint="Ro'yxatni ochish uchun bosing"
            />
            <StatCard
              label="Kechikdi"
              value={summaryQuery.data.late}
              tone="amber"
              onClick={() => setRosterFilter(rosterFilter === "LATE" ? null : "LATE")}
              hint="Kechikkanlarni ko'rish"
            />
            <StatCard
              label="Kelmadi"
              value={summaryQuery.data.absent}
              tone="rose"
              onClick={() => setRosterFilter(rosterFilter === "ABSENT" ? null : "ABSENT")}
              hint="Kelmaganlarni ko'rish"
            />
            <StatCard label="Sababli" value={summaryQuery.data.excused} tone="slate" />
          </div>

          {rosterFilter && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="section-title">
                  {rosterFilter === "PRESENT"
                    ? "Keldilar"
                    : rosterFilter === "LATE"
                      ? "Kechikkanlar"
                      : "Kelmaganlar"}
                </h3>
                <button onClick={() => setRosterFilter(null)} className="btn-icon -mr-2" aria-label="Yopish">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <StudentRosterList
                students={
                  rosterFilter === "PRESENT"
                    ? summaryQuery.data.present_students
                    : rosterFilter === "LATE"
                      ? summaryQuery.data.late_students
                      : summaryQuery.data.absent_students
                }
              />
            </div>
          )}
        </>
      )}

      <Section
        eyebrow="Nazorat"
        title="Davomat olinmagan darslar"
        icon={AlertTriangle}
        iconTone="rose"
        action={
          unmarkedQuery.data ? (
            <span className="tabular text-xs text-ink-subtle">{unmarkedRows.length} ta dars</span>
          ) : undefined
        }
      >
        {unmarkedQuery.isLoading && <LoadingState />}
        {unmarkedQuery.isError && <ErrorState />}
        {unmarkedQuery.data && (
          <Table>
            <Thead>
              <Tr>
                <Th>Vaqti</Th>
                <Th>Sinf</Th>
                <Th>Fan</Th>
                <Th>O'qituvchi</Th>
                <Th>Holat</Th>
              </Tr>
            </Thead>
            <Tbody>
              {unmarkedRows.map(({ lesson, status }) => (
                  <Tr key={lesson.id}>
                    <Td className="tabular">
                      {lesson.start_time.slice(0, 5)}–{lesson.end_time.slice(0, 5)}
                    </Td>
                    <Td>{lesson.school_class_name}</Td>
                    <Td>{lesson.subject_name}</Td>
                    <Td>{lesson.teacher_name}</Td>
                    <Td>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </Td>
                  </Tr>
                ))}
            </Tbody>
          </Table>
        )}
        {unmarkedQuery.data && unmarkedRows.length === 0 && (
          <p className="flex items-center gap-2.5 text-sm font-medium text-ink">
            <CheckCircle2 size={17} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            Tanlangan kun uchun barcha darslarning davomati olingan.
          </p>
        )}
      </Section>

      <Section eyebrow="Arxiv" title="Davomat tarixi" icon={History} iconTone="slate">
        {historyQuery.isLoading && <TableSkeleton rows={6} cols={5} />}
        {historyQuery.isError && <ErrorState />}
        {historyQuery.data && historyQuery.data.results.length === 0 && (
          <EmptyState title="Bu filtrga mos davomat yozuvi yo'q" />
        )}
        {historyQuery.data && historyQuery.data.results.length > 0 && (
          <Table>
            <Thead>
              <Tr>
                <Th>Sana</Th>
                <Th>O'quvchi</Th>
                <Th>Sinf</Th>
                <Th>Fan</Th>
                <Th>Holat</Th>
              </Tr>
            </Thead>
            <Tbody>
              {historyQuery.data.results.map((record) => (
                <Tr key={record.id}>
                  <Td className="text-slate-700 dark:text-slate-200">{record.lesson_date}</Td>
                  <Td className="text-slate-700 dark:text-slate-200">{record.student_name}</Td>
                  <Td className="text-slate-700 dark:text-slate-200">{record.school_class_name}</Td>
                  <Td className="text-slate-700 dark:text-slate-200">{record.subject_name}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[record.status]}>
                      {STATUS_LABEL[record.status] ?? record.status}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Section>
    </div>
  );
}
