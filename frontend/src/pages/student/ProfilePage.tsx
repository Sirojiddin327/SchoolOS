import { useQuery } from "@tanstack/react-query";

import { ChangePasswordForm } from "../../components/ChangePasswordForm";
import { ParentTelegramConnect } from "../../components/ParentTelegramConnect";
import { PageHeader } from "../../components/PageHeader";
import { ProfileHeaderCard, ProfileStat } from "../../components/ProfileHeaderCard";
import { ProgressBar } from "../../components/ProgressBar";
import { Section } from "../../components/Surface";
import { TelegramConnect } from "../../components/TelegramConnect";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fullName } from "../../lib/names";
import { getLevelInfo } from "../../lib/gamification";
import type { MyRank, Streak } from "../../types";

export function StudentProfilePage() {
  const { user } = useAuth();

  const { data: streak } = useQuery({
    queryKey: ["streak", "me"],
    queryFn: async () => (await api.get<Streak>("/streaks/me/")).data,
  });
  const { data: rank } = useQuery({
    queryKey: ["rank", "me"],
    queryFn: async () => (await api.get<MyRank>("/leaderboard/me/")).data,
  });

  const displayName = user ? fullName(user) : "";
  const { level, xpIntoLevel, xpForNextLevel, progressPercent } = getLevelInfo(user?.total_xp ?? 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Profil" />

      <ProfileHeaderCard
        name={displayName}
        email={user?.email}
        roleLabel="O'quvchi"
        stats={
          <>
            <ProfileStat label="Daraja" value={level} tone="brand" />
            <ProfileStat label="Seriya" value={streak?.current_streak ?? 0} tone="amber" />
            <ProfileStat
              label="Sinf reytingi"
              value={rank?.class_rank ? `#${rank.class_rank}` : "—"}
              tone="emerald"
            />
          </>
        }
      />

      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-ink">{level}-daraja</span>
          <span className="tabular text-ink-muted">
            {xpIntoLevel} / {xpForNextLevel} XP
          </span>
        </div>
        <ProgressBar value={progressPercent} tone="brand" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title="Hisob ma'lumotlari">
          <dl className="divide-y divide-line-soft text-sm">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-ink-muted">Email</dt>
              <dd className="truncate text-ink">{user?.email}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-ink-muted">Login</dt>
              <dd className="truncate text-ink">{user?.username}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-ink-muted">Jami XP</dt>
              <dd className="tabular text-ink">{user?.total_xp ?? 0}</dd>
            </div>
          </dl>
        </Section>

        <Section title="Parolni o'zgartirish">
          <ChangePasswordForm />
        </Section>
      </div>

      <Section title="Telegram">
        <TelegramConnect />
      </Section>

      <Section title="Ota-onani Telegramga ulash">
        <ParentTelegramConnect />
      </Section>
    </div>
  );
}
