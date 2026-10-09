import type { ReactNode } from "react";

import { TONE_RING, TONE_TEXT, type Tone } from "../lib/tones";
import { AvatarUploader } from "./AvatarUploader";
import { Badge } from "./Badge";

/**
 * The identity block every role's Profile page opens with.
 *
 * Open on the canvas — a hairline underneath is the only thing separating it
 * from the sections below, and the stats sit in a plain divided row instead
 * of a nested grid of mini-cards.
 */
export function ProfileHeaderCard({
  name,
  email,
  roleLabel,
  roleTone = "brand",
  stats,
  children,
}: {
  name: string;
  email: string | undefined;
  roleLabel: string;
  roleTone?: Tone;
  stats?: ReactNode;
  /** Role-specific extras rendered under the identity row (XP bar, etc.). */
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-line-soft pb-6">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <span className={`rounded-full ring-2 ${TONE_RING[roleTone]}`}>
          <AvatarUploader />
        </span>
        <div className="min-w-0 flex-1 text-center sm:pt-2 sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h2 className="truncate text-xl font-bold tracking-tight text-ink">{name}</h2>
            <Badge tone={roleTone}>{roleLabel}</Badge>
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-muted">{email}</p>
        </div>
      </div>

      {children}

      {stats && <div className="mt-6 grid grid-cols-3 gap-4">{stats}</div>}
    </header>
  );
}

/** One cell of the stats strip — a number with a label, no card chrome. */
export function ProfileStat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="min-w-0">
      <p className={`tabular truncate text-xl font-bold leading-none ${TONE_TEXT[tone]}`}>{value}</p>
      <p className="mt-1.5 truncate text-xs text-ink-subtle">{label}</p>
    </div>
  );
}
