import { Navigate } from "react-router-dom";

import { SchoolTimeLockScreen } from "../components/SchoolTimeLockScreen";
import { LoadingState } from "../components/states";
import { useAuth } from "../lib/auth";
import type { Role } from "../types";

export function ProtectedRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: Role[];
  children: React.ReactNode;
}) {
  const { user, isLoading, isAuthenticated, schoolLockMessage } = useAuth();

  if (schoolLockMessage) {
    return <SchoolTimeLockScreen message={schoolLockMessage} />;
  }

  if (isLoading) {
    return <LoadingState label="Tekshirilmoqda..." />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
