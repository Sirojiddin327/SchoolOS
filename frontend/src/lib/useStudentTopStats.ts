import { useQuery } from "@tanstack/react-query";

import type { Streak } from "../types";
import { api } from "./api";
import { useAuth } from "./auth";
import { getLevelInfo } from "./gamification";

/** Compact stats shown in the top bar — student role only. */
export function useStudentTopStats() {
  const { user } = useAuth();
  const isStudent = user?.role === "STUDENT";

  const { data: streak } = useQuery({
    queryKey: ["streak", "me"],
    queryFn: async () => (await api.get<Streak>("/streaks/me/")).data,
    enabled: isStudent,
  });

  if (!isStudent || !user) return null;

  const { level } = getLevelInfo(user.total_xp ?? 0);

  return {
    level,
    totalXp: user.total_xp ?? 0,
    currentStreak: streak?.current_streak ?? 0,
  };
}
