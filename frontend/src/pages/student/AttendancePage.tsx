import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Field, Input } from "../../components/form";
import { StatCard } from "../../components/StatCard";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "../../components/table";
import { api } from "../../lib/api";
import type { AttendanceRecord, Paginated, StudentDashboard } from "../../types";

const STATUS_LABEL: Record<string, string> = {
  PRESENT: "Keldi",
  LATE: "Kechikdi",
  ABSENT: "Kelmadi",
  EXCUSED: "Sababli",
};

export function StudentAttendancePage() {
  const [date, setDate] = useState("");

  const summaryQuery = useQuery({
    queryKey: ["dashboard", "student"],
    queryFn: async () => (await api.get<StudentDashboard>("/dashboard/student/")).data,
  });

  const historyQuery = useQuery({
    queryKey: ["attendance", "history", date],
    queryFn: async () =>
      (
        await api.get<Paginated<AttendanceRecord>>("/attendance/", {
          params: { date: date || undefined },
        })
      ).data,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Mening davomatim</h1>

      {summaryQuery.isLoading && <LoadingState />}
      {summaryQuery.data && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Keldi" value={summaryQuery.data.attendance_summary.present} />
          <StatCard label="Kechikdi" value={summaryQuery.data.attendance_summary.late} />
          <StatCard label="Kelmadi" value={summaryQuery.data.attendance_summary.absent} />
          <StatCard label="Sababli" value={summaryQuery.data.attendance_summary.excused} />
        </div>
      )}

      <Field label="Sana">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="max-w-[180px]"
        />
      </Field>

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
              <Th>Fan</Th>
              <Th>Holat</Th>
            </Tr>
          </Thead>
          <Tbody>
            {historyQuery.data.results.map((record) => (
              <Tr key={record.id}>
                <Td className="text-slate-700 dark:text-slate-200">{record.lesson_date}</Td>
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
  );
}
