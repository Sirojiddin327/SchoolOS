import { useQuery } from "@tanstack/react-query";
import { Clock3, User } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "../../components/Badge";
import { Field, Input } from "../../components/form";
import { PageHeader } from "../../components/PageHeader";
import { StatCard } from "../../components/StatCard";
import { Section } from "../../components/Surface";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "../../components/table";
import { api } from "../../lib/api";
import type { Tone } from "../../lib/tones";
import { localISODate, SCHOOL_WEEKDAYS } from "../../lib/schoolTime";
import type {
  AttendanceRecord,
  AttendanceStatus,
  LessonAttendanceStatus,
  Paginated,
  StudentDashboard,
} from "../../types";

/** Walks `?page=` until every page is collected — a plain `.get()` only
 * returns the first `PAGE_SIZE` (20) records, which can silently drop the
 * week's earlier days once a student has more than 20 lesson-attendance
 * rows in the range (the API orders newest-first). Capped at 10 pages as a
 * sanity bound; a single school week never comes close. */
async function fetchAllPages<T>(url: string, params: Record<string, unknown>): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext && page <= 10) {
    const { data } = await api.get<Paginated<T>>(url, { params: { ...params, page } });
    results.push(...data.results);
    hasNext = Boolean(data.next);
    page += 1;
  }
  return results;
}

const STATUS_LABEL: Record<string, string> = {
  PRESENT: "Keldi",
  LATE: "Kechikdi",
  ABSENT: "Kelmadi",
  EXCUSED: "Sababli",
};

const DAY_TONE: Record<AttendanceStatus | "NONE", string> = {
  PRESENT: "bg-emerald-500 text-white",
  LATE: "bg-amber-500 text-white",
  ABSENT: "bg-red-500 text-white",
  EXCUSED: "bg-slate-400 text-white",
  NONE: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600",
};

// Worst-first — a day with even one ABSENT record shows as absent overall.
const SEVERITY: AttendanceStatus[] = ["ABSENT", "LATE", "EXCUSED", "PRESENT"];

function currentWeekRange(): { monday: string; saturday: string } {
  const now = new Date();
  const jsDay = now.getDay(); // 0=Sunday
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  const iso = (d: Date) => localISODate(d);
  return { monday: iso(monday), saturday: iso(saturday) };
}

