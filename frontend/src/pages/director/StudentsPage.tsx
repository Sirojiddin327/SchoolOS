import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { Badge } from "../../components/Badge";
import { Field, Input, PrimaryButton, Select, SecondaryButton } from "../../components/form";
import { Modal } from "../../components/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "../../components/table";
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
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">O'quvchilar</h1>
        <PrimaryButton onClick={() => setModalOpen(true)}>+ O'quvchi qo'shish</PrimaryButton>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.results.length === 0 && (
        <EmptyState title="Hali o'quvchi yo'q" description="Yuqoridagi tugma orqali qo'shing." />
      )}

      {data && data.results.length > 0 && (
        <Table>
          <Thead>
            <Tr>
              <Th>Ism</Th>
              <Th>Email</Th>
              <Th>Sinf</Th>
              <Th>Holat</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {data.results.map((student) => (
              <Tr key={student.id}>
                <Td className="font-medium text-slate-900 dark:text-slate-50">
                  {student.first_name} {student.last_name}
                </Td>
                <Td className="text-slate-600 dark:text-slate-300">{student.email}</Td>
                <Td className="text-slate-600 dark:text-slate-300">
                  {student.school_class_name ?? "—"}
                </Td>
                <Td>
                  <Badge tone={student.is_active ? "emerald" : "slate"}>
                    {student.is_active ? "Faol" : "Faol emas"}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <button
                    onClick={() => toggleActive.mutate(student)}
                    className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {student.is_active ? "Faolsizlantirish" : "Faollashtirish"}
                  </button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
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
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
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
