import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Medal, Shield, Swords, Trophy, Zap } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Avatar } from "../../components/Avatar";
import { Badge } from "../../components/Badge";
import { PrimaryButton, Select } from "../../components/form";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { DuelListItem, DuelRatingInfo, DuelStatsInfo, Paginated, RosterStudent } from "../../types";

const MEDAL_TONE: Record<number, string> = {
  0: "text-amber-500",
  1: "text-slate-400",
  2: "text-orange-600",
};

const ARCHETYPE_LABELS: Record<string, string> = {
  wizard: "Sehrgar",
  knight: "Ritsar",
  rogue: "O'g'ri",
  ranger: "Qirg'ovul",
  "ai-novice": "AI Novice",
  "ai-scholar": "AI Scholar",
  "ai-master": "AI Master",
};

function DuelStatusBadge({ duel }: { duel: DuelListItem }) {
  if (duel.status === "PENDING" && duel.awaiting_my_response) return <Badge tone="amber">Taklif keldi</Badge>;
  if (duel.status === "PENDING") return <Badge tone="slate">Kutilmoqda</Badge>;
  if (duel.status === "ACTIVE") return <Badge tone="brand">Javob bering</Badge>;
  if (duel.status === "DECLINED" || duel.status === "CANCELLED" || duel.status === "EXPIRED")
    return <Badge tone="slate">Yopilgan</Badge>;
  if (duel.outcome === "DRAW") return <Badge tone="slate">Durang</Badge>;
  return duel.outcome === "WIN" ? (
    <Badge tone="emerald">G'alaba</Badge>
  ) : (
    <Badge tone="rose">Mag'lubiyat</Badge>
  );
}

function CreateDuelModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [opponent, setOpponent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: opponents } = useQuery({
    queryKey: ["duels", "opponents"],
    queryFn: async () => (await api.get<RosterStudent[]>("/duels/opponents/")).data,
  });

  const createDuel = useMutation({
    mutationFn: async () => (await api.post<DuelListItem>("/duels/", { opponent: Number(opponent) })).data,
    onSuccess: (duel) => {
      queryClient.invalidateQueries({ queryKey: ["duels"] });
      navigate(`/student/duels/${duel.id}`);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: Record<string, string[] | string> } })?.response?.data;
      setError(detail ? Object.values(detail).flat().join(" ") : "Duel boshlashda xatolik.");
    },
  });

  return (
    <Modal title="Tengdoshingni duelga chaqir" onClose={onClose}>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Bir xil 5 ta savolni kim tezroq va aniqroq yechsa — g'olib bo'ladi. Savollar sinfingizdagi e'lon
        qilingan testlardan tasodifiy tanlanadi.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          createDuel.mutate();
        }}
        className="space-y-4"
      >
        <Select required value={opponent} onChange={(e) => setOpponent(e.target.value)}>
          <option value="">— o'quvchini tanlang —</option>
          {opponents?.map((student) => (
            <option key={student.id} value={student.id}>
              {student.full_name}
            </option>
          ))}
        </Select>
        {opponents && opponents.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500">Sinfingizda hali boshqa o'quvchi yo'q.</p>
        )}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <PrimaryButton type="submit" className="w-full" disabled={!opponent || createDuel.isPending}>
          {createDuel.isPending ? "Boshlanmoqda..." : "Duelni boshlash"}
        </PrimaryButton>
      </form>
    </Modal>
  );
}

export function StudentDuelsPage() {
  const [isModalOpen, setModalOpen] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["duels", "stats"],
    queryFn: async () => (await api.get<DuelStatsInfo>("/duels/stats/")).data,
  });

  const { data: leaderboard } = useQuery({
    queryKey: ["duels", "leaderboard"],
    queryFn: async () => (await api.get<DuelRatingInfo[]>("/duels/leaderboard/")).data,
  });

  const { data: duels, isLoading, isError } = useQuery({
    queryKey: ["duels"],
    queryFn: async () => (await api.get<Paginated<DuelListItem>>("/duels/")).data,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Zap}
        title="Duellar"
        action={<PrimaryButton onClick={() => setModalOpen(true)}>+ Yangi duel</PrimaryButton>}
      />

      {stats && (
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            <Shield size={20} />
          </span>
          <div>
            <p className="text-2xl font-bold text-ink">
              {stats.rating}{" "}
              <span className="text-sm font-medium text-ink-subtle">
                {ARCHETYPE_LABELS[stats.archetype] ?? stats.archetype}
              </span>
            </p>
            <p className="text-sm text-ink-muted">
              {stats.wins} g'alaba · {stats.losses} mag'lubiyat · {stats.draws} durang · {stats.xp} XP ·{" "}
              {stats.best_streak} eng yaxshi seriya
            </p>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 flex items-center gap-1.5 section-title">
          <Trophy size={15} /> Duel chempionlari
        </h2>
        {!leaderboard && <LoadingState label="Yuklanmoqda..." />}
        {leaderboard && leaderboard.length === 0 && <EmptyState title="Reyting hali bo'sh" />}
        {leaderboard && leaderboard.length > 0 && (
          <div className="divide-y divide-line-soft">
            {leaderboard.slice(0, 10).map((entry, index) => (
              <div key={entry.student_name} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex w-6 justify-center font-semibold text-ink-muted">
                    {MEDAL_TONE[index] ? <Medal className={`h-4 w-4 ${MEDAL_TONE[index]}`} /> : index + 1}
                  </span>
                  <Avatar name={entry.student_name ?? "?"} size={32} />
                  <div>
                    <p className="text-sm font-medium text-ink">{entry.student_name}</p>
                    <p className="text-xs text-ink-subtle">
                  {ARCHETYPE_LABELS[entry.archetype] ?? entry.archetype}
                </p>
                  </div>
                </div>
                <p className="font-semibold text-brand-700 dark:text-brand-300">{entry.rating}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-1.5 section-title">
          <Swords size={15} /> Mening duellarim
        </h2>
        {isLoading && <LoadingState />}
        {isError && <ErrorState />}
        {duels && duels.results.length === 0 && (
          <EmptyState title="Hali duel bo'lmagan" description="Sinfdoshingizni duelga chaqiring va boshlang." />
        )}
        {duels && duels.results.length > 0 && (
          <div className="space-y-2">
            {duels.results.map((duel) => {
              const opponentName = duel.opponent_player?.name ?? "Raqib";
              const needsAction = duel.status === "ACTIVE" || (duel.status === "PENDING" && duel.awaiting_my_response);
              const content = (
                <div
                  className={`flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-800 ${
                    needsAction ? "hover-card" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={opponentName} size={36} />
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{opponentName}</p>
                      <p className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                        <Clock size={11} />
                        {new Date(duel.created_at).toLocaleDateString("uz-UZ")}
                        {duel.subject_name ? ` · ${duel.subject_name}` : ""}
                        {duel.status === "COMPLETED" && duel.my_xp != null && ` · +${duel.my_xp} XP`}
                      </p>
                    </div>
                  </div>
                  <DuelStatusBadge duel={duel} />
                </div>
              );
              return needsAction ? (
                <Link key={duel.id} to={`/student/duels/${duel.id}`} className="block">
                  {content}
                </Link>
              ) : (
                <div key={duel.id}>{content}</div>
              );
            })}
          </div>
        )}
      </div>

      {isModalOpen && <CreateDuelModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
