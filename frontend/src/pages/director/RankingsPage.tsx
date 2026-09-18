import { Leaderboard } from "../../components/Leaderboard";

export function DirectorRankingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">XP va reyting</h1>
        <p className="mt-1 text-sm text-slate-500">Butun maktab bo'yicha o'quvchi va sinflar reytingi.</p>
      </div>
      <Leaderboard />
    </div>
  );
}
