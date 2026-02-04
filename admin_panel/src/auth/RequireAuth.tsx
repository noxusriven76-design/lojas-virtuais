import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { authStore } from "./auth.store";

type Props = {
  children: ReactNode;
};

export function RequireAuth({ children }: Props) {
  const token = authStore.getToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

