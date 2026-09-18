import { useQuery } from "@tanstack/react-query";

import { StatCard } from "../../components/StatCard";
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
      <h1 className="text-xl font-bold text-slate-900">Mening XP'im</h1>

      <StatCard label="Jami XP" value={user?.total_xp ?? 0} hint="Har bir test va topshiriqdan avtomatik hisoblanadi" />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">XP tarixi</h2>

        {isLoading && <LoadingState />}
        {isError && <ErrorState />}
        {data && data.results.length === 0 && <EmptyState title="Hali XP tarixi yo'q" />}

        {data && data.results.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Sana</th>
                  <th className="px-4 py-3 font-medium">Manba</th>
                  <th className="px-4 py-3 font-medium">Sabab</th>
                  <th className="px-4 py-3 font-medium text-right">XP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.results.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(tx.created_at).toLocaleDateString("uz-UZ")}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{SOURCE_LABEL[tx.source]}</td>
                    <td className="px-4 py-3 text-slate-500">{tx.related_title ?? tx.reason}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                      +{tx.amount}
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
