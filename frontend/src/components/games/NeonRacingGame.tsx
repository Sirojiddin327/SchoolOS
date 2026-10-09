import { Flag, Gauge, Rocket, Timer, Trophy, Zap } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../lib/auth";
import type { GameSession, LiveAnswerResult, RaceState } from "../../types";
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
import {
  carById,
  PLAYER_CARS,
  RaceCar,
  RIVAL_CARS,
  trackById,
  TRACKS,
  type CarDesign,
  type TrackTheme,
} from "./RacingArt";
import { RaceView, type Drive } from "./RaceView";
import { playedSeconds, useLiveGame } from "./useLiveGame";

const GAME = "NEON_RACING";
const CAR_KEY = "schoolos.race-car";
const TRACK_KEY = "schoolos.race-track";
const ADVANCE_MS = 1300;
const FINALE_MS = 3000;
const DIFFICULTY_LABEL = { EASY: "Oson", MEDIUM: "O'rta", HARD: "Qiyin" } as const;

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode / blocked storage — the choice just isn't remembered.
  }
}

function ordinal(position: number): string {
  return ["1ST", "2ND", "3RD"][position - 1] ?? `${position}TH`;
}

interface Banner {
  key: number;
  title: string;
  sub?: string;
  tone: "cyan" | "amber" | "white";
}

/** Neon Racing — each question is a stretch of track: a correct answer drives
 * on (combo adds pace, fills nitro), a wrong one loses pace. Distances, the
 * rivals, position, laps, checkpoints and nitro all come from the server's
 * replay (`race` in every `/answer/` response, see apps.games.racing); nitro is
 * only a request sent with the next answer, checked against the server's meter. */
