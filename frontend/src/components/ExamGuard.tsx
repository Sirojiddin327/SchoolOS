import { ShieldAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { useAuth } from "../lib/auth";

type GuardState = "ok" | "away" | "devtools";

/**
 * Anti-screenshot / anti-copy guard for exam-style screens (tests). A browser
 * can't stop a real OS screenshot, but this makes taken
 * screenshots useless: content is covered while the page loses focus or
 * DevTools are open, printing / selection / copy / context menus are blocked,
 * and every visible frame is stamped with the student's watermark so any
 * captured screenshot stays traceable to its author.
 */
export function ExamGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<GuardState>("ok");
  const [message, setMessage] = useState("");
  const [stamp, setStamp] = useState(() => stampText(user?.first_name || user?.username));

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = [
      ".exam-guard-root { user-select: none; -webkit-user-select: none; }",
      ".exam-guard-root ::selection { background: transparent; }",
      "@media print { .exam-guard-root { display: none !important; } }",
    ].join("\n");
    document.head.appendChild(style);

    const prevent = (e: Event) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ["c", "x", "p"].includes(key)) e.preventDefault();
      if (e.key === "F12" || e.key === "PrintScreen" || e.key === "ContextMenu") e.preventDefault();
    };
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("copy", prevent);
    document.addEventListener("cut", prevent);
    document.addEventListener("paste", prevent);
    document.addEventListener("keydown", onKeyDown);

    const goAway = () => {
      setMessage(
        "Imtihon oynasidan chiqib ketdingiz. Qaytguningizcha savollar ko'rinmaydi — screenshot va boshqa ilovaga o'tish kuzatiladi."
      );
      setState("away");
    };
    const comeBack = () => setState((s) => (s === "away" ? "ok" : s));
    const onVisibility = () => {
      if (document.visibilityState === "hidden") goAway();
      else comeBack();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", goAway);
    window.addEventListener("focus", comeBack);

    return () => {
      style.remove();
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("copy", prevent);
      document.removeEventListener("cut", prevent);
      document.removeEventListener("paste", prevent);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", goAway);
      window.removeEventListener("focus", comeBack);
    };
  }, []);

  // While DevTools are open, the debugger pauses the script and interval ticks
  // come late — that length of a pause is the tell we look for. Combined with
  // a window-size heuristic it still fires when DevTools are undocked.
  useEffect(() => {
    const check = () => {
      const start = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      if (performance.now() - start > 200) {
        setMessage("DevTools (F12) ochiq ekanini aniqlandi. Iltimos, yoping va davom eting.");
        setState("devtools");
        return;
      }
      const devtoolsOpen =
        window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160;
      if (devtoolsOpen) {
        setMessage("DevTools/screenshot vositalari ochiq. Iltimos, yoping va davom eting.");
        setState("devtools");
      }
    };
    const id = setInterval(check, 800);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setStamp(stampText(user?.first_name || user?.username)), 30_000);
    return () => clearInterval(id);
  }, [user?.first_name, user?.username]);

  const blocked = state !== "ok";

  return (
    <div className="exam-guard-root">
      {children}

      {!blocked && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
        >
          {[8, 38, 66].map((top) => (
            <div
              key={top}
              className="absolute left-1/2 -translate-x-1/2 -rotate-[18deg] whitespace-nowrap rounded-lg border border-slate-900/20 px-4 py-1 text-sm font-semibold text-slate-900/15 dark:border-white/20 dark:text-white/20"
              style={{ top: `${top}%` }}
            >
              {stamp}
            </div>
          ))}
        </div>
      )}

      {blocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-6 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 px-6 py-8 text-center">
            <ShieldAlert className="mx-auto h-14 w-14 text-amber-400" strokeWidth={1.5} />
            <h2 className="mt-4 text-xl font-bold text-white">IMTIHON REJIMI FAOL</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{message}</p>
            <button
              type="button"
              onClick={() => setState("ok")}
              className="mt-6 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500"
            >
              Davom etish
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function stampText(name: string | undefined): string {
  const who = (name || "Noma'lum o'quvchi").trim();
  const when = new Date().toLocaleString("uz-UZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return `${who} · SchoolOS · ${when}`;
}