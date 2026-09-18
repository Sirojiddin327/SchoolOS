import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { CurrentUser } from "../types";
import { Avatar } from "./Avatar";
import { SecondaryButton } from "./form";

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export function AvatarUploader() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const displayName = user ? `${user.first_name || user.username} ${user.last_name || ""}`.trim() : "";

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("avatar", file);
      return (await api.post<CurrentUser>("/auth/avatar/", formData)).data;
    },
    onSuccess: (data) => queryClient.setQueryData(["me"], data),
    onError: () => setError("Rasm yuklashda xatolik. Boshqa rasm bilan urinib ko'ring."),
  });

  const remove = useMutation({
    mutationFn: async () => (await api.delete<CurrentUser>("/auth/avatar/")).data,
    onSuccess: (data) => queryClient.setQueryData(["me"], data),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > MAX_SIZE_BYTES) {
      setError("Rasm hajmi 5MB dan oshmasligi kerak.");
      return;
    }
    upload.mutate(file);
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={displayName || "?"} src={user?.avatar_url} size={64} />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <SecondaryButton
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={upload.isPending}
          >
            {upload.isPending ? "Yuklanmoqda..." : "Rasm yuklash"}
          </SecondaryButton>
          {user?.avatar_url && (
            <SecondaryButton type="button" onClick={() => remove.mutate()} disabled={remove.isPending}>
              O'chirish
            </SecondaryButton>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}
