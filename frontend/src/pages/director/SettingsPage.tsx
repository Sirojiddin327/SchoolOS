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
  const [saved, setSaved] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["school-config"],
    queryFn: async () => (await api.get<SchoolTimeConfig>("/school-config/")).data,
  });

  useEffect(() => {
    if (data) {
      setStartTime(data.start_time.slice(0, 5));
      setEndTime(data.end_time.slice(0, 5));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch("/school-config/", {
          start_time: `${startTime}:00`,
          end_time: `${endTime}:00`,
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
