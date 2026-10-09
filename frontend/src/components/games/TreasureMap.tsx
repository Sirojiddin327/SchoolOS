import {
  Bridge,
  Castle,
  CloudFog,
  Columns3,
  DoorOpen,
  Droplets,
  Gem,
  Lock,
  Mountain,
  MountainSnow,
  Tent,
  TreePine,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { useIsWide } from "./useIsWide";

/** Xazina ovi's adventure map — an illustrated SVG route from the camp to the
 * treasure through ten locations, one per correct answer. The explorer walks
 * the actual curved trail (not a straight jump) and a camera follows them;
 * unexplored locations sit dark and desaturated, the treasure glows faintly
 * in the distance until it's reached.
 *
 * Two hand-placed layouts rather than one scaled drawing: a wide landscape
 * route for tablet/desktop, and a tall zig-zag route for phones where the
 * camera scrolls up the map as the student advances. */

type SceneKind =
  | "forest"
  | "river"
  | "bridge"
  | "valley"
  | "pass"
  | "waterfall"
  | "ruins"
  | "cave"
  | "peak"
  | "gate";

export interface MapLocation {
  name: string;
  scene: SceneKind;
  icon: LucideIcon;
}

export const MAP_LOCATIONS: MapLocation[] = [
  { name: "Qarag'ay o'rmoni", scene: "forest", icon: TreePine },
  { name: "Kumush daryo", scene: "river", icon: Waves },
  { name: "Tosh ko'prik", scene: "bridge", icon: Bridge },
  { name: "Tumanli vodiy", scene: "valley", icon: CloudFog },
  { name: "Qoyali dovon", scene: "pass", icon: Mountain },
  { name: "Sharshara", scene: "waterfall", icon: Droplets },
  { name: "Qadimiy xarobalar", scene: "ruins", icon: Columns3 },
  { name: "Yashirin g'or", scene: "cave", icon: DoorOpen },
  { name: "Muz cho'qqisi", scene: "peak", icon: MountainSnow },
  { name: "Oltin darvoza", scene: "gate", icon: Castle },
];

type Point = [number, number];

interface Layout {
  world: { w: number; h: number };
  view: { w: number; h: number };
  /** Camp, the ten locations, then the treasure. */
  points: Point[];
  sceneScale: number;
  playZoom: number;
}

const WIDE: Layout = {
  world: { w: 1000, h: 600 },
  view: { w: 1000, h: 600 },
  points: [
    [70, 520],
    [175, 440],
    [300, 500],
    [410, 415],
    [330, 310],
    [445, 225],
    [575, 290],
    [680, 395],
    [805, 335],
    [740, 220],
    [815, 135],
    [910, 78],
  ],
  sceneScale: 1,
  // Gentle: enough for the camera to drift toward the explorer while the
  // treasure stays in view in the far corner.
  playZoom: 1.06,
};

const TALL: Layout = {
  world: { w: 400, h: 1000 },
  view: { w: 400, h: 380 },
  points: [
    [200, 950],
    [95, 872],
    [300, 800],
    [115, 722],
    [292, 642],
    [105, 562],
    [285, 482],
    [110, 402],
    [298, 322],
    [125, 242],
    [285, 162],
    [195, 68],
  ],
  sceneScale: 0.72,
  playZoom: 1,
};

// Catmull-Rom → cubic Bézier, so the trail bends smoothly through every stop.
function segmentPath(points: Point[], i: number): string {
  const p0 = points[Math.max(0, i - 1)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(points.length - 1, i + 2)];
  const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
  const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
  return `M${p1[0]} ${p1[1]} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}


export function TreasureMap({
  explored,
  reachTreasure = false,
  overview = false,
  forceWide = false,
  onArrive,
  children,
}: {
  /** Locations explored so far (0 = still at camp, 10 = at the golden gate). */
  explored: number;
  /** Walk on to the treasure (the final "treasure found" run). */
  reachTreasure?: boolean;
  /** Whole-map view, no camera zoom — result screens. */
  overview?: boolean;
  /** Always use the landscape layout (e.g. inside a narrow result card). */
  forceWide?: boolean;
  /** Called when the explorer finishes walking to their latest stop. */
  onArrive?: (stop: number) => void;
  /** HTML overlays drawn on top of the map (chips, toasts, the chest…). */
  children?: ReactNode;
}) {
  const isWide = useIsWide();
  const layout = forceWide || isWide ? WIDE : TALL;
  const wideLayout = layout === WIDE;
  const id = useId().replace(/:/g, "");
  const { points, world, view } = layout;
  const lastStop = points.length - 1;
  const target = reachTreasure ? lastStop : clamp(explored, 0, MAP_LOCATIONS.length);

  const segmentRefs = useRef<(SVGPathElement | null)[]>([]);
  const [pos, setPos] = useState<Point>(points[target]);
  const [zoom, setZoom] = useState(overview || reachTreasure ? 1 : layout.playZoom);
  // Stops the explorer has actually reached so far (advances segment by
  // segment during a walk), and how far along the current segment they are.
  const [arrived, setArrived] = useState(target);
  const [walkT, setWalkT] = useState(0);
  const stopRef = useRef(target);
  const posRef = useRef<Point>(points[target]);
  const zoomRef = useRef(zoom);
  const onArriveRef = useRef(onArrive);

  useEffect(() => {
    onArriveRef.current = onArrive;
  });

  // A layout switch (rotating a tablet) — snap to the same stop on the new route.
  useEffect(() => {
    posRef.current = points[stopRef.current];
    setPos(points[stopRef.current]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on layout change
  }, [layout]);

  // Walk the trail, segment by segment, from wherever the explorer stands to `target`.
  useEffect(() => {
    const from = stopRef.current;
    if (target <= from) {
      stopRef.current = target;
      posRef.current = points[target];
      setPos(points[target]);
      setArrived(target);
      return;
    }
    const perSegment = reachTreasure ? 620 : 950;
    let frame = 0;
    let segment = from;
    let segmentStart = performance.now();

    function tick(now: number) {
      const path = segmentRefs.current[segment];
      const t = Math.min(1, (now - segmentStart) / perSegment);
      const eased = easeInOut(t);
      if (path) {
        const len = path.getTotalLength();
        const pt = path.getPointAtLength(len * eased);
        posRef.current = [pt.x, pt.y];
        setPos([pt.x, pt.y]);
      }
      setWalkT(eased);
      if (t >= 1) {
        segment += 1;
        segmentStart = now;
        stopRef.current = segment;
        setArrived(segment);
        setWalkT(0);
        if (segment >= target) {
          onArriveRef.current?.(target);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- points are stable per layout
  }, [target, reachTreasure, layout]);

  // Ease the camera zoom (close-up while playing, pull back for the finale).
  useEffect(() => {
    const goal = overview || reachTreasure ? 1 : layout.playZoom;
    const start = zoomRef.current;
    if (start === goal) return;
    const t0 = performance.now();
    let frame = 0;
    function tick(now: number) {
      const t = Math.min(1, (now - t0) / 1200);
      const z = start + (goal - start) * easeInOut(t);
      zoomRef.current = z;
      setZoom(z);
      if (t < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [overview, reachTreasure, layout]);

  const viewH = overview && !wideLayout ? world.h : view.h;
  const tx = clamp(view.w / 2 - pos[0] * zoom, view.w - world.w * zoom, 0);
  const ty = clamp(viewH / 2 - pos[1] * zoom, viewH - world.h * zoom, 0);

  const segments = useMemo(
    () => Array.from({ length: points.length - 1 }, (_, i) => segmentPath(points, i)),
    [points],
  );
  const lit = arrived;
  const walkingSegment = arrived < target ? arrived : -1;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-slate-800 bg-[#050914] shadow-[0_20px_60px_-20px_rgba(14,165,233,0.25)] animate-map-in ${
        reachTreasure ? "brightness-110" : ""
      } transition-[filter] duration-1000`}
    >
      <svg
        viewBox={`0 0 ${view.w} ${viewH}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Xazina xaritasi: ${Math.min(explored, MAP_LOCATIONS.length)} ta manzil kashf etilgan`}
      >
        <MapDefs id={id} />
        <g transform={`translate(${tx} ${ty}) scale(${zoom})`}>
          <Terrain id={id} layout={layout} />

          {/* Scenery around every stop: lit once explored, dim until then. */}
          {MAP_LOCATIONS.map((location, i) => {
            const [x, y] = points[i + 1];
            const discovered = i + 1 <= lit;
            return (
              <g
                key={location.name}
                style={{
                  opacity: discovered ? 1 : 0.6,
                  filter: discovered ? "none" : "grayscale(0.7) brightness(0.75)",
                  transition: "opacity 1s ease, filter 1s ease",
                }}
              >
                <Scene kind={location.scene} x={x} y={y} s={layout.sceneScale} id={id} />
              </g>
            );
          })}
          <TreasureScene
            x={points[lastStop][0]}
            y={points[lastStop][1]}
            s={layout.sceneScale}
            id={id}
            found={arrived === lastStop}
          />

          {/* The trail: a faint dashed route everywhere, glowing where walked. */}
          {segments.map((d, i) => (
            <path
              key={`trail-${i}`}
              d={d}
              fill="none"
              stroke="#334155"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray="2 9"
            />
          ))}
          {segments.map((d, i) => {
            const walked = i < lit;
            const walking = i === walkingSegment;
            return (
              <path
                key={`walk-${i}`}
                ref={(el) => {
                  segmentRefs.current[i] = el;
                }}
                d={d}
                fill="none"
                stroke={i >= MAP_LOCATIONS.length ? "#fbbf24" : "#22d3ee"}
                strokeWidth={3.5}
                strokeLinecap="round"
                filter={`url(#${id}-glow)`}
                pathLength={1}
                strokeDasharray="1 1"
                strokeDashoffset={walked ? 0 : walking ? 1 - walkT : 1}
                opacity={walked || walking ? 1 : 0}
              />
            );
          })}

          {/* Checkpoints */}
          <Checkpoint x={points[0][0]} y={points[0][1]} icon={Tent} state="explored" label="Lager" wide={wideLayout} id={id} />
          {MAP_LOCATIONS.map((location, i) => {
            const stop = i + 1;
            const state = stop <= lit ? "explored" : stop === lit + 1 ? "next" : "locked";
            return (
              <Checkpoint
                key={location.name}
                x={points[stop][0]}
                y={points[stop][1]}
                icon={location.icon}
                state={state}
                label={location.name}
                wide={wideLayout}
                id={id}
                justReached={stop === arrived && stop === target && !overview}
              />
            );
          })}
          <TreasureNode x={points[lastStop][0]} y={points[lastStop][1]} found={arrived === lastStop} id={id} />

          <Explorer x={pos[0]} y={pos[1]} id={id} />
        </g>
        <rect width={view.w} height={viewH} fill={`url(#${id}-vignette)`} pointerEvents="none" />
      </svg>
      {children}
    </div>
  );
}

function MapDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0b1530" />
        <stop offset="100%" stopColor="#050914" />
      </linearGradient>
      <radialGradient id={`${id}-land`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#173a5c" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#12304a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}-moss`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#11443f" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#0f3b3a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}-vignette`} cx="50%" cy="50%" r="75%">
        <stop offset="68%" stopColor="#020617" stopOpacity="0" />
        <stop offset="100%" stopColor="#020617" stopOpacity="0.7" />
      </radialGradient>
      <radialGradient id={`${id}-gold`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}-aura`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${id}-water`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#0e7490" stopOpacity="0" />
        <stop offset="20%" stopColor="#0e7490" stopOpacity="0.7" />
        <stop offset="80%" stopColor="#0891b2" stopOpacity="0.7" />
        <stop offset="100%" stopColor="#0891b2" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${id}-rock`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#475569" />
        <stop offset="100%" stopColor="#1e293b" />
      </linearGradient>
      <linearGradient id={`${id}-pine`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#14b8a6" />
        <stop offset="100%" stopColor="#0f3b3a" />
      </linearGradient>
      <linearGradient id={`${id}-node`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1d4ed8" />
        <stop offset="100%" stopColor="#0c1a3d" />
      </linearGradient>
      <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

// Deterministic pseudo-random scatter so the terrain is identical on every render.
function scatter(count: number, w: number, h: number, seed: number): Point[] {
  const out: Point[] = [];
  let s = seed;
  for (let i = 0; i < count; i++) {
    s = (s * 9301 + 49297) % 233280;
    const x = (s / 233280) * w;
    s = (s * 9301 + 49297) % 233280;
    const y = (s / 233280) * h;
    out.push([x, y]);
  }
  return out;
}

function Terrain({ id, layout }: { id: string; layout: Layout }) {
  const { w, h } = layout.world;
  const specks = useMemo(() => scatter(70, w, h, 7), [w, h]);
  const shrubs = useMemo(() => scatter(26, w, h, 31), [w, h]);
  const contourCenters = useMemo(() => scatter(5, w, h, 101), [w, h]);

  return (
    <g>
      <rect width={w} height={h} fill={`url(#${id}-sky)`} />
      {/* Land masses */}
      <ellipse cx={w * 0.3} cy={h * 0.72} rx={w * 0.45} ry={h * 0.3} fill={`url(#${id}-moss)`} />
      <ellipse cx={w * 0.7} cy={h * 0.35} rx={w * 0.45} ry={h * 0.32} fill={`url(#${id}-land)`} />
      <ellipse cx={w * 0.55} cy={h * 0.6} rx={w * 0.3} ry={h * 0.25} fill={`url(#${id}-land)`} />
      {/* Topographic contour lines */}
      {contourCenters.map(([cx, cy], i) => (
        <g key={i} fill="none" stroke="#1e3a5f" strokeOpacity="0.28">
          {[1, 2, 3, 4].map((k) => (
            <ellipse key={k} cx={cx} cy={cy} rx={k * 38} ry={k * 22} strokeWidth={0.8} />
          ))}
        </g>
      ))}
      {specks.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.4 : 0.8} fill="#94a3b8" opacity={0.12} />
      ))}
      {shrubs.map(([x, y], i) => (
        <path
          key={i}
          d={`M${x} ${y - 7} L${x + 4.5} ${y + 3} L${x - 4.5} ${y + 3} Z`}
          fill="#134e4a"
          opacity={0.45}
        />
      ))}
    </g>
  );
}

