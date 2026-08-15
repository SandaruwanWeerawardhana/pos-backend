import { waitFor } from "@testing-library/react";
import { db, getLastSyncedAt } from "@/lib/db";
import { mockApi } from "@/lib/api/mock";
import type { PendingOrder } from "@/lib/types";
import { SyncManager } from "@/lib/sync";

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

describe("SyncManager.start", () => {
  it("releases orders orphaned in 'syncing' by a previous crashed run", async () => {
    await db.pendingOrders.add({
      ...makePendingOrder("orphan-1"),
      sync_status: "syncing",
    });

    const manager = new SyncManager();
    manager.start();
    try {
      await waitFor(async () => {
        const order = await db.pendingOrders.get("orphan-1");
        expect(order?.sync_status).toBe("synced");
      });
    } finally {
      manager.stop();
    }
  });

  it("is idempotent - a second start() does not add a second scheduler", async () => {
    await db.pendingOrders.add(makePendingOrder("double-start-1"));
    const syncOrdersSpy = vi.spyOn(mockApi, "syncOrders");

    const manager = new SyncManager();
    manager.start();
    manager.start();
    try {
      await waitFor(async () => {
        const order = await db.pendingOrders.get("double-start-1");
        expect(order?.sync_status).toBe("synced");
      });
      expect(syncOrdersSpy).toHaveBeenCalledTimes(1);
    } finally {
      manager.stop();
    }
  });

  it("stop() prevents any further sync work", async () => {
    const manager = new SyncManager();
    manager.start();
    manager.stop();

    const syncOrdersSpy = vi.spyOn(mockApi, "syncOrders");
    await db.pendingOrders.add(makePendingOrder("after-stop-1"));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(syncOrdersSpy).not.toHaveBeenCalled();
    expect((await db.pendingOrders.get("after-stop-1"))?.sync_status).toBe(
      "pending",
    );
  });
});

