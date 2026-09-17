import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { EmptyState, ErrorState, LoadingState } from "../components/states";
import { api } from "../lib/api";
import type { NotificationItem, Paginated } from "../types";

export function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get<Paginated<NotificationItem>>("/notifications/")).data,
  });

  const markRead = useMutation({
    mutationFn: async (id: number) => api.patch(`/notifications/${id}/mark-read/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Bildirishnomalar</h1>

      {isLoading && <LoadingState />}
      {isError && <ErrorState />}
      {data && data.results.length === 0 && <EmptyState title="Bildirishnomalar yo'q" />}

      {data && data.results.length > 0 && (
        <div className="space-y-3">
          {data.results.map((notification) => (
            <div
              key={notification.id}
              className={`rounded-xl border p-4 ${
                notification.is_read
                  ? "border-slate-200 bg-white"
                  : "border-brand-200 bg-brand-50"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-900">{notification.title}</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
                    {notification.body}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    {new Date(notification.created_at).toLocaleString("uz-UZ")}
                  </p>
                </div>
                {!notification.is_read && (
                  <button
                    onClick={() => markRead.mutate(notification.id)}
                    className="shrink-0 text-sm font-medium text-brand-600 hover:underline"
                  >
                    O'qildi deb belgilash
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
