import type { LucideIcon } from "lucide-react";
import { Bell, ChevronDown, Flame, LogOut, Menu, Trophy, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { Avatar } from "../components/Avatar";
import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../lib/auth";
import { publicName } from "../lib/names";
import { todayLabel } from "../lib/schoolTime";
import { useStudentTopStats } from "../lib/useStudentTopStats";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** True for the dashboard/index link, so it isn't "active" on every sub-page too. */
  end?: boolean;
}

/** A labeled, collapsible group of nav items. Omit `label` for the top-level
 * items (e.g. the dashboard link) that sit above every group. */
export interface NavGroup {
  label?: string;
  items: NavItem[];
}

const ROLE_LABEL: Record<string, string> = {
  DIRECTOR: "Direktor",
  TEACHER: "O'qituvchi",
  STUDENT: "O'quvchi",
};

/**
 * One nav row. Inactive rows are muted neutral text on hover; the active row
 * is the only place the sidebar spends colour — a soft brand wash, brand text,
 * and a 3px accent bar on the leading edge. That single accent is what makes
 * the sidebar feel deliberate rather than a list of blue links.
 */
function NavLinkRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) => `nav-item ${isActive ? "nav-item-active" : ""}`}
    >
      {({ isActive }) => (
        <>
          {isActive && <span aria-hidden className="nav-active-bar" />}
          <item.icon size={17} className="shrink-0" />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function NavSection({ group, onNavigate }: { group: NavGroup; onNavigate?: () => void }) {
  const [open, setOpen] = useState(true);

  if (!group.label) {
    return (
      <div className="space-y-1">
        {group.items.map((item) => (
          <NavLinkRow key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle transition-colors hover:text-ink-muted"
      >
        {group.label}
        <ChevronDown
          size={13}
          className={`transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          {group.items.map((item) => (
            <NavLinkRow key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarContent({
  navGroups,
  brand,
  onNavigate,
}: {
  navGroups: NavGroup[];
  brand: string;
  onNavigate?: () => void;
}) {
  const { user, logout } = useAuth();
  const displayName = publicName(user);

  return (
    <>
      <div className="flex h-16 shrink-0 items-center border-b border-line px-5">
        <Logo subtitle={brand} />
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {navGroups.map((group, i) => (
          <NavSection key={group.label ?? i} group={group} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar name={displayName || "?"} src={user?.avatar_url} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
            <p className="truncate text-xs text-ink-subtle">
              {user && ROLE_LABEL[user.role]}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted transition-colors duration-150 hover:border-line-strong hover:bg-surface-raised hover:text-rose-600 dark:hover:text-rose-400"
        >
          <LogOut size={15} />
          Chiqish
        </button>
      </div>
    </>
  );
}

/**
 * The top bar: identity on the left (or the drawer trigger on mobile), the
 * student's live XP/streak/level in the middle, and controls on the right.
 * The stat pills use violet / orange / amber because those *are* XP, streak
 * and level everywhere else in the app.
 */
function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user } = useAuth();
  const stats = useStudentTopStats();
  const notificationsPath = user ? `/${user.role.toLowerCase()}/notifications` : "/login";

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button onClick={onMenuClick} aria-label="Menyuni ochish" className="btn-icon md:hidden">
          <Menu size={20} />
        </button>
        <p className="truncate text-base font-bold tracking-tight text-ink md:hidden">SchoolOS</p>
        <p className="hidden text-sm text-ink-subtle md:block">{todayLabel()}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {stats ? (
          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="chip bg-violet-500/12 text-violet-700 dark:text-violet-300">
              {stats.level}-daraja
            </span>
            <span className="chip bg-orange-500/12 text-orange-700 dark:text-orange-300">
              <Flame size={13} />
              <span className="tabular">{stats.currentStreak}</span>
            </span>
            <span className="chip bg-amber-500/12 text-amber-700 dark:text-amber-300">
              <Trophy size={13} />
              <span className="tabular">{stats.totalXp}</span> XP
            </span>
          </div>
        ) : (
          <span className="chip bg-surface-raised text-ink-muted">{todayLabel()}</span>
        )}
        <ThemeToggle />
        <NavLink
          to={notificationsPath}
          className="btn-icon border border-line"
          aria-label="Bildirishnomalar"
        >
          <Bell size={17} />
        </NavLink>
      </div>
    </header>
  );
}

export function DashboardLayout({
  navGroups,
  brand,
  vibrant = false,
}: {
  navGroups: NavGroup[];
  brand: string;
  /** A livelier backdrop for the student experience — teacher/director stay neutral. */
  vibrant?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close the drawer whenever the route changes (covers back/forward nav too,
  // not just clicking a link — NavLink's own onClick wouldn't catch that).
  useEffect(() => {
    const timer = window.setTimeout(() => setMobileOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-canvas md:flex">
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Yopish"
            onClick={() => setMobileOpen(false)}
            className="animate-fade absolute inset-0 bg-slate-950/45 dark:bg-black/70"
          />
          <aside className="slide-left absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <Logo subtitle={brand} />
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Yopish"
                className="btn-icon"
              >
                <X size={18} />
              </button>
            </div>
            <SidebarContent
              navGroups={navGroups}
              brand={brand}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Desktop sidebar — a surface distinct from the page behind it, so the
          nav never competes with the content it frames. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <SidebarContent navGroups={navGroups} brand={brand} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenuClick={() => setMobileOpen(true)} />
        {/*
          The content plane sits one step above the page background in the
          student experience only (a whisper of brand at the very top), and
          the whole <Outlet/> is keyed by pathname so each route animates in
          once on navigation instead of re-animating on every re-render.
        */}
        <main
          key={location.pathname}
          className={`fade flex-1 p-4 md:p-6 lg:p-8 ${vibrant ? "shell-vibrant" : ""}`}
        >
          <div className="mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