function Pine({ x, y, s, id }: { x: number; y: number; s: number; id: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="2" rx="9" ry="2.5" fill="black" opacity="0.35" />
      <rect x="-1.2" y="-4" width="2.4" height="6" fill="#422006" />
      <path d="M0 -26 L9 -8 L-9 -8 Z" fill={`url(#${id}-pine)`} />
      <path d="M0 -18 L11 -2 L-11 -2 Z" fill={`url(#${id}-pine)`} />
      <path d="M0 -26 L9 -8 L0 -8 Z" fill="black" opacity="0.18" />
    </g>
  );
}

function Peak({
  x,
  y,
  w,
  h,
  id,
  snow = true,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  id: string;
  snow?: boolean;
}) {
  return (
    <g>
      <path d={`M${x - w / 2} ${y} L${x} ${y - h} L${x + w / 2} ${y} Z`} fill={`url(#${id}-rock)`} />
      <path d={`M${x} ${y - h} L${x + w / 2} ${y} L${x + w * 0.12} ${y} Z`} fill="black" opacity="0.28" />
      {snow && (
        <path
          d={`M${x - w * 0.14} ${y - h * 0.72} L${x} ${y - h} L${x + w * 0.14} ${y - h * 0.72} L${x + w * 0.05} ${y - h * 0.78} L${x - w * 0.04} ${y - h * 0.7} Z`}
          fill="#e2e8f0"
          opacity="0.9"
        />
      )}
    </g>
  );
}

