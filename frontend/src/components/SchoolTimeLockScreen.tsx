export function SchoolTimeLockScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 px-6 text-center text-white">
      <span className="text-6xl">🔒</span>
      <h1 className="text-2xl font-bold">HOZIR DARS VAQTI</h1>
      <p className="max-w-md text-slate-300">{message}</p>
    </div>
  );
}
