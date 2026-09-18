import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { api } from "../lib/api";
import { Field, Input, PrimaryButton } from "./form";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const changePassword = useMutation({
    mutationFn: async () =>
      (
        await api.post("/auth/change-password/", {
          current_password: currentPassword,
          new_password: newPassword,
        })
      ).data,
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: Record<string, string[]> } })?.response?.data;
      if (data?.current_password) {
        setError("Joriy parol noto'g'ri.");
      } else if (data?.new_password) {
        setError(data.new_password[0] ?? "Yangi parol talablarga javob bermaydi.");
      } else {
        setError("Parolni o'zgartirishda xatolik yuz berdi.");
      }
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("Yangi parol kamida 8 belgidan iborat bo'lishi kerak.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Yangi parollar mos kelmadi.");
      return;
    }
    changePassword.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Joriy parol">
        <Input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </Field>
      <Field label="Yangi parol">
        <Input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </Field>
      <Field label="Yangi parolni tasdiqlang">
        <Input
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </Field>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {success && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Parol muvaffaqiyatli o'zgartirildi
        </p>
      )}
      <PrimaryButton type="submit" disabled={changePassword.isPending}>
        {changePassword.isPending ? "Saqlanmoqda..." : "Parolni o'zgartirish"}
      </PrimaryButton>
    </form>
  );
}
