export function CircularProgress({
  value,
  size = 96,
  strokeWidth = 9,
  label,
}: {
  /** 0-100. Values outside that range are clamped. */
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-slate-100 dark:stroke-slate-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-brand-600 transition-[stroke-dashoffset] duration-700 ease-out dark:stroke-brand-400"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-lg font-bold text-slate-900 dark:text-slate-50">{Math.round(clamped)}%</span>
        {label && <span className="text-[10px] text-slate-400 dark:text-slate-500">{label}</span>}
      </div>
    </div>
  );
}
