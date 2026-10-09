import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ChevronLeft, Sparkles, Trophy, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { PrimaryButton } from "../../components/form";
import { LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { RemedialGameQuestion, RemedialSession } from "../../types";

/** 0 = fully pulled to the student's side, 100 = fully pulled to the AI's side. */
function RopeTrack({ position }: { position: number }) {
  const clamped = Math.min(100, Math.max(0, position));
  return (
    <div className="relative my-6 h-3 rounded-full bg-gradient-to-r from-brand-200 via-slate-200 to-red-200 dark:from-brand-500/30 dark:via-slate-700 dark:to-red-500/30">
      <div
        className="absolute top-1/2 h-7 w-7 -translate-y-1/2 rounded-full border-4 border-white bg-amber-500 shadow-md transition-all duration-1000 ease-out dark:border-slate-900"
        style={{ left: `calc(${clamped}% - 14px)` }}
      />
    </div>
  );
}

export function StudentRemedialPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<"explaining" | "explained" | "playing" | "done">("explaining");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [ropePosition, setRopePosition] = useState(50);

  const { data: session } = useQuery({
    queryKey: ["remedial", id],
    queryFn: async () => (await api.get<RemedialSession>(`/remedial-sessions/${id}/`)).data,
    enabled: Boolean(id),
  });

  const explainMutation = useMutation({
    mutationFn: async () => (await api.post<RemedialSession>(`/remedial-sessions/${id}/explain/`)).data,
    onSuccess: (result) => {
      setError(null);
      queryClient.setQueryData(["remedial", id], result);
      setPhase("explained");
    },
    onError: () => setError("AI hozircha javob bera olmadi. Birozdan so'ng qayta urinib ko'ring."),
  });

  useEffect(() => {
    if (!session || session.explanation) return;
    if (phase === "explaining" && !explainMutation.isPending && !error) explainMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-trigger when identity/explanation presence changes
  }, [session?.id, session?.explanation, phase, error]);

  const showingPrePlay = phase !== "playing" && phase !== "done";

  const gameQuery = useQuery({
    queryKey: ["remedial", id, "game"],
    queryFn: async () => (await api.get<RemedialGameQuestion[]>(`/remedial-sessions/${id}/game/`)).data,
    enabled: phase === "playing",
    // AI generation can legitimately fail (provider overloaded) — fail fast with a
    // retry button instead of silently retrying (which can otherwise get stuck
    // paused if the browser's online/offline detection blips mid-retry).
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: async (finalAnswers: Record<number, number>) =>
      (
        await api.post<RemedialSession>(`/remedial-sessions/${id}/submit/`, {
          answers: Object.entries(finalAnswers).map(([question_index, selected_index]) => ({
            question_index: Number(question_index),
            selected_index,
          })),
        })
      ).data,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      setPhase("done");
      // Animate the rope from center to its final resting spot on the next tick,
      // so the CSS transition on RopeTrack actually has something to animate from.
      setTimeout(() => setRopePosition(100 - (result.score_percent ?? 0)), 50);
    },
  });

  if (!session) return <LoadingState />;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles className="text-violet-600 dark:text-violet-400" size={20} />
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">{session.subject_name} — mashq</h1>
      </div>

      {showingPrePlay && !session.explanation && (
        <div className="card p-8 text-center">
          {error ? (
            <>
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              <PrimaryButton className="mt-3" onClick={() => explainMutation.mutate()}>
                Qayta urinish
              </PrimaryButton>
            </>
          ) : (
            <LoadingState label="AI mavzuni tushuntirmoqda..." />
          )}
        </div>
      )}

      {showingPrePlay && session.explanation && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-5 dark:border-violet-500/30 dark:bg-violet-500/10">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white">
              <Bot size={18} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                AI Ustoz
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{session.explanation}</p>
            </div>
          </div>
          <PrimaryButton className="w-full" onClick={() => setPhase("playing")}>
            Arqon tortish o'yinini boshlash
          </PrimaryButton>
        </div>
      )}

      {phase === "playing" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between text-sm font-medium text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1">
              <User size={15} /> Siz
            </span>
            <span>
              {Math.min(questionIndex + 1, gameQuery.data?.length ?? 1)} / {gameQuery.data?.length ?? "…"}
            </span>
            <span className="flex items-center gap-1">
              AI <Bot size={15} />
            </span>
          </div>
          <RopeTrack position={50} />

          {gameQuery.isLoading && <LoadingState label="O'yin tayyorlanmoqda..." />}
          {gameQuery.isError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center dark:border-red-500/30 dark:bg-red-500/10">
              <p className="text-sm text-red-700 dark:text-red-300">
                AI hozircha javob bera olmadi. Birozdan so'ng qayta urinib ko'ring.
              </p>
              <PrimaryButton className="mt-3" onClick={() => gameQuery.refetch()}>
                Qayta urinish
              </PrimaryButton>
            </div>
          )}
          {gameQuery.data?.[questionIndex] && (
            <div className="card p-5">
              <p className="font-medium text-slate-900 dark:text-slate-50">{gameQuery.data[questionIndex].text}</p>
              <div className="mt-3 space-y-2">
                {gameQuery.data[questionIndex].options.map((option, optionIndex) => (
                  <button
                    key={option}
                    onClick={() => {
                      const questions = gameQuery.data!;
                      const isLast = questionIndex === questions.length - 1;
                      const nextAnswers = { ...answers, [questionIndex]: optionIndex };
                      setAnswers(nextAnswers);
                      if (isLast) {
                        submitMutation.mutate(nextAnswers);
                      } else {
                        setQuestionIndex((i) => i + 1);
                      }
                    }}
                    className="flex w-full items-center rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:border-brand-500 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-brand-500/10"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}
          {submitMutation.isPending && <LoadingState label="Natija hisoblanmoqda..." />}
        </div>
      )}

      {phase === "done" && submitMutation.data && (
        <RemedialResult session={submitMutation.data} ropePosition={ropePosition} />
      )}
    </div>
  );
}

function RemedialResult({ session, ropePosition }: { session: RemedialSession; ropePosition: number }) {
  const won = (session.score_percent ?? 0) >= 50;
  const toneClass = won
    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
    : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60";
  const textToneClass = won ? "text-emerald-700 dark:text-emerald-400" : "text-slate-700 dark:text-slate-200";

  return (
    <div className="space-y-4 text-center">
      <RopeTrack position={ropePosition} />
      <div className={`rounded-2xl border p-8 ${toneClass}`}>
        <Trophy className={`mx-auto h-8 w-8 ${textToneClass}`} />
        <p className={`mt-2 text-lg font-bold ${textToneClass}`}>
          {won ? "Ajoyib! Arqonni o'zingizga tortdingiz!" : "Yaxshi urinish — yana mashq qiling!"}
        </p>
        <p className={`mt-1 text-sm ${textToneClass}`}>
          Natija: {session.score_percent?.toFixed(0)}%{session.xp_awarded ? ` · +${session.xp_awarded} XP` : ""}
        </p>
      </div>
      <Link
        to={session.source === "GAME" ? "/student/games" : "/student/tests"}
        className="inline-flex items-center gap-0.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        <ChevronLeft className="h-4 w-4" />{" "}
        {session.source === "GAME" ? "O'yinlar ro'yxatiga qaytish" : "Testlar ro'yxatiga qaytish"}
      </Link>
    </div>
  );
}