export function NeonRacingGame({ session }: { session: GameSession }) {
  const { user } = useAuth();
  const [car, setCar] = useState<CarDesign>(() => carById(readPref(CAR_KEY)));
  const [track, setTrack] = useState<TrackTheme>(() => trackById(readPref(TRACK_KEY)));

  const [race, setRace] = useState<RaceState | null>(session.race);
  const [drive, setDrive] = useState<Drive>("idle");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [nitroArmed, setNitroArmed] = useState(false);
  const nitroRef = useRef(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [gateKey, setGateKey] = useState(0);
  const [warnKey, setWarnKey] = useState(0);
  const [xpPop, setXpPop] = useState<{ key: number; xp: number; label: string } | null>(null);
  const [resultShown, setResultShown] = useState(session.status === "COMPLETED");

  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));

  function showBanner(title: string, tone: Banner["tone"], sub?: string, ms = 1500) {
    const key = Date.now();
    setBanner({ key, title, sub, tone });
    later(ms, () => setBanner((current) => (current?.key === key ? null : current)));
  }

  function onStretch(result: LiveAnswerResult, _index: number, xpGained: number) {
    const next = result.race;
    if (!next) return;
    const previous = race;
    nitroRef.current = false;
    setNitroArmed(false);
    emitGameEvent(GAME, result.correct ? "correct" : "wrong");

    if (next.last?.nitro) {
      setDrive("nitro");
      later(1500, () => setDrive((d) => (d === "nitro" ? "cruise" : d)));
    } else if (result.correct) {
      setDrive("boost");
      later(1100, () => setDrive((d) => (d === "boost" ? "cruise" : d)));
    } else {
      setDrive("slow");
      setWarnKey((k) => k + 1);
      later(1300, () => setDrive((d) => (d === "slow" ? "cruise" : d)));
    }
    setRace(next);

    if (result.correct) {
      const label = next.combo >= 10 ? "PERFECT RUN" : next.combo >= 5 ? `COMBO ×${next.combo}` : "";
      setXpPop({ key: Date.now(), xp: xpGained, label });
      if (next.combo >= 2) emitGameEvent(GAME, "combo_up");
    }

    if (previous && next.checkpoints_passed > previous.checkpoints_passed) {
      setGateKey((k) => k + 1);
      emitGameEvent(GAME, "checkpoint");
      showBanner(`CHECKPOINT ${String(next.checkpoints_passed).padStart(2, "0")}`, "cyan", `${next.position}-o'rin`);
    }
    if (next.final_lap && !previous?.final_lap && !next.finished) {
      emitGameEvent(GAME, "final_lap");
      later(700, () => showBanner("FINAL LAP", "amber", "Oxirgi aylana — hammasini bering!", 1800));
    }
    if (next.finished) {
      emitGameEvent(GAME, "finish");
      later(500, () => {
        setDrive("finish");
        showBanner("FINISH", "white", `${ordinal(next.position)} PLACE`, FINALE_MS);
      });
    }
  }

  const game = useLiveGame(session, {
    advanceMs: ADVANCE_MS,
    answerExtras: () => (nitroRef.current ? { nitro: true } : {}),
    onAnswered: onStretch,
  });
  const { submitMutation, finalSession } = game;

  function fireNitro() {
    if (!race?.nitro_ready || nitroRef.current || game.phase !== "playing" || game.feedback) return;
    nitroRef.current = true;
    setNitroArmed(true);
    setDrive("nitro");
    emitGameEvent(GAME, "nitro");
  }

  // N or Space fires nitro when it's ready.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName) && event.key === " ") return;
      if (event.key.toLowerCase() === "n" || event.key === " ") {
        event.preventDefault();
        fireNitro();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function beginCountdown() {
    setDrive("stopped");
    setCountdown(3);
    emitGameEvent(GAME, "countdown");
    [2, 1, 0].forEach((n, i) =>
      later((i + 1) * 800, () => {
        setCountdown(n);
        emitGameEvent(GAME, n === 0 ? "race_start" : "countdown");
        if (n === 0) {
          game.start();
          setDrive("cruise");
          later(700, () => setCountdown(null));
        }
      }),
    );
  }

  // "Play again" lands here with autoStart — straight to the grid.
  useEffect(() => {
    if (game.autoStart && game.phase === "start" && game.questionsQuery.isSuccess && countdown === null) {
      const t = window.setTimeout(beginCountdown, 0);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when questions are ready
  }, [game.autoStart, game.questionsQuery.isSuccess]);

  useEffect(() => {
    if (!finalSession || resultShown) return;
    emitGameEvent(GAME, finalSession.goal_reached ? "victory" : "defeat");
    const t = window.setTimeout(() => setResultShown(true), FINALE_MS);
    return () => window.clearTimeout(t);
  }, [finalSession, resultShown]);

  if (!race) return <GameInlineError>Poyga holatini yuklab bo'lmadi.</GameInlineError>;

  if (game.phase === "finished" && finalSession && resultShown) {
    return <RaceResult session={finalSession} car={car} elapsed={game.elapsed} onPlayAgain={game.playAgain} />;
  }

  // Lobby (and the countdown on the grid)
  if (game.phase === "start") {
    return (
      <GameDarkShell>
        {countdown === null ? (
          <Lobby
            session={session}
            race={race}
            car={car}
            track={track}
            onCar={(c) => {
              setCar(c);
              writePref(CAR_KEY, c.id);
            }}
            onTrack={(t) => {
              setTrack(t);
              writePref(TRACK_KEY, t.id);
            }}
            loading={game.questionsQuery.isLoading}
            error={game.questionsQuery.isError}
            unavailable={game.questionsUnavailable}
            resuming={session.answered_count > 0}
            onStart={beginCountdown}
          />
        ) : (
          <RaceView track={track} car={car} drive={drive} race={race} className="aspect-[4/3] md:aspect-[16/7]">
            <CountdownOverlay n={countdown} />
          </RaceView>
        )}
      </GameDarkShell>
    );
  }

  const finishing = game.phase === "finished";
  const player = race.racers.find((r) => r.is_player);

  return (
    <GameDarkShell>
      <div className="flex items-center justify-between gap-2">
        <p className="shrink-0 whitespace-nowrap bg-gradient-to-r from-cyan-300 via-sky-200 to-fuchsia-300 bg-clip-text font-black tracking-[0.2em] text-transparent">
          NEON RACING
        </p>
        <p className="truncate text-xs text-slate-400">
          {session.subject_name} · {DIFFICULTY_LABEL[race.difficulty]} · {track.name} · Jami {user?.total_xp ?? 0} XP
        </p>
      </div>

      <RaceView
        track={track}
        car={car}
        drive={drive}
        race={race}
        finalLap={race.final_lap}
        gateKey={gateKey}
        finishGate={race.finished}
        warnKey={warnKey}
        className="aspect-[4/3] md:aspect-[16/7]"
      >
        <RaceHud race={race} xp={game.xpEarned} elapsed={game.elapsed} />
        <Standings race={race} />
        <ProgressStrip race={race} total={game.total} />
        {xpPop && (
          <div
            key={xpPop.key}
            className="pointer-events-none absolute bottom-[34%] left-1/2 z-[130] -translate-x-1/2 animate-float-up text-center"
          >
            {xpPop.label && (
              <p className="font-mono text-[11px] font-black tracking-[0.25em] text-cyan-200">{xpPop.label}</p>
            )}
            {xpPop.xp > 0 && <p className="text-xl font-black text-amber-400">+{xpPop.xp} XP</p>}
          </div>
        )}
        {banner && <RaceBanner key={banner.key} banner={banner} />}
        {finishing && !finalSession && submitMutation.isError && (
          <div className="absolute inset-0 z-[140] flex items-center justify-center bg-slate-950/60">
            <div className="mx-4 max-w-sm space-y-3">
              <GameInlineError>Natijalar saqlanmadi — internet aloqasi uzilgan bo'lishi mumkin.</GameInlineError>
              <button
                onClick={() => submitMutation.mutate()}
                className="w-full rounded-xl bg-brand-600 py-3 text-sm font-bold text-white hover:bg-brand-700"
              >
                Qayta yuborish
              </button>
            </div>
          </div>
        )}
      </RaceView>

      {!finishing && (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem]">
          <div className="order-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3 shadow-[0_0_40px_-12px_rgba(34,211,238,0.35)] backdrop-blur sm:p-4 md:order-1">
            <LiveQuestionSection
              game={game}
              label={`Savol ${String(game.questionIndex + 1).padStart(2, "0")} · ${race.position}/${race.field_size} o'rin`}
              wrongTitle="Noto'g'ri — tezlik pasaydi"
              explanationLabel="Nega?"
              successDetail={
                <span className="flex items-center gap-1.5 font-bold uppercase tracking-wide">
                  <Gauge size={13} /> +{race.last?.gain ?? 0} m
                  {race.combo >= 2 && <span className="text-cyan-300">· combo ×{race.combo}</span>}
                </span>
              }
            />
          </div>
          <NitroControl
            className="order-1 md:order-2"
            race={race}
            armed={nitroArmed}
            disabled={Boolean(game.feedback) || game.answerPending}
            onFire={fireNitro}
          />
        </div>
      )}
      {player && finishing && !submitMutation.isError && (
        <p className="text-center font-mono text-xs tracking-[0.3em] text-slate-400">NATIJA HISOBLANMOQDA…</p>
      )}
    </GameDarkShell>
  );
}

