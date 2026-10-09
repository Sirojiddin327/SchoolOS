import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileText,
  Hourglass,
  Lock,
  type LucideIcon,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "../../components/Badge";
import { PrimaryButton } from "../../components/form";
import { PageHeader } from "../../components/PageHeader";
import { StatCard } from "../../components/StatCard";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import { localISODate } from "../../lib/schoolTime";
import { useAuth } from "../../lib/auth";
import { MONTH_NAMES_UZ, periodTimes, schoolWeekdayOf, WEEKDAY_NAMES_UZ } from "../../lib/schoolTime";
import type {
  AttendanceRecord,
  AttendanceStatus,
  Lesson,
  Paginated,
  RosterStudent,
  SchoolTimeConfig,
  TimetableSlot,
} from "../../types";

const ATTENDANCE_GRACE_MINUTES = 5;

function windowOpensAt(lesson: Lesson) {
  return new Date(`${lesson.date}T${lesson.start_time}`).getTime() + ATTENDANCE_GRACE_MINUTES * 60_000;
}

function windowClosesAt(lesson: Lesson) {
  return new Date(`${lesson.date}T${lesson.end_time}`).getTime();
}

/** Re-renders every 30 seconds so window-open/countdown state stays live without a manual refresh. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function isoDate(d: Date): string {
  return localISODate(d);
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; icon: LucideIcon }[] = [
  { value: "PRESENT", label: "Keldi", icon: CheckCircle2 },
  { value: "LATE", label: "Kechikdi", icon: Clock3 },
  { value: "ABSENT", label: "Kelmadi", icon: XCircle },
  { value: "EXCUSED", label: "Sababli", icon: FileText },
];

const STATUS_COLOR: Record<AttendanceStatus, string> = {
  PRESENT: "bg-emerald-600 text-white",
  LATE: "bg-amber-500 text-white",
  ABSENT: "bg-red-600 text-white",
  EXCUSED: "bg-slate-500 text-white",
};

/** The roster form for one lesson — handles its own grace-period/closed-window
 * display, so the page around it never has to duplicate that logic. */
