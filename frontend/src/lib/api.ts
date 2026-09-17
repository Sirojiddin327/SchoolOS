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

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokenStorage.getRefresh();
  if (!refresh) return null;
  try {
    const { data } = await axios.post("/api/auth/refresh/", { refresh });
    tokenStorage.set(data.access, refresh);
    return data.access as string;
  } catch {
    tokenStorage.clear();
    return null;
  }
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

export function logout() {
  tokenStorage.clear();
}
