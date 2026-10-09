import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  ClipboardCheck,
  FileText,
  Gamepad2,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "../components/Badge";
import { FilterPills } from "../components/FilterPills";
import { Select } from "../components/form";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "../components/table";
import { api } from "../lib/api";
import type { Tone } from "../lib/tones";
import type {
  ClassReport,
  ClassReportAISummary,
  Paginated,
  SchoolClass,
  StudentReportRow,
  StudentReportStatus,
} from "../types";

const PERIODS = [
  { value: 7, label: "7 kun" },
  { value: 30, label: "30 kun" },
  { value: 90, label: "90 kun" },
];

const STATUS_META: Record<
  StudentReportStatus,
  { label: string; tone: Tone; rank: number }
> = {
  RISK: { label: "Xavf", tone: "rose", rank: 0 },
  WATCH: { label: "E'tibor", tone: "amber", rank: 1 },
  GOOD: { label: "Yaxshi", tone: "emerald", rank: 2 },
  NO_DATA: { label: "Ma'lumot yo'q", tone: "slate", rank: 3 },
};

type StatusFilter = "ALL" | StudentReportStatus;

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

/** Teacher/director "O'quvchilar hisoboti" — how each student in a class is
 * doing (tests, games, attendance, XP, weak subjects) with a status, plus an
 * on-demand AI write-up of the whole class. Everything is computed by
 * `/reports/classes/:id/`; the AI summary is a separate, cached call. */
