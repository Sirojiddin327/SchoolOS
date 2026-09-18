import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { useTheme } from "../../lib/theme";
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
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="font-medium text-slate-700 dark:text-slate-200">{point.label}</p>
      <p className="text-amber-600 dark:text-amber-400">+{point.xp} XP</p>
    </div>
  );
}

export function XpHistoryChart({ transactions }: { transactions: XPTransaction[] }) {
  const { theme } = useTheme();
  const data = buildDailySeries(transactions);
  const hasAny = data.some((d) => d.xp > 0);
  const gridColor = theme === "dark" ? "#1e293b" : "#e2e8f0";
  const tickColor = theme === "dark" ? "#64748b" : "#94a3b8";
  const cursorColor = theme === "dark" ? "#78350f" : "#fef3c7";
  const barColor = theme === "dark" ? "#f59e0b" : "#d97706";

  if (!hasAny) {
    return <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">So'nggi 7 kunda XP tarixi yo'q</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={gridColor} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: tickColor }} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: cursorColor }} />
        <Bar dataKey="xp" fill={barColor} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
