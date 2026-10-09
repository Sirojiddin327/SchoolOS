import { Swords, Trophy } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

import { useAuth } from "../../lib/auth";
import type { BattleRules, BattleState, GameSession, LiveAnswerResult } from "../../types";
import { BattleCharacter, FIGHTERS, fighterById, OPPONENT, type Fighter, type FighterPose } from "./BattleCharacter";
import {
  AnimatedNumber,
  formatDuration,
  GameHeaderBar,
  GameInlineError,
  GameResultScreen,
  GameStartActions,
  GameStartStat,
} from "./GameUI";
import { LiveQuestionSection } from "./LiveQuestionSection";
import { playedSeconds, useLiveGame } from "./useLiveGame";

const SECONDS_PER_QUESTION_ESTIMATE = 30;
const FIGHTER_STORAGE_KEY = "schoolos.battle-fighter";
// Attack choreography (ms): wind-up + projectile, impact, back to idle.
const IMPACT_AT = 500;
const SETTLE_AT = 1050;
const ADVANCE_MS = 1700;
const FINALE_MS = 2800;
// Only for the very first paint before the server's state arrives — the
// server's `battle.rules` is the real source of every HP/damage number.
const FALLBACK_RULES: BattleRules = {
  player_hp: 100,
  enemy_hp: 100,
  hit_damage: 20,
  miss_damage: 10,
};

