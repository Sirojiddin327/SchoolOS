import type { LessonSummary } from "../types";
import { Badge } from "./Badge";
import { EmptyState } from "./states";

export function LessonList({ lessons }: { lessons: LessonSummary[] }) {
  if (lessons.length === 0) {
    return <EmptyState title="Bugun darslar yo'q" />;
  }

  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {lessons.map((lesson) => (
        <div key={lesson.id} className="flex items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="font-medium text-slate-900">
              {lesson.subject} — {lesson.school_class}
            </p>
            <p className="text-sm text-slate-500">
              {lesson.start_time.slice(0, 5)}–{lesson.end_time.slice(0, 5)}
              {lesson.room && ` · ${lesson.room}`}
              {lesson.topic && ` · ${lesson.topic}`}
            </p>
          </div>
          <Badge tone={lesson.attendance_marked ? "emerald" : "amber"} className="shrink-0">
            {lesson.attendance_marked ? "Davomat olindi" : "Davomat kutilmoqda"}
          </Badge>
        </div>
      ))}
    </div>
  );
}
