import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../lib/auth";

interface NavItem {
  to: string;
  label: string;
}

const ROLE_LABEL: Record<string, string> = {
  DIRECTOR: "Direktor",
  TEACHER: "O'qituvchi",
  STUDENT: "O'quvchi",
};

export function DashboardLayout({ navItems, brand }: { navItems: NavItem[]; brand: string }) {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-lg font-bold text-brand-700">SchoolOS</p>
          <p className="text-xs text-slate-500">{brand}</p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
