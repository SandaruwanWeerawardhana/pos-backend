import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/lib/db";
import { mockApi } from "@/lib/api/mock";
import type { PendingOrder } from "@/lib/types";
import { useSyncStatus } from "@/lib/sync/use-sync-status";
import { syncManager } from "@/lib/sync";

// Records every liveQuery unsubscribe handed to the hook so the cleanup test
// can assert both subscriptions are actually torn down on unmount.
const { unsubscribeSpies } = vi.hoisted(() => ({
  unsubscribeSpies: [] as ReturnType<typeof vi.fn>[],
}));

vi.mock("dexie", async (importOriginal) => {
  const actual = await importOriginal<typeof import("dexie")>();
  return {
    ...actual,
    liveQuery: ((querier: () => Promise<unknown>) => {
      const observable = actual.liveQuery(querier);
      return {
        ...observable,
        subscribe: (...args: Parameters<typeof observable.subscribe>) => {
          const subscription = observable.subscribe(...args);
          const unsubscribe = vi.fn(() => subscription.unsubscribe());
          unsubscribeSpies.push(unsubscribe);
          return { ...subscription, unsubscribe };
        },
      };
    }) as typeof actual.liveQuery,
  };
});

function makePendingOrder(id: string): PendingOrder {
  return {
    client_generated_id: id,
    items: [],
    total_cents: 1000,
    tax_total_cents: 80,
    payment_method: "cash",
    created_at: Date.now(),
    sync_status: "pending",
    server_id: null,
  };
}

beforeEach(async () => {
  await Promise.all([
    db.products.clear(),
    db.cartItems.clear(),
    db.pendingOrders.clear(),
    db.syncMeta.clear(),
  ]);
  mockApi.setNextSyncResult(null);
  mockApi.setSyncDelay(10);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSyncStatus", () => {
  it("starts at zero with no lastSyncedAt", async () => {
    const { result } = renderHook(() => useSyncStatus());

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(0);
    });
    expect(result.current.conflictCount).toBe(0);
    expect(result.current.lastSyncedAt).toBeNull();
  });

  it("counts pending, syncing, and error orders together as unsynced work", async () => {
    await db.pendingOrders.bulkAdd([
      { ...makePendingOrder("p-1"), sync_status: "pending" },
      { ...makePendingOrder("s-1"), sync_status: "syncing" },
      { ...makePendingOrder("e-1"), sync_status: "error" },
      { ...makePendingOrder("ok-1"), sync_status: "synced" },
    ]);

    const { result } = renderHook(() => useSyncStatus());

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(3);
    });
    expect(result.current.conflictCount).toBe(0);
  });

  it("reports conflicts separately from pending work", async () => {
    await db.pendingOrders.bulkAdd([
      { ...makePendingOrder("p-2"), sync_status: "pending" },
      { ...makePendingOrder("c-1"), sync_status: "conflict" },
      { ...makePendingOrder("c-2"), sync_status: "conflict" },
    ]);

    const { result } = renderHook(() => useSyncStatus());

    await waitFor(() => {
      expect(result.current.conflictCount).toBe(2);
    });
    expect(result.current.pendingCount).toBe(1);
  });

  it("reacts to orders written after the hook mounted", async () => {
    const { result } = renderHook(() => useSyncStatus());

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(0);
    });

    await act(async () => {
      await db.pendingOrders.add(makePendingOrder("live-1"));
    });

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(1);
    });
  });

  it("drops an order out of pendingCount once it is marked synced", async () => {
    await db.pendingOrders.add(makePendingOrder("live-2"));
    const { result } = renderHook(() => useSyncStatus());

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(1);
    });

    await act(async () => {
      await db.pendingOrders.update("live-2", { sync_status: "synced" });
    });

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(0);
    });
  });

  it("exposes lastSyncedAt from syncMeta and tracks later updates", async () => {
    await db.syncMeta.put({ key: "last_synced_at", value: 1_700_000_000_000 });
    const { result } = renderHook(() => useSyncStatus());

    await waitFor(() => {
      expect(result.current.lastSyncedAt).toBe(1_700_000_000_000);
    });

    await act(async () => {
      await db.syncMeta.put({ key: "last_synced_at", value: 1_800_000_000_000 });
    });

    await waitFor(() => {
      expect(result.current.lastSyncedAt).toBe(1_800_000_000_000);
    });
  });

  it("reports lastSyncedAt as null when the stored value is not a number", async () => {
    await db.syncMeta.put({ key: "last_synced_at", value: "corrupt" });
    const { result } = renderHook(() => useSyncStatus());

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(0);
    });
    expect(result.current.lastSyncedAt).toBeNull();
  });

  it("triggerSync() delegates to the shared syncManager", async () => {
    const triggerSpy = vi
      .spyOn(syncManager, "triggerSync")
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useSyncStatus());

    await act(async () => {
      await result.current.triggerSync();
    });

    expect(triggerSpy).toHaveBeenCalledTimes(1);
  });

  it("triggerSync() actually pushes pending orders end to end", async () => {
    await db.pendingOrders.add(makePendingOrder("trigger-1"));
    const { result } = renderHook(() => useSyncStatus());

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(1);
    });

    await act(async () => {
      await result.current.triggerSync();
    });

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(0);
    });
    expect((await db.pendingOrders.get("trigger-1"))?.sync_status).toBe("synced");
  });

  it("unsubscribes both liveQueries on unmount", async () => {
    unsubscribeSpies.length = 0;

    const { unmount } = renderHook(() => useSyncStatus());
    await waitFor(() => {
      expect(unsubscribeSpies).toHaveLength(2);
    });

    unmount();

    for (const unsubscribe of unsubscribeSpies) {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    }
  });
});

