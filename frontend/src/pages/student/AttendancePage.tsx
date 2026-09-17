import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Field, Input } from "../../components/form";
import { StatCard } from "../../components/StatCard";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
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
      <h1 className="text-xl font-bold text-slate-900">Mening davomatim</h1>

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
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Sana</th>
                <th className="px-4 py-3 font-medium">Fan</th>
                <th className="px-4 py-3 font-medium">Holat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyQuery.data.results.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-3 text-slate-700">{record.lesson_date}</td>
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
  );
}
