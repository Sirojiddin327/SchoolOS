// Level is purely a presentational framing of total_xp — every 100 XP is one
// level. Nothing is stored server-side; recomputing it here keeps the backend
// from needing a second source of truth for something derivable in one line.
const XP_PER_LEVEL = 100;

export interface LevelInfo {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
}

export function getLevelInfo(totalXp: number): LevelInfo {
  const safeXp = Math.max(0, totalXp);
  const level = Math.floor(safeXp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = safeXp % XP_PER_LEVEL;

  return {
    level,
    xpIntoLevel,
    xpForNextLevel: XP_PER_LEVEL,
    progressPercent: (xpIntoLevel / XP_PER_LEVEL) * 100,
  };
}