function readStoredFighter(): string | null {
  try {
    return localStorage.getItem(FIGHTER_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeFighter(id: string) {
  try {
    localStorage.setItem(FIGHTER_STORAGE_KEY, id);
  } catch {
    // Private mode / blocked storage — the choice just isn't remembered.
  }
}

interface Shot {
  key: number;
  from: "player" | "enemy";
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
  damage: number;
  xp: number;
}

/** Jang maydoni (Battle Arena) — a correct answer is the player's attack, a
 * wrong one the opponent's. HP, damage, combo and the knockout are all
 * computed by the server from the locked-in answers (`battle` in every
 * `/answer/` response); this component only choreographs them. */
export function BattleArenaGame({ session }: { session: GameSession }) {
  const { user } = useAuth();
  const total = session.question_count;
  const [fighter, setFighter] = useState<Fighter>(() => fighterById(readStoredFighter()));

  const initial = session.battle;
  const rules = initial?.rules ?? FALLBACK_RULES;
  const [hp, setHp] = useState({
    player: initial?.player_hp ?? rules.player_hp,
    enemy: initial?.enemy_hp ?? rules.enemy_hp,
  });
  const [combo, setCombo] = useState(initial?.combo ?? 0);
  const [poses, setPoses] = useState<{
    player: FighterPose;
    enemy: FighterPose;
    key: number;
  }>({
    player: "idle",
    enemy: "idle",
    key: 0,
  });
  const [shot, setShot] = useState<Shot | null>(null);
  const [resultShown, setResultShown] = useState(session.status === "COMPLETED");

  const arenaRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const enemyRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  function later(ms: number, fn: () => void) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function playExchange(result: LiveAnswerResult, xpGained: number) {
    const battle = result.battle;
    if (!battle) return;
    const attacker = result.correct ? "player" : "enemy";
    const target = result.correct ? "enemy" : "player";
    const key = Date.now();

    const arena = arenaRef.current?.getBoundingClientRect();
    const from = (attacker === "player" ? playerRef : enemyRef).current?.getBoundingClientRect();
    const to = (target === "player" ? playerRef : enemyRef).current?.getBoundingClientRect();
    if (arena && from && to) {
      const fx = from.left + from.width / 2 - arena.left;
      const fy = from.top + from.height * 0.45 - arena.top;
      const tx = to.left + to.width / 2 - arena.left;
      const ty = to.top + to.height * 0.45 - arena.top;
      setShot({
        key,
        from: attacker,
        x: fx,
        y: fy,
        dx: tx - fx,
        dy: ty - fy,
        color: attacker === "player" ? fighter.accent : OPPONENT.accent,
        damage: result.correct ? battle.rules.hit_damage : battle.rules.miss_damage,
        xp: xpGained,
      });
    }

    setPoses((p) => ({ ...p, [attacker]: "attack", key }));
    later(IMPACT_AT, () => {
      setPoses((p) => ({ ...p, [target]: "hit", key }));
      setHp({ player: battle.player_hp, enemy: battle.enemy_hp });
      setCombo(battle.combo);
    });
    later(SETTLE_AT, () => {
      if (!battle.over) setPoses({ player: "idle", enemy: "idle", key });
    });
  }

  const game = useLiveGame(session, {
    advanceMs: ADVANCE_MS,
    isGameOver: (result) => Boolean(result.battle?.over),
    initiallyOver: Boolean(initial?.over),
    onAnswered: (result, _index, xpGained) => playExchange(result, xpGained),
  });
  const { submitMutation, finalSession, feedback } = game;
  const victory = Boolean(finalSession?.goal_reached);

  // The finale: victory / battle-complete poses and banner, then the result screen.
  useEffect(() => {
    if (!finalSession || resultShown) return;
    const battle = finalSession.battle;
    const poseTimer = window.setTimeout(() => {
      setPoses({
        player: victory ? "victory" : battle && battle.player_hp <= 0 ? "defeat" : "idle",
        enemy: victory ? "defeat" : "idle",
        key: Date.now(),
      });
    }, 0);
    const t = window.setTimeout(() => setResultShown(true), FINALE_MS);
    return () => {
      window.clearTimeout(poseTimer);
      window.clearTimeout(t);
    };
  }, [finalSession, resultShown, victory]);

  if (game.phase === "start") {
    return (
      <FighterSelect
        session={session}
        rules={rules}
        fighter={fighter}
        onSelect={(f) => {
          setFighter(f);
          storeFighter(f.id);
        }}
        loading={game.questionsQuery.isLoading}
        error={game.questionsQuery.isError}
        unavailable={game.questionsUnavailable}
        resuming={session.answered_count > 0}
        onStart={game.start}
      />
    );
  }

  if (game.phase === "finished" && finalSession && resultShown) {
    return (
      <BattleResult session={finalSession} fighter={fighter} elapsed={game.elapsed} onPlayAgain={game.playAgain} />
    );
  }

  const finishing = game.phase === "finished";
  const round = Math.min(game.questionIndex + 1, total);

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <GameHeaderBar title={`Battle Arena · ${session.subject_name}`} totalXp={user?.total_xp ?? 0} />

      {/* HUD */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <FighterHud fighter={fighter} role="SIZ" hp={hp.player} maxHp={rules.player_hp} xp={game.xpEarned} />
        <RoundPanel round={round} total={total} answered={game.answered} combo={combo} />
        <FighterHud fighter={OPPONENT} role="RAQIB" hp={hp.enemy} maxHp={rules.enemy_hp} align="right" />
      </div>

      {/* Arena */}
      <div
        ref={arenaRef}
        className="relative h-[330px] overflow-hidden rounded-2xl border border-slate-800 bg-[#040712] sm:h-[360px] md:h-[340px]"
        aria-label={`Jang: siz ${hp.player} HP, raqib ${hp.enemy} HP`}
      >
        <ArenaBackdrop />

        <FighterSlot slotRef={playerRef} side="player" fighter={fighter} pose={poses.player} poseKey={poses.key} />
        <FighterSlot slotRef={enemyRef} side="enemy" fighter={OPPONENT} pose={poses.enemy} poseKey={poses.key} />

        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none">
          <span className="bg-gradient-to-b from-white to-sky-300 bg-clip-text text-4xl font-black italic tracking-tight text-transparent drop-shadow-[0_0_18px_rgba(56,189,248,0.6)] md:text-5xl">
            VS
          </span>
        </div>

        {shot && <ShotEffects key={shot.key} shot={shot} />}

        {finalSession && !resultShown && <FinaleOverlay victory={victory} />}
        {finishing && !finalSession && (
          <div className="absolute inset-0 flex animate-fade-in items-center justify-center bg-slate-950/50">
            {submitMutation.isError ? (
              <div className="mx-4 max-w-sm space-y-3">
                <GameInlineError>Natijalar saqlanmadi — internet aloqasi uzilgan bo'lishi mumkin.</GameInlineError>
                <button
                  onClick={() => submitMutation.mutate()}
                  className="w-full rounded-xl bg-brand-600 py-3 text-sm font-bold text-white hover:bg-brand-700"
                >
                  Qayta yuborish
                </button>
              </div>
            ) : (
              <p className="font-mono text-xs tracking-[0.3em] text-sky-200">JANG YAKUNLANMOQDA…</p>
            )}
          </div>
        )}
      </div>

      {!finishing && (
        <LiveQuestionSection
          game={game}
          label={`Round ${String(round).padStart(2, "0")}`}
          wrongTitle={`Noto'g'ri — raqib zarbasi: −${rules.miss_damage} HP`}
          explanationLabel="Nega?"
          successDetail={
            <span className="flex items-center gap-2 font-bold uppercase tracking-wide">
              +{feedback?.result.battle?.rules.hit_damage ?? rules.hit_damage} damage
              {(feedback?.result.battle?.combo ?? 0) >= 2 && (
                <span className="rounded-md bg-brand-500/15 px-1.5 py-0.5 text-brand-700 dark:text-sky-300">
                  Combo ×{feedback?.result.battle?.combo}
                </span>
              )}
            </span>
          }
        />
      )}
    </div>
  );
}

// ---------- Arena pieces ----------

const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 37) % 100,
  bottom: (i * 23) % 40,
  delay: (i * 0.45) % 6,
  size: i % 3 === 0 ? 3 : 2,
}));

function ArenaBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_115%,rgba(37,99,235,0.45),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-20%,rgba(139,92,246,0.22),transparent_55%)]" />

      {/* Distant structures */}
      <svg
        viewBox="0 0 800 200"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-x-0 top-[8%] h-[46%] w-full opacity-60"
      >
        <g fill="#0b1530">
          <path d="M0 200 V120 H40 V90 H70 V130 H110 V60 H130 V40 H140 V60 H160 V140 H210 V100 H250 V200 Z" />
          <path d="M540 200 V110 H580 V70 H600 V30 H612 V70 H640 V120 H690 V80 H730 V130 H800 V200 Z" />
          <path d="M300 200 V150 L340 120 L380 150 V200 Z" />
          <path d="M420 200 V140 L460 110 L500 140 V200 Z" />
        </g>
        <g fill="#38bdf8">
          {[
            [135, 44],
            [606, 34],
            [60, 96],
            [700, 88],
            [230, 108],
            [570, 78],
          ].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="2" opacity="0.8" className="animate-pulse motion-reduce:animate-none" />
          ))}
        </g>
        <rect x="0" y="198" width="800" height="2" fill="#38bdf8" opacity="0.35" />
      </svg>

      {/* Glowing perspective floor */}
      <div
        className="absolute inset-x-[-30%] bottom-0 h-[52%]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(56,189,248,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.22) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
          transform: "perspective(420px) rotateX(62deg)",
          transformOrigin: "bottom",
          maskImage: "linear-gradient(to top, black 30%, transparent)",
          WebkitMaskImage: "linear-gradient(to top, black 30%, transparent)",
        }}
      />
      <div className="absolute inset-x-0 top-[54%] h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
      <div className="absolute inset-x-[15%] top-[56%] h-px bg-gradient-to-r from-transparent via-violet-400/40 to-transparent" />

      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-cyan-300 animate-particle-rise motion-reduce:hidden"
          style={{
            left: `${p.left}%`,
            bottom: `${p.bottom}%`,
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

const SLOT_CLASS = {
  // Phones: a diagonal, vertical-first arena (opponent up-right, you down-left).
  // md+: the two fighters squared off across the floor.
  player: "left-[3%] bottom-[3%] h-[58%] md:left-[11%] md:bottom-[8%] md:h-[78%]",
  enemy: "right-[5%] top-[5%] h-[46%] md:top-auto md:right-[11%] md:bottom-[8%] md:h-[78%]",
};

function FighterSlot({
  slotRef,
  side,
  fighter,
  pose,
  poseKey,
}: {
  slotRef: RefObject<HTMLDivElement>;
  side: "player" | "enemy";
  fighter: Fighter;
  pose: FighterPose;
  poseKey: number;
}) {
  return (
    <div ref={slotRef} className={`absolute aspect-[7/10] ${SLOT_CLASS[side]}`}>
      {/* Platform */}
      <div
        className="absolute -bottom-[2%] left-1/2 h-[9%] w-[120%] -translate-x-1/2 rounded-[50%] border"
        style={{
          borderColor: `${fighter.accent}99`,
          background: `radial-gradient(ellipse at center, ${fighter.accent}44, transparent 70%)`,
          boxShadow: `0 0 26px ${fighter.accent}55`,
        }}
      />
      <BattleCharacter
        fighter={fighter}
        pose={pose}
        poseKey={poseKey}
        facing={side === "player" ? "right" : "left"}
        className="h-full w-full"
      />
      <span
        className="absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950/70 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.2em] md:hidden"
        style={{ color: fighter.accent }}
      >
        {fighter.name}
      </span>
    </div>
  );
}

function ShotEffects({ shot }: { shot: Shot }) {
  const tx = shot.x + shot.dx;
  const ty = shot.y + shot.dy;
  const vars = {
    "--dx": `${shot.dx}px`,
    "--dy": `${shot.dy}px`,
  } as CSSProperties;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {/* Energy orb */}
      <span
        className="absolute -ml-3 -mt-3 h-6 w-6 animate-projectile rounded-full motion-reduce:hidden"
        style={{
          ...vars,
          left: shot.x,
          top: shot.y,
          background: `radial-gradient(circle, white 0%, ${shot.color} 45%, transparent 70%)`,
          boxShadow: `0 0 24px 8px ${shot.color}`,
          animationDelay: "0.16s",
          animationFillMode: "both",
        }}
      />
      {/* Impact burst */}
      <span
        className="absolute h-16 w-16 animate-impact rounded-full border-2 motion-reduce:hidden"
        style={{
          left: tx,
          top: ty,
          borderColor: shot.color,
          boxShadow: `0 0 30px ${shot.color}, inset 0 0 20px ${shot.color}`,
          animationDelay: `${IMPACT_AT / 1000}s`,
          animationFillMode: "both",
        }}
      />
      {/* Damage number (+ XP on your hits) */}
      <div
        className="absolute -translate-x-1/2 animate-float-up text-center"
        style={{
          left: tx,
          top: ty - 70,
          animationDelay: `${IMPACT_AT / 1000}s`,
          animationFillMode: "both",
        }}
      >
        <p
          className="text-2xl font-black md:text-3xl"
          style={{
            color: shot.from === "player" ? "#e0f2fe" : "#fecaca",
            textShadow: `0 0 16px ${shot.color}`,
          }}
        >
          −{shot.damage}
        </p>
        {shot.from === "player" && shot.xp > 0 && <p className="text-sm font-bold text-amber-400">+{shot.xp} XP</p>}
      </div>
    </div>
  );
}

function FinaleOverlay({ victory }: { victory: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex animate-fade-in items-center justify-center">
      <div
        className={`absolute inset-0 ${
          victory ? "bg-[radial-gradient(ellipse_at_25%_70%,rgba(34,211,238,0.35),transparent_60%)]" : "bg-slate-950/40"
        }`}
      />
      {victory && (
        <span className="absolute left-[25%] top-[62%] h-40 w-40 animate-impact rounded-full border-2 border-cyan-300 shadow-[0_0_40px_rgba(34,211,238,0.8)] motion-reduce:hidden" />
      )}
      <p
        className={`relative animate-banner-in text-center font-black ${
          victory
            ? "bg-gradient-to-b from-white via-sky-200 to-cyan-400 bg-clip-text text-5xl text-transparent drop-shadow-[0_0_30px_rgba(34,211,238,0.7)] md:text-7xl"
            : "text-3xl text-white md:text-5xl"
        }`}
      >
        {victory ? "VICTORY" : "BATTLE COMPLETE"}
      </p>
    </div>
  );
}

// ---------- HUD ----------

export function HealthBar({
  value,
  max,
  tone,
  align = "left",
}: {
  value: number;
  max: number;
  tone: "player" | "enemy";
  align?: "left" | "right";
}) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const low = percent <= 30;
  const fill = low
    ? "from-red-500 to-rose-400"
    : tone === "player"
      ? "from-brand-500 to-cyan-400"
      : "from-amber-500 to-orange-400";
  const anchor = align === "right" ? "right-0" : "left-0";
  return (
    <div
      className="relative h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      {/* Damage "ghost" trails behind the real bar */}
      <div
        className={`absolute inset-y-0 ${anchor} rounded-full bg-slate-400/60 transition-[width] delay-300 duration-700 dark:bg-white/35`}
        style={{ width: `${percent}%` }}
      />
      <div
        className={`absolute inset-y-0 ${anchor} rounded-full bg-gradient-to-r ${fill} shadow-[0_0_10px_rgba(34,211,238,0.35)] transition-[width] duration-300`}
        style={{ width: `${percent}%` }}
      />
      <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_calc(10%-1px),rgba(2,6,23,0.35)_calc(10%-1px),rgba(2,6,23,0.35)_10%)]" />
    </div>
  );
}

