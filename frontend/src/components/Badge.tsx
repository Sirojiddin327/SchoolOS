import type { ReactNode } from "react";

type BadgeTone = "brand" | "amber" | "emerald" | "red" | "slate";

const TONE_CLASS: Record<BadgeTone, string> = {
  brand: "bg-brand-50 text-brand-700",
  amber: "bg-amber-50 text-amber-700",
  emerald: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
  slate: "bg-slate-100 text-slate-600",
};

export function Badge({ tone = "slate", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}
