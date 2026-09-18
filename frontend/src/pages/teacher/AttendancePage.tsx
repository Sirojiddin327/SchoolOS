import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Field, Input, PrimaryButton } from "../../components/form";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { AttendanceRecord, AttendanceStatus, Lesson, Paginated, RosterStudent } from "../../types";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; icon: string }[] = [
  { value: "PRESENT", label: "Keldi", icon: "✅" },
  { value: "LATE", label: "Kechikdi", icon: "🕐" },
  { value: "ABSENT", label: "Kelmadi", icon: "❌" },
  { value: "EXCUSED", label: "Sababli", icon: "📄" },
];

const STATUS_COLOR: Record<AttendanceStatus, string> = {
  PRESENT: "bg-emerald-600 text-white",
  LATE: "bg-amber-500 text-white",
  ABSENT: "bg-red-600 text-white",
  EXCUSED: "bg-slate-500 text-white",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function AttendanceForm({ lesson, onDone }: { lesson: Lesson; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [statuses, setStatuses] = useState<Record<number, AttendanceStatus> | null>(null);
  const [saved, setSaved] = useState(false);

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

  if (rosterLoading || existingLoading || statuses === null || !roster) {
    return <LoadingState label="Ro'yxat yuklanmoqda..." />;
  }

  if (roster.length === 0) {
    return <EmptyState title="Bu sinfda hali o'quvchi yo'q" />;
  }

  return (
    <div className="space-y-3">
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {roster.map((student) => (
          <div key={student.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm font-medium text-slate-800">{student.full_name}</span>
            <div className="flex gap-1">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatuses({ ...statuses, [student.id]: option.value })}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    statuses[student.id] === option.value
                      ? STATUS_COLOR[option.value]
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {option.icon} {option.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <PrimaryButton onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saqlanmoqda..." : "Davomatni saqlash"}
        </PrimaryButton>
        {saved && <span className="text-sm text-emerald-600">Saqlandi ✓</span>}
        <button onClick={onDone} className="text-sm text-slate-500 hover:underline">
          Yopish
        </button>
      </div>
    </div>
  );
}

export function TeacherAttendancePage() {
  const [date, setDate] = useState(todayIso());
  const [expandedLessonId, setExpandedLessonId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["lessons", { date }],
    queryFn: async () =>
      (await api.get<Paginated<Lesson>>("/lessons/", { params: { date } })).data,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Davomat</h1>

      <Field label="Sana">
        <Input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setExpandedLessonId(null);
          }}
          className="max-w-[180px]"
        />
      </Field>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.results.length === 0 && <EmptyState title="Bu kunga dars topilmadi" />}

      {data && data.results.length > 0 && (
        <div className="space-y-3">
          {data.results.map((lesson) => (
            <div key={lesson.id} className="rounded-xl border border-slate-200 bg-white">
              <button
                onClick={() =>
                  setExpandedLessonId(expandedLessonId === lesson.id ? null : lesson.id)
                }
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {lesson.subject_name} — {lesson.school_class_name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {lesson.start_time.slice(0, 5)}–{lesson.end_time.slice(0, 5)}
                    {lesson.room && ` · ${lesson.room}`}
                  </p>
                </div>
                <span className="text-sm font-medium text-brand-600">
                  {expandedLessonId === lesson.id ? "Yopish ▲" : "Davomat olish ▼"}
                </span>
              </button>
              {expandedLessonId === lesson.id && (
                <div className="border-t border-slate-100 px-5 py-4">
                  <AttendanceForm lesson={lesson} onDone={() => setExpandedLessonId(null)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
