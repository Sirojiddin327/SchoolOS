import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";

import { StatCard } from "../../components/StatCard";
import { Table, Tbody, Td, Th, Thead, Tr } from "../../components/table";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { Paginated, XPTransaction } from "../../types";

const SOURCE_LABEL: Record<XPTransaction["source"], string> = {
  TEST: "Test",
  ACTIVITY: "Topshiriq",
};

export function StudentXpPage() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["xp-history", "me"],
    queryFn: async () => (await api.get<Paginated<XPTransaction>>("/xp/history/")).data,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Mening XP'im</h1>

      <StatCard
        label="Jami XP"
        value={user?.total_xp ?? 0}
        hint="Har bir test va topshiriqdan avtomatik hisoblanadi"
        icon={Trophy}
        tone="amber"
      />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">XP tarixi</h2>

        {isLoading && <LoadingState />}
        {isError && <ErrorState />}
        {data && data.results.length === 0 && <EmptyState title="Hali XP tarixi yo'q" />}

        {data && data.results.length > 0 && (
          <Table>
            <Thead>
              <Tr>
                <Th>Sana</Th>
                <Th>Manba</Th>
                <Th>Sabab</Th>
                <Th className="text-right">XP</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.results.map((tx) => (
                <Tr key={tx.id}>
                  <Td className="text-slate-700 dark:text-slate-200">
                    {new Date(tx.created_at).toLocaleDateString("uz-UZ")}
                  </Td>
                  <Td className="text-slate-700 dark:text-slate-200">{SOURCE_LABEL[tx.source]}</Td>
                  <Td>{tx.related_title ?? tx.reason}</Td>
                  <Td className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                    +{tx.amount}
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
