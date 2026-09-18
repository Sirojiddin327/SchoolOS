import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "../../components/Badge";
import { Field, Input, PrimaryButton, SecondaryButton, Select } from "../../components/form";
import { Modal } from "../../components/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type {
  ActivityStatus,
  ActivitySubmission,
  ActivitySummary,
  ActivityType,
  Paginated,
  SchoolClass,
  Subject,
} from "../../types";

const TYPE_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: "ASSIGNMENT", label: "Topshiriq" },
  { value: "CHALLENGE", label: "Chellenj" },
  { value: "TYPING", label: "Tez yozish" },
  { value: "PRACTICAL", label: "Amaliy ish" },
  { value: "SPORTS", label: "Sport" },
];

const STATUS_LABEL: Record<ActivityStatus, string> = {
  DRAFT: "Qoralama",
  PUBLISHED: "E'lon qilingan",
  CLOSED: "Yopilgan",
};

interface ActivityFormState {
  title: string;
  description: string;
  subject: string;
  school_class: string;
  activity_type: ActivityType;
  max_xp: string;
  start_date: string;
  end_date: string;
}

const EMPTY_FORM: ActivityFormState = {
  title: "",
  description: "",
  subject: "",
  school_class: "",
  activity_type: "ASSIGNMENT",
  max_xp: "100",
  start_date: "",
  end_date: "",
};

function GradeForm({ submission, onDone }: { submission: ActivitySubmission; onDone: () => void }) {
  const [scorePercent, setScorePercent] = useState("100");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);

  const grade = useMutation({
    mutationFn: async () =>
      api.post(`/activity-submissions/${submission.id}/grade/`, {
        score_percent: Number(scorePercent),
        feedback,
      }),
    onSuccess: onDone,
    onError: () => setError("Baholashda xatolik."),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        grade.mutate();
      }}
      className="mt-2 flex flex-wrap items-end gap-2"
    >
      <Field label="Ball (%)">
        <Input
          type="number"
          min={0}
          max={100}
          required
          value={scorePercent}
          onChange={(e) => setScorePercent(e.target.value)}
          className="w-24"
        />
      </Field>
      <Field label="Fikr-mulohaza">
        <Input value={feedback} onChange={(e) => setFeedback(e.target.value)} className="w-56" />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <PrimaryButton type="submit" disabled={grade.isPending}>
        {grade.isPending ? "Baholanmoqda..." : "Baholash"}
      </PrimaryButton>
    </form>
  );
}

function ActivityManager({ activity }: { activity: ActivitySummary }) {
  const queryClient = useQueryClient();

  const { data: submissions, refetch } = useQuery({
    queryKey: ["activity-submissions", activity.id],
    queryFn: async () =>
      (await api.get<ActivitySubmission[]>(`/activities/${activity.id}/submissions/`)).data,
  });

  const changeStatus = useMutation({
    mutationFn: async (action: "publish" | "close") => api.post(`/activities/${activity.id}/${action}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["activities", "teacher"] }),
  });

  return (
    <div className="space-y-4 border-t border-slate-100 px-5 py-4">
      <div className="flex flex-wrap gap-2">
        {activity.status === "DRAFT" && (
          <SecondaryButton onClick={() => changeStatus.mutate("publish")} disabled={changeStatus.isPending}>
            E'lon qilish
          </SecondaryButton>
        )}
        {activity.status === "PUBLISHED" && (
          <SecondaryButton onClick={() => changeStatus.mutate("close")} disabled={changeStatus.isPending}>
            Yopish
          </SecondaryButton>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          Topshirilganlar ({submissions?.length ?? 0})
        </h3>
        {!submissions && <LoadingState label="Yuklanmoqda..." />}
        {submissions && submissions.length === 0 && <EmptyState title="Hali hech kim topshirmagan" />}
        {submissions && submissions.length > 0 && (
          <div className="space-y-2">
            {submissions.map((submission) => (
              <div key={submission.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800">{submission.student_name}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(submission.submitted_at).toLocaleString("uz-UZ")}
                  </p>
                </div>
                {submission.content && <p className="mt-1 text-sm text-slate-600">{submission.content}</p>}
                {submission.attachment && (
                  <a
                    href={submission.attachment}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-sm text-brand-600 hover:underline"
                  >
                    Ilova faylni ko'rish
                  </a>
                )}
                {submission.result ? (
                  <p className="mt-2 text-sm font-medium text-emerald-700">
                    ✅ {submission.result.score_percent.toFixed(0)}% • {submission.result.xp_awarded} XP
                  </p>
                ) : (
                  <GradeForm submission={submission} onDone={refetch} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TeacherActivitiesPage() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ActivityFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await api.get<Paginated<SchoolClass>>("/classes/")).data,
  });
  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await api.get<Paginated<Subject>>("/subjects/")).data,
  });

  const { data: activities, isLoading, isError } = useQuery({
    queryKey: ["activities", "teacher"],
    queryFn: async () => (await api.get<Paginated<ActivitySummary>>("/activities/")).data,
  });

  const createActivity = useMutation({
    mutationFn: async (payload: ActivityFormState) =>
      api.post("/activities/", {
        title: payload.title,
        description: payload.description,
        subject: Number(payload.subject),
        school_class: Number(payload.school_class),
        activity_type: payload.activity_type,
        max_xp: Number(payload.max_xp),
        start_date: payload.start_date || null,
        end_date: payload.end_date || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities", "teacher"] });
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setError(null);
    },
    onError: () => setError("Saqlashda xatolik."),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Topshiriqlar</h1>
        <PrimaryButton onClick={() => setModalOpen(true)}>+ Topshiriq yaratish</PrimaryButton>
      </div>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {activities && activities.results.length === 0 && <EmptyState title="Hali topshiriq yaratmagansiz" />}

      {activities && activities.results.length > 0 && (
        <div className="space-y-3">
          {activities.results.map((activity) => (
            <div key={activity.id} className="rounded-xl border border-slate-200 bg-white">
              <button
                onClick={() => setExpandedId(expandedId === activity.id ? null : activity.id)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <div>
                  <p className="font-semibold text-slate-900">{activity.title}</p>
                  <p className="text-sm text-slate-500">
                    {activity.subject_name} · {activity.school_class_name} ·{" "}
                    {activity.submission_count} ta topshirildi · maks {activity.max_xp} XP
                  </p>
                </div>
                <Badge tone={activity.status === "PUBLISHED" ? "emerald" : "slate"} className="shrink-0">
                  {STATUS_LABEL[activity.status]}
                </Badge>
              </button>
              {expandedId === activity.id && <ActivityManager activity={activity} />}
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <Modal title="Yangi topshiriq" onClose={() => setModalOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createActivity.mutate(form);
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
              <Field label="Turi">
                <Select
                  value={form.activity_type}
                  onChange={(e) =>
                    setForm({ ...form, activity_type: e.target.value as ActivityType })
                  }
                >
                  {TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="Boshlanish sanasi">
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </Field>
              <Field label="Tugash sanasi">
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </Field>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <SecondaryButton type="button" onClick={() => setModalOpen(false)}>
                Bekor qilish
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={createActivity.isPending}>
                {createActivity.isPending ? "Saqlanmoqda..." : "Yaratish"}
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
