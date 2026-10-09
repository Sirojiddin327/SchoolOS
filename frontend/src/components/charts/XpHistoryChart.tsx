import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { AXIS_PROPS, useChartTheme } from "../../lib/chartTheme";
import { localISODate } from "../../lib/schoolTime";
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
      date: localISODate(d),
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
  const theme = useChartTheme();
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className={theme.tooltip.content}>
      <p className={theme.tooltip.label}>{point.label}</p>
      <p className="font-semibold text-amber-600 dark:text-amber-400">+{point.xp} XP</p>
    </div>
  );
}

/** XP earned per day. Amber is reserved for XP everywhere in the app. */
export function XpHistoryChart({ transactions }: { transactions: XPTransaction[] }) {
  const theme = useChartTheme();
  const data = buildDailySeries(transactions);
  const hasAny = data.some((d) => d.xp > 0);

  if (!hasAny) {
    return <p className="py-10 text-center text-sm text-ink-subtle">So'nggi 7 kunda XP tarixi yo'q</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data} barCategoryGap="30%" margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={theme.grid} />
        <XAxis
          dataKey="label"
          {...AXIS_PROPS}
          tick={{ ...AXIS_PROPS.tick, fill: theme.axis }}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.cursor }} />
        <Bar
          dataKey="xp"
          fill={theme.tone("amber")}
          radius={[6, 6, 6, 6]}
          maxBarSize={24}
          className="chart-enter"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
