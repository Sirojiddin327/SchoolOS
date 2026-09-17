import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Field, Input, Select } from "../../components/form";
import { StatCard } from "../../components/StatCard";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { AttendanceRecord, ClassAttendanceSummary, Paginated, SchoolClass } from "../../types";

const STATUS_LABEL: Record<string, string> = {
  PRESENT: "Keldi",
  LATE: "Kechikdi",
  ABSENT: "Kelmadi",
  EXCUSED: "Sababli",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function AttendancePage() {
  const [selectedClass, setSelectedClass] = useState("");
  const [date, setDate] = useState(todayIso());

  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await api.get<Paginated<SchoolClass>>("/classes/")).data,
  });

  const summaryQuery = useQuery({
    queryKey: ["attendance", "class-summary", selectedClass, date],
    enabled: Boolean(selectedClass),
    queryFn: async () =>
      (
        await api.get<ClassAttendanceSummary>("/attendance/class-summary/", {
          params: { school_class: selectedClass, date },
        })
      ).data,
  });

  const historyQuery = useQuery({
    queryKey: ["attendance", "history", selectedClass, date],
    queryFn: async () =>
      (
        await api.get<Paginated<AttendanceRecord>>("/attendance/", {
          params: { school_class: selectedClass || undefined, date: date || undefined },
        })
      ).data,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Davomat</h1>

      <div className="flex flex-wrap gap-3">
        <Field label="Sinf">
          <Select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="min-w-[160px]"
          >
            <option value="">Barcha sinflar</option>
            {classes?.results.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sana">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-w-[160px]"
          />
        </Field>
      </div>

      {selectedClass && summaryQuery.isLoading && <LoadingState />}
      {selectedClass && summaryQuery.isError && <ErrorState />}
      {selectedClass && summaryQuery.data && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard label="Jami o'quvchi" value={summaryQuery.data.total_students} />
          <StatCard label="Keldi" value={summaryQuery.data.present} />
          <StatCard label="Kechikdi" value={summaryQuery.data.late} />
          <StatCard label="Kelmadi" value={summaryQuery.data.absent} />
          <StatCard label="Sababli" value={summaryQuery.data.excused} />
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Tarix</h2>
        {historyQuery.isLoading && <LoadingState />}
        {historyQuery.isError && <ErrorState />}
        {historyQuery.data && historyQuery.data.results.length === 0 && (
          <EmptyState title="Bu filtrga mos davomat yozuvi yo'q" />
        )}
        {historyQuery.data && historyQuery.data.results.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Sana</th>
                  <th className="px-4 py-3 font-medium">O'quvchi</th>
                  <th className="px-4 py-3 font-medium">Sinf</th>
                  <th className="px-4 py-3 font-medium">Fan</th>
                  <th className="px-4 py-3 font-medium">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyQuery.data.results.map((record) => (
                  <tr key={record.id}>
                    <td className="px-4 py-3 text-slate-700">{record.lesson_date}</td>
                    <td className="px-4 py-3 text-slate-700">{record.student_name}</td>
                    <td className="px-4 py-3 text-slate-700">{record.school_class_name}</td>
                    <td className="px-4 py-3 text-slate-700">{record.subject_name}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {STATUS_LABEL[record.status] ?? record.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
