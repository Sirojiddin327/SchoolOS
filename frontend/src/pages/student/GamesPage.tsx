import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Brain,
  Building2,
  Castle,
  Clock,
  Gamepad2,
  Gauge,
  KeyRound,
  Map,
  Shield,
  Swords,
  Shuffle,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge } from "../../components/Badge";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { NO_QUESTIONS_HINT, NO_QUESTIONS_TITLE } from "../../lib/gameErrors";
import { api } from "../../lib/api";
import type { GameDifficulty, GameSession, GameType, Paginated, Subject, SubjectCoverage } from "../../types";

const ALL_SUBJECTS_OPTION = { id: 0, name: "Hamma fanlar" };

const GAME_OPTIONS: { type: GameType; label: string; description: string; icon: typeof Swords }[] = [
  {
    type: "TUG_OF_WAR",
    label: "Arqon tortish",
    description: "Har to'g'ri javob arqonni o'zingizga tortadi — nechta savolga to'g'ri javob bera olasiz?",
    icon: Swords,
  },
  {
    type: "QUIZ",
    label: "Viktorina",
    description: "Klassik test-o'yin — savollarga javob bering, oxirida natijangizni ko'ring.",
    icon: Brain,
  },
  {
    type: "TOWER_BUILDER",
    label: "Minora qurish",
    description: "Har to'g'ri javob minorangizga yangi qavat qo'shadi — 10 savolda eng baland minorani quring.",
    icon: Building2,
  },
  {
    type: "CODE_BREAKER",
    label: "Kodni buzish",
    description: "Har to'g'ri javob maxfiy kodning bir segmentini ochadi — 70% to'plab, kodni to'liq buzing.",
    icon: KeyRound,
  },
  {
    type: "TREASURE_HUNT",
    label: "Xazina ovi",
    description: "Har to'g'ri javob xaritada bir manzil oldinga olib boradi — 80% to'plab, xazinaga yeting.",
    icon: Map,
  },
  {
    type: "BATTLE_ARENA",
    label: "Jang maydoni",
    description: "Jangchingizni tanlang: to'g'ri javob — sizning zarbangiz, xato — raqibniki. Raqibni yenging!",
    icon: Shield,
  },
  {
    type: "TOWER_DEFENSE",
    label: "Tower Defense",
    description:
      "Bazangizni to'lqin-to'lqin hujumdan himoya qiling — har to'g'ri javob minorani o'q uzdiradi. Oxirida — BOSS.",
    icon: Castle,
  },
  {
    type: "NEON_RACING",
    label: "Neon Racing",
    description:
      "Neon trekda AI raqiblar bilan poyga — bilimingiz mashinangizni tezlashtiradi. Nitroni o'z vaqtida yoqing!",
    icon: Gauge,
  },
];

// Games that ask for a level before starting, and what each level means there.
const LEVELS: Partial<Record<GameType, Record<GameDifficulty, string>>> = {
  TOWER_DEFENSE: {
    EASY: "10 savol · 3 to'lqin · sekin dushmanlar",
    MEDIUM: "12 savol · 4 to'lqin · kuchliroq boss",
    HARD: "14 savol · 4 to'lqin · tez va kuchli dushmanlar",
  },
  NEON_RACING: {
    EASY: "10 savol · 2 aylana · nitro tez to'ladi",
    MEDIUM: "12 savol · 3 aylana · kuchli raqiblar",
    HARD: "14 savol · 3 aylana · eng tez raqiblar, nitro — sekin",
  },
};

const DIFFICULTY_OPTIONS: { value: GameDifficulty; label: string; tone: string }[] = [
  { value: "EASY", label: "Oson", tone: "text-emerald-600 dark:text-emerald-400" },
  { value: "MEDIUM", label: "O'rta", tone: "text-amber-600 dark:text-amber-400" },
  { value: "HARD", label: "Qiyin", tone: "text-red-600 dark:text-red-400" },
];

