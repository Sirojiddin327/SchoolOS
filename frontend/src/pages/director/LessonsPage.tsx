import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Field, Input, PrimaryButton, Select, SecondaryButton } from "../../components/form";
import { Modal } from "../../components/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { Lesson, Paginated, SchoolClass, Subject, Teacher } from "../../types";

interface LessonFormState {
  subject: string;
  school_class: string;
  teacher: string;
  date: string;
  start_time: string;
  end_time: string;
  room: string;
  topic: string;
}

const EMPTY_FORM: LessonFormState = {
  subject: "",
  school_class: "",
  teacher: "",
  date: "",
  start_time: "",
  end_time: "",
  room: "",
  topic: "",
};

export function LessonsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<LessonFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ school_class: "", subject: "", date: "" });

  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await api.get<Paginated<SchoolClass>>("/classes/")).data,
  });
  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await api.get<Paginated<Subject>>("/subjects/")).data,
  });
  const { data: teachers } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => (await api.get<Paginated<Teacher>>("/teachers/")).data,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["lessons", filters],
    queryFn: async () =>
      (
        await api.get<Paginated<Lesson>>("/lessons/", {
          params: {
            school_class: filters.school_class || undefined,
            subject: filters.subject || undefined,
            date: filters.date || undefined,
          },
        })
      ).data,
  });

  const createLesson = useMutation({
    mutationFn: async (payload: LessonFormState) =>
      (
        await api.post("/lessons/", {
          ...payload,
          subject: Number(payload.subject),
          school_class: Number(payload.school_class),
          teacher: Number(payload.teacher),
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setError(null);
    },
    onError: (err: unknown) => {
      const detail =
        (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      setError(detail ? Object.values(detail).flat().join(" ") : "Saqlashda xatolik.");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Darslar</h1>
        <PrimaryButton onClick={() => setModalOpen(true)}>+ Dars qo'shish</PrimaryButton>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={filters.school_class}
          onChange={(e) => setFilters({ ...filters, school_class: e.target.value })}
          className="max-w-[180px]"
        >
          <option value="">Barcha sinflar</option>
          {classes?.results.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </Select>
        <Select
          value={filters.subject}
          onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
          className="max-w-[180px]"
        >
          <option value="">Barcha fanlar</option>
          {subjects?.results.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={filters.date}
          onChange={(e) => setFilters({ ...filters, date: e.target.value })}
          className="max-w-[180px]"
        />
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.results.length === 0 && <EmptyState title="Bu filtrga mos dars topilmadi" />}

      {data && data.results.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Sana</th>
                <th className="px-4 py-3 font-medium">Vaqt</th>
                <th className="px-4 py-3 font-medium">Sinf</th>
                <th className="px-4 py-3 font-medium">Fan</th>
                <th className="px-4 py-3 font-medium">O'qituvchi</th>
                <th className="px-4 py-3 font-medium">Xona</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.results.map((lesson) => (
                <tr key={lesson.id}>
                  <td className="px-4 py-3 text-slate-700">{lesson.date}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {lesson.start_time.slice(0, 5)}–{lesson.end_time.slice(0, 5)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{lesson.school_class_name}</td>
                  <td className="px-4 py-3 text-slate-700">{lesson.subject_name}</td>
                  <td className="px-4 py-3 text-slate-700">{lesson.teacher_name}</td>
                  <td className="px-4 py-3 text-slate-500">{lesson.room || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <Modal title="Dars qo'shish" onClose={() => setModalOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createLesson.mutate(form);
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sinf">
                <Select
                  required
                  value={form.school_class}
                  onChange={(e) => setForm({ ...form, school_class: e.target.value })}
                >
                  <option value="">— tanlang —</option>
                  {classes?.results.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Fan">
                <Select
                  required
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                >
                  <option value="">— tanlang —</option>
                  {subjects?.results.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="O'qituvchi">
              <Select
                required
                value={form.teacher}
                onChange={(e) => setForm({ ...form, teacher: e.target.value })}
              >
                <option value="">— tanlang —</option>
                {teachers?.results.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.first_name} {teacher.last_name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Sana">
                <Input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </Field>
              <Field label="Boshlanishi">
                <Input
                  type="time"
                  required
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                />
              </Field>
              <Field label="Tugashi">
                <Input
                  type="time"
                  required
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Xona">
                <Input
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                />
              </Field>
              <Field label="Mavzu">
                <Input
                  value={form.topic}
                  onChange={(e) => setForm({ ...form, topic: e.target.value })}
                />
              </Field>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton type="button" onClick={() => setModalOpen(false)}>
                Bekor qilish
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={createLesson.isPending}>
                {createLesson.isPending ? "Saqlanmoqda..." : "Saqlash"}
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
