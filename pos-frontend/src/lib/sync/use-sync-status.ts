"use client";

import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/db";
import { syncManager } from "./index";

export interface SyncStatusSummary {
  pendingCount: number;
  conflictCount: number;
  lastSyncedAt: number | null;
  triggerSync: () => Promise<void>;
}


export function useSyncStatus(): SyncStatusSummary {
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  useEffect(() => {
    const countsSubscription = liveQuery(async () => {
      const [pending, syncing, error, conflict] = await Promise.all([
        db.pendingOrders.where("sync_status").equals("pending").count(),
        db.pendingOrders.where("sync_status").equals("syncing").count(),
        db.pendingOrders.where("sync_status").equals("error").count(),
        db.pendingOrders.where("sync_status").equals("conflict").count(),
      ]);
      return { pendingCount: pending + syncing + error, conflictCount: conflict };
    }).subscribe({
      next: (counts) => {
        setPendingCount(counts.pendingCount);
        setConflictCount(counts.conflictCount);
      },
    });

    const lastSyncedSubscription = liveQuery(() =>
      db.syncMeta.get("last_synced_at"),
    ).subscribe({
      next: (record) => {
        setLastSyncedAt(typeof record?.value === "number" ? record.value : null);
      },
    });

    return () => {
      countsSubscription.unsubscribe();
      lastSyncedSubscription.unsubscribe();
    };
  }, []);

  const triggerSync = () => syncManager.triggerSync();

  return { pendingCount, conflictCount, lastSyncedAt, triggerSync };
}
