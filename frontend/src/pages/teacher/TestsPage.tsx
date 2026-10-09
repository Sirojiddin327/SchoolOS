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
  TestAttempt,
  TestOptionWrite,
  TestQuestionWrite,
  TestSummary,
} from "../../types";

interface TestFormState {
  title: string;
  description: string;
  subject: string;
  school_class: string;
  time_limit_minutes: string;
  max_xp: string;
}

const EMPTY_TEST_FORM: TestFormState = {
  title: "",
  description: "",
  subject: "",
  school_class: "",
  time_limit_minutes: "",
  max_xp: "100",
};

interface AITestFormState {
  title: string;
  subject: string;
  school_class: string;
  topic: string;
  question_count: string;
  max_xp: string;
}

const EMPTY_AI_FORM: AITestFormState = {
  title: "",
  subject: "",
  school_class: "",
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

function AddQuestionForm({
  testId,
  nextOrder,
  onDone,
}: {
  testId: number;
  nextOrder: number;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState([
    { text: "", is_correct: true },
    { text: "", is_correct: false },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (options.some((o) => !o.text.trim())) {
      setError("Barcha variantlarni to'ldiring.");
      return;
    }
    setPending(true);
    try {
      const { data: question } = await api.post<TestQuestionWrite>("/questions/", {
        test: testId,
        text,
        order: nextOrder,
      });
      for (const option of options) {
        await api.post("/options/", { question: question.id, text: option.text, is_correct: option.is_correct });
      }
      setText("");
      setOptions([
        { text: "", is_correct: true },
        { text: "", is_correct: false },
      ]);
      onDone();
    } catch (err) {
      const detail = (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      setError(detail ? Object.values(detail).flat().join(" ") : "Saqlashda xatolik.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
      <Field label="Savol matni">
        <Input required value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div className="space-y-2">
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="radio"
              name="correct-option"
              checked={option.is_correct}
              onChange={() =>
                setOptions(options.map((o, i) => ({ ...o, is_correct: i === index })))
              }
            />
            <Input
              required
              placeholder={`${index + 1}-variant`}
              value={option.text}
              onChange={(e) =>
                setOptions(options.map((o, i) => (i === index ? { ...o, text: e.target.value } : o)))
              }
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setOptions([...options, { text: "", is_correct: false }])}
          className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          + Variant qo'shish
        </button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <PrimaryButton type="submit" disabled={pending}>
        {pending ? "Saqlanmoqda..." : "Savolni qo'shish"}
      </PrimaryButton>
    </form>
  );
}

function TestManager({ test }: { test: TestSummary }) {
  const queryClient = useQueryClient();
  const [showResults, setShowResults] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tests", "teacher"] }),
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
          Savollar ({questions?.length ?? 0}
          {test.max_questions != null && ` / ${test.max_questions}`})
        </h3>
        {test.max_questions != null && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Bu fan shu sinfda haftasiga kamdan-kam o'tiladi — test uchun ko'pi bilan {test.max_questions} ta savol
            belgilangan.
          </p>
        )}
        {questions?.map((question) => (
          <QuestionRow key={question.id} question={question} onChanged={refetch} />
        ))}
        {test.max_questions != null && (questions?.length ?? 0) >= test.max_questions ? (
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
            Savollar shablon chegarasiga yetdi ({test.max_questions} ta).
          </p>
        ) : showAddQuestion ? (
          <AddQuestionForm
            testId={test.id}
            nextOrder={(questions?.length ?? 0) + 1}
            onDone={() => {
              refetch();
              setShowAddQuestion(false);
            }}
          />
        ) : (
          <button
            onClick={() => setShowAddQuestion(true)}
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            + Savol qo'shish
          </button>
        )}
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

export function TeacherTestsPage() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<TestFormState>(EMPTY_TEST_FORM);
  const [error, setError] = useState<string | null>(null);
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

  const { data: tests, isLoading, isError } = useQuery({
    queryKey: ["tests", "teacher"],
    queryFn: async () => (await api.get<Paginated<TestSummary>>("/tests/")).data,
  });

  const createTest = useMutation({
    mutationFn: async (payload: TestFormState) =>
      api.post("/tests/", {
        title: payload.title,
        description: payload.description,
        subject: Number(payload.subject),
        school_class: Number(payload.school_class),
        time_limit_minutes: payload.time_limit_minutes ? Number(payload.time_limit_minutes) : null,
        max_xp: Number(payload.max_xp),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tests", "teacher"] });
      setModalOpen(false);
      setForm(EMPTY_TEST_FORM);
      setError(null);
    },
    onError: () => setError("Saqlashda xatolik."),
  });

  const generateTest = useMutation({
    mutationFn: async (payload: AITestFormState) =>
      (
        await api.post<TestSummary>("/tests/generate/", {
          title: payload.title,
          subject: Number(payload.subject),
          school_class: Number(payload.school_class),
          topic: payload.topic,
          question_count: Number(payload.question_count),
          max_xp: Number(payload.max_xp),
        })
      ).data,
    onSuccess: (test) => {
      queryClient.invalidateQueries({ queryKey: ["tests", "teacher"] });
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
        action={
          <div className="flex gap-2">
            <SecondaryButton onClick={() => setAIModalOpen(true)} className="inline-flex items-center gap-1.5">
              <Sparkles size={15} /> AI bilan yaratish
            </SecondaryButton>
            <PrimaryButton onClick={() => setModalOpen(true)}>+ Test yaratish</PrimaryButton>
          </div>
        }
      />

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {tests && tests.results.length === 0 && <EmptyState title="Hali test yaratmagansiz" />}

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
                    {test.subject_name} · {test.school_class_name} · {test.question_count} ta savol · maks{" "}
                    {test.max_xp} XP
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

      {isModalOpen && (
        <Modal title="Yangi test" onClose={() => setModalOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createTest.mutate(form);
            }}
            className="space-y-4"
          >
            <Field label="Nomi">
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Tavsif">
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fan">
                <Select
                  required
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
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
                  value={form.school_class}
                  onChange={(e) => setForm({ ...form, school_class: e.target.value })}
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
              <Field label="Vaqt chegarasi (daqiqa)">
                <Input
                  type="number"
                  min={1}
                  value={form.time_limit_minutes}
                  onChange={(e) => setForm({ ...form, time_limit_minutes: e.target.value })}
                />
              </Field>
              <Field label="Maksimal XP">
                <Input
                  type="number"
                  min={1}
                  required
                  value={form.max_xp}
                  onChange={(e) => setForm({ ...form, max_xp: e.target.value })}
                />
              </Field>
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton type="button" onClick={() => setModalOpen(false)}>
                Bekor qilish
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={createTest.isPending}>
                {createTest.isPending ? "Saqlanmoqda..." : "Yaratish"}
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}

      {isAIModalOpen && (
        <Modal title="AI bilan test yaratish" onClose={() => setAIModalOpen(false)}>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Mavzuni yozing — AI shu mavzudan savollarni tuzib beradi. Yaratilgach, e'lon qilishdan oldin
            ko'rib chiqib, kerak bo'lsa tahrirlashingiz mumkin.
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
