import { Badge } from "./Badge";
import { AchievementIcon } from "../lib/achievementIcons";
import type { Achievement } from "../types";

export function AchievementUnlockCard({
  achievement,
  delayMs = 0,
}: {
  achievement: Achievement;
  delayMs?: number;
}) {
  return (
    <div
      className="animate-pop-in flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left dark:border-amber-500/30 dark:bg-amber-500/10"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
        <AchievementIcon icon={achievement.icon} className="h-5 w-5" />
      </span>
      <div>
        <Badge tone="amber">Yangi yutuq</Badge>
        <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">{achievement.name}</p>
      </div>
    </div>
  );
}
