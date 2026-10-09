import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import type { RaceState } from "../../types";
import { RaceCar, RIVAL_CARS, TrackScenery, type CarDesign, type TrackTheme } from "./RacingArt";

/** Neon Racing's pseudo-3D track view. The road is plain SVG geometry with a
 * computed perspective (y = horizon + depth²), and the moving parts — lane
 * dashes, rail lights, ground stripes — are advanced every frame by writing
 * their attributes directly (no React re-render per frame). Rival cars sit on
 * the same perspective curve according to their distance gap to the student. */

export type Drive = "idle" | "stopped" | "cruise" | "boost" | "nitro" | "slow" | "finish";

// Track units scrolled per second, per driving state.
const SPEED: Record<Drive, number> = {
  idle: 0.35,
  stopped: 0,
  cruise: 0.9,
  boost: 1.5,
  nitro: 2.6,
  slow: 0.45,
  finish: 0,
};

const HORIZON = 44; // % from the top
const BANDS = 16;
// How many distance units ahead are still visible on the road.
const VIEW_AHEAD = 24;
const VIEW_BEHIND = 5;

const depthToY = (t: number) => HORIZON + (100 - HORIZON) * t * t;
const halfRoad = (y: number) => 3 + 45 * ((y - HORIZON) / (100 - HORIZON));

// Rival lanes (fraction of the road's half-width); the student drives the
// centre. Side lanes clear the student's car; the centre lane is only used by
// a rival well ahead, otherwise it slots in beside the others, staggered.
const SIDE_LANE = 0.66;
const CENTRE_LANE_MIN_GAP = 8;

function laneFor(index: number, gap: number): { lane: number; stagger: number } {
  if (index === 0) return { lane: -SIDE_LANE, stagger: 0 };
  if (index === 1) return { lane: SIDE_LANE, stagger: 0 };
  return gap > CENTRE_LANE_MIN_GAP ? { lane: 0, stagger: 0 } : { lane: -SIDE_LANE, stagger: 0.14 };
}