export function StudentGamesPage() {
  const navigate = useNavigate();
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null);

  const {
    data: subjects,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await api.get<Paginated<Subject>>("/subjects/")).data,
  });

  const { data: coverage } = useQuery({
    queryKey: ["games", "subjects", "coverage"],
    queryFn: async () => (await api.get<SubjectCoverage[]>("/games/subjects/")).data,
  });

  const { data: history } = useQuery({
    queryKey: ["games"],
    queryFn: async () => (await api.get<Paginated<GameSession>>("/games/")).data,
  });

  const [levelFor, setLevelFor] = useState<GameType | null>(null);

  /** The picked subject has nothing in the question bank — show the empty state
   * up front instead of letting the student start a game that can't fill. */
  const selectedSubjectIsEmpty =
    selectedSubject !== null &&
    selectedSubject !== 0 &&
    coverage !== undefined &&
    coverage.some((row) => row.id === selectedSubject && row.question_count === 0);

  const startGame = useMutation({
    mutationFn: async ({ game_type, difficulty }: { game_type: GameType; difficulty?: GameDifficulty }) =>
      (await api.post<GameSession>("/games/", { subject: selectedSubject === 0 ? null : selectedSubject, game_type, difficulty })).data,
    onSuccess: (session) => navigate(`/student/games/${session.id}`),
  });

  return (
    <div className="space-y-6">
      <PageHeader icon={Gamepad2} title="O'yinlar" />

      <div>
        <h2 className="mb-3 section-title">1. Fan tanlang</h2>
        {isLoading && <LoadingState />}
        {isError && <ErrorState />}
        {subjects && subjects.results.length === 0 && <EmptyState title="Hali fan qo'shilmagan" />}
        {subjects && subjects.results.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            <button
              key="all"
              onClick={() => setSelectedSubject(0)}
              className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-colors ${
                selectedSubject === 0
                  ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10"
                  : "hover-card border-line bg-surface"
              }`}
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  selectedSubject === 0
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                <Shuffle size={18} />
              </span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{ALL_SUBJECTS_OPTION.name}</span>
            </button>
            {subjects.results.map((subject) => (
              <button
                key={subject.id}
                onClick={() => setSelectedSubject(subject.id)}
                className={`flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-colors ${
                  selectedSubject === subject.id
                    ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10"
                    : "hover-card border-line bg-surface"
                }`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    selectedSubject === subject.id
                      ? "bg-brand-600 text-white"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}
                >
                  <BookOpen size={18} />
                </span>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{subject.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedSubjectIsEmpty && (
        <EmptyState
          icon={BookOpen}
          title={NO_QUESTIONS_TITLE}
          description={NO_QUESTIONS_HINT}
          action={
            <button type="button" onClick={() => setSelectedSubject(null)} className="btn-ghost mt-2">
              Boshqa fanni tanlash
            </button>
          }
        />
      )}

      {selectedSubject !== null && !selectedSubjectIsEmpty && (
        <div>
          <h2 className="mb-3 section-title">2. O'yinni tanlang</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {GAME_OPTIONS.map((option) => (
              <button
                key={option.type}
                onClick={() =>
                  LEVELS[option.type] ? setLevelFor(option.type) : startGame.mutate({ game_type: option.type })
                }
                disabled={startGame.isPending}
                className="card flex items-start gap-3 p-5 text-left disabled:opacity-60 hover-card"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                  <option.icon size={20} />
                </span>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-50">{option.label}</p>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{option.description}</p>
                </div>
              </button>
            ))}
          </div>
          {levelFor && (
            <div className="mt-4 animate-pop-in">
              <h3 className="mb-3 section-title">3. Qiyinlikni tanlang</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {DIFFICULTY_OPTIONS.map((level) => (
                  <button
                    key={level.value}
                    type="button"
                    onClick={() => startGame.mutate({ game_type: levelFor, difficulty: level.value })}
                    disabled={startGame.isPending}
                    className="hover-card rounded-xl border border-slate-200 p-4 text-left disabled:opacity-60 dark:border-slate-700"
                  >
                    <p className={`font-bold ${level.tone}`}>{level.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {LEVELS[levelFor]?.[level.value]}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
          {startGame.isPending && <LoadingState label="O'yin boshlanmoqda..." />}
        </div>
      )}

      {history && history.results.length > 0 && (
        <div>
          <h2 className="mb-3 section-title">So'nggi o'yinlar</h2>
          <div className="divide-y divide-line-soft">
            {history.results.slice(0, 8).map((session) => (
              <div key={session.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {session.subject_name} · {session.game_type_display}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-ink-subtle">
                    <Clock size={11} />
                    {new Date(session.created_at).toLocaleDateString("uz-UZ")}
                  </p>
                </div>
                {session.status === "COMPLETED" ? (
                  <Badge tone="emerald">{session.score_percent?.toFixed(0)}%</Badge>
                ) : (
                  <Badge tone="amber">Tugallanmagan</Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
