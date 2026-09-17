import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Field, Input } from "../../components/form";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { Lesson, Paginated } from "../../types";

export function StudentLessonsPage() {
  const [date, setDate] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["lessons", { date }],
    queryFn: async () =>
      (
        await api.get<Paginated<Lesson>>("/lessons/", { params: { date: date || undefined } })
      ).data,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Mening darslarim</h1>

      <Field label="Sana">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="max-w-[180px]"
        />
      </Field>

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
                <th className="px-4 py-3 font-medium">Fan</th>
                <th className="px-4 py-3 font-medium">O'qituvchi</th>
                <th className="px-4 py-3 font-medium">Xona</th>
                <th className="px-4 py-3 font-medium">Mavzu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.results.map((lesson) => (
                <tr key={lesson.id}>
                  <td className="px-4 py-3 text-slate-700">{lesson.date}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {lesson.start_time.slice(0, 5)}–{lesson.end_time.slice(0, 5)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{lesson.subject_name}</td>
                  <td className="px-4 py-3 text-slate-700">{lesson.teacher_name}</td>
                  <td className="px-4 py-3 text-slate-500">{lesson.room || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{lesson.topic || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
