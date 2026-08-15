"use client";

import { useAuthStore } from "@/lib/store/auth";

export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const staff = useAuthStore((state) => state.staff);
  const token = useAuthStore((state) => state.token);
  const expiresAt = useAuthStore((state) => state.expiresAt);
  const login = useAuthStore((state) => state.login);
  const loginStaff = useAuthStore((state) => state.loginStaff);
  const register = useAuthStore((state) => state.register);
  const logout = useAuthStore((state) => state.logout);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const changePassword = useAuthStore((state) => state.changePassword);

  return {
    user,
    staff,
    token,
    expiresAt,
    isAuthenticated: Boolean(token),
    /** Till-only session: the back office must stay out of reach. */
    posOnly: staff?.posOnly ?? false,
    login,
    loginStaff,
    register,
    logout,
    updateProfile,
    changePassword,
  };
}