function FighterHud({
  fighter,
  role,
  hp,
  maxHp,
  xp,
  align = "left",
}: {
  fighter: Fighter;
  role: string;
  hp: number;
  maxHp: number;
  xp?: number;
  align?: "left" | "right";
}) {
  const right = align === "right";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className={`flex items-center gap-2 ${right ? "flex-row-reverse text-right" : ""}`}>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-black text-white"
          style={{
            background: `linear-gradient(135deg, ${fighter.armorLight}, ${fighter.armorDark})`,
            boxShadow: `0 0 12px ${fighter.accent}66`,
          }}
        >
          {fighter.name[0]}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-black tracking-wider text-slate-900 dark:text-slate-50">{fighter.name}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{role}</p>
        </div>
      </div>
      <div className="mt-2">
        <HealthBar value={hp} max={maxHp} tone={right ? "enemy" : "player"} align={align} />
      </div>
      <div
        className={`mt-1.5 flex items-center justify-between text-xs font-semibold ${right ? "flex-row-reverse" : ""}`}
      >
        <span className="text-slate-600 dark:text-slate-300">
          HP {hp}/{maxHp}
        </span>
        {xp !== undefined && <span className="text-amber-600 dark:text-amber-400">+{xp} XP</span>}
      </div>
    </div>
  );
}