// ---------- In-race HUD ----------

function Glass({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/10 bg-slate-950/55 px-3 py-1.5 backdrop-blur ${className}`}>
      {children}
    </div>
  );
}

function RaceHud({ race, xp, elapsed }: { race: RaceState; xp: number; elapsed: number }) {
  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 z-[125] flex items-start justify-between gap-2 sm:inset-x-3 sm:top-3">
      <Glass>
        <p className="font-mono text-[9px] font-bold tracking-[0.25em] text-slate-400">POS</p>
        <p className="font-mono text-xl font-black leading-none sm:text-3xl">
          {race.position}
          <span className="text-sm text-slate-500 sm:text-base">/{race.field_size}</span>
        </p>
      </Glass>
      <Glass className="text-center">
        <p className="font-mono text-[9px] font-bold tracking-[0.25em] text-slate-400">LAP</p>
        <p
          className={`font-mono text-lg font-black leading-none sm:text-2xl ${race.final_lap ? "text-amber-300" : ""}`}
        >
          {race.lap}/{race.laps}
        </p>
        <p className="mt-0.5 flex items-center justify-center gap-1 font-mono text-[10px] text-slate-400">
          <Timer size={10} /> {formatDuration(elapsed)}
        </p>
      </Glass>
      <Glass className="text-right">
        <p className="font-mono text-[9px] font-bold tracking-[0.25em] text-slate-400">XP · COMBO</p>
        <p className="font-mono text-lg font-black leading-none sm:text-2xl">
          <span className="text-amber-400">+{xp}</span>
          <span
            key={race.combo}
            className="ml-2 inline-block animate-combo-pop text-cyan-300 motion-reduce:animate-none"
          >
            ×{race.combo}
          </span>
        </p>
      </Glass>
    </div>
  );
}

function Standings({ race }: { race: RaceState }) {
  const ordered = [...race.racers].sort((a, b) => b.distance - a.distance);
  const leader = ordered[0]?.distance ?? 0;
  return (
    <div className="pointer-events-none absolute right-3 top-24 z-[125] hidden w-40 space-y-1 md:block">
      {ordered.map((racer, i) => {
        const design = racer.is_player ? null : RIVAL_CARS[racer.id];
        return (
          <div
            key={racer.id}
            className={`flex items-center justify-between rounded-lg border px-2 py-1 font-mono text-[11px] backdrop-blur transition-all duration-700 ${
              racer.is_player
                ? "border-cyan-300/60 bg-cyan-400/15 text-white"
                : "border-white/10 bg-slate-950/55 text-slate-300"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span className="w-3 font-black">{i + 1}</span>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: design?.accent ?? "#22d3ee" }} />
              {racer.name}
            </span>
            <span className="text-slate-500">{i === 0 ? "—" : leader - racer.distance < 1 ? "<1m" : `−${Math.round(leader - racer.distance)}m`}</span>
          </div>
        );
      })}
    </div>
  );
}