function WaterBand({ x, y, s, id }: { x: number; y: number; s: number; id: string }) {
  return (
    <g>
      <path
        d={`M${x - 80 * s} ${y + 6 * s} C${x - 40 * s} ${y - 10 * s} ${x + 40 * s} ${y + 22 * s} ${x + 80 * s} ${y + 4 * s}`}
        stroke={`url(#${id}-water)`}
        strokeWidth={18 * s}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M${x - 60 * s} ${y + 4 * s} C${x - 30 * s} ${y - 6 * s} ${x + 30 * s} ${y + 16 * s} ${x + 60 * s} ${y + 3 * s}`}
        stroke="#67e8f9"
        strokeOpacity="0.35"
        strokeWidth={1.2}
        strokeDasharray="6 8"
        fill="none"
      />
    </g>
  );
}

function Scene({ kind, x, y, s, id }: { kind: SceneKind; x: number; y: number; s: number; id: string }) {
  switch (kind) {
    case "forest":
      return (
        <g>
          {[
            [-44, 8, 0.9],
            [-30, -14, 1.1],
            [34, -10, 1],
            [48, 10, 0.85],
            [-14, 30, 0.8],
            [20, 28, 0.95],
          ].map(([dx, dy, k], i) => (
            <Pine key={i} x={x + dx * s} y={y + dy * s} s={k * s} id={id} />
          ))}
        </g>
      );
    case "river":
      return <WaterBand x={x} y={y + 6 * s} s={s} id={id} />;
    case "bridge":
      return (
        <g>
          <WaterBand x={x} y={y} s={s} id={id} />
          <g transform={`translate(${x} ${y + 6 * s}) rotate(-14) scale(${s})`}>
            <rect x="-30" y="-6" width="60" height="12" rx="2" fill="#78716c" />
            {[-24, -12, 0, 12, 24].map((bx) => (
              <rect key={bx} x={bx - 0.6} y="-6" width="1.2" height="12" fill="#292524" opacity="0.6" />
            ))}
            <rect x="-32" y="-8" width="64" height="2" fill="#a8a29e" />
            <rect x="-32" y="6" width="64" height="2" fill="#57534e" />
          </g>
        </g>
      );
    case "valley":
      return (
        <g>
          <Peak x={x - 46 * s} y={y + 14 * s} w={60 * s} h={34 * s} id={id} snow={false} />
          <Peak x={x + 48 * s} y={y + 16 * s} w={54 * s} h={30 * s} id={id} snow={false} />
          {[-10, 8].map((dy, i) => (
            <ellipse key={i} cx={x + (i ? 18 : -14) * s} cy={y + dy * s} rx={56 * s} ry={9 * s} fill="#cbd5e1" opacity={0.1} />
          ))}
        </g>
      );
    case "pass":
      return (
        <g>
          <Peak x={x - 40 * s} y={y + 6 * s} w={70 * s} h={62 * s} id={id} />
          <Peak x={x + 42 * s} y={y + 8 * s} w={64 * s} h={52 * s} id={id} />
        </g>
      );
    case "waterfall":
      return (
        <g>
          <path
            d={`M${x - 46 * s} ${y + 10 * s} L${x - 30 * s} ${y - 40 * s} L${x + 30 * s} ${y - 44 * s} L${x + 46 * s} ${y + 10 * s} Z`}
            fill={`url(#${id}-rock)`}
          />
          {[-8, 0, 8].map((dx) => (
            <rect
              key={dx}
              x={x + dx * s - 2 * s}
              y={y - 40 * s}
              width={4 * s}
              height={44 * s}
              fill="#67e8f9"
              opacity={0.45}
            />
          ))}
          <ellipse cx={x} cy={y + 12 * s} rx={30 * s} ry={7 * s} fill="#22d3ee" opacity={0.25} />
        </g>
      );
    case "ruins":
      return (
        <g transform={`translate(${x} ${y}) scale(${s})`}>
          <rect x="-50" y="12" width="100" height="5" fill="#57534e" opacity="0.8" />
          {[
            [-40, 30],
            [-24, 20],
            [26, 34],
            [42, 16],
          ].map(([cx, h]) => (
            <g key={cx}>
              <rect x={cx - 4} y={12 - h} width="8" height={h} fill="#a8a29e" />
              <rect x={cx - 4} y={12 - h} width="3" height={h} fill="white" opacity="0.12" />
              <rect x={cx - 6} y={10 - h} width="12" height="3" fill="#d6d3d1" />
            </g>
          ))}
          <path d="M-24 -8 Q0 -30 26 -22" stroke="#a8a29e" strokeWidth="5" fill="none" strokeDasharray="30 6" />
        </g>
      );
    case "cave":
      return (
        <g transform={`translate(${x} ${y}) scale(${s})`}>
          <path d="M-58 16 Q-50 -34 0 -40 Q52 -34 60 16 Z" fill={`url(#${id}-rock)`} />
          <path d="M-20 16 Q-20 -14 0 -16 Q20 -14 20 16 Z" fill="#020617" />
          <path d="M-14 16 Q-14 -6 0 -8 Q14 -6 14 16 Z" fill="#0ea5e9" opacity="0.12" />
        </g>
      );
    case "peak":
      return (
        <g>
          <Peak x={x} y={y + 8 * s} w={110 * s} h={86 * s} id={id} />
          <Peak x={x + 52 * s} y={y + 12 * s} w={56 * s} h={44 * s} id={id} />
        </g>
      );
    case "gate":
      return (
        <g transform={`translate(${x} ${y}) scale(${s})`}>
          {[-30, 30].map((px) => (
            <g key={px}>
              <rect x={px - 7} y="-34" width="14" height="48" fill="#78716c" />
              <rect x={px - 7} y="-34" width="5" height="48" fill="white" opacity="0.12" />
            </g>
          ))}
          <rect x="-42" y="-44" width="84" height="10" fill="#a8a29e" />
          <rect x="-42" y="-44" width="84" height="2" fill="#fbbf24" opacity="0.6" />
        </g>
      );
  }
}

