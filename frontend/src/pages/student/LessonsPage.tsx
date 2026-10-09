import { useQuery } from "@tanstack/react-query";
import { Clock, DoorOpen, User } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "../../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { WeekdayTabs } from "../../components/WeekdayTabs";
import { api } from "../../lib/api";
import { periodTimes, todaySchoolWeekday } from "../../lib/schoolTime";
import type { Paginated, SchoolTimeConfig, TimetableSlot } from "../../types";

export function StudentLessonsPage() {
  const [day, setDay] = useState(todaySchoolWeekday() ?? 1);

  const { data: config } = useQuery({
    queryKey: ["school-config"],
    queryFn: async () => (await api.get<SchoolTimeConfig>("/school-config/")).data,
  });
  const { data, isLoading, isError } = useQuery({
    queryKey: ["timetable-slots", "student", day],
    queryFn: async () =>
      (await api.get<Paginated<TimetableSlot>>("/timetable-slots/", { params: { day_of_week: day } })).data,
  });

  const slots = [...(data?.results ?? [])].sort((a, b) => a.period_number - b.period_number);

  return (
    <div className="space-y-6">
      <PageHeader title="Mening darslarim" subtitle="Kun tanlab, o'sha kundagi dars jadvalingizni ko'ring." />

      <WeekdayTabs value={day} onChange={setDay} />

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && slots.length === 0 && <EmptyState title="Bu kunga dars belgilanmagan" />}

      {data && slots.length > 0 && (
        <div className="divide-y divide-line-soft">
          {slots.map((slot) => {
            const time = config ? periodTimes(slot.period_number, config) : null;
            return (
              <div key={slot.id} className="flex items-center gap-4 py-4">
                <div className="flex h-11 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                  <span className="text-xs font-bold leading-tight">{time ? time.start : `${slot.period_number}-`}</span>
                  <span className="text-[10px] leading-tight opacity-80">{time ? time.end : "dars"}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{slot.subject_name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                    <span className="flex items-center gap-1">
                      <User size={12} /> {slot.teacher_name}
                    </span>
                    {slot.room && (
                      <span className="flex items-center gap-1">
                        <DoorOpen size={12} /> {slot.room}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {slot.period_number}-dars
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