function ProgressStrip({ race, total }: { race: RaceState; total: number }) {
  const progress = total > 0 ? race.answered / total : 0;
  const player = race.racers.find((r) => r.is_player)?.distance ?? 0;
  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-2 z-[125] sm:inset-x-8">
      <div className="relative h-1.5 rounded-full bg-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-400 transition-[width] duration-700"
          style={{ width: `${progress * 100}%` }}
        />
        {Array.from({ length: race.checkpoints_total }, (_, k) => (
          <span
            key={k}
            className={`absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 ${k < race.checkpoints_passed ? "bg-cyan-200" : "bg-white/30"}`}
            style={{ left: `${((k + 1) / (race.checkpoints_total + 1)) * 100}%` }}
          />
        ))}
        {race.racers
          .filter((r) => !r.is_player)
          .map((rival) => {
            // Rivals sit around the student's marker by their distance gap.
            const offset = player > 0 ? ((rival.distance - player) / player) * progress : 0;
            const at = Math.min(1, Math.max(0, progress + offset));
            return (
              <span
                key={rival.id}
                className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-slate-950 transition-[left] duration-700"
                style={{ left: `${at * 100}%`, background: RIVAL_CARS[rival.id]?.accent }}
              />
            );
          })}
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_#22d3ee] transition-[left] duration-700"
          style={{ left: `${progress * 100}%` }}
        />
        <Flag size={12} className="absolute -right-1 -top-4 text-white/70" />
      </div>
    </div>
  );
}

function NitroControl({
  race,
  armed,
  disabled,
  onFire,
  className = "",
}: {
  race: RaceState;
  armed: boolean;
  disabled: boolean;
  onFire: () => void;
  className?: string;
}) {
  const ready = race.nitro_ready;
  return (
    <button
      type="button"
      onClick={onFire}
      disabled={!ready || armed || disabled}
      aria-label={ready ? "Nitroni yoqish (N)" : `Nitro ${race.nitro}%`}
      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 md:flex-col md:items-stretch md:justify-center ${
        armed
          ? "border-fuchsia-300 bg-fuchsia-500/20 shadow-[0_0_30px_rgba(232,121,249,0.6)]"
          : ready
            ? "border-cyan-300 bg-cyan-400/15 shadow-[0_0_28px_rgba(34,211,238,0.55)] hover:-translate-y-0.5"
            : "border-white/10 bg-slate-950/60"
      } ${className}`}
    >
      <Rocket size={22} className={ready || armed ? "text-cyan-200" : "text-slate-500"} />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] font-black tracking-[0.3em] text-slate-300">
          {armed ? "NITRO YOQILDI" : ready ? "NITRO READY" : "NITRO"}
        </p>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ${
              ready || armed ? "from-cyan-300 to-fuchsia-400" : "from-cyan-600 to-sky-400"
            }`}
            style={{ width: `${armed ? 100 : race.nitro}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          {armed
            ? "Keyingi javob bilan kuchayadi"
            : ready
              ? "N yoki Space — yoqish"
              : `To'g'ri javoblar to'ldiradi · ${race.nitro_used} marta ishlatildi`}
        </p>
      </div>
    </button>
  );
}

function RaceBanner({ banner }: { banner: Banner }) {
  const color =
    banner.tone === "amber"
      ? "from-white via-amber-200 to-amber-500 drop-shadow-[0_0_24px_rgba(251,191,36,0.7)]"
      : banner.tone === "white"
        ? "from-white via-slate-100 to-slate-300 drop-shadow-[0_0_24px_rgba(248,250,252,0.6)]"
        : "from-white via-cyan-200 to-cyan-400 drop-shadow-[0_0_24px_rgba(34,211,238,0.7)]";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[26%] z-[135] flex flex-col items-center">
      <p
        className={`animate-banner-in bg-gradient-to-b bg-clip-text text-3xl font-black text-transparent md:text-5xl ${color}`}
      >
        {banner.title}
      </p>
      {banner.sub && <p className="mt-1 font-mono text-xs tracking-[0.3em] text-slate-200">{banner.sub}</p>}
    </div>
  );
}

