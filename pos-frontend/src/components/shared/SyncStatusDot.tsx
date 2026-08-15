"use client";

import { useSyncStatus } from "@/lib/sync/use-sync-status";

export function SyncStatusDot() {
  const { pendingCount, conflictCount } = useSyncStatus();

  const state =
    conflictCount > 0 ? "conflict" : pendingCount > 0 ? "pending" : "synced";

  const dotClass = {
    conflict: "bg-amber-500",
    pending: "bg-zinc-400",
    synced: "bg-green-500",
  }[state];

  const label = {
    conflict: `${conflictCount} conflict${conflictCount === 1 ? "" : "s"}`,
    pending: `${pendingCount} pending`,
    synced: "Synced",
  }[state];

  /* Work still in flight gets an expanding halo; a settled "Synced" stays
     still so the till is not permanently blinking at the cashier. */
  const unsettled = state !== "synced";

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors duration-[var(--duration-base)] dark:text-zinc-400">
      <span className="relative inline-flex h-1.5 w-1.5">
        {unsettled && (
          <span
            aria-hidden
            className={`animate-pulse-ring absolute inset-0 rounded-full ${dotClass}`}
          />
        )}
        <span
          className={`relative h-1.5 w-1.5 rounded-full transition-colors duration-[var(--duration-base)] ${dotClass}`}
        />
      </span>
      {label}
    </span>
  );
}
