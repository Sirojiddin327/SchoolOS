import { useQuery } from "@tanstack/react-query";

import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { Paginated, RosterStudent, SchoolClass } from "../../types";

export function StudentClassPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await api.get<Paginated<SchoolClass>>("/classes/")).data,
  });

  const myClass = data?.results[0];

  const { data: roster, isLoading: rosterLoading } = useQuery({
    queryKey: ["classes", myClass?.id, "students"],
    enabled: Boolean(myClass),
    queryFn: async () => (await api.get<RosterStudent[]>(`/classes/${myClass!.id}/students/`)).data,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Mening sinfim</h1>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && !myClass && (
        <EmptyState
          title="Siz hali biror sinfga biriktirilmagansiz"
          description="Direktor sizni sinfga qo'shgach, bu yerda ko'rinadi."
        />
      )}

      {myClass && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-lg font-semibold text-slate-900">{myClass.name}</p>
            <p className="text-sm text-slate-500">
              Sinf rahbari: {myClass.class_teacher_name ?? "tayinlanmagan"} ·{" "}
              {myClass.students_count} o'quvchi
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Sinfdoshlarim</h2>
            {rosterLoading && <LoadingState />}
            {roster && roster.length > 0 && (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {roster.map((student) => (
                  <li key={student.id} className="flex justify-between px-4 py-3 text-sm">
                    <span className="text-slate-800">{student.full_name}</span>
                    <span className="text-slate-400">{student.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
