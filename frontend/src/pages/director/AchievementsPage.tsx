import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "../../components/Badge";
import { Field, Input, PrimaryButton, SecondaryButton, Select } from "../../components/form";
import { Modal } from "../../components/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "../../components/table";
import { ACHIEVEMENT_ICON_OPTIONS, AchievementIcon } from "../../lib/achievementIcons";
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
  icon: "trophy",
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
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Yutuqlar</h1>
        <PrimaryButton onClick={() => setModalOpen(true)}>+ Yutuq yaratish</PrimaryButton>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.results.length === 0 && <EmptyState title="Hali yutuq yaratilmagan" />}

      {data && data.results.length > 0 && (
        <Table>
          <Thead>
            <Tr>
              <Th>Nomi</Th>
              <Th>Shart</Th>
              <Th>Qiymat</Th>
              <Th>Holati</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {data.results.map((achievement) => (
              <Tr key={achievement.id}>
                <Td className="text-slate-700 dark:text-slate-200">
                  <span className="inline-flex items-center gap-2">
                    <AchievementIcon icon={achievement.icon} className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    {achievement.name}
                  </span>
                </Td>
                <Td>{CONDITION_LABEL[achievement.condition_type]}</Td>
                <Td>{achievement.condition_value}</Td>
                <Td>
                  <Badge tone={achievement.is_active ? "emerald" : "slate"}>
                    {achievement.is_active ? "Faol" : "Nofaol"}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <button
                    onClick={() => toggleActive.mutate(achievement)}
                    className="text-sm text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {achievement.is_active ? "Nofaollashtirish" : "Faollashtirish"}
                  </button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
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
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
                    <AchievementIcon icon={form.icon} className="h-4 w-4" />
                  </span>
                  <Select
                    value={form.icon}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                  >
                    {ACHIEVEMENT_ICON_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
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
            <p className="text-xs text-slate-400 dark:text-slate-500">
              "Birinchi test" va "100% ball" shartlari uchun qiymat e'tiborga olinmaydi.
            </p>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
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
