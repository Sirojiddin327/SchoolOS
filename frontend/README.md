# SchoolOS Frontend

React + TypeScript + Vite + TailwindCSS SPA with three role-based dashboards
(Director, Teacher, Student).

## Stack

- Vite + React 18 + TypeScript
- React Router (role-based route guards)
- TanStack Query (server state, `/api/auth/me/` session check)
- Axios (JWT access/refresh handling, see `src/lib/api.ts`)
- Tailwind CSS

## Requirements

- Node.js 18+

## Setup

```bash
npm install
cp .env.example .env   # if/when frontend env vars are introduced
npm run dev
```

Dev server runs at `http://localhost:5173` and proxies `/api/*` requests to
`http://127.0.0.1:8000` (the Django backend) — see `vite.config.ts`.

## Structure

```
src/
├── components/   Reusable UI: state screens (loading/empty/error/permission-denied), StatCard, lock screen
├── lib/          api.ts (axios + JWT refresh), auth.tsx (AuthProvider/useAuth)
├── pages/        director/, teacher/, student/, LoginPage
├── routes/       DashboardLayout (sidebar shell), ProtectedRoute (role guard)
└── types/        Shared TypeScript types
```

## Auth flow

1. `LoginPage` posts to `/api/auth/login/`, stores `access`/`refresh` tokens in `localStorage`.
2. `AuthProvider` fetches `/api/auth/me/` to resolve the current user + role.
3. `ProtectedRoute` redirects to `/login` if unauthenticated, or blocks the route
   if the user's role isn't in `allowedRoles`.
4. A `423` response (student trying to use the platform during school hours) is
   turned into a `SchoolTimeLockedError` and rendered as a full-screen lock screen.

## Adding shadcn/ui

The current UI is hand-styled Tailwind. Once Node tooling is available locally, you can
layer in [shadcn/ui](https://ui.shadcn.com) components without changing the page structure:

```bash
npx shadcn@latest init
```
