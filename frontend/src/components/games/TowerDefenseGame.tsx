import { Clock, Crosshair, Flag, Gem, Shield, Skull, Sparkles, Swords, Trophy, Zap } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";

import { useAuth } from "../../lib/auth";
import type {
  DefenseBoost,
  DefenseEnemy,
  DefenseEnemyType,
  DefenseState,
  GameSession,
  LiveAnswerResult,
} from "../../types";
import { DefenseEnemyArt, DefenseTower } from "./DefenseArt";
import { emitGameEvent } from "./gameEvents";
import {
  AnimatedNumber,
  formatDuration,
  GameDarkShell,
  GameInlineError,
  GameProgressBar,
  GameResultScreen,
  GameStartActions,
  GameStartStat,
} from "./GameUI";
import { LiveQuestionSection } from "./LiveQuestionSection";
import { useIsWide } from "./useIsWide";
import { playedSeconds, useLiveGame } from "./useLiveGame";

const GAME = "TOWER_DEFENSE";
// Shot choreography (ms): charge + projectile flight, then impact.
const IMPACT_AT = 480;
// How long a cleared wave's last explosion plays before the next wave spawns.
const NEXT_WAVE_AT = 1100;
const ADVANCE_MS = 1900;
const FINALE_MS = 2800;

const DIFFICULTY_LABEL = { EASY: "Oson", MEDIUM: "O'rta", HARD: "Qiyin" } as const;

const ENEMY_INFO: Record<DefenseEnemyType, { name: string; trait: string }> = {
  scout: { name: "SCOUT", trait: "Tez · kam HP" },
  shield: { name: "SHIELD", trait: "Energiya qalqoni" },
  tank: { name: "TANK", trait: "Sekin · ko'p HP" },
  boss: { name: "BOSS", trait: "So'nggi to'lqin" },
};

const BOOST_COLOR: Record<"normal" | "POWER_BOOST" | "OVERCHARGE", string> = {
  normal: "#22d3ee",
  POWER_BOOST: "#fbbf24",
  OVERCHARGE: "#c084fc",
};

// ---------- Battlefield geometry ----------

type Point = { x: number; y: number };

/** Where enemies come from and the base they march on, in % of the field.
 * Wide screens: a horizontal lane, portal on the right. Phones: a vertical
 * lane, portal at the top, the tower at the bottom. */
const LANE = {
  wide: { spawn: { x: 90, y: 58 }, base: { x: 16, y: 58 } },
  tall: { spawn: { x: 50, y: 9 }, base: { x: 50, y: 74 } },
};

function laneAt(wide: boolean, t: number): Point {
  const { spawn, base } = wide ? LANE.wide : LANE.tall;
  return { x: spawn.x + (base.x - spawn.x) * t, y: spawn.y + (base.y - spawn.y) * t };
}

const ENEMY_WIDTH: Record<DefenseEnemyType, { wide: number; tall: number }> = {
  scout: { wide: 8, tall: 17 },
  shield: { wide: 9.5, tall: 20 },
  tank: { wide: 11.5, tall: 23 },
  boss: { wide: 17, tall: 34 },
};

/** Lane progress (0 = portal, 1 = base) for each living enemy: the front one
 * creeps closer with every missed question this wave, the rest queue behind. */
function enemySlots(enemies: DefenseEnemy[], steps: number): Map<number, number> {
  const front = Math.min(0.2 + steps * 0.1, 0.62);
  const slots = new Map<number, number>();
  let k = 0;
  enemies.forEach((enemy, index) => {
    if (enemy.hp > 0) {
      slots.set(index, Math.max(0.02, front - k * 0.16));
      k += 1;
    }
  });
  return slots;
}

interface Shot {
  key: number;
  from: "tower" | "enemy";
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
  damage: number;
  xp: number;
  label?: string;
}

/** Tower Defense — a correct answer fires the tower at the front enemy, a
 * wrong one lets that enemy strike the base. Waves, HP, shields, combo boosts
 * and the outcome come from the server's replay (`defense` in every
 * `/answer/` response, see apps.games.defense); this component stages it. */
