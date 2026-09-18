import { useEffect, useState } from "react";

import type { Achievement } from "../types";
import { achievementCelebrations } from "./celebrationTracking";

/** Call once an achievement's celebration has actually been shown to the student. */
export function markAchievementsCelebrated(ids: number[]): void {
  achievementCelebrations.markSeen(ids);
}

/**
 * Given the current achievement catalog (from GET /api/achievements/),
 * returns any unlocked ones the student hasn't been celebrated for yet, and
 * immediately marks them as celebrated. Use wherever achievements are
 * fetched as a matter of course (a dashboard, a list page) to catch unlocks
 * that happened without a dedicated "before vs after" moment to diff against
 * — e.g. a teacher grading an activity submission later.
 */
export function useNewlyUnlockedAchievements(achievements: Achievement[] | undefined): Achievement[] {
  const [celebrated, setCelebrated] = useState<Achievement[]>([]);

  useEffect(() => {
    if (!achievements) return;
    const seen = achievementCelebrations.getSeen();
    const fresh = achievements.filter((a) => a.unlocked && !seen.has(a.id));
    if (fresh.length > 0) {
      setCelebrated(fresh);
      achievementCelebrations.markSeen(fresh.map((a) => a.id));
    }
    // Only ever re-derive when the achievements list itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [achievements]);

  return celebrated;
}
