import type { SchoolTimeConfig } from "../types";

/** Sunday-indexed (matches `Date.getDay()`) — for calendar-date labels. */
export const WEEKDAY_NAMES_UZ = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

export const MONTH_NAMES_UZ = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentyabr",
  "Oktyabr",
  "Noyabr",
  "Dekabr",
];

export function todayLabel(): string {
  const now = new Date();
  return `${WEEKDAY_NAMES_UZ[now.getDay()]}, ${now.getDate()}-${MONTH_NAMES_UZ[now.getMonth()]}`;
}

/** `YYYY-MM-DD` in the local timezone. `toISOString()` returns the *UTC* date,
 * which in UTC+5 (Asia/Tashkent) is yesterday between 00:00–05:00. */
export function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISODate(): string {
  return localISODate(new Date());
}

/** Monday(1)–Saturday(6) — matches the backend's `TimetableSlot.DayOfWeek`
 * choices exactly (the school week has no Sunday slot). Used for the weekly
 * schedule's day-selector tabs. */
export const SCHOOL_WEEKDAYS: { value: number; label: string; short: string }[] = [
  { value: 1, label: "Dushanba", short: "Du" },
  { value: 2, label: "Seshanba", short: "Se" },
  { value: 3, label: "Chorshanba", short: "Cho" },
  { value: 4, label: "Payshanba", short: "Pa" },
  { value: 5, label: "Juma", short: "Ju" },
  { value: 6, label: "Shanba", short: "Sha" },
];

/** JS `Date.getDay()` (0=Sunday) -> the matching `SCHOOL_WEEKDAYS` value, or
 * `null` on Sunday (the school week doesn't have a Sunday schedule). */
export function schoolWeekdayOf(date: Date): number | null {
  const jsDay = date.getDay();
  return jsDay === 0 ? null : jsDay;
}

/** `schoolWeekdayOf(new Date())` — today's day, or `null` on Sunday. Callers
 * picking a default day-tab to land on (the weekly schedule browser) fall
 * back to Monday themselves (`?? 1`); anything meaning today's *actual* date
 * (attendance, "what's happening right now") should keep the `null` as "no
 * school today" instead. */
export function todaySchoolWeekday(): number | null {
  return schoolWeekdayOf(new Date());
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

/** Mirrors the backend's `SchoolTimeSettings.period_times()` exactly — the
 * Nth period's start/end clock time, counting breaks from the school day's
 * start. `TimetableSlot` only stores a period *number*, not a clock time, so
 * this is how a weekly schedule view turns "2-dars" into "08:50–09:35". */
export function periodTimes(periodNumber: number, config: SchoolTimeConfig): { start: string; end: string } {
  let current = config.start_time.slice(0, 5);
  for (let period = 1; period < periodNumber; period++) {
    current = addMinutes(current, config.period_duration_minutes);
    const breakMinutes =
      period === config.long_break_after_period ? config.long_break_minutes : config.short_break_minutes;
    current = addMinutes(current, breakMinutes);
  }
  return { start: current, end: addMinutes(current, config.period_duration_minutes) };
}