function CountdownOverlay({ n }: { n: number }) {
  return (
    <div className="absolute inset-0 z-[140] flex items-center justify-center bg-slate-950/30">
      <span
        key={n}
        className={`animate-pop-in font-black ${
          n === 0
            ? "bg-gradient-to-b from-white to-emerald-300 bg-clip-text text-7xl text-transparent drop-shadow-[0_0_30px_rgba(52,211,153,0.8)] md:text-9xl"
            : "text-7xl text-white drop-shadow-[0_0_30px_rgba(34,211,238,0.8)] md:text-9xl"
        }`}
      >
        {n === 0 ? "GO!" : n}
      </span>
    </div>
  );
}

// ---------- Lobby ----------

function Lobby({
  session,
  race,
  car,
  track,
  onCar,
  onTrack,
  loading,
  error,
  unavailable,
  resuming,
  onStart,
}: {
  session: GameSession;
  race: RaceState;
  car: CarDesign;
  track: TrackTheme;
  onCar: (car: CarDesign) => void;
  onTrack: (track: TrackTheme) => void;
  loading: boolean;
  error: boolean;
  unavailable: boolean;
  resuming: boolean;
  onStart: () => void;
}) {
  const minutes = Math.max(1, Math.round((session.question_count * 25) / 60));
  return (
    <div className="space-y-5">
      <div className="relative">
        <RaceView track={track} car={car} drive="idle" race={null} className="aspect-[4/3] md:aspect-[16/7]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 rounded-t-2xl bg-gradient-to-b from-slate-950/85 via-slate-950/30 to-transparent px-5 pb-16 pt-5 text-center">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.35em] text-cyan-200/90">
            EduGames Championship
          </p>
          <h1 className="mt-1 bg-gradient-to-r from-cyan-200 via-white to-fuchsia-300 bg-clip-text text-4xl font-black italic tracking-[0.12em] text-transparent drop-shadow-[0_0_28px_rgba(34,211,238,0.5)] sm:text-6xl">
            NEON RACING
          </h1>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
        <span className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-slate-300">
          Fan: <b className="text-white">{session.subject_name}</b>
        </span>
        <span className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-slate-300">
          Qiyinlik: <b className="text-white">{DIFFICULTY_LABEL[race.difficulty]}</b>
        </span>
        <Link to="/student/games" className="rounded-full px-3 py-1 font-semibold text-cyan-300 hover:underline">
          Fan yoki qiyinlikni o'zgartirish
        </Link>
      </div>

      <section>
        <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400">Mashina</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4" role="radiogroup" aria-label="Mashinani tanlang">
          {PLAYER_CARS.map((option) => {
            const selected = option.id === car.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onCar(option)}
                className={`rounded-xl border bg-slate-900/70 p-3 text-left transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                  selected ? "border-transparent" : "border-white/10 hover:border-white/25"
                }`}
                style={selected ? { boxShadow: `0 0 0 2px ${option.accent}, 0 0 24px ${option.accent}55` } : undefined}
              >
                <RaceCar car={option} className="mx-auto h-14 w-auto" />
                <p className="mt-1 font-black tracking-[0.12em] text-white">{option.name}</p>
                <p className="text-xs" style={{ color: option.accent }}>
                  {option.tagline}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400">Trek</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4" role="radiogroup" aria-label="Trekni tanlang">
          {TRACKS.map((option) => {
            const selected = option.id === track.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onTrack(option)}
                className={`overflow-hidden rounded-xl border text-left transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                  selected ? "border-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.4)]" : "border-white/10"
                }`}
              >
                <div className="h-12" style={{ background: option.sky }}>
                  <div className="h-full" style={{ boxShadow: `inset 0 -10px 20px -8px ${option.rail}` }} />
                </div>
                <div className="bg-slate-900/80 p-2.5">
                  <p className="font-bold text-white">{option.name}</p>
                  <p className="truncate text-xs text-slate-400">{option.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="mx-auto max-w-lg space-y-4 text-center">
        <div className="grid grid-cols-3 gap-2">
          <GameStartStat label="Savollar" value={`${session.question_count} ta`} />
          <GameStartStat label="Aylanalar" value={`${race.laps} ta`} />
          <GameStartStat label="Maksimal XP" value={`${session.max_xp} XP`} tone="amber" />
        </div>
        <p className="text-sm text-slate-400">
          Har savol — trekning bir bo'lagi. To'g'ri javob tezlashtiradi va nitroni to'ldiradi, xato — sekinlashtiradi.
          Nitro tayyor bo'lsa, N tugmasi bilan yoqing. ~{minutes} daqiqa.
        </p>
        <GameStartActions loading={loading} error={error} unavailable={unavailable} resuming={resuming} onStart={onStart} label="START RACE" />
      </div>
    </div>
  );
}

// ---------- Result ----------

function RaceResult({
  session,
  car,
  elapsed,
  onPlayAgain,
}: {
  session: GameSession;
  car: CarDesign;
  elapsed: number;
  onPlayAgain: () => void;
}) {
  const race = session.race;
  if (!race) return null;
  const accuracy = Math.round(session.score_percent ?? 0);
  const winner = race.position === 1;
  const record = session.personal_record;
  const standings = [...race.racers].sort((a, b) => b.distance - a.distance);

  return (
    <GameResultScreen
      tone={winner ? "win" : race.position <= 2 ? "draw" : "neutral"}
      icon={Trophy}
      title={`${ordinal(race.position)} PLACE`}
      subtitle={
        winner
          ? "Chempion! Bilimingiz sizni marraga birinchi olib keldi."
          : `Marra ${race.position}-o'rinda — yana bir poyga, va shohsupa sizniki!`
      }
      remedialSessionId={session.remedial_session_id}
      stats={[
        { label: "O'rin", value: `${race.position}/${race.field_size}` },
        { label: "Aniqlik", value: `${accuracy}%` },
        { label: "To'g'ri javoblar", value: `${session.correct_count}/${session.question_count}` },
        { label: "Eng yuqori combo", value: `×${race.max_combo}` },
        { label: "Nitro", value: `${race.nitro_used} marta` },
        {
          label: "Olingan XP",
          value: session.xp_awarded ? <AnimatedNumber value={session.xp_awarded} prefix="+" /> : "0",
          tone: "amber",
        },
      ]}
      onPrimary={onPlayAgain}
      primaryLabel="Yana poyga"
      secondaryLabel="O'yinlarga qaytish"
    >
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-slate-900">
        {record?.is_record && (
          <p className="flex animate-pop-in items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-fuchsia-500 py-2 text-sm font-black uppercase tracking-wider text-white shadow-[0_0_20px_rgba(34,211,238,0.5)]">
            <Zap size={16} /> Yangi shaxsiy rekord!
          </p>
        )}
        <div className="space-y-1.5">
          {standings.map((racer, i) => (
            <div
              key={racer.id}
              className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm ${
                racer.is_player ? "bg-brand-50 font-semibold dark:bg-brand-500/10" : ""
              }`}
            >
              <span className="w-5 font-mono font-black text-slate-500">{i + 1}</span>
              <RaceCar car={racer.is_player ? car : (RIVAL_CARS[racer.id] ?? car)} className="h-6 w-auto" />
              <span className="flex-1 text-slate-800 dark:text-slate-100">
                {racer.is_player ? `${car.name} (siz)` : racer.name}
              </span>
              <span className="font-mono text-xs text-slate-500">{Math.round(racer.distance)} m</span>
            </div>
          ))}
        </div>
        <GameProgressBar label="Aniqlik" value={accuracy} max={100} suffix="%" />
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Vaqt: {formatDuration(playedSeconds(elapsed, session))} · Ball: {race.score}
          {record?.best_before != null && ` · Oldingi rekord: ${record.best_before}`}
        </p>
      </div>
    </GameResultScreen>
  );
}
