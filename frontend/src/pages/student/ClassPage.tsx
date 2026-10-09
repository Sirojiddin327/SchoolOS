import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "../../components/PageHeader";
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
      <PageHeader title="Mening sinfim" />

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
          <div>
            <p className="text-lg font-semibold text-ink">{myClass.name}</p>
            <p className="text-sm text-ink-muted">
              Sinf rahbari: {myClass.class_teacher_name ?? "tayinlanmagan"} ·{" "}
              {myClass.students_count} o'quvchi
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-ink">Sinfdoshlarim</h2>
            {rosterLoading && <LoadingState />}
            {roster && roster.length > 0 && (
              <ul className="divide-y divide-line-soft">
                {roster.map((student) => (
                  <li key={student.id} className="py-3 text-sm">
                    <span className="text-ink">{student.full_name}</span>
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