export function TowerDefenseGame({ session }: { session: GameSession }) {
  const { user } = useAuth();
  const wide = useIsWide();
  const initial = session.defense;

  const [field, setField] = useState<DefenseState | null>(initial);
  const [enemies, setEnemies] = useState<DefenseEnemy[]>(initial?.enemies ?? []);
  const [waveKey, setWaveKey] = useState(initial?.wave ?? 1);
  const [steps, setSteps] = useState(0);
  const [banner, setBanner] = useState<{ key: number; boss: boolean; wave: number } | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [charging, setCharging] = useState(false);
  const [baseHitKey, setBaseHitKey] = useState(0);
  const [resultShown, setResultShown] = useState(session.status === "COMPLETED");

  const fieldRef = useRef<HTMLDivElement>(null);
  const towerRef = useRef<HTMLDivElement>(null);
  const enemyRefs = useRef(new Map<number, HTMLDivElement>());
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));

  function showWaveBanner(wave: number, boss: boolean) {
    setBanner({ key: Date.now(), boss, wave });
    emitGameEvent(GAME, boss ? "boss_arrival" : "wave_start");
    later(1600, () => setBanner(null));
  }

  function aim(fromEl: Element | null | undefined, fromYRatio: number, toEl: Element | null | undefined) {
    const stage = fieldRef.current?.getBoundingClientRect();
    const a = fromEl?.getBoundingClientRect();
    const b = toEl?.getBoundingClientRect();
    if (!stage || !a || !b) return null;
    const x = a.left + a.width / 2 - stage.left;
    const y = a.top + a.height * fromYRatio - stage.top;
    return { x, y, dx: b.left + b.width / 2 - stage.left - x, dy: b.top + b.height / 2 - stage.top - y };
  }

  function playTurn(result: LiveAnswerResult, xpGained: number) {
    const next = result.defense;
    const event = next?.last_event;
    if (!next || !event) return;
    const key = Date.now();
    const previousBoost = field?.boost ?? null;
    emitGameEvent(GAME, result.correct ? "correct" : "wrong");

    if (event.kind === "hit") {
      emitGameEvent(GAME, "tower_attack");
      setCharging(true);
      // Tower crystal (46/220 down the tower art) → the front enemy.
      const geometry = aim(towerRef.current, 46 / 220, enemyRefs.current.get(event.target));
      if (geometry) {
        setShot({
          key,
          from: "tower",
          ...geometry,
          color: BOOST_COLOR[event.boost ?? "normal"],
          damage: event.damage,
          xp: xpGained,
          label: event.shield_hit ? "SHIELD HIT" : event.killed ? "DESTROYED" : undefined,
        });
      }
      later(IMPACT_AT, () => {
        setCharging(false);
        emitGameEvent(GAME, event.killed ? "enemy_defeated" : "enemy_hit");
        if (next.boost && next.boost !== previousBoost) {
          emitGameEvent(GAME, next.boost === "OVERCHARGE" ? "overcharge" : "power_boost");
        } else if (next.combo >= 2) {
          emitGameEvent(GAME, "combo_up");
        }
        setField(next);
        if (event.wave_cleared) {
          // Let the last enemy's explosion play on the old wave, then spawn the next.
          setEnemies((current) => current.map((e, i) => (i === event.target ? { ...e, hp: 0, shield: 0 } : e)));
          if (!next.victory) {
            later(NEXT_WAVE_AT - IMPACT_AT, () => {
              setEnemies(next.enemies);
              setWaveKey(next.wave);
              setSteps(0);
              showWaveBanner(next.wave, next.boss_wave);
            });
          }
        } else {
          setEnemies(next.enemies);
        }
      });
    } else {
      emitGameEvent(GAME, "base_hit");
      // The front enemy fires at the tower's base.
      const geometry = aim(enemyRefs.current.get(event.source), 0.5, towerRef.current);
      if (geometry) {
        setShot({
          key,
          from: "enemy",
          ...geometry,
          dy: geometry.dy + 40,
          color: "#e879f9",
          damage: event.damage,
          xp: 0,
        });
      }
      later(IMPACT_AT, () => {
        setField(next);
        setSteps((s) => s + 1);
        setBaseHitKey((k) => k + 1);
      });
    }
  }

  const game = useLiveGame(session, {
    advanceMs: ADVANCE_MS,
    isGameOver: (result) => Boolean(result.defense?.over),
    initiallyOver: Boolean(initial?.over),
    onAnswered: (result, _index, xpGained) => playTurn(result, xpGained),
  });
  const { submitMutation, finalSession, feedback } = game;
  const victory = Boolean(finalSession?.goal_reached);

  // "Play again" lands here with autoStart — skip the briefing once questions are in.
  useEffect(() => {
    if (game.autoStart && game.phase === "start" && game.questionsQuery.isSuccess) {
      const t = window.setTimeout(() => {
        game.start();
        showWaveBanner(field?.wave ?? 1, Boolean(field?.boss_wave));
      }, 0);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when questions are ready
  }, [game.autoStart, game.questionsQuery.isSuccess]);

  // Finale banner, then the result screen.
  useEffect(() => {
    if (!finalSession || resultShown) return;
    emitGameEvent(GAME, victory ? "victory" : "defeat");
    const t = window.setTimeout(() => setResultShown(true), FINALE_MS);
    return () => window.clearTimeout(t);
  }, [finalSession, resultShown, victory]);

  if (!initial || !field) {
    return <GameInlineError>Bu o'yin holatini yuklab bo'lmadi.</GameInlineError>;
  }

  if (game.phase === "start") {
    return (
      <GameDarkShell>
        <Briefing
          session={session}
          state={field}
          wide={wide}
          loading={game.questionsQuery.isLoading}
          error={game.questionsQuery.isError}
          unavailable={game.questionsUnavailable}
          resuming={session.answered_count > 0}
          onStart={() => {
            game.start();
            showWaveBanner(field.wave, field.boss_wave);
          }}
        />
      </GameDarkShell>
    );
  }

  if (game.phase === "finished" && finalSession && resultShown) {
    return <DefenseResult session={finalSession} elapsed={game.elapsed} onPlayAgain={game.playAgain} />;
  }

  const finishing = game.phase === "finished";
  const boss = enemies.find((enemy) => enemy.type === "boss");

  return (
    <GameDarkShell>
      <Hud
        state={field}
        round={Math.min(game.questionIndex + 1, game.total)}
        total={game.total}
        xp={game.xpEarned}
        elapsed={game.elapsed}
        userXp={user?.total_xp ?? 0}
        subject={session.subject_name}
      />

      <Battlefield
        fieldRef={fieldRef}
        towerRef={towerRef}
        enemyRefs={enemyRefs}
        wide={wide}
        state={field}
        enemies={enemies}
        waveKey={waveKey}
        steps={steps}
        charging={charging}
        baseHitKey={baseHitKey}
        zoom={boss && boss.hp > 0 ? 1.04 : 1}
      >
        {boss && <BossBar boss={boss} />}
        {shot && <ShotEffects key={shot.key} shot={shot} />}
        {banner && <WaveBanner key={banner.key} wave={banner.wave} total={field.waves_total} boss={banner.boss} />}
        {finalSession && !resultShown && <FinaleBanner victory={victory} />}
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
      </Battlefield>

      {!finishing && (
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 shadow-[0_0_40px_-12px_rgba(56,189,248,0.35)] backdrop-blur sm:p-4">
          <div className="mb-3 flex items-center justify-between font-mono text-[11px] font-bold uppercase tracking-[0.25em]">
            <span className="text-sky-300">
              {field.boss_wave ? "Boss wave" : `Wave ${String(field.wave).padStart(2, "0")}`}
            </span>
            <ComboTag combo={field.combo} boost={field.boost} />
          </div>
          <LiveQuestionSection
            game={game}
            wrongTitle="Noto'g'ri — dushman bazaga zarba berdi"
            explanationLabel="Nega?"
            successDetail={
              <span className="flex items-center gap-1.5 font-bold uppercase tracking-wide">
                <Crosshair size={13} />
                {feedback?.result.defense?.last_event?.kind === "hit"
                  ? `−${feedback.result.defense.last_event.damage} HP`
                  : "Zarba"}
              </span>
            }
          />
        </div>
      )}
    </GameDarkShell>
  );
}

