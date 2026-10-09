import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { Field, Input, PrimaryButton } from "../../components/form";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, LoadingState } from "../../components/states";
import { Section } from "../../components/Surface";
import { TelegramConnect } from "../../components/TelegramConnect";
import { api } from "../../lib/api";
import type { SchoolTimeConfig } from "../../types";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [formKey, setFormKey] = useState(0);
  const [saved, setSaved] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["school-config"],
    queryFn: async () => (await api.get<SchoolTimeConfig>("/school-config/")).data,
  });

  const save = useMutation({
    mutationFn: async (draft: SchoolTimeConfig) => (await api.patch<SchoolTimeConfig>("/school-config/", draft)).data,
    onSuccess: (config) => {
      queryClient.setQueryData(["school-config"], config);
      setFormKey((k) => k + 1);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Sozlamalar" subtitle="Maktab vaqti, dars jadvali va bog'lanish sozlamalari." />

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}

      {data && (
        <SchoolConfigForm
          key={formKey}
          config={data}
          saving={save.isPending}
          onSave={(draft) => save.mutate(draft)}
        />
      )}

      {saved && (
        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Saqlandi
        </span>
      )}

      <Section title="Telegram">
        <TelegramConnect />
      </Section>
    </div>
  );
}

function SchoolConfigForm({
  config,
  saving,
  onSave,
}: {
  config: SchoolTimeConfig;
  saving: boolean;
  onSave: (draft: SchoolTimeConfig) => void;
}) {
  const [startTime, setStartTime] = useState(config.start_time.slice(0, 5));
  const [endTime, setEndTime] = useState(config.end_time.slice(0, 5));
  const [periodDuration, setPeriodDuration] = useState(String(config.period_duration_minutes));
  const [shortBreak, setShortBreak] = useState(String(config.short_break_minutes));
  const [longBreakAfterPeriod, setLongBreakAfterPeriod] = useState(String(config.long_break_after_period));
  const [longBreak, setLongBreak] = useState(String(config.long_break_minutes));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          start_time: `${startTime}:00`,
          end_time: `${endTime}:00`,
          period_duration_minutes: Number(periodDuration),
          short_break_minutes: Number(shortBreak),
          long_break_after_period: Number(longBreakAfterPeriod),
          long_break_minutes: Number(longBreak),
        });
      }}
      className="space-y-6"
    >
      <Section title="Dars vaqti (School Time Lock)">
        <p className="text-sm text-ink-muted">
          Shu vaqt oralig'ida o'quvchilar platformadan foydalana olmaydi. Direktor va
          o'qituvchilarga bu cheklov taalluqli emas.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Boshlanishi">
            <Input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="py-2.5"
            />
          </Field>
          <Field label="Tugashi">
            <Input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="py-2.5"
            />
          </Field>
        </div>
      </Section>

      <Section title="Dars jadvali vaqtlari">
        <p className="text-sm text-ink-muted">
          Har bir dars va tanaffus necha daqiqa davom etishi. "Darslarni yaratish" tugmasi
          shu qiymatlarga qarab har bir darsning vaqtini hisoblaydi.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Dars davomiyligi (daqiqa)">
            <Input
              type="number"
              min={1}
              required
              value={periodDuration}
              onChange={(e) => setPeriodDuration(e.target.value)}
              className="py-2.5"
            />
          </Field>
          <Field label="Kichik tanaffus (daqiqa)">
            <Input
              type="number"
              min={0}
              required
              value={shortBreak}
              onChange={(e) => setShortBreak(e.target.value)}
              className="py-2.5"
            />
          </Field>
          <Field label="Katta tanaffus qaysi darsdan keyin">
            <Input
              type="number"
              min={1}
              required
              value={longBreakAfterPeriod}
              onChange={(e) => setLongBreakAfterPeriod(e.target.value)}
              className="py-2.5"
            />
          </Field>
          <Field label="Katta tanaffus (daqiqa)">
            <Input
              type="number"
              min={0}
              required
              value={longBreak}
              onChange={(e) => setLongBreak(e.target.value)}
              className="py-2.5"
            />
          </Field>
        </div>
      </Section>

      <PrimaryButton type="submit" disabled={saving}>
        {saving ? "Saqlanmoqda..." : "Saqlash"}
      </PrimaryButton>
    </form>
  );
}
