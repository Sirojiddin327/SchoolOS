export function LoadingState({ label = "Yuklanmoqda..." }: { label?: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-slate-500">
      <span className="animate-pulse">{label}</span>
    </div>
  );
}

export function ErrorState({ message = "Xatolik yuz berdi. Qayta urinib ko'ring." }: { message?: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 text-red-700">
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-center text-slate-500">
      <span className="text-sm font-medium">{title}</span>
      {description && <span className="text-xs">{description}</span>}
    </div>
  );
}

export function PermissionDeniedState() {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
      <span className="text-sm font-medium">Sizda bu bo'limni ko'rish huquqi yo'q</span>
    </div>
  );
}
