import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Field, Input } from "../../components/form";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "../../components/table";
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
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Mening darslarim</h1>

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
        <Table>
          <Thead>
            <Tr>
              <Th>Sana</Th>
              <Th>Vaqt</Th>
              <Th>Fan</Th>
              <Th>O'qituvchi</Th>
              <Th>Xona</Th>
              <Th>Mavzu</Th>
            </Tr>
          </Thead>
          <Tbody>
            {data.results.map((lesson) => (
              <Tr key={lesson.id}>
                <Td className="text-slate-700 dark:text-slate-200">{lesson.date}</Td>
                <Td className="text-slate-700 dark:text-slate-200">
                  {lesson.start_time.slice(0, 5)}–{lesson.end_time.slice(0, 5)}
                </Td>
                <Td className="text-slate-700 dark:text-slate-200">{lesson.subject_name}</Td>
                <Td className="text-slate-700 dark:text-slate-200">{lesson.teacher_name}</Td>
                <Td>{lesson.room || "—"}</Td>
                <Td>{lesson.topic || "—"}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
