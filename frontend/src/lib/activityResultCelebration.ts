import { useEffect, useMemo } from "react";

import type { ActivitySubmission } from "../types";
import { activityResultCelebrations } from "./celebrationTracking";

/**
 * Given the student's activity submissions, returns any freshly-graded ones
 * (result just appeared) that haven't been celebrated yet, and marks them as
 * celebrated. Grading happens on the teacher's own schedule, so — unlike a
 * test's immediate auto-score — there's no single in-page action to diff a
 * before/after snapshot against; this is the "seen it once" equivalent.
 */
export function useNewlyGradedSubmissions(
  submissions: ActivitySubmission[] | undefined,
): ActivitySubmission[] {
  const fresh = useMemo(() => {
    if (!submissions) return [];
    const seen = activityResultCelebrations.getSeen();
    return submissions.filter((s) => s.result && !seen.has(s.id));
  }, [submissions]);

  useEffect(() => {
    if (fresh.length > 0) activityResultCelebrations.markSeen(fresh.map((s) => s.id));
  }, [fresh]);

  return fresh;
}
