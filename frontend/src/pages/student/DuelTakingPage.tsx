import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Clock, Hourglass, Swords, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import {
  GameInlineError,
  GameOptionButton,
  GameQuestionCard,
  GameResultScreen,
  GameStepProgress,
} from "../../components/games/GameUI";
import { PrimaryButton, SecondaryButton } from "../../components/form";
import { ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { DuelAnswerResult, DuelListItem, DuelPlayerInfo, DuelQuestionItem } from "../../types";

function DuelHeader({
  title,
  opponent,
  secondsLeft,
}: {
  title: string;
  opponent?: DuelPlayerInfo | null;
  secondsLeft?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
      <span className="font-semibold text-slate-800 dark:text-slate-100">{title}</span>
      <span className="flex items-center gap-2">
        {secondsLeft != null && (
          <span
            className={`flex items-center gap-1 font-medium ${
              secondsLeft <= 5 ? "text-rose-500" : "text-brand-600 dark:text-brand-400"
            }`}
          >
            <Clock size={14} /> {secondsLeft}s
          </span>
        )}
        {opponent && (
          <span className="flex items-center gap-1 font-medium">
            {opponent.is_ai ? <Bot size={14} /> : <Zap size={14} />} {opponent.archetype || opponent.name}
          </span>
        )}
      </span>
    </div>
  );
}

function serverSkewMs(serverNow: string): number {
  return new Date(serverNow).getTime() - Date.now();
}

function remainingMs(deadlineServerMs: number, skewMs: number, nowMs: number): number {
  return deadlineServerMs - skewMs - nowMs;
}

export function StudentDuelTakingPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: duel, isLoading, isError } = useQuery({
    queryKey: ["duel", id],
    queryFn: async () => (await api.get<DuelListItem>(`/duels/${id}/`)).data,
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data?.status === "ACTIVE" || query.state.data?.status === "COMPLETED" ? 3000 : false,
  });

  const [stepKey, setStepKey] = useState(0);
  const [answer, setAnswer] = useState<DuelAnswerResult | null>(null);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!duel || duel.status !== "ACTIVE") return;
    const timer = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(timer);
  }, [duel]);

  const matchActive = useMemo(() => {
    if (!duel || duel.status !== "ACTIVE" || !duel.match_starts_at) return false;
    return remainingMs(new Date(duel.match_starts_at).getTime(), serverSkewMs(duel.server_now), nowMs) <= 0;
  }, [duel, nowMs]);

  const questionQuery = useQuery({
    queryKey: ["duel", id, "question", stepKey],
    queryFn: async (): Promise<DuelQuestionItem & { offset_ms?: number }> => {
      const res = await api.get<DuelQuestionItem>(`/duels/${id}/question/`);
      if (res.data.done) return res.data;
      return { ...res.data, offset_ms: res.data.server_now_ms - Date.now() };
    },
    enabled: Boolean(id) && matchActive,
  });

  const finishedAll = questionQuery.data?.done === true;
  useEffect(() => {
    if (finishedAll) queryClient.invalidateQueries({ queryKey: ["duel", id] });
  }, [finishedAll, id, queryClient]);

  const question = questionQuery.data && !questionQuery.data.done ? questionQuery.data : null;

  const answerMutation = useMutation({
    mutationFn: async (selectedIndex: number) => {
      const res = await api.post<DuelAnswerResult & { duel: DuelListItem }>(`/duels/${id}/answer/`, {
        question_index: question?.index,
        selected_index: selectedIndex,
      });
      queryClient.setQueryData(["duel", id], res.data.duel);
      return res.data;
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: unknown } })?.response?.data;
      setAnswer({
        correct: false,
        timed_out: false,
        correct_index: chosenIndex ?? 0,
        explanation: typeof detail === "string" ? detail : "Javobni yuborishda xatolik.",
      });
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });

  useEffect(() => {
    if (!question || answer || submittingRef.current) return;
    if (remainingMs(question.opened_at_ms, question.offset_ms ?? 0, nowMs) <= 0) {
      submittingRef.current = true;
      answerMutation.mutate(-1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowMs, question, answer]);

  const submitAnswer = (selectedIndex: number) => {
    if (submittingRef.current || answer) return;
    submittingRef.current = true;
    setSubmitting(true);
    setChosenIndex(selectedIndex);
    answerMutation.mutate(selectedIndex, {
      onSuccess: (res) => {
        setAnswer({
          correct: res.correct,
          timed_out: res.timed_out,
          correct_index: res.correct_index,
          explanation: res.explanation,
          event: res.event,
        });
      },
      onSettled: () => setSubmitting(false),
    });
  };

  const readyMutation = useMutation({
    mutationFn: async () => (await api.post<DuelListItem>(`/duels/${id}/ready/`)).data,
    onSuccess: (next) => {
      setActionError(null);
      queryClient.setQueryData(["duel", id], next);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: unknown } })?.response?.data;
      setActionError(typeof detail === "string" ? detail : "Tayyorlashda xatolik yuz berdi.");
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (action: "accept" | "decline" | "cancel") =>
      (await api.post<DuelListItem>(`/duels/${id}/${action}/`)).data,
    onSuccess: (next) => {
      setActionError(null);
      queryClient.setQueryData(["duel", id], next);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: unknown } })?.response?.data;
      setActionError(typeof detail === "string" ? detail : "Amal bajarilmadi.");
    },
  });

  if (isLoading) return <LoadingState />;
  if (isError || !duel) return <ErrorState />;

  const opponent = duel.opponent_player;
  const opponentName = opponent?.name ?? "Raqib";

  if (duel.status === "PENDING" && duel.awaiting_my_response) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <DuelHeader title={`Duel · ${opponentName}`} opponent={opponent} />
        <GameQuestionCard>
          <p className="font-semibold text-slate-900 dark:text-slate-50">Duelga taklif qilindi!</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {opponentName} sizni duelga chaqirdi — {duel.question_count} ta savol. Qabul qilasizmi?
          </p>
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
            <PrimaryButton
              className="flex-1"
              onClick={() => inviteMutation.mutate("accept")}
              disabled={inviteMutation.isPending}
            >
              {inviteMutation.isPending ? "..." : "Qabul qilish"}
            </PrimaryButton>
            <SecondaryButton
              className="flex-1"
              onClick={() => inviteMutation.mutate("decline")}
              disabled={inviteMutation.isPending}
            >
              Rad etish
            </SecondaryButton>
          </div>
          {actionError && <GameInlineError>{actionError}</GameInlineError>}
        </GameQuestionCard>
      </div>
    );
  }

  if (duel.status === "PENDING") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <DuelHeader title={`Duel · ${opponentName}`} opponent={opponent} />
        <GameQuestionCard>
          <p className="font-semibold text-slate-900 dark:text-slate-50">Raqib javobini kutmoqda...</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Taklif {opponentName}ga yuborildi. U qabul qilgach duel avtomatik boshlanadi.
          </p>
          {actionError && <GameInlineError>{actionError}</GameInlineError>}
          <div className="mt-5">
            <SecondaryButton onClick={() => inviteMutation.mutate("cancel")} disabled={inviteMutation.isPending}>
              Bekor qilish
            </SecondaryButton>
          </div>
        </GameQuestionCard>
      </div>
    );
  }

  if (duel.status === "DECLINED" || duel.status === "CANCELLED" || duel.status === "EXPIRED") {
    return (
      <GameResultScreen
        tone="neutral"
        icon={Hourglass}
        title="Duel o'tmadi"
        subtitle={
          duel.status === "DECLINED"
            ? `${opponentName} taklifni rad etdi.`
            : duel.status === "CANCELLED"
              ? "Taklif bekor qilindi."
              : "Taklif muddati tugadi."
        }
        stats={[]}
        secondaryTo="/student/duels"
        secondaryLabel="Duellar ro'yxatiga qaytish"
      />
    );
  }

  if (duel.status === "COMPLETED") {
    return <DuelResult duel={duel} />;
  }

  if (duel.status !== "ACTIVE") {
    return <ErrorState />;
  }

  if (!duel.match_starts_at) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <DuelHeader title={`Duel · ${opponentName}`} opponent={opponent} />
        <GameQuestionCard>
          <p className="font-semibold text-slate-900 dark:text-slate-50">Tayyormisiz?</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {duel.question_count} ta savol, har biriga {duel.seconds_per_question} soniya. Ikkala taraf ham
            tayyor bo'lgach o'yin boshlanadi.
          </p>
          {actionError && <GameInlineError>{actionError}</GameInlineError>}
          <div className="mt-4 flex flex-col gap-2">
            <PrimaryButton onClick={() => readyMutation.mutate()} disabled={duel.i_am_ready || readyMutation.isPending}>
              {duel.i_am_ready ? "Tayyor — raqibni kutmoqda..." : "Tayyorman!"}
            </PrimaryButton>
            {duel.i_am_ready && !duel.opponent_ready && (
              <p className="text-xs text-slate-400 dark:text-slate-500">{opponentName} hali tayyor emas...</p>
            )}
          </div>
        </GameQuestionCard>
      </div>
    );
  }

  const startRemaining = remainingMs(new Date(duel.match_starts_at).getTime(), serverSkewMs(duel.server_now), nowMs);
  if (startRemaining > 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <DuelHeader title={`Duel · ${opponentName}`} opponent={opponent} />
        <GameQuestionCard>
          <p className="font-semibold text-slate-900 dark:text-slate-50">Duel boshlanmoqda...</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Ikkala taraf tayyor. Savollar {Math.max(1, Math.ceil(startRemaining / 1000))} soniyadan keyin keladi.
          </p>
        </GameQuestionCard>
      </div>
    );
  }

  if (finishedAll && duel.status === "ACTIVE") {
    return (
      <GameResultScreen
        tone="neutral"
        icon={Hourglass}
        title="Javobingiz qabul qilindi"
        subtitle={`${opponentName} hali javob bermadi — u tugatgach natija shu yerda chiqadi.`}
        stats={[]}
        secondaryTo="/student/duels"
        secondaryLabel="Duellar ro'yxatiga qaytish"
      />
    );
  }

  if (questionQuery.isLoading && !question) {
    return <LoadingState label="Savol yuklanmoqda..." />;
  }

  if (questionQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <DuelHeader title={`Duel · ${opponentName}`} opponent={opponent} />
        <GameInlineError>{"Savolni yuklashda xatolik yuz berdi."}</GameInlineError>
        <SecondaryButton onClick={() => setStepKey((k) => k + 1)}>Qayta urinish</SecondaryButton>
      </div>
    );
  }

  if (!question) {
    return <LoadingState label="Tayyorlanmoqda..." />;
  }

  const remaining = remainingMs(question.opened_at_ms, question.offset_ms ?? 0, nowMs);
  const secondsLeft = Math.max(0, Math.ceil(remaining / 1000));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <DuelHeader title={`Duel · ${opponentName}`} opponent={opponent} secondsLeft={Math.max(1, secondsLeft)} />
      <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <Clock size={13} /> {question.index + 1}/{duel.question_count}
        </span>
      </div>
      <GameStepProgress index={answer ? question.index + 1 : question.index} total={duel.question_count} />

      <GameQuestionCard>
        <p className="font-semibold text-slate-900 dark:text-slate-50">
          {question.index + 1}. {question.text}
        </p>
        <div className="mt-4 space-y-2.5">
          {question.options.map((optionText, optionIndex) => {
            const state = answer
              ? optionIndex === answer.correct_index
                ? "correct"
                : answer.correct === false && optionIndex === chosenIndex
                  ? "incorrect"
                  : "default"
              : "default";
            return (
              <GameOptionButton
                key={optionIndex}
                index={optionIndex}
                text={optionText}
                state={state}
                disabled={Boolean(answer) || submitting}
                onClick={() => submitAnswer(optionIndex)}
              />
            );
          })}
        </div>
        {answer && answer.explanation && (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {answer.explanation}
          </p>
        )}
      </GameQuestionCard>

      {answer && (
        <PrimaryButton
          className="w-full"
          onClick={() => {
            setAnswer(null);
            setChosenIndex(null);
            setStepKey((k) => k + 1);
          }}
        >
          {question.index + 1 >= duel.question_count ? "Natijani ko'rish" : "Keyingi savol"}
        </PrimaryButton>
      )}
      {submitting && <p className="text-center text-xs text-slate-400">Yuklanmoqda...</p>}
    </div>
  );
}

function DuelResult({ duel }: { duel: DuelListItem }) {
  const opponentName = duel.opponent_player?.name ?? "Raqib";
  const me = duel.battle?.me;
  const foe = duel.battle?.opponent;
  const myCorrect = me ? me.correct : 0;

  const isDraw = duel.outcome === "DRAW";
  const tone = isDraw ? "draw" : duel.outcome === "WIN" ? "win" : "lose";
  return (
    <GameResultScreen
      tone={tone}
      icon={Swords}
      title={isDraw ? "Durang!" : duel.outcome === "WIN" ? "G'alaba qozondingiz!" : "Bu safar omad yor bo'lmadi"}
      subtitle="Natijangiz asosida XP va duel reytingingiz avtomatik yangilandi."
      stats={[
        { label: "Siz", value: `${myCorrect}/${duel.question_count}` },
        { label: opponentName, value: `${foe ? foe.correct : 0}/${duel.question_count}` },
        ...(duel.my_xp != null ? [{ label: "XP", value: `+${duel.my_xp}`, tone: "amber" as const }] : []),
      ]}
      secondaryTo="/student/duels"
      secondaryLabel="Duellar ro'yxatiga qaytish"
    />
  );
}