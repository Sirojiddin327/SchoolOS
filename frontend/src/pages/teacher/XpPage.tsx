import { useQuery } from "@tanstack/react-query";

import { StatCard } from "../../components/StatCard";
import { Table, Tbody, Td, Th, Thead, Tr } from "../../components/table";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { Paginated, SchoolClass, XPTransaction } from "../../types";

const SOURCE_LABEL: Record<XPTransaction["source"], string> = {
  TEST: "Test",
  ACTIVITY: "Topshiriq",
};

export function TeacherXpPage() {
  const { data: classes, isLoading, isError } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await api.get<Paginated<SchoolClass>>("/classes/")).data,
  });
  const { data: history } = useQuery({
    queryKey: ["xp-history", "teacher"],
    queryFn: async () => (await api.get<Paginated<XPTransaction>>("/xp/history/")).data,
  });

  const sortedClasses = [...(classes?.results ?? [])].sort((a, b) => b.total_xp - a.total_xp);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">XP statistikasi</h1>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}

      {sortedClasses.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {sortedClasses.map((cls) => (
            <StatCard key={cls.id} label={cls.name} value={`${cls.total_xp} XP`} />
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">So'nggi XP harakatlari</h2>
        {history && history.results.length === 0 && <EmptyState title="Hali XP tarixi yo'q" />}
        {history && history.results.length > 0 && (
          <Table>
            <Thead>
              <Tr>
                <Th>Sana</Th>
                <Th>O'quvchi</Th>
                <Th>Manba</Th>
                <Th>Sabab</Th>
                <Th className="text-right">XP</Th>
              </Tr>
            </Thead>
            <Tbody>
              {history.results.map((tx) => (
                <Tr key={tx.id}>
                  <Td className="text-slate-700 dark:text-slate-200">
                    {new Date(tx.created_at).toLocaleDateString("uz-UZ")}
                  </Td>
                  <Td className="text-slate-700 dark:text-slate-200">{tx.student_name}</Td>
                  <Td className="text-slate-700 dark:text-slate-200">{SOURCE_LABEL[tx.source]}</Td>
                  <Td>{tx.related_title ?? tx.reason}</Td>
                  <Td className="text-right font-semibold text-emerald-600 dark:text-emerald-400">+{tx.amount}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
