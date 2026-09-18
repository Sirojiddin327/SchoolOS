import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { api } from "../lib/api";
import type { TelegramLinkCode, TelegramStatus } from "../types";
import { PrimaryButton, SecondaryButton } from "./form";
import { ErrorState, LoadingState } from "./states";

export function TelegramConnect() {
  const queryClient = useQueryClient();
  const [linkCode, setLinkCode] = useState<TelegramLinkCode | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["telegram", "status"],
    queryFn: async () => (await api.get<TelegramStatus>("/telegram/status/")).data,
  });

  const generateCode = useMutation({
    mutationFn: async () => (await api.post<TelegramLinkCode>("/telegram/link-code/")).data,
    onSuccess: (data) => setLinkCode(data),
  });

  const unlink = useMutation({
    mutationFn: async () => api.delete("/telegram/unlink/"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram", "status"] });
      setLinkCode(null);
    },
  });

  if (isLoading) return <LoadingState label="Telegram holati tekshirilmoqda..." />;
  if (isError || !data) return <ErrorState />;

  if (data.linked) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> Telegram bog'langan
          </p>
          {data.telegram_username && (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">@{data.telegram_username}</p>
          )}
        </div>
        <SecondaryButton onClick={() => unlink.mutate()} disabled={unlink.isPending}>
          Uzish
        </SecondaryButton>
      </div>
    );
  }

  if (linkCode) {
    const deepLink = `https://t.me/${linkCode.bot_username}?start=${linkCode.code}`;
    return (
      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-800/50">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Telegramda <strong>@{linkCode.bot_username}</strong> botini oching va shu kodni yuboring,
          yoki quyidagi tugmani bosing:
        </p>
        <p className="text-center text-2xl font-bold tracking-widest text-slate-900 dark:text-slate-100">
          {linkCode.code}
        </p>
        <a href={deepLink} target="_blank" rel="noreferrer" className="block">
          <PrimaryButton type="button" className="w-full">
            Botni ochish
          </PrimaryButton>
        </a>
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">Kod 10 daqiqa amal qiladi.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-800">
      <p className="text-sm text-slate-600 dark:text-slate-400">Telegram orqali bildirishnoma olish uchun bog'lang.</p>
      <PrimaryButton onClick={() => generateCode.mutate()} disabled={generateCode.isPending}>
        {generateCode.isPending ? "Yuklanmoqda..." : "Telegramni bog'lash"}
      </PrimaryButton>
    </div>
  );
}
