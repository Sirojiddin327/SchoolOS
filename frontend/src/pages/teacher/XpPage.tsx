import { useQuery } from "@tanstack/react-query";

import { StatCard } from "../../components/StatCard";
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
      <h1 className="text-xl font-bold text-slate-900">XP statistikasi</h1>

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
        <h2 className="mb-3 text-sm font-semibold text-slate-700">So'nggi XP harakatlari</h2>
        {history && history.results.length === 0 && <EmptyState title="Hali XP tarixi yo'q" />}
        {history && history.results.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Sana</th>
                  <th className="px-4 py-3 font-medium">O'quvchi</th>
                  <th className="px-4 py-3 font-medium">Manba</th>
                  <th className="px-4 py-3 font-medium">Sabab</th>
                  <th className="px-4 py-3 font-medium text-right">XP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.results.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(tx.created_at).toLocaleDateString("uz-UZ")}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{tx.student_name}</td>
                    <td className="px-4 py-3 text-slate-700">{SOURCE_LABEL[tx.source]}</td>
                    <td className="px-4 py-3 text-slate-500">{tx.related_title ?? tx.reason}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">+{tx.amount}</td>
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
