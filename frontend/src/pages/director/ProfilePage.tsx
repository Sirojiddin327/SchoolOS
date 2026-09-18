import { AvatarUploader } from "../../components/AvatarUploader";
import { ChangePasswordForm } from "../../components/ChangePasswordForm";
import { TelegramConnect } from "../../components/TelegramConnect";
import { useAuth } from "../../lib/auth";

export function DirectorProfilePage() {
  const { user } = useAuth();

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Profil</h1>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <AvatarUploader />
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="font-medium text-slate-900 dark:text-slate-50">
            {user?.first_name} {user?.last_name}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{user?.email}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 font-semibold text-slate-900 dark:text-slate-50">Parolni o'zgartirish</h2>
        <ChangePasswordForm />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 font-semibold text-slate-900 dark:text-slate-50">Telegram</h2>
        <TelegramConnect />
      </div>
    </div>
  );
}
