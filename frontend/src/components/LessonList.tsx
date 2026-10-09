import { CalendarX2, CheckCircle2, Clock3, MapPin } from "lucide-react";

import { TONE_DOT, type Tone } from "../lib/tones";
import type { LessonSummary } from "../types";
import { Badge } from "./Badge";
import { EmptyState } from "./states";

/**
 * The day's schedule, read top-to-bottom like a timeline: a time column, a
 * connector rail with a status dot, then the lesson. The rail is what turns a
 * list of rows into a schedule you can scan in one pass, and the dot is where
 * the only colour in the row lives.
 */
export function LessonList({ lessons }: { lessons: LessonSummary[] }) {
  if (lessons.length === 0) {
    return (
      <EmptyState
        title="Bugun darslar yo'q"
        description="Dushanba–Shanba dars jadvali bo'yicha bu kunga dars rejalashtirilmagan."
        icon={CalendarX2}
      />
    );
  }

  return (
    <ol className="divide-y divide-line-soft">
      {lessons.map((lesson) => {
        const marked: Tone = lesson.attendance_marked ? "emerald" : "amber";
        return (
          <li key={lesson.id} className="flex items-center gap-4 py-3.5">
            <div className="w-12 shrink-0 text-right">
              <p className="tabular text-sm font-semibold text-ink">
                {lesson.start_time.slice(0, 5)}
              </p>
              <p className="tabular text-[11px] text-ink-subtle">
                {lesson.end_time.slice(0, 5)}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-center self-stretch py-1">
              <span className={`h-2.5 w-2.5 rounded-full ${TONE_DOT[marked]}`} />
              <span className="mt-1 w-px flex-1 bg-line" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">
                {lesson.subject} <span className="text-ink-subtle">— {lesson.school_class}</span>
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-subtle">
                <span className="inline-flex items-center gap-1">
                  <Clock3 size={12} />
                  {lesson.start_time.slice(0, 5)}–{lesson.end_time.slice(0, 5)}
                </span>
                {lesson.room && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={12} />
                    {lesson.room}
                  </span>
                )}
                {lesson.topic && <span className="truncate">{lesson.topic}</span>}
              </p>
            </div>

            <Badge tone={marked} dot className="shrink-0">
              {lesson.attendance_marked ? (
                <>
                  <CheckCircle2 size={12} /> Davomat olindi
                </>
              ) : (
"Kutilmoqda"
              )}
            </Badge>
          </li>
        );
      })}
    </ol>
  );
}
