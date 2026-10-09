import { useEffect, useMemo } from "react";

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
  const fresh = useMemo(() => {
    if (!achievements) return [];
    const seen = achievementCelebrations.getSeen();
    return achievements.filter((a) => a.unlocked && !seen.has(a.id));
  }, [achievements]);

  useEffect(() => {
    if (fresh.length > 0) achievementCelebrations.markSeen(fresh.map((a) => a.id));
  }, [fresh]);

  return fresh;
}
