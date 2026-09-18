import { Badge } from "./Badge";
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
      className="animate-pop-in flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span className="text-2xl">{achievement.icon || "🏆"}</span>
      <div>
        <Badge tone="amber">Yangi yutuq</Badge>
        <p className="mt-1 font-medium text-slate-900">{achievement.name}</p>
      </div>
    </div>
  );
}
