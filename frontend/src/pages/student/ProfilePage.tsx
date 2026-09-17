import { TelegramConnect } from "../../components/TelegramConnect";
import { useAuth } from "../../lib/auth";

export function StudentProfilePage() {
  const { user } = useAuth();

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Profil</h1>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="font-medium text-slate-900">
          {user?.first_name} {user?.last_name}
        </p>
        <p className="text-sm text-slate-500">{user?.email}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-3 font-semibold text-slate-900">Telegram</h2>
        <TelegramConnect />
      </div>
    </div>
  );
}
