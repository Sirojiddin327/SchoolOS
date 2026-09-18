import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Field, Input, PrimaryButton, Select, SecondaryButton } from "../../components/form";
import { Modal } from "../../components/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { Paginated, SchoolClass, Subject, Teacher, TimetableSlot } from "../../types";

const DAYS = [
  { value: 1, label: "Dushanba" },
  { value: 2, label: "Seshanba" },
  { value: 3, label: "Chorshanba" },
  { value: 4, label: "Payshanba" },
  { value: 5, label: "Juma" },
  { value: 6, label: "Shanba" },
];

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

function mondayOfCurrentWeekIso(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

interface SlotFormState {
  subject: string;
  teacher: string;
  room: string;
}

export function TimetablePage() {
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState("");
  const [editingCell, setEditingCell] = useState<{ day: number; period: number } | null>(null);
  const [form, setForm] = useState<SlotFormState>({ subject: "", teacher: "", room: "" });
  const [error, setError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(mondayOfCurrentWeekIso());
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);

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

  const { data: slots, isLoading, isError } = useQuery({
    queryKey: ["timetable-slots", classId],
    enabled: Boolean(classId),
    queryFn: async () =>
      (
        await api.get<Paginated<TimetableSlot>>("/timetable-slots/", {
          params: { school_class: classId },
        })
      ).data.results,
  });

  const slotAt = (day: number, period: number) =>
    slots?.find((s) => s.day_of_week === day && s.period_number === period);

  const saveSlot = useMutation({
    mutationFn: async () => {
      if (!editingCell) return;
      const existing = slotAt(editingCell.day, editingCell.period);
      const payload = {
        school_class: Number(classId),
        day_of_week: editingCell.day,
        period_number: editingCell.period,
        subject: Number(form.subject),
        teacher: Number(form.teacher),
        room: form.room,
      };
      if (existing) {
        return api.patch(`/timetable-slots/${existing.id}/`, payload);
      }
      return api.post("/timetable-slots/", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timetable-slots", classId] });
      setEditingCell(null);
      setError(null);
    },
    onError: () => setError("Saqlashda xatolik. O'qituvchi shu vaqtda band bo'lishi mumkin."),
  });

  const deleteSlot = useMutation({
    mutationFn: async (id: number) => api.delete(`/timetable-slots/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["timetable-slots", classId] }),
  });

  const generate = useMutation({
    mutationFn: async () =>
      (await api.post("/timetable/generate/", { week_start: weekStart })).data,
    onSuccess: (data) => {
      setGenerateMessage(`${data.length} ta dars yaratildi.`);
      setTimeout(() => setGenerateMessage(null), 4000);
    },
  });

  function openCell(day: number, period: number) {
    const existing = slotAt(day, period);
    setForm({
      subject: existing ? String(existing.subject) : "",
      teacher: existing ? String(existing.teacher) : "",
      room: existing?.room ?? "",
    });
    setError(null);
    setEditingCell({ day, period });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Dars jadvali</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Haftalik shablonni tuzing, keyin belgilangan haftaga real darslarni yarating.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <Field label="Hafta boshlanishi (Dushanba)">
            <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
          </Field>
          <PrimaryButton onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? "Yaratilmoqda..." : "Darslarni yaratish"}
          </PrimaryButton>
        </div>
      </div>
      {generateMessage && <p className="text-sm text-emerald-600 dark:text-emerald-400">{generateMessage}</p>}

      <Field label="Sinf">
        <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="max-w-xs">
          <option value="">— sinfni tanlang —</option>
          {classes?.results.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </Select>
      </Field>

      {!classId && <EmptyState title="Jadvalni ko'rish uchun avval sinfni tanlang" />}
      {classId && isLoading && <LoadingState />}
      {classId && isError && <ErrorState />}

      {classId && slots && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                  Dars
                </th>
                {DAYS.map((day) => (
                  <th
                    key={day.value}
                    className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400"
                  >
                    {day.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERIODS.map((period) => (
                <tr key={period}>
                  <td className="border-b border-r border-slate-100 px-3 py-2 font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    {period}
                  </td>
                  {DAYS.map((day) => {
                    const slot = slotAt(day.value, period);
                    return (
                      <td
                        key={day.value}
                        className="border-b border-slate-100 px-2 py-2 align-top dark:border-slate-800"
                      >
                        {slot ? (
                          <button
                            onClick={() => openCell(day.value, period)}
                            className="w-full rounded-md bg-brand-50 px-2 py-1.5 text-left hover:bg-brand-100 dark:bg-brand-500/10 dark:hover:bg-brand-500/20"
                          >
                            <p className="font-medium text-brand-700 dark:text-brand-300">{slot.subject_name}</p>
                            <p className="text-xs text-brand-600 dark:text-brand-400">{slot.teacher_name}</p>
                          </button>
                        ) : (
                          <button
                            onClick={() => openCell(day.value, period)}
                            className="w-full rounded-md border border-dashed border-slate-200 px-2 py-1.5 text-slate-300 hover:border-slate-300 hover:text-slate-400 dark:border-slate-700 dark:text-slate-600 dark:hover:border-slate-600 dark:hover:text-slate-500"
                          >
                            +
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingCell && (
        <Modal
          title={`${DAYS.find((d) => d.value === editingCell.day)?.label}, ${editingCell.period}-dars`}
          onClose={() => setEditingCell(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveSlot.mutate();
            }}
            className="space-y-4"
          >
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
            <Field label="Xona">
              <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
            </Field>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex items-center justify-between pt-2">
              {(() => {
                const existing = slotAt(editingCell.day, editingCell.period);
                return existing ? (
                  <button
                    type="button"
                    onClick={() => {
                      deleteSlot.mutate(existing.id);
                      setEditingCell(null);
                    }}
                    className="text-sm text-red-600 hover:underline dark:text-red-400"
                  >
                    O'chirish
                  </button>
                ) : (
                  <span />
                );
              })()}
              <div className="flex gap-2">
                <SecondaryButton type="button" onClick={() => setEditingCell(null)}>
                  Bekor qilish
                </SecondaryButton>
                <PrimaryButton type="submit" disabled={saveSlot.isPending}>
                  {saveSlot.isPending ? "Saqlanmoqda..." : "Saqlash"}
                </PrimaryButton>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