export function ReportsPage() {
  const [classId, setClassId] = useState<number | null>(null);
  const [days, setDays] = useState(30);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const classesQuery = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await api.get<Paginated<SchoolClass>>("/classes/")).data,
  });
  const classes = classesQuery.data?.results ?? [];
  const effectiveClassId = classId ?? classes[0]?.id ?? null;

  const reportQuery = useQuery({
    queryKey: ["class-report", effectiveClassId, days],
    queryFn: async () => {
      if (!effectiveClassId) return null;
      return (await api.get<ClassReport>(`/reports/classes/${effectiveClassId}/`, { params: { days } })).data;
    },
    enabled: effectiveClassId !== null,
  });

  const aiMutation = useMutation({
    mutationFn: async (refresh: boolean) =>
      (await api.post<ClassReportAISummary>(`/reports/classes/${effectiveClassId}/ai-summary/?days=${days}`, { refresh }))
        .data,
  });

  // A new class or period makes the previous AI write-up stale.
  useEffect(() => {
    aiMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset is stable enough; only react to the selection
  }, [classId, days]);

  const report = reportQuery.data;
  const rows = useMemo(() => {
    const sorted = [...(report?.students ?? [])].sort(
      (a, b) => STATUS_META[a.status].rank - STATUS_META[b.status].rank || a.full_name.localeCompare(b.full_name),
    );
    return statusFilter === "ALL" ? sorted : sorted.filter((row) => row.status === statusFilter);
  }, [report, statusFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BarChart3}
        title="O'quvchilar hisoboti"
        subtitle="Natijalar, davomat va AI tahlil — sinf bo'yicha"
      />

      {classesQuery.isLoading && <LoadingState />}
      {classesQuery.isError && <ErrorState />}
      {classesQuery.data && classes.length === 0 && (
        <EmptyState
          title="Sizga biriktirilgan sinf yo'q"
          description="Sinf rahbari yoki dars o'qituvchisi bo'lgach, hisobot shu yerda chiqadi."
        />
      )}

      {classes.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Select
            aria-label="Sinf"
            className="sm:w-56"
            value={effectiveClassId ?? ""}
            onChange={(event) => setClassId(Number(event.target.value))}
          >
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </Select>
          <FilterPills options={PERIODS} value={days} onChange={setDays} />
        </div>
      )}

      {reportQuery.isLoading && <LoadingState label="Hisobot tayyorlanmoqda..." />}
      {reportQuery.isError && <ErrorState message="Hisobotni yuklab bo'lmadi." />}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard
              icon={FileText}
              label="O'rtacha test"
              value={pct(report.summary.test_avg)}
              hint={`${report.summary.tests_taken} ta natija`}
            />
            <StatCard
              icon={ClipboardCheck}
              tone="emerald"
              label="Davomat"
              value={pct(report.summary.attendance_rate)}
            />
            <StatCard
              icon={Gamepad2}
              tone="violet"
              label="O'yinlar"
              value={report.summary.games_played}
              hint={report.summary.game_avg === null ? undefined : `o'rtacha ${pct(report.summary.game_avg)}`}
            />
            <StatCard icon={Zap} tone="amber" label="To'plangan XP" value={`+${report.summary.xp_gained}`} />
            <StatCard
              icon={AlertTriangle}
              tone="rose"
              label="E'tibor kerak"
              value={report.summary.at_risk + report.summary.watch}
              hint={`${report.summary.at_risk} xavf · ${report.summary.watch} e'tibor`}
              onClick={() => setStatusFilter(report.summary.at_risk > 0 ? "RISK" : "WATCH")}
            />
          </div>

          <AiSummaryCard
            summary={aiMutation.data}
            loading={aiMutation.isPending}
            error={aiMutation.isError}
            onGenerate={(refresh) => aiMutation.mutate(refresh)}
          />

          {report.subjects.length > 0 && <SubjectBars subjects={report.subjects} />}

          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="section-title">
                O'quvchilar · {report.summary.students}
              </h2>
              <FilterPills<StatusFilter>
                options={[
                  { value: "ALL", label: "Hammasi" },
                  { value: "RISK", label: "Xavf" },
                  { value: "WATCH", label: "E'tibor" },
                  { value: "GOOD", label: "Yaxshi" },
                ]}
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </div>
            {report.students.length === 0 ? (
              <EmptyState title="Bu sinfda o'quvchi yo'q" />
            ) : rows.length === 0 ? (
              <EmptyState title="Bu holatda o'quvchi yo'q" />
            ) : (
              <StudentTable rows={rows} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AiSummaryCard({
  summary,
  loading,
  error,
  onGenerate,
}: {
  summary: ClassReportAISummary | undefined;
  loading: boolean;
  error: boolean;
  onGenerate: (refresh: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-500/30 dark:bg-violet-500/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white">
            <Bot size={20} />
          </span>
          <div>
            <p className="font-semibold text-violet-700 dark:text-violet-300">AI tahlil</p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Kim qanday ketyapti, kimga e'tibor kerak va nima qilish kerak — qisqa xulosa.
            </p>
          </div>
        </div>
        {summary ? (
          <button
            type="button"
            onClick={() => onGenerate(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-500/15"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : undefined} /> Yangilash
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onGenerate(false)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            <Sparkles size={15} /> {loading ? "Tahlil qilinmoqda..." : "AI tahlil qilish"}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">
          AI hozircha javob bera olmadi. Birozdan so'ng qayta urinib ko'ring.
        </p>
      )}
      {summary && <AiText text={summary.summary} />}
      <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
        AI'ga o'quvchilarning ismlari yuborilmaydi — faqat anonim kodlar.
      </p>
    </div>
  );
}

/** The AI reply is plain text: section titles on their own lines, "- " bullets under them. */
function AiText({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    <div className="mt-4 space-y-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
      {lines.map((line, i) =>
        line.startsWith("- ") || line.startsWith("• ") ? (
          <p key={i} className="flex gap-2 pl-1">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
            <span>{line.slice(2)}</span>
          </p>
        ) : line.length < 60 && !line.endsWith(".") ? (
          <p key={i} className="pt-2 font-semibold text-slate-900 first:pt-0 dark:text-slate-50">
            {line.replace(/:$/, "")}
          </p>
        ) : (
          <p key={i}>{line}</p>
        ),
      )}
    </div>
  );
}

function barTone(avg: number): string {
  if (avg < 50) return "bg-red-500";
  if (avg < 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function SubjectBars({ subjects }: { subjects: ClassReport["subjects"] }) {
  return (
    <div>
      <h2 className="section-title">Fanlar bo'yicha o'rtacha natija</h2>
      <div className="mt-3 space-y-3">
        {subjects.map((subject) => (
          <div key={subject.subject} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-ink">{subject.subject}</span>
            <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
              <div className={`h-full rounded-full ${barTone(subject.avg)}`} style={{ width: `${subject.avg}%` }} />
            </div>
            <span className="w-20 text-right text-xs text-ink-muted">
              <span className="font-semibold text-ink">{Math.round(subject.avg)}%</span> ·{" "}
              {subject.results} ta
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Trend({ value }: { value: number | null }) {
  if (value === null || Math.abs(value) < 1) return null;
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`ml-1.5 inline-flex items-center gap-0.5 text-xs font-semibold ${
        up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
      }`}
      title="Davrning ikkinchi yarmi birinchisiga nisbatan"
    >
      <Icon size={12} />
      {up ? "+" : ""}
      {Math.round(value)}
    </span>
  );
}

function StudentTable({ rows }: { rows: StudentReportRow[] }) {
  return (
    <Table>
      <Thead>
        <Tr>
          <Th>O'quvchi</Th>
          <Th>Holat</Th>
          <Th>Test</Th>
          <Th className="hidden md:table-cell">O'yinlar</Th>
          <Th>Davomat</Th>
          <Th>XP</Th>
          <Th className="hidden md:table-cell">Zaif fanlar</Th>
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row) => (
          <Tr key={row.id}>
            <Td className="whitespace-nowrap font-medium text-slate-900 dark:text-slate-50">{row.full_name}</Td>
            <Td>
              <Badge tone={STATUS_META[row.status].tone}>{STATUS_META[row.status].label}</Badge>
            </Td>
            <Td className="whitespace-nowrap">
              {pct(row.test_avg)}
              <Trend value={row.test_trend} />
              <span className="block text-xs text-slate-400">{row.tests_taken} ta</span>
            </Td>
            <Td className="hidden whitespace-nowrap md:table-cell">
              {pct(row.game_avg)}
              <span className="block text-xs text-slate-400">{row.games_played} ta</span>
            </Td>
            <Td className="whitespace-nowrap">
              {pct(row.attendance_rate)}
              {(row.absences > 0 || row.late > 0) && (
                <span className="block text-xs text-slate-400">
                  {row.absences} qoldirgan · {row.late} kech
                </span>
              )}
            </Td>
            <Td className="whitespace-nowrap text-amber-600 dark:text-amber-400">+{row.xp_gained}</Td>
            <Td className="hidden md:table-cell">
              {row.weak_subjects.length === 0 ? (
                <span className="text-slate-400">—</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {row.weak_subjects.map((weak) => (
                    <Badge key={weak.subject} tone="rose">
                      {weak.subject} {Math.round(weak.avg)}%
                    </Badge>
                  ))}
                </div>
              )}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
