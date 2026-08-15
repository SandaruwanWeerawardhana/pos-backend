import { httpClient, type HttpClient } from "./http-client";
import type { AuthUser, LoginResult, ProfileUpdate } from "@/lib/api/client";

export class AuthService {
  constructor(private readonly http: HttpClient) {}

  login(email: string, password: string): Promise<LoginResult> {
    return this.http.request<LoginResult>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
  }

  register(
    ownerName: string,
    businessName: string,
    email: string,
    password: string,
    businessType: string,
  ): Promise<LoginResult> {
    return this.http.request<LoginResult>("/auth/register", {
      method: "POST",
      body: { ownerName, businessName, email, password, businessType },
      auth: false,
    });
  }

  requestPasswordReset(email: string): Promise<{ devToken?: string }> {
    return this.http.request<{ devToken?: string }>(
      "/auth/password/reset-request",
      {
        method: "POST",
        body: { email },
        auth: false,
      },
    );
  }

  resetPassword(token: string, newPassword: string): Promise<void> {
    return this.http.request<void>("/auth/password/reset", {
      method: "POST",
      body: { token, newPassword },
      auth: false,
    });
  }

  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return this.http.request<void>("/auth/password/change", {
      method: "POST",
      body: { currentPassword, newPassword },
    });
  }

  updateProfile(update: ProfileUpdate): Promise<AuthUser> {
    return this.http.request<AuthUser>("/auth/profile", {
      method: "PATCH",
      body: update,
    });
  }
}

export const authService = new AuthService(httpClient);
