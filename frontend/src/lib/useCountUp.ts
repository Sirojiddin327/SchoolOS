import { useEffect, useRef, useState } from "react";

/**
 * Animates toward `target` whenever it changes — the "satisfying visual
 * feedback" for XP/score numbers landing. Pass `startFrom` to animate up
 * from a fixed number (e.g. 0) the first time this mounts; otherwise the
 * first render shows `target` immediately and only later changes animate.
 */
export function useCountUp(target: number, options: { durationMs?: number; startFrom?: number } = {}): number {
  const { durationMs = 800, startFrom } = options;
  const [value, setValue] = useState(startFrom ?? target);
  const fromRef = useRef(startFrom ?? target);

  useEffect(() => {
    const from = fromRef.current;
    const to = target;
    if (from === to) return;

    const start = performance.now();
    let frame: number;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- durationMs intentionally not a dependency
  }, [target]);

  return value;
}