function RoundPanel({
  round,
  total,
  answered,
  combo,
}: {
  round: number;
  total: number;
  answered: number;
  combo: number;
}) {
  return (
    <div className="col-span-2 row-start-1 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900 md:col-span-1 md:row-start-auto md:min-w-[170px] md:flex-col md:justify-center md:py-3">
      <div className="text-left md:text-center">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">Round</p>
        <p className="whitespace-nowrap font-mono text-lg font-black text-slate-900 dark:text-slate-50">
          {String(round).padStart(2, "0")} <span className="text-slate-400">/ {total}</span>
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap justify-center gap-1" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 w-2.5 rounded-sm transition-colors ${i < answered ? "bg-brand-500" : "bg-slate-200 dark:bg-slate-800"}`}
          />
        ))}
      </div>
      <span
        key={combo}
        className={`whitespace-nowrap rounded-lg px-2 py-0.5 font-mono text-xs font-black tracking-wider ${
          combo >= 2
            ? "animate-combo-pop bg-gradient-to-r from-brand-500 to-cyan-400 text-white shadow-[0_0_14px_rgba(34,211,238,0.5)] motion-reduce:animate-none"
            : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
        }`}
      >
        COMBO ×{Math.max(combo, 0)}
      </span>
    </div>
  );
}

// ---------- Start: choose your fighter ----------

