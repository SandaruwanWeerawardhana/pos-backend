"use client";

import { useOfflineStatus } from "@/lib/hooks/use-offline-status";

export function OfflineBanner() {
  const { online } = useOfflineStatus();

  if (online) return null;

  return (
    <div className="animate-fade-in-up bg-red-100 px-4 py-1.5 text-center text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
      Offline — sales are saved locally and will sync when you&apos;re back online.
    </div>
  );
}
