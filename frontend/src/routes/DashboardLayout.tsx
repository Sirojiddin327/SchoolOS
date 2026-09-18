import type { LucideIcon } from "lucide-react";
import { Bell, Flame, LogOut, Menu, Trophy, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { Avatar } from "../components/Avatar";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../lib/auth";
import { useStudentTopStats } from "../lib/useStudentTopStats";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** True for the dashboard/index link, so it isn't "active" on every sub-page too. */
  end?: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  DIRECTOR: "Direktor",
  TEACHER: "O'qituvchi",
  STUDENT: "O'quvchi",
};

function SidebarContent({ navItems, brand, onNavigate }: { navItems: NavItem[]; brand: string; onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const displayName = user ? `${user.first_name || user.username} ${user.last_name || ""}`.trim() : "";

  return (
    <>
      <div className="border-b border-slate-200 px-6 py-5 dark:border-slate-800">
        <p className="text-lg font-bold text-brand-700 dark:text-brand-400">SchoolOS</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{brand}</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              }`
            }
          >
            <item.icon size={17} className="shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Avatar name={displayName || "?"} src={user?.avatar_url} size={36} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{displayName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{user && ROLE_LABEL[user.role]}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <LogOut size={15} />
          Chiqish
        </button>
      </div>
    </>
  );
}

function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user } = useAuth();
  const stats = useStudentTopStats();
  const notificationsPath = user ? `/${user.role.toLowerCase()}/notifications` : "/login";

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur md:px-6 dark:border-slate-800 dark:bg-slate-950/80">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          aria-label="Menyuni ochish"
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Menu size={20} />
        </button>
        <p className="text-lg font-bold text-brand-700 md:hidden dark:text-brand-400">SchoolOS</p>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {stats && (
          <div className="hidden items-center gap-2 sm:flex">
            <span className="flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
              {stats.level}-daraja
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
              <Flame size={14} />
              {stats.currentStreak}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              <Trophy size={14} />
              {stats.totalXp} XP
            </span>
          </div>
        )}
        <ThemeToggle />
        <NavLink
          to={notificationsPath}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Bildirishnomalar"
        >
          <Bell size={17} />
        </NavLink>
      </div>
    </header>
  );
}

export function DashboardLayout({
  navItems,
  brand,
  vibrant = false,
}: {
  navItems: NavItem[];
  brand: string;
  /** A livelier backdrop for the student experience — teacher/director stay neutral. */
  vibrant?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close the drawer whenever the route changes (covers back/forward nav too,
  // not just clicking a link — NavLink's own onClick wouldn't catch that).
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div
      className={`min-h-screen md:flex ${
        vibrant
          ? "bg-gradient-to-br from-brand-50 via-slate-50 to-amber-50 dark:from-slate-950 dark:via-slate-950 dark:to-violet-950/40"
          : "bg-slate-50 dark:bg-slate-950"
      }`}
    >
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Yopish"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-900/40 dark:bg-black/60"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-end px-3 pt-3">
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Yopish"
                className="rounded-md p-2 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>
            <SidebarContent navItems={navItems} brand={brand} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex dark:border-slate-800 dark:bg-slate-900">
        <SidebarContent navItems={navItems} brand={brand} />
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <TopBar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
