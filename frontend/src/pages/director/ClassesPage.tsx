import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Field, Input, PrimaryButton, Select, SecondaryButton } from "../../components/form";
import { Modal } from "../../components/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { Paginated, RosterStudent, SchoolClass, Teacher } from "../../types";

export function ClassesPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [classTeacherId, setClassTeacherId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await api.get<Paginated<SchoolClass>>("/classes/")).data,
  });

  const { data: teachers } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => (await api.get<Paginated<Teacher>>("/teachers/")).data,
  });

  const { data: roster } = useQuery({
    queryKey: ["classes", expandedId, "students"],
    enabled: expandedId !== null,
    queryFn: async () =>
      (await api.get<RosterStudent[]>(`/classes/${expandedId}/students/`)).data,
  });

  const createClass = useMutation({
    mutationFn: async () =>
      (
        await api.post("/classes/", {
          name,
          class_teacher: classTeacherId ? Number(classTeacherId) : null,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      setModalOpen(false);
      setName("");
      setClassTeacherId("");
      setError(null);
    },
    onError: () => setError("Saqlashda xatolik. Sinf nomi band bo'lishi mumkin."),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Sinflar</h1>
        <PrimaryButton onClick={() => setModalOpen(true)}>+ Sinf qo'shish</PrimaryButton>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.results.length === 0 && (
        <EmptyState title="Hali sinf yo'q" description="Yuqoridagi tugma orqali qo'shing." />
      )}

      {data && data.results.length > 0 && (
        <div className="space-y-3">
          {data.results.map((cls) => (
            <div key={cls.id} className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <button
                onClick={() => setExpandedId(expandedId === cls.id ? null : cls.id)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-50">{cls.name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Sinf rahbari: {cls.class_teacher_name ?? "tayinlanmagan"} ·{" "}
                    {cls.students_count} o'quvchi
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
                        <li key={student.id} className="flex justify-between text-slate-700 dark:text-slate-200">
                          <span>{student.full_name}</span>
                          <span className="text-slate-400 dark:text-slate-500">{student.email}</span>
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

      {isModalOpen && (
        <Modal title="Sinf qo'shish" onClose={() => setModalOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createClass.mutate();
            }}
            className="space-y-4"
          >
            <Field label="Sinf nomi (masalan, 9-V)">
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Sinf rahbari">
              <Select
                value={classTeacherId}
                onChange={(e) => setClassTeacherId(e.target.value)}
              >
                <option value="">— tanlanmagan —</option>
                {teachers?.results.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.first_name} {teacher.last_name} ({teacher.email})
                  </option>
                ))}
              </Select>
            </Field>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton type="button" onClick={() => setModalOpen(false)}>
                Bekor qilish
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={createClass.isPending}>
                {createClass.isPending ? "Saqlanmoqda..." : "Saqlash"}
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
