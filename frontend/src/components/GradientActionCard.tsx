import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

type GradientTone = "brand" | "amber" | "violet";

const TONE_CLASS: Record<GradientTone, string> = {
  brand: "from-brand-600 to-brand-500 dark:from-brand-600/90 dark:to-brand-500/80",
  amber: "from-amber-500 to-orange-500 dark:from-amber-500/90 dark:to-orange-500/80",
  violet: "from-violet-600 to-fuchsia-500 dark:from-violet-600/90 dark:to-fuchsia-500/80",
};

export function GradientActionCard({
  icon: Icon,
  title,
  subtitle,
  to,
  tone = "brand",
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  to: string;
  tone?: GradientTone;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-r p-5 text-white shadow-sm transition-transform hover:scale-[1.01] ${TONE_CLASS[tone]}`}
    >
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
          <Icon size={22} />
        </span>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-white/80">{subtitle}</p>
        </div>
      </div>
      <ArrowRight size={20} className="shrink-0 text-white/80" />
    </Link>
  );
}
