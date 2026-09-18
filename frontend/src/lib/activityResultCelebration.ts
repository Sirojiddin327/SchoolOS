import { useEffect, useState } from "react";

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
  const [celebrated, setCelebrated] = useState<ActivitySubmission[]>([]);

  useEffect(() => {
    if (!submissions) return;
    const seen = activityResultCelebrations.getSeen();
    const fresh = submissions.filter((s) => s.result && !seen.has(s.id));
    if (fresh.length > 0) {
      setCelebrated(fresh);
      activityResultCelebrations.markSeen(fresh.map((s) => s.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions]);

  return celebrated;
}
