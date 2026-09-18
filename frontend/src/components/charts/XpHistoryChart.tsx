import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import type { XPTransaction } from "../../types";

const DAYS_TO_SHOW = 7;

interface DayPoint {
  date: string;
  label: string;
  xp: number;
}

function buildDailySeries(transactions: XPTransaction[]): DayPoint[] {
  const days: DayPoint[] = [];
  const today = new Date();

  for (let i = DAYS_TO_SHOW - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("uz-UZ", { weekday: "short" }),
      xp: 0,
    });
  }

  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const tx of transactions) {
    const bucket = byDate.get(tx.created_at.slice(0, 10));
    if (bucket) bucket.xp += tx.amount;
  }
  return days;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: DayPoint }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-slate-700">{point.label}</p>
      <p className="text-amber-600">+{point.xp} XP</p>
    </div>
  );
}

export function XpHistoryChart({ transactions }: { transactions: XPTransaction[] }) {
  const data = buildDailySeries(transactions);
  const hasAny = data.some((d) => d.xp > 0);

  if (!hasAny) {
    return <p className="py-8 text-center text-sm text-slate-400">So'nggi 7 kunda XP tarixi yo'q</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#fef3c7" }} />
        <Bar dataKey="xp" fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
