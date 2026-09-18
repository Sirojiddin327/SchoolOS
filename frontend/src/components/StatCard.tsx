import { Link } from "react-router-dom";

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  /** When set, the whole card becomes a link — for stats that lead somewhere. */
  to?: string;
}

export function StatCard({ label, value, hint, to }: StatCardProps) {
  const className =
    "rounded-xl border border-slate-200 bg-white p-5 shadow-sm" +
    (to ? " transition-colors hover:border-brand-200 hover:bg-brand-50/40" : "");

  const content = (
    <>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}
