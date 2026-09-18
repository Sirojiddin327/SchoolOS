type ProgressBarTone = "brand" | "amber" | "emerald";

const TRACK_TONE: Record<ProgressBarTone, string> = {
  brand: "bg-brand-100",
  amber: "bg-amber-100",
  emerald: "bg-emerald-100",
};

const FILL_TONE: Record<ProgressBarTone, string> = {
  brand: "bg-brand-600",
  amber: "bg-amber-500",
  emerald: "bg-emerald-600",
};

export function ProgressBar({
  value,
  tone = "brand",
  className,
}: {
  /** 0-100. Values outside that range are clamped. */
  value: number;
  tone?: ProgressBarTone;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`h-2.5 w-full overflow-hidden rounded-full ${TRACK_TONE[tone]} ${className ?? ""}`}
    >
      <div
        className={`h-full rounded-full ${FILL_TONE[tone]} transition-[width] duration-700 ease-out`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
