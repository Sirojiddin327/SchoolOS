import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Field, Input, PrimaryButton } from "../../components/form";
import { ErrorState, LoadingState } from "../../components/states";
import { TelegramConnect } from "../../components/TelegramConnect";
import { api } from "../../lib/api";
import type { SchoolTimeConfig } from "../../types";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [periodDuration, setPeriodDuration] = useState("45");
  const [shortBreak, setShortBreak] = useState("5");
  const [longBreakAfterPeriod, setLongBreakAfterPeriod] = useState("4");
  const [longBreak, setLongBreak] = useState("20");
  const [saved, setSaved] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["school-config"],
    queryFn: async () => (await api.get<SchoolTimeConfig>("/school-config/")).data,
  });

  useEffect(() => {
    if (data) {
      setStartTime(data.start_time.slice(0, 5));
      setEndTime(data.end_time.slice(0, 5));
      setPeriodDuration(String(data.period_duration_minutes));
      setShortBreak(String(data.short_break_minutes));
      setLongBreakAfterPeriod(String(data.long_break_after_period));
      setLongBreak(String(data.long_break_minutes));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch("/school-config/", {
          start_time: `${startTime}:00`,
          end_time: `${endTime}:00`,
          period_duration_minutes: Number(periodDuration),
          short_break_minutes: Number(shortBreak),
          long_break_after_period: Number(longBreakAfterPeriod),
          long_break_minutes: Number(longBreak),
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-config"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Sozlamalar</h1>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}

      {data && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
        >
          <div>
            <h2 className="font-semibold text-slate-900">Dars vaqti (School Time Lock)</h2>
            <p className="mt-1 text-sm text-slate-500">
              Shu vaqt oralig'ida o'quvchilar platformadan foydalana olmaydi. Direktor va
              o'qituvchilarga bu cheklov taalluqli emas.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Boshlanishi">
              <Input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </Field>
            <Field label="Tugashi">
              <Input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </Field>
          </div>

          <div className="pt-2">
            <h2 className="font-semibold text-slate-900">Dars jadvali vaqtlari</h2>
            <p className="mt-1 text-sm text-slate-500">
              Har bir dars va tanaffus necha daqiqa davom etishi. "Darslarni yaratish" tugmasi
              shu qiymatlarga qarab har bir darsning vaqtini hisoblaydi.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dars davomiyligi (daqiqa)">
              <Input
                type="number"
                min={1}
                required
                value={periodDuration}
                onChange={(e) => setPeriodDuration(e.target.value)}
              />
            </Field>
            <Field label="Kichik tanaffus (daqiqa)">
              <Input
                type="number"
                min={0}
                required
                value={shortBreak}
                onChange={(e) => setShortBreak(e.target.value)}
              />
            </Field>
            <Field label="Katta tanaffus qaysi darsdan keyin">
              <Input
                type="number"
                min={1}
                required
                value={longBreakAfterPeriod}
                onChange={(e) => setLongBreakAfterPeriod(e.target.value)}
              />
            </Field>
            <Field label="Katta tanaffus (daqiqa)">
              <Input
                type="number"
                min={0}
                required
                value={longBreak}
                onChange={(e) => setLongBreak(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex items-center gap-3">
            <PrimaryButton type="submit" disabled={save.isPending}>
              {save.isPending ? "Saqlanmoqda..." : "Saqlash"}
            </PrimaryButton>
            {saved && <span className="text-sm text-emerald-600">Saqlandi ✓</span>}
          </div>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-3 font-semibold text-slate-900">Telegram</h2>
        <TelegramConnect />
      </div>
    </div>
  );
}
