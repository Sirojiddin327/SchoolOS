import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Sparkles } from "lucide-react";
import { useState } from "react";

import { Badge } from "../../components/Badge";
import { Field, Input, PrimaryButton, SecondaryButton, Select } from "../../components/form";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { Table, Tbody, Td, Th, Thead, Tr } from "../../components/table";
import { api } from "../../lib/api";
import type {
  Paginated,
  SchoolClass,
  Subject,
  Teacher,
  TestAttempt,
  TestOptionWrite,
  TestQuestionWrite,
  TestSummary,
} from "../../types";

interface AITestFormState {
  title: string;
  subject: string;
  school_class: string;
  teacher: string;
  topic: string;
  question_count: string;
  max_xp: string;
}

const EMPTY_AI_FORM: AITestFormState = {
  title: "",
  subject: "",
  school_class: "",
  teacher: "",
  topic: "",
  question_count: "10",
  max_xp: "100",
};

function QuestionRow({ question, onChanged }: { question: TestQuestionWrite; onChanged: () => void }) {
  const { data: options } = useQuery({
    queryKey: ["options", question.id],
    queryFn: async () =>
      (await api.get<Paginated<TestOptionWrite>>("/options/", { params: { question: question.id } }))
        .data.results,
  });

  const deleteQuestion = useMutation({
    mutationFn: async () => api.delete(`/questions/${question.id}/`),
    onSuccess: onChanged,
  });

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{question.text}</p>
        <button
          onClick={() => deleteQuestion.mutate()}
          className="shrink-0 text-xs text-red-600 hover:underline dark:text-red-400"
        >
          O'chirish
        </button>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {options?.map((option) => (
          <li
            key={option.id}
            className={`flex items-center gap-1.5 ${
              option.is_correct ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {option.is_correct ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5 text-center">·</span>}
            {option.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TestManager({ test }: { test: TestSummary }) {
  const queryClient = useQueryClient();
  const [showResults, setShowResults] = useState(false);

  const { data: questions, refetch } = useQuery({
    queryKey: ["questions", test.id],
    queryFn: async () =>
      (await api.get<Paginated<TestQuestionWrite>>("/questions/", { params: { test: test.id } })).data
        .results,
  });

  const { data: results } = useQuery({
    queryKey: ["test-results", test.id],
    enabled: showResults,
    queryFn: async () => (await api.get<TestAttempt[]>(`/tests/${test.id}/results/`)).data,
  });

  const togglePublish = useMutation({
    mutationFn: async () =>
      api.post(`/tests/${test.id}/${test.is_published ? "unpublish" : "publish"}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tests", "director"] }),
  });

  return (
    <div className="space-y-4 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <SecondaryButton onClick={() => togglePublish.mutate()} disabled={togglePublish.isPending}>
          {test.is_published ? "Bekor qilish (unpublish)" : "E'lon qilish"}
        </SecondaryButton>
        <SecondaryButton onClick={() => setShowResults(!showResults)}>
          {showResults ? "Natijalarni yashirish" : "Natijalarni ko'rish"}
        </SecondaryButton>
      </div>

      <div className="space-y-2">
        <h3 className="section-title">
          Savollar ({questions?.length ?? 0})
        </h3>
        {questions?.map((question) => (
          <QuestionRow key={question.id} question={question} onChanged={refetch} />
        ))}
      </div>

      {showResults && (
        <div>
          <h3 className="mb-2 section-title">Natijalar</h3>
          {!results && <LoadingState label="Yuklanmoqda..." />}
          {results && results.length === 0 && <EmptyState title="Hali hech kim topshirmagan" />}
          {results && results.length > 0 && (
            <Table>
              <Thead>
                <Tr>
                  <Th>O'quvchi</Th>
                  <Th className="text-right">Natija</Th>
                  <Th className="text-right">XP</Th>
                </Tr>
              </Thead>
              <Tbody>
                {results.map((attempt) => (
                  <Tr key={attempt.id}>
                    <Td className="text-slate-700 dark:text-slate-200">{attempt.student_name}</Td>
                    <Td className="text-right text-slate-700 dark:text-slate-200">
                      {attempt.score_percent?.toFixed(0)}%
                    </Td>
                    <Td className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      +{attempt.xp_awarded}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}

export function DirectorTestsPage() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isAIModalOpen, setAIModalOpen] = useState(false);
  const [aiForm, setAIForm] = useState<AITestFormState>(EMPTY_AI_FORM);
  const [aiError, setAIError] = useState<string | null>(null);

  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await api.get<Paginated<SchoolClass>>("/classes/")).data,
  });
  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await api.get<Paginated<Subject>>("/subjects/")).data,
  });
  const { data: teachers } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => (await api.get<Paginated<Teacher>>("/teachers/")).data,
  });

  const { data: tests, isLoading, isError } = useQuery({
    queryKey: ["tests", "director"],
    queryFn: async () => (await api.get<Paginated<TestSummary>>("/tests/")).data,
  });

  const generateTest = useMutation({
    mutationFn: async (payload: AITestFormState) =>
      (
        await api.post<TestSummary>("/tests/generate/", {
          title: payload.title,
          subject: Number(payload.subject),
          school_class: Number(payload.school_class),
          teacher: Number(payload.teacher),
          topic: payload.topic,
          question_count: Number(payload.question_count),
          max_xp: Number(payload.max_xp),
        })
      ).data,
    onSuccess: (test) => {
      queryClient.invalidateQueries({ queryKey: ["tests", "director"] });
      setAIModalOpen(false);
      setAIForm(EMPTY_AI_FORM);
      setAIError(null);
      setExpandedId(test.id);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: Record<string, string[] | string> } })?.response?.data;
      setAIError(detail ? Object.values(detail).flat().join(" ") : "AI bilan yaratishda xatolik.");
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Testlar"
        subtitle="Har qanday o'qituvchi uchun AI yordamida test tuzing."
        action={
          <SecondaryButton onClick={() => setAIModalOpen(true)} className="inline-flex items-center gap-1.5">
            <Sparkles size={15} /> AI bilan yaratish
          </SecondaryButton>
        }
      />

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {tests && tests.results.length === 0 && <EmptyState title="Hali test yaratilmagan" />}

      {tests && tests.results.length > 0 && (
        <div className="space-y-3">
          {tests.results.map((test) => (
            <div key={test.id} className="card">
              <button
                onClick={() => setExpandedId(expandedId === test.id ? null : test.id)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-50">{test.title}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {test.subject_name} · {test.school_class_name} · {test.teacher_name} · {test.question_count} ta
                    savol · maks {test.max_xp} XP
                  </p>
                </div>
                <Badge tone={test.is_published ? "emerald" : "slate"} className="shrink-0">
                  {test.is_published ? "E'lon qilingan" : "Qoralama"}
                </Badge>
              </button>
              {expandedId === test.id && <TestManager test={test} />}
            </div>
          ))}
        </div>
      )}

      {isAIModalOpen && (
        <Modal title="AI bilan test yaratish" onClose={() => setAIModalOpen(false)}>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Mavzuni yozing — AI shu mavzudan savollarni tuzib beradi. Test tanlangan o'qituvchi nomidan
            saqlanadi, e'lon qilishdan oldin ko'rib chiqib tahrirlash mumkin.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAIError(null);
              generateTest.mutate(aiForm);
            }}
            className="space-y-4"
          >
            <Field label="Test nomi">
              <Input
                required
                value={aiForm.title}
                onChange={(e) => setAIForm({ ...aiForm, title: e.target.value })}
              />
            </Field>
            <Field label="Mavzu">
              <Input
                required
                placeholder="Masalan: Kvadrat tenglamalar"
                value={aiForm.topic}
                onChange={(e) => setAIForm({ ...aiForm, topic: e.target.value })}
              />
            </Field>
            <Field label="O'qituvchi">
              <Select
                required
                value={aiForm.teacher}
                onChange={(e) => setAIForm({ ...aiForm, teacher: e.target.value })}
              >
                <option value="">— tanlang —</option>
                {teachers?.results.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.first_name || teacher.last_name
                      ? `${teacher.first_name} ${teacher.last_name}`.trim()
                      : `O'qituvchi №${teacher.id}`}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fan">
                <Select
                  required
                  value={aiForm.subject}
                  onChange={(e) => setAIForm({ ...aiForm, subject: e.target.value })}
                >
                  <option value="">— tanlang —</option>
                  {subjects?.results.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Sinf">
                <Select
                  required
                  value={aiForm.school_class}
                  onChange={(e) => setAIForm({ ...aiForm, school_class: e.target.value })}
                >
                  <option value="">— tanlang —</option>
                  {classes?.results.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Savollar soni">
                <Input
                  type="number"
                  min={3}
                  max={20}
                  required
                  value={aiForm.question_count}
                  onChange={(e) => setAIForm({ ...aiForm, question_count: e.target.value })}
                />
              </Field>
              <Field label="Maksimal XP">
                <Input
                  type="number"
                  min={1}
                  required
                  value={aiForm.max_xp}
                  onChange={(e) => setAIForm({ ...aiForm, max_xp: e.target.value })}
                />
              </Field>
            </div>
            {aiError && <p className="text-sm text-red-600 dark:text-red-400">{aiError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton type="button" onClick={() => setAIModalOpen(false)}>
                Bekor qilish
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={generateTest.isPending}>
                {generateTest.isPending ? "Yaratilmoqda..." : "AI bilan yaratish"}
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
