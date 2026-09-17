import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { Field, Input, PrimaryButton, Select, SecondaryButton } from "../../components/form";
import { Modal } from "../../components/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { Paginated, SchoolClass, Student } from "../../types";

interface StudentFormState {
  email: string;
  first_name: string;
  last_name: string;
  school_class: string;
  password: string;
}

const EMPTY_FORM: StudentFormState = {
  email: "",
  first_name: "",
  last_name: "",
  school_class: "",
  password: "",
};

export function StudentsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<StudentFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["students"],
    queryFn: async () => (await api.get<Paginated<Student>>("/students/")).data,
  });

  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await api.get<Paginated<SchoolClass>>("/classes/")).data,
  });

  const createStudent = useMutation({
    mutationFn: async (payload: StudentFormState) =>
      (
        await api.post("/students/", {
          ...payload,
          school_class: payload.school_class ? Number(payload.school_class) : null,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setError(null);
    },
    onError: () => setError("Saqlashda xatolik. Email band bo'lishi mumkin."),
  });

  const toggleActive = useMutation({
    mutationFn: async (student: Student) =>
      (await api.patch(`/students/${student.id}/`, { is_active: !student.is_active })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["students"] }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createStudent.mutate(form);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">O'quvchilar</h1>
        <PrimaryButton onClick={() => setModalOpen(true)}>+ O'quvchi qo'shish</PrimaryButton>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.results.length === 0 && (
        <EmptyState title="Hali o'quvchi yo'q" description="Yuqoridagi tugma orqali qo'shing." />
      )}

      {data && data.results.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Ism</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Sinf</th>
                <th className="px-4 py-3 font-medium">Holat</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.results.map((student) => (
                <tr key={student.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {student.first_name} {student.last_name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{student.email}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {student.school_class_name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        student.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {student.is_active ? "Faol" : "Faol emas"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleActive.mutate(student)}
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      {student.is_active ? "Faolsizlantirish" : "Faollashtirish"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <Modal title="O'quvchi qo'shish" onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ism">
                <Input
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                />
              </Field>
              <Field label="Familiya">
                <Input
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Sinf">
              <Select
                value={form.school_class}
                onChange={(e) => setForm({ ...form, school_class: e.target.value })}
              >
                <option value="">— tanlanmagan —</option>
                {classes?.results.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Vaqtinchalik parol">
              <Input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton type="button" onClick={() => setModalOpen(false)}>
                Bekor qilish
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={createStudent.isPending}>
                {createStudent.isPending ? "Saqlanmoqda..." : "Saqlash"}
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
