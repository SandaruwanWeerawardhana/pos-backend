"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store/auth";
import { ROUTES } from "@/lib/types/routes";

export function RequireOffice({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const posOnly = useAuthStore((state) => state.staff?.posOnly ?? false);

  useEffect(() => {
    if (posOnly) router.replace(ROUTES.pos.root);
  }, [posOnly, router]);

  if (posOnly) return null;
  return <>{children}</>;
}