export function RaceView({
  track,
  car,
  drive,
  race,
  finalLap = false,
  gateKey = 0,
  finishGate = false,
  warnKey = 0,
  className = "",
  children,
}: {
  track: TrackTheme;
  car: CarDesign;
  drive: Drive;
  race: RaceState | null;
  finalLap?: boolean;
  /** Bump to send a checkpoint gate rushing past. */
  gateKey?: number;
  finishGate?: boolean;
  /** Bump for the red "lost pace" flash. */
  warnKey?: number;
  className?: string;
  children?: ReactNode;
}) {
  const dashRefs = useRef<(SVGRectElement | null)[]>([]);
  const leftRefs = useRef<(SVGRectElement | null)[]>([]);
  const rightRefs = useRef<(SVGRectElement | null)[]>([]);
  const stripeRefs = useRef<(SVGRectElement | null)[]>([]);
  const targetSpeed = useRef(SPEED[drive]);

  useEffect(() => {
    targetSpeed.current = SPEED[drive];
  }, [drive]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let speed = targetSpeed.current;
    let phase = 0;
    let last = performance.now();
    let frame = 0;

    function paint() {
      for (let k = 0; k < BANDS; k++) {
        const t = (k / BANDS + phase) % 1;
        const y = depthToY(t);
        const half = halfRoad(y);
        const h = 0.3 + 3.2 * t * t;
        const dash = dashRefs.current[k];
        if (dash) {
          const w = 0.25 + 1.1 * t;
          dash.setAttribute("x", String(50 - w / 2));
          dash.setAttribute("y", String(y));
          dash.setAttribute("width", String(w));
          dash.setAttribute("height", String(k % 2 ? 0 : h));
        }
        const postW = 0.3 + 1.6 * t;
        const left = leftRefs.current[k];
        if (left) {
          left.setAttribute("x", String(50 - half - postW));
          left.setAttribute("y", String(y - h / 2));
          left.setAttribute("width", String(postW));
          left.setAttribute("height", String(h));
        }
        const right = rightRefs.current[k];
        if (right) {
          right.setAttribute("x", String(50 + half));
          right.setAttribute("y", String(y - h / 2));
          right.setAttribute("width", String(postW));
          right.setAttribute("height", String(h));
        }
        const stripe = stripeRefs.current[k];
        if (stripe) {
          stripe.setAttribute("y", String(y));
          stripe.setAttribute("height", String(0.15 + 0.5 * t));
          stripe.setAttribute("opacity", String(0.05 + 0.2 * t));
        }
      }
    }

    function tick(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Ease toward the target speed so boosts and slow-downs feel physical.
      speed += (targetSpeed.current - speed) * Math.min(1, dt * 3);
      phase = (phase + speed * dt) % 1;
      paint();
      frame = requestAnimationFrame(tick);
    }

    paint();
    if (!reduced) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const boost: 0 | 1 | 2 = drive === "nitro" ? 2 : drive === "boost" ? 1 : 0;
  const player = race?.racers.find((r) => r.is_player);
  const sceneryPaused = drive === "stopped" || drive === "finish";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-800 ${className}`}
      style={{ background: track.sky }}
      role="img"
      aria-label={
        race && player ? `Poyga: ${race.position}-o'rin, ${race.lap}/${race.laps} aylana` : `Trek: ${track.name}`
      }
    >
      {/* Horizon glow + scenery band, scrolling sideways with the race */}
      <div
        className="absolute inset-x-0 h-24"
        style={{
          top: `${HORIZON - 12}%`,
          background: `radial-gradient(ellipse at 50% 100%, ${track.glow}, transparent 70%)`,
        }}
      />
      <div className="absolute inset-x-0 overflow-hidden" style={{ top: `${HORIZON - 26}%`, height: "26%" }}>
        <div
          className="flex h-full w-[200%] animate-scenery-scroll motion-reduce:animate-none"
          style={
            {
              "--scenery-speed": drive === "nitro" ? "10s" : drive === "boost" ? "18s" : "32s",
              animationPlayState: sceneryPaused ? "paused" : "running",
            } as CSSProperties
          }
        >
          <TrackScenery track={track} />
          <TrackScenery track={track} />
        </div>
      </div>

      {/* The road */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id={`road-fade-${track.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={track.road} stopOpacity="0.4" />
            <stop offset="100%" stopColor={track.road} />
          </linearGradient>
        </defs>
        <rect x="0" y={HORIZON} width="100" height={100 - HORIZON} fill={track.ground} />
        {Array.from({ length: BANDS }, (_, k) => (
          <rect
            key={`s${k}`}
            ref={(el) => {
              stripeRefs.current[k] = el;
            }}
            x="0"
            width="100"
            fill={track.rail}
          />
        ))}
        <polygon
          points={`${50 - halfRoad(HORIZON)},${HORIZON} ${50 + halfRoad(HORIZON)},${HORIZON} ${50 + halfRoad(100)},100 ${50 - halfRoad(100)},100`}
          fill={`url(#road-fade-${track.id})`}
        />
        {/* Glowing rails along the road edges */}
        {[-1, 1].map((side) => (
          <line
            key={side}
            x1={50 + side * halfRoad(HORIZON)}
            y1={HORIZON}
            x2={50 + side * halfRoad(100)}
            y2="100"
            stroke={side < 0 ? track.rail : track.railAlt}
            strokeWidth={finalLap ? 0.9 : 0.55}
            strokeOpacity={finalLap ? 1 : 0.8}
            vectorEffect="non-scaling-stroke"
            style={{ filter: `drop-shadow(0 0 4px ${side < 0 ? track.rail : track.railAlt})` }}
          />
        ))}
        {Array.from({ length: BANDS }, (_, k) => (
          <rect
            key={`d${k}`}
            ref={(el) => {
              dashRefs.current[k] = el;
            }}
            fill="#e2e8f0"
            opacity="0.75"
          />
        ))}
        {Array.from({ length: BANDS }, (_, k) => (
          <rect
            key={`l${k}`}
            ref={(el) => {
              leftRefs.current[k] = el;
            }}
            fill={k % 2 ? track.railAlt : track.rail}
          />
        ))}
        {Array.from({ length: BANDS }, (_, k) => (
          <rect
            key={`r${k}`}
            ref={(el) => {
              rightRefs.current[k] = el;
            }}
            fill={k % 2 ? track.rail : track.railAlt}
          />
        ))}
      </svg>

      {/* Checkpoint / finish gate rushing past */}
      {(gateKey > 0 || finishGate) && (
        <div
          key={finishGate ? "finish" : gateKey}
          className="pointer-events-none absolute left-1/2 animate-gate-rush motion-reduce:hidden"
          style={{ top: `${HORIZON - 16}%`, width: "34%", height: "30%", transformOrigin: "50% 100%" }}
        >
          <div
            className="h-full w-full rounded-t-[40%] border-[3px] border-b-0"
            style={{
              borderColor: finishGate ? "#f8fafc" : track.rail,
              boxShadow: `0 0 24px ${finishGate ? "#f8fafc" : track.rail}`,
              backgroundImage: finishGate
                ? "repeating-linear-gradient(90deg, rgba(248,250,252,0.35) 0 8%, transparent 8% 16%)"
                : undefined,
            }}
          />
        </div>
      )}

      {/* Rivals */}
      {race &&
        player &&
        race.racers
          .filter((r) => !r.is_player)
          .map((rival, i) => {
            const gap = rival.distance - player.distance;
            const visible = gap > -VIEW_BEHIND && gap < VIEW_AHEAD;
            const { lane, stagger } = laneFor(i, gap);
            const t = visible ? Math.min(1.08, 0.92 - 0.84 * (gap / VIEW_AHEAD) - stagger) : 0.02;
            const y = depthToY(Math.max(0.02, t));
            const width = 2 * halfRoad(y) * 0.3;
            const x = 50 + lane * halfRoad(y);
            const design = RIVAL_CARS[rival.id];
            if (!design) return null;
            return (
              <div
                key={rival.id}
                className="absolute"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: `${width}%`,
                  transform: "translate(-50%, -88%)",
                  opacity: visible ? 1 : 0,
                  zIndex: Math.round(y),
                  transition: "left 1.1s ease-out, top 1.1s ease-out, width 1.1s ease-out, opacity 0.6s",
                }}
              >
                <RaceCar car={design} />
                <span
                  className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-950/70 px-1 font-mono text-[9px] font-bold tracking-widest"
                  style={{ color: design.accent }}
                >
                  {design.name}
                </span>
              </div>
            );
          })}

      {/* Speed streaks on boost / nitro */}
      {boost > 0 && (
        <div
          className="pointer-events-none absolute inset-0 animate-speed-streak motion-reduce:hidden"
          style={{
            background: `repeating-conic-gradient(from 0deg at 50% ${HORIZON}%, transparent 0deg 7deg, ${
              boost === 2 ? car.accent : "rgba(226,232,240,0.5)"
            } 7deg 7.6deg)`,
            maskImage: `radial-gradient(ellipse at 50% ${HORIZON}%, transparent 25%, black 70%)`,
            WebkitMaskImage: `radial-gradient(ellipse at 50% ${HORIZON}%, transparent 25%, black 70%)`,
            opacity: boost === 2 ? 0.5 : 0.25,
          }}
        />
      )}

      {/* The student's car — pushes up the road on a boost */}
      <div
        className="absolute left-1/2 w-[34%] transition-transform duration-500 ease-out md:w-[28%]"
        style={{
          bottom: "2%",
          transform: `translateX(-50%) translateY(${boost === 2 ? -10 : boost === 1 ? -5 : drive === "slow" ? 3 : 0}%) scale(${
            boost === 2 ? 0.94 : boost === 1 ? 0.97 : 1
          })`,
          zIndex: 120,
        }}
      >
        <div className={drive === "stopped" || drive === "finish" ? "" : "animate-car-bob motion-reduce:animate-none"}>
          <RaceCar car={car} boost={boost} />
        </div>
      </div>

      {/* Final-lap intensity + lost-pace warning */}
      {finalLap && (
        <div
          className="pointer-events-none absolute inset-0 animate-fade-in"
          style={{ boxShadow: `inset 0 0 80px ${track.glow}` }}
        />
      )}
      {warnKey > 0 && (
        <div key={warnKey} className="pointer-events-none absolute inset-0 animate-alert-flash rounded-2xl" />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(2,6,23,0.7))]" />
      {children}
    </div>
  );
}
