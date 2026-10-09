import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, School } from "lucide-react";
import { useState } from "react";

import { Badge } from "../../components/Badge";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import { todayISODate } from "../../lib/schoolTime";
import { TONE_TEXT, type Tone } from "../../lib/tones";
import type { ClassAttendanceSummary, Paginated, RosterStudent, SchoolClass } from "../../types";

function todayIso() {
  return todayISODate();
}

function NameList({ title, tone, students }: { title: string; tone: Tone; students: RosterStudent[] }) {
  const toneClass = TONE_TEXT[tone];
  return (
    <div>
      <p className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${toneClass}`}>
        {title} ({students.length})
      </p>
      {students.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">—</p>
      ) : (
        <ul className="space-y-1">
          {students.map((student) => (
            <li key={student.id} className="text-sm text-slate-700 dark:text-slate-200">
              {student.full_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HomeroomClassCard({ cls }: { cls: SchoolClass }) {
  const [showRoster, setShowRoster] = useState(false);
  const today = todayIso();

  const { data: summary, isLoading, isError } = useQuery({
    queryKey: ["attendance", "class-summary", cls.id, today],
    queryFn: async () =>
      (
        await api.get<ClassAttendanceSummary>("/attendance/class-summary/", {
          params: { school_class: cls.id, date: today },
        })
      ).data,
  });

  const { data: roster } = useQuery({
    queryKey: ["classes", cls.id, "students"],
    enabled: showRoster,
    queryFn: async () => (await api.get<RosterStudent[]>(`/classes/${cls.id}/students/`)).data,
  });

  return (
    <div className="rounded-2xl border-2 border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 dark:border-brand-500/30 dark:from-brand-500/10 dark:to-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <School size={16} className="text-brand-600 dark:text-brand-400" />
            <Badge tone="brand">Mening sinfim</Badge>
          </div>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-50">{cls.name}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{cls.students_count} o'quvchi</p>
        </div>
      </div>

      <div className="mt-4 border-t border-brand-100 pt-4 dark:border-brand-500/20">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Bugungi davomat
        </p>
        {isLoading && <LoadingState label="Yuklanmoqda..." />}
        {isError && <ErrorState />}
        {summary && (
          <>
            <div className="mb-4 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 size={15} />
                {summary.present} keldi
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                <Clock size={15} />
                {summary.late} kechikdi
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">
                <AlertTriangle size={15} />
                {summary.absent} kelmadi
              </span>
            </div>

            {summary.present + summary.late + summary.absent + summary.excused === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">Bugun hali davomat belgilanmagan.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <NameList title="Kelmaganlar" tone="rose" students={summary.absent_students} />
                <NameList title="Kechikkanlar" tone="amber" students={summary.late_students} />
              </div>
            )}
          </>
        )}
      </div>

      <button
        onClick={() => setShowRoster(!showRoster)}
        className="mt-4 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        {showRoster ? "Ro'yxatni yashirish" : "Sinf ro'yxatini ko'rish"}
      </button>
      {showRoster && (
        <div className="mt-3 border-t border-brand-100 pt-3 dark:border-brand-500/20">
          {!roster && <LoadingState label="Ro'yxat yuklanmoqda..." />}
          {roster && roster.length === 0 && <EmptyState title="Bu sinfda hali o'quvchi yo'q" />}
          {roster && roster.length > 0 && (
            <ul className="space-y-1 text-sm">
              {roster.map((student) => (
                <li key={student.id} className="text-slate-700 dark:text-slate-200">
                  {student.full_name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function TeacherClassesPage() {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await api.get<Paginated<SchoolClass>>("/classes/")).data,
  });

  const { data: roster } = useQuery({
    queryKey: ["classes", expandedId, "students"],
    enabled: expandedId !== null,
    queryFn: async () =>
      (await api.get<RosterStudent[]>(`/classes/${expandedId}/students/`)).data,
  });

  const homeroomClasses = data?.results.filter((cls) => cls.is_my_homeroom) ?? [];
  const otherClasses = data?.results.filter((cls) => !cls.is_my_homeroom) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Mening sinflarim" />

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.results.length === 0 && (
        <EmptyState title="Sizga hali sinf biriktirilmagan" />
      )}

      {homeroomClasses.length > 0 && (
        <div className="space-y-4">
          {homeroomClasses.map((cls) => (
            <HomeroomClassCard key={cls.id} cls={cls} />
          ))}
        </div>
      )}

      {otherClasses.length > 0 && (
        <div className="space-y-3">
          {homeroomClasses.length > 0 && (
            <h2 className="section-title">Dars beradigan sinflarim</h2>
          )}
          {otherClasses.map((cls) => (
            <div key={cls.id} className="card">
              <button
                onClick={() => setExpandedId(expandedId === cls.id ? null : cls.id)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-50">{cls.name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {cls.class_teacher_name === null
                      ? "Sinf rahbari tayinlanmagan"
                      : `Sinf rahbari: ${cls.class_teacher_name}`}{" "}
                    · {cls.students_count} o'quvchi
                  </p>
                </div>
                <span className="text-slate-400 dark:text-slate-500">{expandedId === cls.id ? "▲" : "▼"}</span>
              </button>
              {expandedId === cls.id && (
                <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
                  {!roster && <LoadingState label="Ro'yxat yuklanmoqda..." />}
                  {roster && roster.length === 0 && (
                    <EmptyState title="Bu sinfda hali o'quvchi yo'q" />
                  )}
                  {roster && roster.length > 0 && (
                    <ul className="space-y-1 text-sm">
                      {roster.map((student) => (
                        <li key={student.id} className="text-slate-700 dark:text-slate-200">
                          {student.full_name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