// ---------- HUD ----------

function HudPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}

function HudLabel({ icon: Icon, children }: { icon: typeof Clock; children: ReactNode }) {
  return (
    <p className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
      <Icon size={11} /> {children}
    </p>
  );
}

function Hud({
  state,
  round,
  total,
  xp,
  elapsed,
  userXp,
  subject,
}: {
  state: DefenseState;
  round: number;
  total: number;
  xp: number;
  elapsed: number;
  userXp: number;
  subject: string;
}) {
  const basePercent = (state.base_hp / state.max_base_hp) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="bg-gradient-to-r from-sky-300 via-cyan-200 to-violet-300 bg-clip-text font-black tracking-[0.2em] text-transparent">
          TOWER DEFENSE
        </p>
        <p className="truncate text-xs text-slate-400">
          {subject} · {DIFFICULTY_LABEL[state.difficulty]} · Jami {userXp} XP
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-[auto_minmax(0,1.6fr)_auto_auto_auto]">
        <HudPanel>
          <HudLabel icon={Flag}>Wave</HudLabel>
          <p className="font-mono text-lg font-black">
            {state.wave}
            <span className="text-slate-500">/{state.waves_total}</span>
            {state.boss_wave && <span className="ml-2 text-xs text-fuchsia-300">BOSS</span>}
          </p>
        </HudPanel>
        <HudPanel className="order-first col-span-2 md:order-none md:col-span-1">
          <div className="flex items-center justify-between">
            <HudLabel icon={Shield}>Baza</HudLabel>
            <span className="font-mono text-xs font-bold">
              {state.base_hp}/{state.max_base_hp}
            </span>
          </div>
          <div
            className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-800"
            role="meter"
            aria-label="Baza HP"
            aria-valuemin={0}
            aria-valuemax={state.max_base_hp}
            aria-valuenow={state.base_hp}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/30 transition-[width] delay-300 duration-700"
              style={{ width: `${basePercent}%` }}
            />
            <div
              className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r transition-[width] duration-300 ${
                basePercent <= 30 ? "from-red-500 to-rose-400" : "from-brand-500 to-cyan-400"
              } shadow-[0_0_10px_rgba(34,211,238,0.5)]`}
              style={{ width: `${basePercent}%` }}
            />
          </div>
        </HudPanel>
        <HudPanel>
          <HudLabel icon={Zap}>XP</HudLabel>
          <p className="font-mono text-lg font-black text-amber-400">+{xp}</p>
        </HudPanel>
        <HudPanel>
          <HudLabel icon={Sparkles}>Combo</HudLabel>
          <p key={state.combo} className="animate-combo-pop font-mono text-lg font-black motion-reduce:animate-none">
            ×{state.combo}
          </p>
        </HudPanel>
        <HudPanel>
          <HudLabel icon={Clock}>Vaqt</HudLabel>
          <p className="font-mono text-lg font-black">{formatDuration(elapsed)}</p>
          <p className="font-mono text-[10px] text-slate-500">
            Savol {round}/{total}
          </p>
        </HudPanel>
      </div>
    </div>
  );
}

function ComboTag({ combo, boost }: { combo: number; boost: DefenseBoost }) {
  if (boost) {
    const overcharge = boost === "OVERCHARGE";
    return (
      <span
        key={boost}
        className={`animate-combo-pop rounded-md px-2 py-0.5 text-white motion-reduce:animate-none ${
          overcharge
            ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-[0_0_16px_rgba(192,132,252,0.7)]"
            : "bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_0_16px_rgba(251,191,36,0.6)]"
        }`}
      >
        {overcharge ? "Overcharge" : "Power boost"} ×{combo}
      </span>
    );
  }
  return <span className={combo >= 2 ? "text-cyan-300" : "text-slate-500"}>Combo ×{combo}</span>;
}

// ---------- Battlefield ----------

const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  left: (i * 41) % 100,
  bottom: (i * 29) % 50,
  delay: (i * 0.4) % 6,
  size: i % 4 === 0 ? 3 : 2,
}));

function Battlefield({
  fieldRef,
  towerRef,
  enemyRefs,
  wide,
  state,
  enemies,
  waveKey,
  steps,
  charging,
  baseHitKey,
  zoom,
  preview = false,
  children,
}: {
  fieldRef?: RefObject<HTMLDivElement>;
  towerRef?: RefObject<HTMLDivElement>;
  enemyRefs?: MutableRefObject<Map<number, HTMLDivElement>>;
  wide: boolean;
  state: DefenseState;
  enemies: DefenseEnemy[];
  waveKey: number;
  steps: number;
  charging: boolean;
  baseHitKey: number;
  zoom: number;
  preview?: boolean;
  children?: ReactNode;
}) {
  const slots = enemySlots(enemies, steps);
  const lastSlot = useRef(new Map<string, number>());
  const spawn = laneAt(wide, 0);

  // A base hit shakes the stage for a moment (without remounting anything on it).
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    if (baseHitKey === 0) return;
    const start = window.setTimeout(() => setShaking(true), 0);
    const stop = window.setTimeout(() => setShaking(false), 480);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(stop);
    };
  }, [baseHitKey]);

  return (
    <div
      ref={fieldRef}
      className={`relative overflow-hidden rounded-2xl border border-slate-800 bg-[#03060f] ${
        wide ? "aspect-[16/7]" : "h-[440px]"
      }`}
      role="img"
      aria-label={`Jang maydoni: to'lqin ${state.wave}/${state.waves_total}, baza ${state.base_hp} HP`}
    >
      <div
        className={`absolute inset-0 transition-transform duration-1000 ease-out ${
          shaking ? "animate-shake motion-reduce:animate-none" : ""
        }`}
        style={{ transform: `scale(${zoom})` }}
      >
        {/* Atmosphere */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_90%,rgba(37,99,235,0.35),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_90%_20%,rgba(168,85,247,0.28),transparent_50%)]" />
        <div
          className="absolute inset-x-[-20%] bottom-0 h-[55%] opacity-70"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56,189,248,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.16) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            transform: "perspective(420px) rotateX(58deg)",
            transformOrigin: "bottom",
            maskImage: "linear-gradient(to top, black 30%, transparent)",
            WebkitMaskImage: "linear-gradient(to top, black 30%, transparent)",
          }}
        />
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="absolute animate-particle-rise rounded-full bg-cyan-300 motion-reduce:hidden"
            style={{
              left: `${p.left}%`,
              bottom: `${p.bottom}%`,
              width: p.size,
              height: p.size,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}

        {/* The lane */}
        {wide ? (
          <div
            className="absolute left-[12%] right-[5%] top-[58%] h-[15%] -translate-y-1/2 animate-lane-flow border-y border-cyan-400/25 motion-reduce:animate-none"
            style={{
              background:
                "linear-gradient(90deg, rgba(34,211,238,0.12), rgba(168,85,247,0.12)), repeating-linear-gradient(90deg, transparent 0 60px, rgba(125,211,252,0.18) 60px 64px, transparent 64px 80px)",
            }}
          />
        ) : (
          <div
            className="absolute bottom-[20%] left-1/2 top-[3%] w-[30%] -translate-x-1/2 animate-lane-flow-y border-x border-cyan-400/25 motion-reduce:animate-none"
            style={{
              background:
                "linear-gradient(180deg, rgba(168,85,247,0.12), rgba(34,211,238,0.12)), repeating-linear-gradient(180deg, transparent 0 60px, rgba(125,211,252,0.18) 60px 64px, transparent 64px 80px)",
            }}
          />
        )}

        {/* Enemy portal */}
        <div
          className="absolute aspect-square -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${spawn.x}%`, top: `${spawn.y}%`, width: wide ? "11%" : "30%" }}
        >
          <div className="absolute inset-0 animate-[spin_6s_linear_infinite] rounded-full border-2 border-dashed border-fuchsia-400/60 motion-reduce:animate-none" />
          <div className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle,rgba(232,121,249,0.55),rgba(88,28,135,0.2)_60%,transparent_70%)] shadow-[0_0_40px_rgba(192,132,252,0.6)]" />
        </div>

        {/* Tower + base */}
        <div
          ref={towerRef}
          className={`absolute aspect-[120/220] ${
            wide ? "bottom-[6%] left-[3%] h-[80%]" : "bottom-[1%] left-1/2 h-[38%] -translate-x-1/2"
          }`}
        >
          <DefenseTower boost={state.boost} charging={charging} className="h-full w-full" />
        </div>

        {/* Enemies */}
        {enemies.map((enemy, index) => {
          const key = `${waveKey}-${index}`;
          const alive = enemy.hp > 0;
          const t = alive ? (slots.get(index) ?? 0) : (lastSlot.current.get(key) ?? 0.3);
          if (alive) lastSlot.current.set(key, t);
          return (
            <EnemyUnit
              key={key}
              unitRef={(el) => {
                if (!enemyRefs) return;
                if (el) enemyRefs.current.set(index, el);
                else enemyRefs.current.delete(index);
              }}
              enemy={enemy}
              wide={wide}
              position={laneAt(wide, t)}
              spawn={spawn}
              speed={state.speed}
              instant={preview}
            />
          );
        })}
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(2,6,23,0.75))]" />
      {baseHitKey > 0 && (
        <div key={baseHitKey} className="pointer-events-none absolute inset-0 animate-alert-flash rounded-2xl" />
      )}
      {children}
    </div>
  );
}