function TreasureScene({ x, y, s, id, found }: { x: number; y: number; s: number; id: string; found: boolean }) {
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={(found ? 120 : 70) * s}
        fill={`url(#${id}-gold)`}
        style={{ transition: "r 1.2s ease" }}
        className={found ? undefined : "animate-pulse"}
      />
      <g transform={`translate(${x} ${y}) scale(${s})`} opacity={found ? 1 : 0.55}>
        <path d="M-50 28 L-38 -2 L38 -2 L50 28 Z" fill="#44403c" />
        <path d="M-38 -2 L0 -30 L38 -2 Z" fill="#57534e" />
        <path d="M-38 -2 L0 -30 L0 -2 Z" fill="white" opacity="0.08" />
        <rect x="-12" y="6" width="24" height="22" fill="#020617" />
      </g>
    </g>
  );
}

type CheckpointState = "explored" | "next" | "locked";

function Checkpoint({
  x,
  y,
  icon: Icon,
  state,
  label,
  wide,
  id,
  justReached = false,
}: {
  x: number;
  y: number;
  icon: LucideIcon;
  state: CheckpointState;
  label: string;
  wide: boolean;
  id: string;
  justReached?: boolean;
}) {
  const r = wide ? 17 : 15;
  const explored = state === "explored";
  // Wide map: label under the node. Tall map: beside it, away from the trail's side.
  const labelX = wide ? x : x < 200 ? x + r + 7 : x - r - 7;
  const labelY = wide ? y + r + 15 : y + 4;
  const anchor = wide ? "middle" : x < 200 ? "start" : "end";

  return (
    <g>
      {justReached && (
        <circle
          cx={x}
          cy={y}
          r={r}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="2"
          className="animate-ring-once"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      )}
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={explored ? `url(#${id}-node)` : "#0b1220"}
        stroke={explored ? "#38bdf8" : state === "next" ? "#38bdf8" : "#334155"}
        strokeOpacity={state === "next" ? 0.7 : 1}
        strokeWidth={explored ? 2 : 1.5}
        strokeDasharray={state === "next" ? "3 3" : undefined}
        filter={explored ? `url(#${id}-glow)` : undefined}
        style={{ transition: "fill 0.6s, stroke 0.6s" }}
      />
      <g transform={`translate(${x - 8} ${y - 8})`}>
        {state === "locked" ? (
          <Lock width={16} height={16} color="#475569" strokeWidth={2} />
        ) : (
          <Icon width={16} height={16} color={explored ? "#e0f2fe" : "#7dd3fc"} strokeWidth={2} />
        )}
      </g>
      <text
        x={labelX}
        y={labelY}
        textAnchor={anchor}
        fontSize={wide ? 11 : 11.5}
        fontWeight={600}
        fill={explored ? "#e2e8f0" : state === "next" ? "#94a3b8" : "#475569"}
        style={{ paintOrder: "stroke", stroke: "#050914", strokeWidth: 3, transition: "fill 0.6s" }}
      >
        {label}
      </text>
    </g>
  );
}

