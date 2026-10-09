import axios from "axios";

const ACCESS_KEY = "schoolos.access";
const REFRESH_KEY = "schoolos.refresh";

export const tokenStorage = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: (access: string, refresh: string) => {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/** Thrown when the backend returns 423 (student trying to use the platform during school hours). */
export class SchoolTimeLockedError extends Error {
  constructor(public detail: string) {
    super(detail);
    this.name = "SchoolTimeLockedError";
  }
}

export const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const access = tokenStorage.getAccess();
  if (access) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});

let refreshInFlight: Promise<string | null> | null = null;

/** Bumped on logout so an in-flight token refresh started *before* the logout
 * cannot write new tokens back into storage after they were cleared (that
 * race resurrected a "logged out" session and silently signed the user in
 * again). */
let logoutGeneration = 0;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokenStorage.getRefresh();
  if (!refresh) return null;
  const generation = logoutGeneration;
  try {
    const { data } = await axios.post("/api/auth/refresh/", { refresh });
    if (generation !== logoutGeneration) return null;
    tokenStorage.set(data.access, data.refresh ?? refresh);
    return data.access as string;
  } catch (error) {
    // Only a rejected token (401/400) means the session is over. A network
    // blip or a 5xx must NOT clear the tokens — clearing them here is what
    // turned a transient failure into a forced logout.
    if (statusOf(error) === 401 || statusOf(error) === 400) {
      tokenStorage.clear();
    }
    return null;
  }
}

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 423) {
      return Promise.reject(new SchoolTimeLockedError(error.response.data?.detail ?? "Locked"));
    }

    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      refreshInFlight ??= refreshAccessToken();
      const newAccess = await refreshInFlight;
      refreshInFlight = null;
      if (newAccess) {
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      }
    }

    return Promise.reject(error);
  },
);

export async function login(email: string, password: string) {
  const { data } = await axios.post("/api/auth/login/", { email, password });
  tokenStorage.set(data.access, data.refresh);
}

export async function logout() {
  logoutGeneration += 1;
  const refresh = tokenStorage.getRefresh();
  tokenStorage.clear();
  // Best-effort revocation: the refresh token dies server-side so a stolen
  // one cannot be replayed for its full 14-day lifetime.
  if (refresh) {
    axios.post("/api/auth/logout/", { refresh }).catch(() => {});
  }
}
