"use client";

import { useConnectionStore } from "@/lib/store/connection";
import { useSyncStatus } from "@/lib/sync/use-sync-status";

export interface OfflineStatus {
  online: boolean;
  pendingCount: number;
  conflictCount: number;
}

export function useOfflineStatus(): OfflineStatus {
  const online = useConnectionStore((state) => state.online);
  const { pendingCount, conflictCount } = useSyncStatus();

  return { online, pendingCount, conflictCount };
}