function FighterSelect({
  session,
  rules,
  fighter,
  onSelect,
  loading,
  error,
  unavailable,
  resuming,
  onStart,
}: {
  session: GameSession;
  rules: BattleRules;
  fighter: Fighter;
  onSelect: (fighter: Fighter) => void;
  loading: boolean;
  error: boolean;
  unavailable: boolean;
  resuming: boolean;
  onStart: () => void;
}) {
  const total = session.question_count;
  const minutes = Math.max(1, Math.round((total * SECONDS_PER_QUESTION_ESTIMATE) / 60));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="text-center">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.35em] text-brand-600 dark:text-sky-300/90">
          Battle Arena · {session.subject_name}
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-[0.14em] text-slate-900 dark:text-white dark:drop-shadow-[0_0_24px_rgba(56,189,248,0.45)] sm:text-4xl">
          CHOOSE YOUR FIGHTER
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-300">
          To'g'ri javob — sizning zarbangiz, xato javob — raqibning zarbasi. Jangchi tanlovi faqat ko'rinish uchun.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" role="radiogroup" aria-label="Jangchini tanlang">
        {FIGHTERS.map((f) => {
          const selected = f.id === fighter.id;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(f)}
              className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-b from-slate-900 to-slate-950 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                selected ? "border-transparent" : "border-slate-800 hover:border-slate-600"
              }`}
              style={
                selected
                  ? {
                      boxShadow: `0 0 0 2px ${f.accent}, 0 0 28px ${f.accent}55`,
                    }
                  : undefined
              }
            >
              <div
                className="absolute inset-x-0 bottom-0 h-1/2 opacity-60"
                style={{
                  background: `radial-gradient(ellipse at 50% 100%, ${f.accent}33, transparent 70%)`,
                }}
              />
              <div className="relative mx-auto h-36 sm:h-44">
                <BattleCharacter
                  fighter={f}
                  pose={selected ? "victory" : "idle"}
                  className="mx-auto h-full aspect-[7/10]"
                />
              </div>
              <div className="relative mt-2 flex items-center justify-between">
                <div>
                  <p className="font-black tracking-[0.15em] text-white">{f.name}</p>
                  <p className="flex items-center gap-1 text-xs font-semibold" style={{ color: f.accent }}>
                    <f.traitIcon size={12} /> {f.trait}
                  </p>
                </div>
                {selected && (
                  <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    Tanlandi
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mx-auto max-w-lg space-y-4 text-center">
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 px-4 py-3">
          <span className="font-black tracking-[0.15em]" style={{ color: fighter.accent }}>
            {fighter.name}
          </span>
          <span className="font-black italic text-slate-500">VS</span>
          <span className="font-black tracking-[0.15em]" style={{ color: OPPONENT.accent }}>
            {OPPONENT.name}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <GameStartStat label="Raundlar" value={`${total} ta`} />
          <GameStartStat label="Maksimal XP" value={`${session.max_xp} XP`} tone="amber" />
          <GameStartStat label="Taxminiy vaqt" value={`~${minutes} daq`} />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          To'g'ri javob: raqibga −{rules.hit_damage} HP · Xato javob: sizga −{rules.miss_damage} HP. Raqibning HP'si
          tugasa — g'alaba!
        </p>
        <GameStartActions loading={loading} error={error} unavailable={unavailable} resuming={resuming} onStart={onStart} label="Jangga kirish" />
      </div>
    </div>
  );
}

// ---------- Result ----------

function BattleResult({
  session,
  fighter,
  elapsed,
  onPlayAgain,
}: {
  session: GameSession;
  fighter: Fighter;
  elapsed: number;
  onPlayAgain: () => void;
}) {
  const battle: BattleState | null = session.battle;
  const rounds = battle?.rounds_played ?? session.answered_count;
  const correct = session.correct_count;
  const accuracy = Math.round(session.score_percent ?? 0);
  const victory = session.goal_reached;
  const xp = session.xp_awarded ? <AnimatedNumber value={session.xp_awarded} prefix="+" /> : "0";

  const showcase = (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-[#040712] py-4">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 50% 90%, ${fighter.accent}40, transparent 65%)`,
        }}
      />
      <BattleCharacter
        fighter={fighter}
        pose={victory ? "victory" : "idle"}
        className="relative mx-auto aspect-[7/10] h-40"
      />
      <p className="relative mt-1 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-sky-300">
        Battle complete
      </p>
    </div>
  );

  if (victory) {
    return (
      <GameResultScreen
        remedialSessionId={session?.remedial_session_id}
        tone="win"
        icon={Trophy}
        title="VICTORY"
        subtitle={`${fighter.name} ${OPPONENT.name}ni mag'lub etdi — ajoyib jang!`}
        stats={[
          { label: "To'g'ri javoblar", value: `${correct}/${rounds}` },
          { label: "Aniqlik", value: `${accuracy}%` },
          { label: "Eng yuqori combo", value: `×${battle?.max_combo ?? 0}` },
          { label: "Olingan XP", value: xp, tone: "amber" },
          {
            label: "Vaqt",
            value: formatDuration(playedSeconds(elapsed, session)),
          },
        ]}
        onPrimary={onPlayAgain}
        primaryLabel="Qayta o'ynash"
        secondaryLabel="O'yinlarga qaytish"
      >
        {showcase}
      </GameResultScreen>
    );
  }

  return (
    <GameResultScreen
      remedialSessionId={session?.remedial_session_id}
      tone="neutral"
      icon={Swords}
      title="BATTLE COMPLETE"
      subtitle="Siz arenadan o'tdingiz! Har bir raund bilimingizni kuchaytiradi — keyingi jangda albatta g'alaba qozonasiz."
      stats={[
        { label: "To'g'ri javoblar", value: `${correct}/${rounds}` },
        { label: "Aniqlik", value: `${accuracy}%` },
        { label: "Olingan XP", value: xp, tone: "amber" },
        {
          label: "O'tilgan raundlar",
          value: `${rounds}/${session.question_count}`,
        },
      ]}
      onPrimary={onPlayAgain}
      primaryLabel="Qayta urinish"
      secondaryLabel="O'yinlarga qaytish"
    >
      {showcase}
    </GameResultScreen>
  );
}