function WeeklyStrip() {
  const { monday, saturday } = currentWeekRange();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["attendance", "week", monday],
    queryFn: () =>
      fetchAllPages<AttendanceRecord>("/attendance/", { date_from: monday, date_to: saturday }),
  });

  const byDate = new Map<string, AttendanceRecord[]>();
  for (const record of data ?? []) {
    const list = byDate.get(record.lesson_date) ?? [];
    list.push(record);
    byDate.set(record.lesson_date, list);
  }

  return (
    <Section title="Bu hafta">
      {isLoading && <LoadingState label="Yuklanmoqda..." />}
      {isError && <ErrorState message="Haftalik davomat yuklanmadi." />}
      {data && (
        <div className="grid grid-cols-6 gap-2">
          {SCHOOL_WEEKDAYS.map((day, index) => {
            const date = new Date(monday);
            date.setDate(date.getDate() + index);
            const iso = localISODate(date);
            const records = byDate.get(iso) ?? [];
            const worst = SEVERITY.find((s) => records.some((r) => r.status === s));
            const tone = worst ? DAY_TONE[worst] : DAY_TONE.NONE;
            return (
              <div key={day.value} className="flex flex-col items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {day.short}
                </span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${tone}`}>
                  {date.getDate()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/** A lesson's attendance state as a student should read it: marked, waiting,
 * too early, or never taken — the last one is what a silent lesson used to be. */
type LessonTone = "taken" | "upcoming" | "waiting" | "missed";

function lessonStatus(lesson: LessonAttendanceStatus, now: number): { label: string; tone: LessonTone } {
  if (lesson.attendance_marked) return { label: "Davomat olingan", tone: "taken" };
  const start = new Date(`${lesson.date}T${lesson.start_time}`).getTime();
  const end = new Date(`${lesson.date}T${lesson.end_time}`).getTime();
  if (now < start) return { label: "Dars boshlanmadi", tone: "upcoming" };
  if (now < end) return { label: "Davomat kutilmoqda", tone: "waiting" };
  return { label: "Davomat olinmagan", tone: "missed" };
}

const TONE_BADGE: Record<LessonTone, Tone> = {
  taken: "emerald",
  upcoming: "slate",
  waiting: "amber",
  missed: "rose",
};

/** Re-renders every 30 seconds so today's lesson statuses stay truthful. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function TodayLessonsSection() {
  const now = useNow();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["attendance", "lesson-status"],
    queryFn: async () => (await api.get<LessonAttendanceStatus[]>("/attendance/lesson-summary/")).data,
  });

  return (
    <Section title="Bugungi darslar">
      {isLoading && <LoadingState label="Yuklanmoqda..." />}
      {isError && <ErrorState message="Bugungi darslar yuklanmadi." />}
      {data && data.length === 0 && <EmptyState title="Bugun darsingiz yo'q" />}
      {data && data.length > 0 && (
        <div className="divide-y divide-line-soft">
          {data.map((lesson) => {
            const status = lessonStatus(lesson, now);
            return (
              <div key={lesson.id} className="flex flex-wrap items-center gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">
                    {lesson.subject_name}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {lesson.start_time.slice(0, 5)}–{lesson.end_time.slice(0, 5)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      {lesson.teacher_name}
                    </span>
                  </p>
                </div>
                <Badge tone={TONE_BADGE[status.tone]}>{status.label}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

export function StudentAttendancePage() {
  const [date, setDate] = useState("");

  const summaryQuery = useQuery({
    queryKey: ["dashboard", "student"],
    queryFn: async () => (await api.get<StudentDashboard>("/dashboard/student/")).data,
  });

  const historyQuery = useQuery({
    queryKey: ["attendance", "history", date],
    queryFn: async () =>
      (
        await api.get<Paginated<AttendanceRecord>>("/attendance/", {
          params: { date: date || undefined },
        })
      ).data,
  });

  const lessonsQuery = useQuery({
    queryKey: ["attendance", "lesson-status", date],
    enabled: Boolean(date),
    queryFn: async () =>
      (
        await api.get<LessonAttendanceStatus[]>("/attendance/lesson-summary/", {
          params: { date },
        })
      ).data,
  });

  // A picked day is shown lesson-by-lesson, so a lesson whose attendance was
  // never taken appears as its own "davomat olinmagan" row instead of vanishing.
  const mergedRows =
    date && historyQuery.data && lessonsQuery.data
      ? lessonsQuery.data.map((lesson) => ({
          lesson,
          status: historyQuery.data!.results.find((r) => r.lesson === lesson.id)?.status ?? null,
        }))
      : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Mening davomatim" />

      {summaryQuery.isLoading && <LoadingState />}
      {summaryQuery.data && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Keldi" value={summaryQuery.data.attendance_summary.present} />
          <StatCard label="Kechikdi" value={summaryQuery.data.attendance_summary.late} />
          <StatCard label="Kelmadi" value={summaryQuery.data.attendance_summary.absent} />
          <StatCard label="Sababli" value={summaryQuery.data.attendance_summary.excused} />
        </div>
      )}

      <TodayLessonsSection />

      <WeeklyStrip />

      <Field label="Sana">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="max-w-[180px]"
        />
      </Field>

      {!date && historyQuery.isLoading && <LoadingState />}
      {!date && historyQuery.isError && <ErrorState />}
      {!date && historyQuery.data && historyQuery.data.results.length === 0 && (
        <EmptyState title="Bu filtrga mos davomat yozuvi yo'q" />
      )}

      {!date && historyQuery.data && historyQuery.data.results.length > 0 && (
        <Table>
          <Thead>
            <Tr>
              <Th>Sana</Th>
              <Th>Fan</Th>
              <Th>Holat</Th>
            </Tr>
          </Thead>
          <Tbody>
            {historyQuery.data.results.map((record) => (
              <Tr key={record.id}>
                <Td className="text-slate-700 dark:text-slate-200">{record.lesson_date}</Td>
                <Td className="text-slate-700 dark:text-slate-200">{record.subject_name}</Td>
                <Td className="text-slate-700 dark:text-slate-200">
                  {STATUS_LABEL[record.status] ?? record.status}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {date && (historyQuery.isLoading || lessonsQuery.isLoading) && <LoadingState />}
      {date && (historyQuery.isError || lessonsQuery.isError) && <ErrorState />}
      {date && mergedRows !== null && mergedRows.length === 0 && (
        <EmptyState title="Bu kunda dars bo'lmagan" />
      )}
      {date && mergedRows !== null && mergedRows.length > 0 && (
            <Table>
              <Thead>
                <Tr>
                  <Th>Fan</Th>
                  <Th>Vaqti</Th>
                  <Th>Holat</Th>
                </Tr>
              </Thead>
              <Tbody>
                {mergedRows.map(({ lesson, status }) => (
                  <Tr key={lesson.id}>
                    <Td className="text-slate-700 dark:text-slate-200">{lesson.subject_name}</Td>
                    <Td className="text-slate-500 dark:text-slate-400">
                      {lesson.start_time.slice(0, 5)}–{lesson.end_time.slice(0, 5)}
                    </Td>
                    <Td>
                      {status ? (
                        <Badge tone="slate">{STATUS_LABEL[status] ?? status}</Badge>
                      ) : (
                        (() => {
                          const lessonBadge = lessonStatus(lesson, Date.now());
                          return <Badge tone={TONE_BADGE[lessonBadge.tone]}>{lessonBadge.label}</Badge>;
                        })()
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
    </div>
  );
}