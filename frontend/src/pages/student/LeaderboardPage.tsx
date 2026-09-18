import { Leaderboard } from "../../components/Leaderboard";

export function StudentLeaderboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Reyting</h1>
      <Leaderboard />
    </div>
  );
}