function TreasureNode({ x, y, found, id }: { x: number; y: number; found: boolean; id: string }) {
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={22}
        fill={found ? "#78350f" : "#1c1917"}
        stroke={found ? "#fbbf24" : "#a16207"}
        strokeOpacity={found ? 1 : 0.6}
        strokeWidth={2}
        filter={found ? `url(#${id}-glow)` : undefined}
        style={{ transition: "fill 0.8s, stroke 0.8s" }}
      />
      <g transform={`translate(${x - 11} ${y - 11})`}>
        <Gem width={22} height={22} color={found ? "#fde68a" : "#a16207"} strokeWidth={2} />
      </g>
    </g>
  );
}

function Explorer({ x, y, id }: { x: number; y: number; id: string }) {
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <circle r="30" fill={`url(#${id}-aura)`} />
      <circle
        r="16"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="1.5"
        className="animate-aura"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
      {/* Map-pin explorer token, hovering just above the checkpoint */}
      <g transform="translate(0 -24)">
        <ellipse cx="0" cy="24" rx="7" ry="2.5" fill="black" opacity="0.4" />
        <path d="M0 18 C-3 12 -10 6 -10 -1 A10 10 0 1 1 10 -1 C10 6 3 12 0 18 Z" fill="#0ea5e9" stroke="white" strokeWidth="2" />
        <circle cx="0" cy="-1" r="3.6" fill="white" />
      </g>
    </g>
  );
}

