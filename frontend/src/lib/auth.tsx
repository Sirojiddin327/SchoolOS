import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useState } from "react";

import { api, login as apiLogin, logout as apiLogout, SchoolTimeLockedError, tokenStorage } from "./api";
import type { CurrentUser } from "../types";

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  schoolLockMessage: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [schoolLockMessage, setSchoolLockMessage] = useState<string | null>(null);

  const hasToken = Boolean(tokenStorage.getAccess());

  const { data: user, isLoading } = useQuery({
    queryKey: ["me"],
    enabled: hasToken,
    retry: false,
    queryFn: async () => {
      try {
        const { data } = await api.get<CurrentUser>("/auth/me/");
        setSchoolLockMessage(null);
        return data;
      } catch (error) {
        if (error instanceof SchoolTimeLockedError) {
          setSchoolLockMessage(error.detail);
        }
        throw error;
      }
    },
  });

  async function login(email: string, password: string) {
    await apiLogin(email, password);
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  }

  function logout() {
    apiLogout();
    queryClient.setQueryData(["me"], null);
    queryClient.clear();
  }

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading: hasToken && isLoading,
        isAuthenticated: Boolean(user),
        schoolLockMessage,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
