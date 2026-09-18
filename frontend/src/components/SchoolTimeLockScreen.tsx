import { Lock } from "lucide-react";

export function SchoolTimeLockScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 px-6 text-center text-white">
      <Lock className="h-16 w-16 text-slate-400" strokeWidth={1.5} />
      <h1 className="text-2xl font-bold">HOZIR DARS VAQTI</h1>
      <p className="max-w-md text-slate-300">{message}</p>
    </div>
  );
}