/** The treasure chest — closed, or opening with light pouring out. */
export function TreasureChest({ open, className = "" }: { open: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 200 170" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#0b1530" />
        </linearGradient>
        <linearGradient id={`${id}-trim`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <radialGradient id={`${id}-light`} cx="50%" cy="100%" r="80%">
          <stop offset="0%" stopColor="#fef3c7" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#fbbf24" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
      </defs>

      {open && (
        <g className="animate-rays-in" style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}>
          {[-60, -36, -12, 12, 36, 60].map((angle) => (
            <path
              key={angle}
              d="M100 92 L92 0 L108 0 Z"
              fill={`url(#${id}-light)`}
              transform={`rotate(${angle} 100 92)`}
              opacity="0.7"
            />
          ))}
          <ellipse cx="100" cy="90" rx="70" ry="42" fill={`url(#${id}-light)`} />
        </g>
      )}

      <ellipse cx="100" cy="156" rx="70" ry="7" fill="black" opacity="0.4" />
      {/* Body */}
      <rect x="40" y="90" width="120" height="62" rx="6" fill={`url(#${id}-body)`} />
      <rect x="40" y="90" width="120" height="6" fill={`url(#${id}-trim)`} />
      <rect x="40" y="146" width="120" height="6" rx="2" fill={`url(#${id}-trim)`} />
      <rect x="60" y="90" width="7" height="62" fill={`url(#${id}-trim)`} opacity="0.9" />
      <rect x="133" y="90" width="7" height="62" fill={`url(#${id}-trim)`} opacity="0.9" />
      <rect x="92" y="100" width="16" height="20" rx="3" fill={`url(#${id}-trim)`} />
      <circle cx="100" cy="108" r="2.6" fill="#422006" />
      {open && <ellipse cx="100" cy="92" rx="56" ry="5" fill="#fef3c7" opacity="0.9" />}

      {/* Lid — hinged at the back, lifts and tips open */}
      <g
        className={open ? "animate-lid-open" : undefined}
        style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
      >
        <path d="M40 90 V74 Q40 56 60 56 H140 Q160 56 160 74 V90 Z" fill={`url(#${id}-body)`} />
        <path d="M40 90 V74 Q40 56 60 56 H140 Q160 56 160 74 V90 Z" fill="white" opacity="0.06" />
        <rect x="40" y="84" width="120" height="6" fill={`url(#${id}-trim)`} />
        <rect x="60" y="57" width="7" height="33" fill={`url(#${id}-trim)`} opacity="0.9" />
        <rect x="133" y="57" width="7" height="33" fill={`url(#${id}-trim)`} opacity="0.9" />
      </g>

      {open &&
        [
          [70, 0],
          [128, 200],
          [96, 420],
          [140, 650],
          [58, 820],
        ].map(([sx, delay]) => (
          <path
            key={sx}
            d={`M${sx} 80 l3 -6 l3 6 l-3 6 Z`}
            fill="#fde68a"
            className="animate-sparkle-rise"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
    </svg>
  );
}
