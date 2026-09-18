import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../lib/auth";

interface NavItem {
  to: string;
  label: string;
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

  return (
    <>
      <div className="border-b border-slate-200 px-6 py-5">
        <p className="text-lg font-bold text-brand-700">SchoolOS</p>
        <p className="text-xs text-slate-500">{brand}</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-4">
        <p className="truncate text-sm font-medium text-slate-800">
          {user?.first_name || user?.username}
        </p>
        <p className="text-xs text-slate-500">{user && ROLE_LABEL[user.role]}</p>
        <button
          onClick={logout}
          className="mt-3 w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          Chiqish
        </button>
      </div>
    </>
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
          ? "bg-gradient-to-br from-brand-50 via-slate-50 to-amber-50"
          : "bg-slate-50"
      }`}
    >
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <p className="text-lg font-bold text-brand-700">SchoolOS</p>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Menyuni ochish"
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Yopish"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <SidebarContent navItems={navItems} brand={brand} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <SidebarContent navItems={navItems} brand={brand} />
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
