import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Field, Input, PrimaryButton, SecondaryButton, Select } from "../../components/form";
import { Modal } from "../../components/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
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
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">{question.text}</p>
        <button
          onClick={() => deleteQuestion.mutate()}
          className="shrink-0 text-xs text-red-600 hover:underline"
        >
          O'chirish
        </button>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {options?.map((option) => (
          <li key={option.id} className={option.is_correct ? "font-medium text-emerald-700" : "text-slate-500"}>
            {option.is_correct ? "✓" : "·"} {option.text}
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
        // eslint-disable-next-line no-await-in-loop -- options must exist before the question is usable
        await api.post("/options/", { question: question.id, text: option.text, is_correct: option.is_correct });
      }
      setText("");
      setOptions([
        { text: "", is_correct: true },
        { text: "", is_correct: false },
      ]);
      onDone();
    } catch {
      setError("Saqlashda xatolik.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-dashed border-slate-300 p-3">
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
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          + Variant qo'shish
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
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
    <div className="space-y-4 border-t border-slate-100 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <SecondaryButton onClick={() => togglePublish.mutate()} disabled={togglePublish.isPending}>
          {test.is_published ? "Bekor qilish (unpublish)" : "E'lon qilish"}
        </SecondaryButton>
        <SecondaryButton onClick={() => setShowResults(!showResults)}>
          {showResults ? "Natijalarni yashirish" : "Natijalarni ko'rish"}
        </SecondaryButton>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">Savollar ({questions?.length ?? 0})</h3>
        {questions?.map((question) => (
          <QuestionRow key={question.id} question={question} onChanged={refetch} />
        ))}
        {showAddQuestion ? (
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
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            + Savol qo'shish
          </button>
        )}
      </div>

      {showResults && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Natijalar</h3>
          {!results && <LoadingState label="Yuklanmoqda..." />}
          {results && results.length === 0 && <EmptyState title="Hali hech kim topshirmagan" />}
          {results && results.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">O'quvchi</th>
                    <th className="px-3 py-2 font-medium text-right">Natija</th>
                    <th className="px-3 py-2 font-medium text-right">XP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((attempt) => (
                    <tr key={attempt.id}>
                      <td className="px-3 py-2 text-slate-700">{attempt.student_name}</td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {attempt.score_percent?.toFixed(0)}%
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-600">
                        +{attempt.xp_awarded}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Testlar</h1>
        <PrimaryButton onClick={() => setModalOpen(true)}>+ Test yaratish</PrimaryButton>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {tests && tests.results.length === 0 && <EmptyState title="Hali test yaratmagansiz" />}

      {tests && tests.results.length > 0 && (
        <div className="space-y-3">
          {tests.results.map((test) => (
            <div key={test.id} className="rounded-xl border border-slate-200 bg-white">
              <button
                onClick={() => setExpandedId(expandedId === test.id ? null : test.id)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <div>
                  <p className="font-semibold text-slate-900">{test.title}</p>
                  <p className="text-sm text-slate-500">
                    {test.subject_name} · {test.school_class_name} · {test.question_count} ta savol · maks{" "}
                    {test.max_xp} XP
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    test.is_published ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {test.is_published ? "E'lon qilingan" : "Qoralama"}
                </span>
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
            {error && <p className="text-sm text-red-600">{error}</p>}
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
    </div>
  );
}
