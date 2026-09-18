import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Field, Input, Select } from "../../components/form";
import { StatCard } from "../../components/StatCard";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "../../components/table";
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
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Davomat</h1>

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
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Tarix</h2>
        {historyQuery.isLoading && <LoadingState />}
        {historyQuery.isError && <ErrorState />}
        {historyQuery.data && historyQuery.data.results.length === 0 && (
          <EmptyState title="Bu filtrga mos davomat yozuvi yo'q" />
        )}
        {historyQuery.data && historyQuery.data.results.length > 0 && (
          <Table>
            <Thead>
              <Tr>
                <Th>Sana</Th>
                <Th>O'quvchi</Th>
                <Th>Sinf</Th>
                <Th>Fan</Th>
                <Th>Holat</Th>
              </Tr>
            </Thead>
            <Tbody>
              {historyQuery.data.results.map((record) => (
                <Tr key={record.id}>
                  <Td className="text-slate-700 dark:text-slate-200">{record.lesson_date}</Td>
                  <Td className="text-slate-700 dark:text-slate-200">{record.student_name}</Td>
                  <Td className="text-slate-700 dark:text-slate-200">{record.school_class_name}</Td>
                  <Td className="text-slate-700 dark:text-slate-200">{record.subject_name}</Td>
                  <Td className="text-slate-700 dark:text-slate-200">
                    {STATUS_LABEL[record.status] ?? record.status}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
