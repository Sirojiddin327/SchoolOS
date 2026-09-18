import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { Badge } from "../../components/Badge";
import { Field, Input, PrimaryButton, SecondaryButton } from "../../components/form";
import { Modal } from "../../components/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "../../components/table";
import { api } from "../../lib/api";
import type { Paginated, Teacher } from "../../types";

interface TeacherFormState {
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  password: string;
}

const EMPTY_FORM: TeacherFormState = {
  email: "",
  first_name: "",
  last_name: "",
  phone_number: "",
  password: "",
};

export function TeachersPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<TeacherFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => (await api.get<Paginated<Teacher>>("/teachers/")).data,
  });

  const createTeacher = useMutation({
    mutationFn: async (payload: TeacherFormState) => (await api.post("/teachers/", payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teachers"] });
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setError(null);
    },
    onError: () => setError("Saqlashda xatolik. Email band bo'lishi mumkin."),
  });

  const toggleActive = useMutation({
    mutationFn: async (teacher: Teacher) =>
      (await api.patch(`/teachers/${teacher.id}/`, { is_active: !teacher.is_active })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teachers"] }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createTeacher.mutate(form);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">O'qituvchilar</h1>
        <PrimaryButton onClick={() => setModalOpen(true)}>+ O'qituvchi qo'shish</PrimaryButton>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.results.length === 0 && (
        <EmptyState title="Hali o'qituvchi yo'q" description="Yuqoridagi tugma orqali qo'shing." />
      )}

      {data && data.results.length > 0 && (
        <Table>
          <Thead>
            <Tr>
              <Th>Ism</Th>
              <Th>Email</Th>
              <Th>Telefon</Th>
              <Th>Holat</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {data.results.map((teacher) => (
              <Tr key={teacher.id}>
                <Td className="font-medium text-slate-900 dark:text-slate-50">
                  {teacher.first_name} {teacher.last_name}
                </Td>
                <Td className="text-slate-600 dark:text-slate-300">{teacher.email}</Td>
                <Td className="text-slate-600 dark:text-slate-300">{teacher.phone_number || "—"}</Td>
                <Td>
                  <Badge tone={teacher.is_active ? "emerald" : "slate"}>
                    {teacher.is_active ? "Faol" : "Faol emas"}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <button
                    onClick={() => toggleActive.mutate(teacher)}
                    className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {teacher.is_active ? "Faolsizlantirish" : "Faollashtirish"}
                  </button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {isModalOpen && (
        <Modal title="O'qituvchi qo'shish" onClose={() => setModalOpen(false)}>
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
            <Field label="Telefon">
              <Input
                value={form.phone_number}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
              />
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
              <PrimaryButton type="submit" disabled={createTeacher.isPending}>
                {createTeacher.isPending ? "Saqlanmoqda..." : "Saqlash"}
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