function EnemyUnit({
  unitRef,
  enemy,
  wide,
  position,
  spawn,
  speed,
  instant,
}: {
  unitRef: (el: HTMLDivElement | null) => void;
  enemy: DefenseEnemy;
  wide: boolean;
  position: Point;
  spawn: Point;
  speed: number;
  instant: boolean;
}) {
  // Mount at the portal, then march to the slot — a new wave visibly arrives.
  const [entered, setEntered] = useState(instant);
  useEffect(() => {
    const t = window.setTimeout(() => setEntered(true), 60);
    return () => window.clearTimeout(t);
  }, []);
  const at = entered ? position : spawn;
  const alive = enemy.hp > 0;
  const boss = enemy.type === "boss";
  const hpPercent = (enemy.hp / enemy.max_hp) * 100;
  const moveSeconds = (boss ? 1.6 : 1.1) / speed;

  return (
    <div
      ref={unitRef}
      className="absolute aspect-square -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${at.x}%`,
        top: `${at.y}%`,
        width: `${ENEMY_WIDTH[enemy.type][wide ? "wide" : "tall"]}%`,
        transition: `left ${moveSeconds}s cubic-bezier(0.45,0,0.2,1), top ${moveSeconds}s cubic-bezier(0.45,0,0.2,1)`,
        zIndex: boss ? 5 : 6,
      }}
      aria-label={`${ENEMY_INFO[enemy.type].name}: ${enemy.hp}/${enemy.max_hp} HP`}
    >
      <div className={alive ? (boss ? "animate-boss-enter" : "") : "animate-enemy-die"}>
        <div
          className={alive ? "animate-enemy-bob motion-reduce:animate-none" : undefined}
          style={{ animationDuration: `${2.4 / speed}s` }}
        >
          <div style={wide ? undefined : { transform: "rotate(-90deg)" }}>
            <DefenseEnemyArt type={enemy.type} shielded={enemy.shield > 0} className="h-full w-full" />
          </div>
        </div>
      </div>
      {alive && !boss && (
        <div className="absolute -top-2 left-[10%] right-[10%] h-1.5 overflow-hidden rounded-full bg-slate-900/90 ring-1 ring-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-rose-400 transition-[width] duration-300"
            style={{ width: `${hpPercent}%` }}
          />
          {enemy.max_shield > 0 && enemy.shield > 0 && (
            <div
              className="absolute inset-y-0 left-0 bg-violet-200/80"
              style={{ width: `${(enemy.shield / enemy.max_shield) * 100}%` }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function BossBar({ boss }: { boss: DefenseEnemy }) {
  const percent = (boss.hp / boss.max_hp) * 100;
  return (
    <div className="absolute inset-x-[8%] top-3 z-10 animate-fade-in">
      <div className="flex items-center justify-between font-mono text-[10px] font-black uppercase tracking-[0.3em] text-fuchsia-300">
        <span className="flex items-center gap-1">
          <Skull size={11} /> Boss wave
        </span>
        <span>
          {boss.hp}/{boss.max_hp}
        </span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-900/90 ring-1 ring-fuchsia-400/40">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-rose-400 shadow-[0_0_14px_rgba(232,121,249,0.7)] transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

const SPARK_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function ShotEffects({ shot }: { shot: Shot }) {
  const tx = shot.x + shot.dx;
  const ty = shot.y + shot.dy;
  const vars = { "--dx": `${shot.dx}px`, "--dy": `${shot.dy}px` } as CSSProperties;
  const impactDelay = `${IMPACT_AT / 1000}s`;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
      <span
        className="absolute -ml-3 -mt-3 h-6 w-6 animate-projectile rounded-full motion-reduce:hidden"
        style={{
          ...vars,
          left: shot.x,
          top: shot.y,
          background: `radial-gradient(circle, white 0%, ${shot.color} 45%, transparent 70%)`,
          boxShadow: `0 0 26px 10px ${shot.color}`,
          animationDelay: "0.14s",
          animationFillMode: "both",
        }}
      />
      <span
        className="absolute h-14 w-14 animate-impact rounded-full border-2 motion-reduce:hidden"
        style={{
          left: tx,
          top: ty,
          borderColor: shot.color,
          boxShadow: `0 0 30px ${shot.color}`,
          animationDelay: impactDelay,
          animationFillMode: "both",
        }}
      />
      {SPARK_ANGLES.map((angle) => (
        <span
          key={angle}
          className="absolute h-1.5 w-1.5 animate-spark rounded-full motion-reduce:hidden"
          style={
            {
              left: tx,
              top: ty,
              background: shot.color,
              boxShadow: `0 0 8px ${shot.color}`,
              "--sx": `${Math.cos((angle * Math.PI) / 180) * 42}px`,
              "--sy": `${Math.sin((angle * Math.PI) / 180) * 42}px`,
              animationDelay: impactDelay,
              animationFillMode: "both",
            } as CSSProperties
          }
        />
      ))}
      <div
        className="absolute -translate-x-1/2 animate-float-up text-center"
        style={{ left: tx, top: ty - 64, animationDelay: impactDelay, animationFillMode: "both" }}
      >
        {shot.label && <p className="font-mono text-[10px] font-black tracking-[0.25em] text-white/80">{shot.label}</p>}
        <p
          className="text-2xl font-black md:text-3xl"
          style={{ color: shot.from === "tower" ? "#e0f2fe" : "#fecaca", textShadow: `0 0 16px ${shot.color}` }}
        >
          −{shot.damage}
        </p>
        {shot.xp > 0 && <p className="text-sm font-bold text-amber-400">+{shot.xp} XP</p>}
      </div>
    </div>
  );
}

function WaveBanner({ wave, total, boss }: { wave: number; total: number; boss: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex animate-fade-in flex-col items-center justify-center bg-slate-950/30">
      <p
        className={`animate-banner-in text-center font-black ${
          boss
            ? "bg-gradient-to-b from-white via-fuchsia-200 to-fuchsia-500 bg-clip-text text-4xl text-transparent drop-shadow-[0_0_30px_rgba(232,121,249,0.8)] md:text-6xl"
            : "text-3xl text-white drop-shadow-[0_0_24px_rgba(56,189,248,0.8)] md:text-5xl"
        }`}
      >
        {boss ? "BOSS WAVE" : `WAVE ${wave}`}
      </p>
      <p className="mt-2 font-mono text-xs tracking-[0.3em] text-slate-300">
        {boss ? "Oxirgi sinov — hamma kuchni ishga soling" : `${wave} / ${total}`}
      </p>
    </div>
  );
}

function FinaleBanner({ victory }: { victory: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex animate-fade-in items-center justify-center">
      <div
        className={`absolute inset-0 ${
          victory ? "bg-[radial-gradient(ellipse_at_20%_70%,rgba(34,211,238,0.4),transparent_60%)]" : "bg-slate-950/50"
        }`}
      />
      <p
        className={`relative animate-banner-in text-center font-black ${
          victory
            ? "bg-gradient-to-b from-white via-sky-200 to-cyan-400 bg-clip-text text-5xl text-transparent drop-shadow-[0_0_30px_rgba(34,211,238,0.7)] md:text-7xl"
            : "text-3xl text-white md:text-5xl"
        }`}
      >
        {victory ? "VICTORY" : "BATTLE ENDED"}
      </p>
    </div>
  );
}

// ---------- Briefing (start) ----------

function Briefing({
  session,
  state,
  wide,
  loading,
  error,
  unavailable,
  resuming,
  onStart,
}: {
  session: GameSession;
  state: DefenseState;
  wide: boolean;
  loading: boolean;
  error: boolean;
  unavailable: boolean;
  resuming: boolean;
  onStart: () => void;
}) {
  const minutes = Math.max(1, Math.round((session.question_count * 30) / 60));
  return (
    <div className="space-y-5">
      <div className="relative">
        <Battlefield
          wide={wide}
          state={state}
          enemies={state.enemies}
          waveKey={state.wave}
          steps={0}
          charging={false}
          baseHitKey={0}
          zoom={1}
          preview
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 rounded-t-2xl bg-gradient-to-b from-slate-950/90 via-slate-950/40 to-transparent px-5 pb-16 pt-5 text-center">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.35em] text-sky-300/90">
            {session.subject_name} · {DIFFICULTY_LABEL[state.difficulty]}
          </p>
          <h1 className="mt-1 bg-gradient-to-r from-sky-200 via-white to-violet-200 bg-clip-text text-3xl font-black tracking-[0.18em] text-transparent drop-shadow-[0_0_24px_rgba(56,189,248,0.45)] sm:text-5xl">
            TOWER DEFENSE
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {(Object.keys(ENEMY_INFO) as DefenseEnemyType[]).map((type) => (
          <div key={type} className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/70 p-3">
            <DefenseEnemyArt type={type} shielded={type === "shield"} className="h-10 w-10 shrink-0" />
            <div className="min-w-0">
              <p className={`font-black tracking-[0.15em] ${type === "boss" ? "text-fuchsia-300" : "text-white"}`}>
                {ENEMY_INFO[type].name}
              </p>
              <p className="truncate text-xs text-slate-400">{ENEMY_INFO[type].trait}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-lg space-y-4 text-center">
        <div className="grid grid-cols-3 gap-2">
          <GameStartStat label="Savollar" value={`${session.question_count} ta`} />
          <GameStartStat label="To'lqinlar" value={`${state.waves_total} ta`} />
          <GameStartStat label="Maksimal XP" value={`${session.max_xp} XP`} tone="amber" />
        </div>
        <p className="text-sm text-slate-400">
          To'g'ri javob — minora o'q uzadi, xato — dushman bazaga zarba beradi. 5 ta ketma-ket to'g'ri javob — POWER
          BOOST, 10 ta — OVERCHARGE. Taxminan {minutes} daqiqa.
        </p>
        <GameStartActions
          loading={loading}
          error={error}
          unavailable={unavailable}
          resuming={resuming}
          onStart={onStart}
          label="Mudofaani boshlash"
        />
      </div>
    </div>
  );
}

// ---------- Result ----------

function DefenseResult({
  session,
  elapsed,
  onPlayAgain,
}: {
  session: GameSession;
  elapsed: number;
  onPlayAgain: () => void;
}) {
  const state = session.defense;
  const record = session.personal_record;
  const accuracy = Math.round(session.score_percent ?? 0);
  const victory = session.goal_reached;
  const xp = session.xp_awarded ? <AnimatedNumber value={session.xp_awarded} prefix="+" /> : "0";
  if (!state) return null;

  if (victory) {
    return (
      <GameResultScreen
        tone="win"
        icon={Trophy}
        title="VICTORY"
        subtitle={`Baza himoya qilindi — ${DIFFICULTY_LABEL[state.difficulty]} daraja yakunlandi.`}
        remedialSessionId={session.remedial_session_id}
        stats={[
          { label: "Ball", value: <AnimatedNumber value={state.score} /> },
          { label: "Aniqlik", value: `${accuracy}%` },
          { label: "Olingan XP", value: xp, tone: "amber" },
          { label: "Eng yuqori combo", value: `×${state.max_combo}` },
          { label: "Yo'q qilingan dushman", value: `${state.enemies_defeated}` },
          { label: "To'lqinlar", value: `${state.waves_cleared}/${state.waves_total}` },
        ]}
        onPrimary={onPlayAgain}
        primaryLabel="Yana o'ynash"
        secondaryLabel="O'yinlarga qaytish"
      >
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-slate-900">
          {record?.is_record && (
            <p className="flex animate-pop-in items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-2 text-sm font-black uppercase tracking-wider text-white shadow-[0_0_20px_rgba(251,191,36,0.5)]">
              <Gem size={16} /> Yangi shaxsiy rekord!
            </p>
          )}
          <GameProgressBar label="Aniqlik" value={accuracy} max={100} suffix="%" />
          <GameProgressBar label="To'lqinlar" value={state.waves_cleared} max={state.waves_total} />
          <GameProgressBar label="Dushmanlar" value={state.enemies_defeated} max={state.enemies_total} />
          {record?.best_before !== null && record?.best_before !== undefined && (
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              Oldingi eng yaxshi natija: {record.best_before} ball
            </p>
          )}
        </div>
      </GameResultScreen>
    );
  }

  return (
    <GameResultScreen
      tone="neutral"
      icon={Swords}
      title="BATTLE ENDED"
      subtitle={`Bu safar ${state.waves_cleared}/${state.waves_total} to'lqin to'xtatildi — har bir savol minorani kuchaytiradi. Yana bir urinish!`}
      remedialSessionId={session.remedial_session_id}
      stats={[
        { label: "Aniqlik", value: `${accuracy}%` },
        { label: "Olingan XP", value: xp, tone: "amber" },
        { label: "Eng yuqori combo", value: `×${state.max_combo}` },
        { label: "Javob berilgan savollar", value: `${state.rounds_played}` },
      ]}
      onPrimary={onPlayAgain}
      primaryLabel="Qayta urinish"
      secondaryLabel="O'yinlarga qaytish"
    >
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-slate-900">
        <GameProgressBar label="To'lqinlar" value={state.waves_cleared} max={state.waves_total} />
        <GameProgressBar label="Dushmanlar" value={state.enemies_defeated} max={state.enemies_total} />
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Vaqt: {formatDuration(playedSeconds(elapsed, session))}
        </p>
      </div>
    </GameResultScreen>
  );
}
