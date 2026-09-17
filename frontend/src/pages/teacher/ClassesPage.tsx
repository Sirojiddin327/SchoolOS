import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { Paginated, RosterStudent, SchoolClass } from "../../types";

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

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Mening sinflarim</h1>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.results.length === 0 && (
        <EmptyState title="Sizga hali sinf biriktirilmagan" />
      )}

      {data && data.results.length > 0 && (
        <div className="space-y-3">
          {data.results.map((cls) => (
            <div key={cls.id} className="rounded-xl border border-slate-200 bg-white">
              <button
                onClick={() => setExpandedId(expandedId === cls.id ? null : cls.id)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <div>
                  <p className="font-semibold text-slate-900">{cls.name}</p>
                  <p className="text-sm text-slate-500">
                    {cls.class_teacher_name === null
                      ? "Sinf rahbari tayinlanmagan"
                      : `Sinf rahbari: ${cls.class_teacher_name}`}{" "}
                    · {cls.students_count} o'quvchi
                  </p>
                </div>
                <span className="text-slate-400">{expandedId === cls.id ? "▲" : "▼"}</span>
              </button>
              {expandedId === cls.id && (
                <div className="border-t border-slate-100 px-5 py-4">
                  {!roster && <LoadingState label="Ro'yxat yuklanmoqda..." />}
                  {roster && roster.length === 0 && (
                    <EmptyState title="Bu sinfda hali o'quvchi yo'q" />
                  )}
                  {roster && roster.length > 0 && (
                    <ul className="space-y-1 text-sm">
                      {roster.map((student) => (
                        <li key={student.id} className="flex justify-between text-slate-700">
                          <span>{student.full_name}</span>
                          <span className="text-slate-400">{student.email}</span>
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
