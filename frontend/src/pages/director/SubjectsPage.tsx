import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Input, PrimaryButton } from "../../components/form";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "../../components/states";
import { api } from "../../lib/api";
import type { Paginated, Subject } from "../../types";

export function SubjectsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await api.get<Paginated<Subject>>("/subjects/")).data,
  });

  const createSubject = useMutation({
    mutationFn: async () => (await api.post("/subjects/", { name })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      setName("");
      setError(null);
    },
    onError: () => setError("Saqlashda xatolik. Bu fan allaqachon mavjud bo'lishi mumkin."),
  });

  const deleteSubject = useMutation({
    mutationFn: async (id: number) => api.delete(`/subjects/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subjects"] }),
  });

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader title="Fanlar" />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createSubject.mutate();
        }}
        className="flex gap-2"
      >
        <Input
          placeholder="Fan nomi, masalan: Matematika"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <PrimaryButton type="submit" disabled={createSubject.isPending}>
          Qo'shish
        </PrimaryButton>
      </form>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.results.length === 0 && <EmptyState title="Hali fan yo'q" />}

      {data && data.results.length > 0 && (
        <ul className="divide-y divide-line-soft">
          {data.results.map((subject) => (
            <li key={subject.id} className="flex items-center justify-between py-3">
              <span className="text-ink">{subject.name}</span>
              <button
                onClick={() => deleteSubject.mutate(subject.id)}
                className="text-sm text-red-600 hover:underline dark:text-red-400"
              >
                O'chirish
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
