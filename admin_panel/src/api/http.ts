import axios, { AxiosError } from "axios";
import { authStore } from "../auth/auth.store";

export const http = axios.create({
  baseURL: "http://localhost:8000",
});

http.interceptors.request.use((config) => {
  const token = authStore.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      authStore.logout();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error: unknown, fallback = "Operacao falhou"): string {
  if (!error || typeof error !== "object") return fallback;
  const maybeAxios = error as AxiosError<{ detail?: string; error?: { message?: string } }>;
  const message = maybeAxios.response?.data?.error?.message ?? maybeAxios.response?.data?.detail;
  return typeof message === "string" && message.trim() ? message : fallback;
}
