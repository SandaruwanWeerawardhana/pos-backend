"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isSessionExpired, useAuthStore } from "@/lib/store/auth";
import { ROUTES } from "@/lib/types/routes";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  SIDEBAR_CONTENT_OFFSET_CLASS,
  SIDEBAR_WIDTH_CLASS,
} from "@/lib/layout";

function subscribeAuthHydration(onStoreChange: () => void) {
  return useAuthStore.persist?.onFinishHydration(onStoreChange) ?? (() => {});
}

function getAuthHydrationSnapshot() {
  return useAuthStore.persist?.hasHydrated?.() ?? true;
}

// How often the guard re-checks the token's expiry while a session is open.
const EXPIRY_CHECK_INTERVAL_MS = 30_000;

// Client-side route guard. Auth is persisted to localStorage via Zustand, so a
// server middleware can't see it — this waits for persist rehydration, then
// redirects to /auth/login when no token is present. Rendering a skeleton until
// hydrated avoids a false redirect on first paint for already-authenticated users.
export function RequireAuth({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const expiresAt = useAuthStore((state) => state.expiresAt);
  const logout = useAuthStore((state) => state.logout);
  const hydrated = useSyncExternalStore(
    subscribeAuthHydration,
    getAuthHydrationSnapshot,
    () => false,
  );

  useEffect(() => {
    if (hydrated && !token) router.replace(ROUTES.auth.login);
  }, [hydrated, token, router]);

  // A session can expire while the tab sits open on a till nobody has touched
  // for hours. Polling the stored expiry ends it locally instead of leaving a
  // dead token in place until the next request happens to fail.
  useEffect(() => {
    if (!token) return;

    function checkExpiry() {
      if (isSessionExpired({ token, expiresAt })) {
        logout();
        router.replace(`${ROUTES.auth.login}?reason=expired`);
      }
    }

    checkExpiry();
    const timer = window.setInterval(checkExpiry, EXPIRY_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [token, expiresAt, logout, router]);

  if (!hydrated) {
    return (
      <output
        aria-label="Checking your session"
        className={`flex h-[calc(100dvh-3.5rem)] min-h-0 flex-1 overflow-hidden ${SIDEBAR_CONTENT_OFFSET_CLASS}`}
      >
        {/* Sidebar skeleton — hidden on mobile, mirrors the real sidebar width */}
        <aside className={`fixed bottom-0 left-0 top-0 z-[80] hidden h-dvh ${SIDEBAR_WIDTH_CLASS} flex-col border-r border-outline-variant bg-surface-container-lowest p-3 pt-14 md:flex dark:border-zinc-800 dark:bg-zinc-950`}>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </aside>

        {/* Content skeleton — matches loading.tsx structure */}
        <div className="min-w-0 flex-1 overflow-y-auto bg-surface p-4 sm:p-6 dark:bg-zinc-950">
          <div className="mx-auto flex max-w-6xl flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-56" />
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-10 w-full rounded-lg" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </output>
    );
  }

  if (!token) return null;
  return <>{children}</>;
}