function AttendanceForm({ lesson, onDone }: { lesson: Lesson; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [statuses, setStatuses] = useState<Record<number, AttendanceStatus> | null>(null);
  const [saved, setSaved] = useState(false);
  const now = useNow();
  const opensAt = windowOpensAt(lesson);
  const closesAt = windowClosesAt(lesson);
  const windowOpen = now >= opensAt && now < closesAt;
  const windowClosed = now >= closesAt;

  const { data: roster, isLoading: rosterLoading } = useQuery({
    queryKey: ["classes", lesson.school_class, "students"],
    queryFn: async () =>
      (await api.get<RosterStudent[]>(`/classes/${lesson.school_class}/students/`)).data,
  });

  const { data: existing, isLoading: existingLoading } = useQuery({
    queryKey: ["attendance", "lesson", lesson.id],
    queryFn: async () =>
      (await api.get<Paginated<AttendanceRecord>>("/attendance/", { params: { lesson: lesson.id } }))
        .data.results,
  });

  if (roster && existing && statuses === null) {
    const initial: Record<number, AttendanceStatus> = {};
    for (const student of roster) {
      const record = existing.find((r) => r.student === student.id);
      initial[student.id] = record?.status ?? "PRESENT";
    }
    setStatuses(initial);
  }

  const save = useMutation({
    mutationFn: async () =>
      api.post("/attendance/bulk-mark/", {
        lesson: lesson.id,
        records: Object.entries(statuses ?? {}).map(([student, status]) => ({
          student: Number(student),
          status,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const saveErrorMessage = axios.isAxiosError(save.error)
    ? ((save.error.response?.data as { detail?: string } | undefined)?.detail ??
      "Davomatni saqlashda xatolik yuz berdi.")
    : "Davomatni saqlashda xatolik yuz berdi.";

  if (rosterLoading || existingLoading || statuses === null || !roster) {
    return <LoadingState label="Ro'yxat yuklanmoqda..." />;
  }

  if (roster.length === 0) {
    return <EmptyState title="Bu sinfda hali o'quvchi yo'q" />;
  }

  if (windowClosed) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
        <Lock className="h-4 w-4 shrink-0" />
        Dars tugagani uchun davomat yopildi. O'zgartirish kerak bo'lsa, direktorga murojaat qiling.
      </div>
    );
  }

  if (!windowOpen) {
    const minutesLeft = Math.max(1, Math.ceil((opensAt - now) / 60_000));
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
        <Hourglass className="h-4 w-4 shrink-0" />
        Davomatni dars boshlangandan {ATTENDANCE_GRACE_MINUTES} daqiqa o'tgach belgilash mumkin —
        yana {minutesLeft} daqiqa kuting.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="divide-y divide-line-soft">
        {roster.map((student) => (
          <div key={student.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {student.full_name}
            </span>
            <div className="flex flex-wrap gap-1">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatuses({ ...statuses, [student.id]: option.value })}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    statuses[student.id] === option.value
                      ? STATUS_COLOR[option.value]
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                  }`}
                >
                  <option.icon className="h-3.5 w-3.5" /> {option.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saqlanmoqda..." : "Davomatni saqlash"}
        </PrimaryButton>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Saqlandi
          </span>
        )}
        {save.isError && (
          <span className="text-sm text-red-600 dark:text-red-400">{saveErrorMessage}</span>
        )}
        <button onClick={onDone} className="text-sm text-slate-500 hover:underline dark:text-slate-400">
          Yopish
        </button>
      </div>
    </div>
  );
}

interface PeriodEntry {
  periodNumber: number;
  start: string;
  end: string;
  lesson: Lesson | null;
  attendanceTaken: boolean;
}

function buildTodayPeriods(
  slots: TimetableSlot[],
  lessons: Lesson[],
  attendanceLessonIds: Set<number>,
  config: SchoolTimeConfig,
): PeriodEntry[] {
  if (slots.length === 0) return [];
  const periodNumbers = slots.map((s) => s.period_number);
  const minPeriod = Math.min(...periodNumbers);
  const maxPeriod = Math.max(...periodNumbers);

  const entries: PeriodEntry[] = [];
  for (let p = minPeriod; p <= maxPeriod; p++) {
    const slot = slots.find((s) => s.period_number === p);
    const { start, end } = periodTimes(p, config);
    const lesson = slot
      ? (lessons.find((l) => l.start_time.slice(0, 5) === start && l.school_class === slot.school_class) ?? null)
      : null;
    entries.push({
      periodNumber: p,
      start,
      end,
      lesson,
      attendanceTaken: lesson ? attendanceLessonIds.has(lesson.id) : false,
    });
  }
  return entries;
}

type PeriodTone = "open" | "taken" | "upcoming" | "missed" | "empty";

const BADGE_CLASS: Record<PeriodTone, string> = {
  open: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  taken: "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400",
  upcoming: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  missed: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  empty: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600",
};

function periodStatus(entry: PeriodEntry, now: number): { tone: PeriodTone; label: string } {
  if (!entry.lesson) return { tone: "empty", label: "Dars yo'q" };
  if (entry.attendanceTaken) return { tone: "taken", label: "Davomat olingan" };
  const opensAt = windowOpensAt(entry.lesson);
  const closesAt = windowClosesAt(entry.lesson);
  if (now < opensAt) return { tone: "upcoming", label: "Keyingi dars" };
  if (now >= closesAt) return { tone: "missed", label: "Vaqti o'tgan" };
  return { tone: "open", label: "Davomat olish mumkin" };
}

function PeriodBadgeNumber({ n, tone }: { n: number; tone: PeriodTone }) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${BADGE_CLASS[tone]}`}
    >
      {n}
    </span>
  );
}

function TodayPeriodCard({
  entry,
  now,
  expanded,
  onToggle,
}: {
  entry: PeriodEntry;
  now: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const timeLabel = `${entry.start}–${entry.end}`;

  if (!entry.lesson) {
    return (
      <div className="card-inset flex items-center gap-4 border-dashed px-5 py-4">
        <PeriodBadgeNumber n={entry.periodNumber} tone="empty" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-400 dark:text-slate-500">Darsingiz yo'q</p>
          <p className="text-xs text-slate-400 dark:text-slate-600">
            {timeLabel} · Bugun bu vaqtda sizga dars biriktirilmagan
          </p>
        </div>
      </div>
    );
  }

  const status = periodStatus(entry, now);
  const lesson = entry.lesson;

  return (
    <div className="card">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-4 px-5 py-4 text-left">
        <PeriodBadgeNumber n={entry.periodNumber} tone={status.tone} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900 dark:text-slate-50">
            {lesson.school_class_name} · {lesson.subject_name}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {timeLabel}
            {lesson.room && ` · ${lesson.room}`}
          </p>
        </div>
        <Badge
          tone={
            status.tone === "open"
              ? "emerald"
              : status.tone === "taken"
                ? "brand"
                : status.tone === "upcoming"
                  ? "amber"
                  : "slate"
          }
          className="shrink-0"
        >
          {status.label}
        </Badge>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <AttendanceForm lesson={lesson} onDone={onToggle} />
        </div>
      )}
    </div>
  );
}

function TomorrowPreviewCard({ slot, config }: { slot: TimetableSlot; config: SchoolTimeConfig | undefined }) {
  const time = config ? periodTimes(slot.period_number, config) : null;
  return (
    <div className="flex items-center gap-4 card px-5 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        {slot.period_number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900 dark:text-slate-50">
          {slot.school_class_name} · {slot.subject_name}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {time ? `${time.start}–${time.end}` : `${slot.period_number}-dars`}
          {slot.room && ` · ${slot.room}`}
        </p>
      </div>
      <Badge tone="slate" className="shrink-0">
        Davomat ertaga olinadi
      </Badge>
    </div>
  );
}

export function TeacherAttendancePage() {
  const { user } = useAuth();
  const teacherId = user?.teacher_profile_id ?? null;
  const now = useNow();
  const [expandedPeriod, setExpandedPeriod] = useState<number | null>(null);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayIsoStr = isoDate(today);
  const todayDow = schoolWeekdayOf(today);
  const tomorrowDow = schoolWeekdayOf(tomorrow);

  const { data: config } = useQuery({
    queryKey: ["school-config"],
    queryFn: async () => (await api.get<SchoolTimeConfig>("/school-config/")).data,
  });

  const todaySlotsQuery = useQuery({
    queryKey: ["timetable-slots", "teacher", teacherId, todayDow],
    enabled: teacherId != null && todayDow != null,
    queryFn: async () =>
      (
        await api.get<Paginated<TimetableSlot>>("/timetable-slots/", {
          params: { day_of_week: todayDow, teacher: teacherId },
        })
      ).data.results,
  });

  const tomorrowSlotsQuery = useQuery({
    queryKey: ["timetable-slots", "teacher", teacherId, tomorrowDow],
    enabled: teacherId != null && tomorrowDow != null,
    queryFn: async () =>
      (
        await api.get<Paginated<TimetableSlot>>("/timetable-slots/", {
          params: { day_of_week: tomorrowDow, teacher: teacherId },
        })
      ).data.results,
  });

  const todayLessonsQuery = useQuery({
    queryKey: ["lessons", "teacher", teacherId, todayIsoStr],
    enabled: teacherId != null,
    queryFn: async () =>
      (
        await api.get<Paginated<Lesson>>("/lessons/", {
          params: { date: todayIsoStr, teacher: teacherId },
        })
      ).data.results,
  });

  const todayAttendanceQuery = useQuery({
    queryKey: ["attendance", "teacher", teacherId, todayIsoStr],
    enabled: teacherId != null,
    queryFn: async () =>
      (
        await api.get<Paginated<AttendanceRecord>>("/attendance/", {
          params: { date: todayIsoStr, teacher: teacherId },
        })
      ).data.results,
  });

  const loading =
    todaySlotsQuery.isLoading || todayLessonsQuery.isLoading || todayAttendanceQuery.isLoading || !config;
  const errored = todaySlotsQuery.isError || todayLessonsQuery.isError || todayAttendanceQuery.isError;

  const periods =
    config && todaySlotsQuery.data && todayLessonsQuery.data && todayAttendanceQuery.data
      ? buildTodayPeriods(
          todaySlotsQuery.data,
          todayLessonsQuery.data,
          new Set(todayAttendanceQuery.data.map((r) => r.lesson)),
          config,
        )
      : [];

  const lessonPeriods = periods.filter((p) => p.lesson);
  const takenCount = lessonPeriods.filter((p) => p.attendanceTaken).length;
  const remainingCount = lessonPeriods.length - takenCount;

  const tomorrowSlots = [...(tomorrowSlotsQuery.data ?? [])].sort((a, b) => a.period_number - b.period_number);

  return (
    <div className="space-y-8">
      <PageHeader title="Davomat" subtitle="Bugungi va ertangi darslaringiz shu yerda." />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={CalendarDays}
          label="Bugun"
          value={`${today.getDate()}-${MONTH_NAMES_UZ[today.getMonth()]}`}
          hint={WEEKDAY_NAMES_UZ[today.getDay()]}
        />
        <StatCard icon={BookOpen} label="Bugungi darslar" value={lessonPeriods.length} />
        <StatCard icon={CheckCircle2} label="Davomat olingan" value={takenCount} tone="emerald" />
        <StatCard icon={Hourglass} label="Qolgan" value={remainingCount} tone="amber" />
      </div>

      <div>
        <h2 className="mb-3 section-title">Bugungi darslar</h2>

        {loading && <LoadingState />}
        {!loading && errored && <ErrorState />}

        {!loading && !errored && periods.length === 0 && (
          <EmptyState
            icon={CalendarDays}
            title="Bugun darslaringiz yo'q"
            description="Ertangi darslaringizni pastda ko'rishingiz mumkin."
          />
        )}

        {!loading && !errored && periods.length > 0 && (
          <div className="space-y-3">
            {periods.map((entry) => (
              <TodayPeriodCard
                key={entry.periodNumber}
                entry={entry}
                now={now}
                expanded={expandedPeriod === entry.periodNumber}
                onToggle={() =>
                  setExpandedPeriod(expandedPeriod === entry.periodNumber ? null : entry.periodNumber)
                }
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 section-title">Ertangi darslar</h2>
        {tomorrowSlotsQuery.isLoading && <LoadingState />}
        {tomorrowSlotsQuery.isError && <ErrorState />}
        {tomorrowSlotsQuery.data && tomorrowSlots.length === 0 && (
          <EmptyState title="Ertaga darsingiz yo'q" />
        )}
        {tomorrowSlots.length > 0 && (
          <div className="space-y-3">
            {tomorrowSlots.map((slot) => (
              <TomorrowPreviewCard key={slot.id} slot={slot} config={config} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
