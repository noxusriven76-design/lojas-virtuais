import { http } from "../api/http";
import type { AuthUser } from "./auth.store";

type LoginResponse = {
  access_token: string;
  token_type: string;
};

export async function login(email: string, password: string, otpCode?: string): Promise<LoginResponse> {
  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);
  if (otpCode && otpCode.trim()) body.set("otp_code", otpCode.trim());

  const { data } = await http.post<LoginResponse>("/auth/login", body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return data;
}

export async function fetchMe(): Promise<AuthUser> {
  const { data } = await http.get<AuthUser>("/auth/me");
  return data;
}