describe("SyncManager.syncOnce", () => {
  it("syncs pending orders and records server_id + lastSyncedAt", async () => {
    await db.pendingOrders.bulkAdd([
      makePendingOrder("success-1"),
      makePendingOrder("success-2"),
    ]);

    const manager = new SyncManager();
    await manager.syncOnce();

    const orders = await db.pendingOrders.toArray();
    expect(orders).toHaveLength(2);
    for (const order of orders) {
      expect(order.sync_status).toBe("synced");
      expect(order.server_id).toBe(`srv_${order.client_generated_id}`);
    }

    expect(await getLastSyncedAt()).not.toBeNull();
  });

  it("stamps lastSyncedAt on a healthy cycle even with no orders to push", async () => {
    const manager = new SyncManager();
    await manager.syncOnce();

    expect(await getLastSyncedAt()).not.toBeNull();
  });

  it("does not call the server when there is nothing to push", async () => {
    const syncOrdersSpy = vi.spyOn(mockApi, "syncOrders");

    await new SyncManager().syncOnce();

    expect(syncOrdersSpy).not.toHaveBeenCalled();
  });

  it("marks an order 'conflict' and keeps it for UI review when the server reports a conflict", async () => {
    await db.pendingOrders.add(makePendingOrder("conflict-1"));
    mockApi.setNextSyncResult("conflict");

    const manager = new SyncManager();
    await manager.syncOnce();

    const order = await db.pendingOrders.get("conflict-1");
    expect(order?.sync_status).toBe("conflict");
    expect(order?.server_id).toBeNull();
  });

  it("does not retry a conflicted order on the next cycle", async () => {
    await db.pendingOrders.add(makePendingOrder("conflict-sticky-1"));
    mockApi.setNextSyncResult("conflict");

    const manager = new SyncManager();
    await manager.syncOnce();

    const syncOrdersSpy = vi.spyOn(mockApi, "syncOrders");
    await manager.syncOnce();

    expect(syncOrdersSpy).not.toHaveBeenCalled();
    expect((await db.pendingOrders.get("conflict-sticky-1"))?.sync_status).toBe(
      "conflict",
    );
  });

  it("marks a forced error 'error' and retries it successfully on the next cycle", async () => {
    await db.pendingOrders.add(makePendingOrder("error-retry-1"));
    mockApi.setNextSyncResult("error");

    const manager = new SyncManager();
    await manager.syncOnce();

    let order = await db.pendingOrders.get("error-retry-1");
    expect(order?.sync_status).toBe("error");

    // Next cycle: no forced result this time, so the retry should succeed.
    await manager.syncOnce();

    order = await db.pendingOrders.get("error-retry-1");
    expect(order?.sync_status).toBe("synced");
    expect(order?.server_id).toBe("srv_error-retry-1");
  });

  it("releases the claim back to 'error' when the transport itself fails", async () => {
    await db.pendingOrders.add(makePendingOrder("transport-fail-1"));
    vi
      .spyOn(mockApi, "syncOrders")
      .mockRejectedValueOnce(new Error("network unreachable"));

    const manager = new SyncManager();
    await expect(manager.syncOnce()).resolves.toBeUndefined();

    // Not left stranded in "syncing", so the next cycle can pick it up again.
    expect((await db.pendingOrders.get("transport-fail-1"))?.sync_status).toBe(
      "error",
    );
    expect(await getLastSyncedAt()).toBeNull();
  });

  it("treats an 'already_synced' server response as synced", async () => {
    await db.pendingOrders.add(makePendingOrder("idempotent-1"));

    const manager = new SyncManager();
    await manager.syncOnce();

    // Force a resend of the same id; the mock now reports "already_synced".
    await db.pendingOrders.update("idempotent-1", { sync_status: "pending" });
    await manager.syncOnce();

    expect((await db.pendingOrders.get("idempotent-1"))?.sync_status).toBe(
      "synced",
    );
  });

  it("pushes at most maxBatchSize orders per cycle", async () => {
    await db.pendingOrders.bulkAdd(
      Array.from({ length: 5 }, (_, index) => makePendingOrder(`batch-${index}`)),
    );
    const syncOrdersSpy = vi.spyOn(mockApi, "syncOrders");

    const manager = new SyncManager(30_000, 300_000, 2);
    await manager.syncOnce();

    expect(syncOrdersSpy.mock.calls[0][0]).toHaveLength(2);
    expect(
      await db.pendingOrders.where("sync_status").equals("synced").count(),
    ).toBe(2);
    expect(
      await db.pendingOrders.where("sync_status").equals("pending").count(),
    ).toBe(3);
  });

  it("does not re-send orders already claimed 'syncing' by a concurrent run", async () => {
    const ids = ["dup-1", "dup-2", "dup-3"];
    await db.pendingOrders.bulkAdd(ids.map(makePendingOrder));

    const syncOrdersSpy = vi.spyOn(mockApi, "syncOrders");

    const managerA = new SyncManager();
    const managerB = new SyncManager();
    await Promise.all([managerA.syncOnce(), managerB.syncOnce()]);

    const sentIds = syncOrdersSpy.mock.calls.flatMap(([orders]) =>
      orders.map((order) => order.client_generated_id),
    );

    expect(new Set(sentIds).size).toBe(sentIds.length);
    expect([...sentIds].sort()).toEqual([...ids].sort());

    const orders = await db.pendingOrders.toArray();
    for (const order of orders) {
      expect(order.sync_status).toBe("synced");
    }
  });

  it("ignores a re-entrant syncOnce() while one is already in flight", async () => {
    await db.pendingOrders.add(makePendingOrder("reentrant-1"));
    const syncOrdersSpy = vi.spyOn(mockApi, "syncOrders");

    const manager = new SyncManager();
    await Promise.all([manager.syncOnce(), manager.syncOnce()]);

    expect(syncOrdersSpy).toHaveBeenCalledTimes(1);
  });

  it("refreshes the product cache, dropping products the server no longer returns", async () => {
    await db.products.add({
      id: "stale-product",
      name: "Discontinued",
      sku: "OLD-1",
      barcode: "000",
      price_cents: 500,
      tax_rate: 0,
      stock_quantity: 3,
    });

    await new SyncManager().syncOnce();

    expect(await db.products.get("stale-product")).toBeUndefined();
    expect(await db.products.count()).toBeGreaterThan(0);
  });

  it("still pushes orders when the product pull fails", async () => {
    await db.pendingOrders.add(makePendingOrder("pull-fails-1"));
    vi
      .spyOn(mockApi, "getProducts")
      .mockRejectedValueOnce(new Error("products endpoint down"));

    await new SyncManager().syncOnce();

    expect((await db.pendingOrders.get("pull-fails-1"))?.sync_status).toBe(
      "synced",
    );
    expect(await getLastSyncedAt()).not.toBeNull();
  });
});

