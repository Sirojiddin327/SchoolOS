import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Sparkles } from "lucide-react";
import { useState } from "react";

import { Badge } from "../../components/Badge";
import { Field, PrimaryButton, Select } from "../../components/form";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "../../components/table";
import { api } from "../../lib/api";
import type { Paginated, QuestionPoolStatus, SchoolClass, Subject } from "../../types";

// Mirrors the backend's POOL_LOW_THRESHOLD (apps.games.services) — below this,
// the scheduled auto-refill will top the pool back up on its own.
const POOL_LOW_THRESHOLD = 20;

function poolTone(count: number): "amber" | "emerald" {
  return count < POOL_LOW_THRESHOLD ? "amber" : "emerald";
}

export function QuestionPoolsPage() {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [schoolClass, setSchoolClass] = useState("");
  const [lastResult, setLastResult] = useState<string | null>(null);

  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await api.get<Paginated<Subject>>("/subjects/")).data,
  });
  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await api.get<Paginated<SchoolClass>>("/classes/")).data,
  });

  const { data: pools, isLoading, isError } = useQuery({
    queryKey: ["question-pools"],
    queryFn: async () => (await api.get<QuestionPoolStatus[]>("/question-pools/")).data,
  });

  const refill = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ added: number }>("/question-pools/refill/", {
          subject: Number(subject),
          school_class: Number(schoolClass),
        })
      ).data,
    onSuccess: ({ added }) => {
      queryClient.invalidateQueries({ queryKey: ["question-pools"] });
      setLastResult(added > 0 ? `${added} ta savol qo'shildi.` : "AI hozircha savol yarata olmadi — birozdan so'ng qayta urinib ko'ring.");
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Database}
        title="Savollar ombori"
        subtitle={
          'Barcha o\'yinlar ("Arqon tortish", "Viktorina", "Minora qurish", "Kodni buzish", "Xazina ovi", "Jang maydoni", "Tower Defense", "Neon Racing") shu yerdagi tayyor savollardan foydalanadi — o\'yin boshlanganda AI\'ga jonli so\'rov yubormaydi. Har bir sinf + fan uchun alohida ombor bor.'
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Sinf">
          <Select value={schoolClass} onChange={(e) => setSchoolClass(e.target.value)} className="min-w-[160px]">
            <option value="">— tanlang —</option>
            {classes?.results.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fan">
          <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="min-w-[160px]">
            <option value="">— tanlang —</option>
            {subjects?.results.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <PrimaryButton
          onClick={() => {
            setLastResult(null);
            refill.mutate();
          }}
          disabled={!subject || !schoolClass || refill.isPending}
          className="flex items-center gap-1.5"
        >
          <Sparkles size={15} />
          {refill.isPending ? "Tayyorlanmoqda..." : "Pool'ni to'ldirish"}
        </PrimaryButton>
        {lastResult && <p className="w-full text-sm text-ink-muted">{lastResult}</p>}
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {pools && pools.length === 0 && (
        <EmptyState
          title="Hali birorta pool to'ldirilmagan"
          description="Yuqoridan sinf va fan tanlab, birinchi marta to'ldiring."
        />
      )}
      {pools && pools.length > 0 && (
        <Table>
          <Thead>
            <Tr>
              <Th>Sinf</Th>
              <Th>Fan</Th>
              <Th className="text-right">Savollar soni</Th>
            </Tr>
          </Thead>
          <Tbody>
            {pools.map((pool) => (
              <Tr key={`${pool.subject}-${pool.school_class}`}>
                <Td className="font-medium text-slate-900 dark:text-slate-50">{pool.school_class_name}</Td>
                <Td className="text-slate-600 dark:text-slate-300">{pool.subject_name}</Td>
                <Td className="text-right">
                  <Badge tone={poolTone(pool.count)}>{pool.count} ta</Badge>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
