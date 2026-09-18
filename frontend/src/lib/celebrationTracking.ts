// A persisted "have we already celebrated this id" set — the shared plumbing
// behind every "show it once, then never again" gamification moment (an
// achievement unlocking, an activity submission getting graded) that doesn't
// have a single in-page action to diff a before/after snapshot against.
function createSeenTracker(storageKey: string) {
  function getSeen(): Set<number> {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
    } catch {
      return new Set();
    }
  }

  function markSeen(ids: number[]): void {
    if (ids.length === 0) return;
    try {
      const seen = getSeen();
      for (const id of ids) seen.add(id);
      localStorage.setItem(storageKey, JSON.stringify([...seen]));
    } catch {
      // Browser storage can be unavailable (private mode, quota) — a missed
      // celebration is harmless, so this stays best-effort.
    }
  }

  return { getSeen, markSeen };
}

export const achievementCelebrations = createSeenTracker("schoolos.seen-achievement-celebrations");
export const activityResultCelebrations = createSeenTracker("schoolos.seen-activity-result-celebrations");
