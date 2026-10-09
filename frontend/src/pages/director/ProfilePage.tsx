import { useQuery } from "@tanstack/react-query";

import { ChangePasswordForm } from "../../components/ChangePasswordForm";
import { PageHeader } from "../../components/PageHeader";
import { ProfileHeaderCard, ProfileStat } from "../../components/ProfileHeaderCard";
import { Section } from "../../components/Surface";
import { TelegramConnect } from "../../components/TelegramConnect";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { shortName } from "../../lib/names";
import type { DirectorDashboard } from "../../types";

export function DirectorProfilePage() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["dashboard", "director"],
    queryFn: async () => (await api.get<DirectorDashboard>("/dashboard/director/")).data,
  });

  const displayName = user ? shortName(user) : "";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Profil" />

      <ProfileHeaderCard
        name={displayName}
        email={user?.email}
        roleLabel="Direktor"
        stats={
          <>
            <ProfileStat label="O'quvchilar" value={data?.total_students ?? 0} tone="brand" />
            <ProfileStat label="O'qituvchilar" value={data?.total_teachers ?? 0} tone="violet" />
            <ProfileStat label="Sinflar" value={data?.total_classes ?? 0} tone="amber" />
          </>
        }
      />

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
          </dl>
        </Section>

        <Section title="Parolni o'zgartirish">
          <ChangePasswordForm />
        </Section>
      </div>

      <Section title="Telegram">
        <TelegramConnect />
      </Section>
    </div>
  );
}
