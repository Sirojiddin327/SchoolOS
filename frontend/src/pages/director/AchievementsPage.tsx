import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "../../components/Badge";
import { Field, Input, PrimaryButton, SecondaryButton, Select } from "../../components/form";
import { Modal } from "../../components/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { AchievementConditionType, AchievementManage, Paginated } from "../../types";

const CONDITION_LABEL: Record<AchievementConditionType, string> = {
  FIRST_TEST: "Birinchi testni topshirish",
  PERFECT_SCORE: "Testdan 100% ball olish",
  XP_THRESHOLD: "Jami XP chegarasiga yetish",
  STREAK_LENGTH: "Seriya uzunligiga yetish",
};

interface FormState {
  name: string;
  description: string;
  icon: string;
  condition_type: AchievementConditionType;
  condition_value: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  icon: "🏆",
  condition_type: "XP_THRESHOLD",
  condition_value: "100",
};

export function DirectorAchievementsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["achievements", "manage"],
    queryFn: async () =>
      (await api.get<Paginated<AchievementManage>>("/achievements/manage/")).data,
  });

  const createAchievement = useMutation({
    mutationFn: async (payload: FormState) =>
      api.post("/achievements/manage/", {
        ...payload,
        condition_value: Number(payload.condition_value),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["achievements", "manage"] });
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setError(null);
    },
    onError: () => setError("Saqlashda xatolik."),
  });

  const toggleActive = useMutation({
    mutationFn: async (achievement: AchievementManage) =>
      api.patch(`/achievements/manage/${achievement.id}/`, { is_active: !achievement.is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["achievements", "manage"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Yutuqlar</h1>
        <PrimaryButton onClick={() => setModalOpen(true)}>+ Yutuq yaratish</PrimaryButton>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.results.length === 0 && <EmptyState title="Hali yutuq yaratilmagan" />}

      {data && data.results.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nomi</th>
                <th className="px-4 py-3 font-medium">Shart</th>
                <th className="px-4 py-3 font-medium">Qiymat</th>
                <th className="px-4 py-3 font-medium">Holati</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.results.map((achievement) => (
                <tr key={achievement.id}>
                  <td className="px-4 py-3 text-slate-700">
                    {achievement.icon} {achievement.name}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {CONDITION_LABEL[achievement.condition_type]}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{achievement.condition_value}</td>
                  <td className="px-4 py-3">
                    <Badge tone={achievement.is_active ? "emerald" : "slate"}>
                      {achievement.is_active ? "Faol" : "Nofaol"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleActive.mutate(achievement)}
                      className="text-sm text-brand-600 hover:underline"
                    >
                      {achievement.is_active ? "Nofaollashtirish" : "Faollashtirish"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <Modal title="Yangi yutuq" onClose={() => setModalOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createAchievement.mutate(form);
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-3 gap-3">
              <Field label="Ikonka">
                <Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
              </Field>
              <div className="col-span-2">
                <Field label="Nomi">
                  <Input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            <Field label="Tavsif">
              <Input
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Shart turi">
                <Select
                  value={form.condition_type}
                  onChange={(e) =>
                    setForm({ ...form, condition_type: e.target.value as AchievementConditionType })
                  }
                >
                  {Object.entries(CONDITION_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Qiymat">
                <Input
                  type="number"
                  min={0}
                  required
                  value={form.condition_value}
                  onChange={(e) => setForm({ ...form, condition_value: e.target.value })}
                />
              </Field>
            </div>
            <p className="text-xs text-slate-400">
              "Birinchi test" va "100% ball" shartlari uchun qiymat e'tiborga olinmaydi.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton type="button" onClick={() => setModalOpen(false)}>
                Bekor qilish
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={createAchievement.isPending}>
                {createAchievement.isPending ? "Saqlanmoqda..." : "Yaratish"}
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
