import { waitFor } from "@testing-library/react";
import {
  addToCart,
  createLocalOrder,
  db,
  getCartTotal,
  getInventoryReport,
  getSalesReport,
  getTodaysOrderSummary,
  presetToRange,
  saveStoreSettings,
  seedProducts,
} from "@/lib/db";
import { mockApi } from "@/lib/api/mock";
import { ApiError } from "@/lib/services/http-client";
import { SyncManager } from "@/lib/sync";
import type { PendingOrder, Product } from "@/lib/types";

/**
 * 899 c/kg is the price that made unrounded cart maths persist 410.843 into
 * IndexedDB; every test below that touches weighted money uses it.
 */
const chickenBreast: Product = {
  id: "p_chicken",
  name: "Chicken Breast",
  sku: "MET-CHB",
  barcode: "8901400000011",
  price_cents: 899,
  tax_rate: 0,
  stock_quantity: 27,
  unit: "kg",
  is_weighted: true,
};

const espresso: Product = {
  id: "p_espresso",
  name: "Espresso",
  sku: "COF-ESP",
  barcode: "1111111111",
  price_cents: 300,
  tax_rate: 0.08,
  stock_quantity: 10,
};

function makePendingOrder(id: string): PendingOrder {
  return {
    client_generated_id: id,
    items: [
      {
        product_id: espresso.id,
        name: espresso.name,
        quantity: 1,
        unit_price_cents: 300,
        tax_rate: 0.08,
      },
    ],
    total_cents: 324,
    tax_total_cents: 24,
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
    db.stockMovements.clear(),
    db.syncMeta.clear(),
    db.cashReconciliations.clear(),
  ]);
  mockApi.setNextSyncResult(null);
  mockApi.setSyncDelay(10);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("weighted-line money stays integer cents", () => {
  it("rounds the cart subtotal instead of carrying a fraction", async () => {
    await addToCart(chickenBreast, 0.457); /* 899 * 0.457 = 410.843 */

    const total = await getCartTotal();

    expect(total.subtotal_cents).toBe(411);
    expect(total.total_cents).toBe(411);
    expect(Number.isInteger(total.subtotal_cents)).toBe(true);
    expect(Number.isInteger(total.total_cents)).toBe(true);
  });

  it("clamps a discount against the rounded subtotal, as the server does", async () => {
    await addToCart(chickenBreast, 0.457); /* rounds to 411 */

    const total = await getCartTotal(411);

    expect(total.subtotal_cents).toBe(0);
    expect(total.total_cents).toBe(0);
  });

  it("persists an integer total onto the order", async () => {
    await seedProducts([chickenBreast]);
    await addToCart(chickenBreast, 0.457);

    const order = await createLocalOrder("cash");

    expect(Number.isInteger(order.total_cents)).toBe(true);
    expect(order.total_cents).toBe(411);
  });
});

describe("createLocalOrder guards", () => {
  it("refuses an empty cart rather than queueing an unsyncable order", async () => {
    await expect(createLocalOrder("cash")).rejects.toThrow(/empty cart/i);
    expect(await db.pendingOrders.count()).toBe(0);
  });
});

describe("SyncManager rejection handling", () => {
  it("parks a permanently rejected batch as conflict so the queue drains", async () => {
    await db.pendingOrders.add(makePendingOrder("bad-order"));
    vi.spyOn(mockApi, "syncOrders").mockRejectedValue(
      new ApiError("validation failed", 400),
    );

    const manager = new SyncManager();
    await manager.triggerSync();

    const order = await db.pendingOrders.get("bad-order");
    expect(order?.sync_status).toBe("conflict");
  });

  it("keeps a server-side failure retryable", async () => {
    await db.pendingOrders.add(makePendingOrder("transient-order"));
    vi.spyOn(mockApi, "syncOrders").mockRejectedValue(
      new ApiError("internal server error", 500),
    );

    const manager = new SyncManager();
    await manager.triggerSync();

    const order = await db.pendingOrders.get("transient-order");
    expect(order?.sync_status).toBe("error");
  });

  it("keeps an expired token retryable — a re-login fixes it", async () => {
    await db.pendingOrders.add(makePendingOrder("unauthorised-order"));
    vi.spyOn(mockApi, "syncOrders").mockRejectedValue(
      new ApiError("unauthorised", 401),
    );

    const manager = new SyncManager();
    await manager.triggerSync();

    const order = await db.pendingOrders.get("unauthorised-order");
    expect(order?.sync_status).toBe("error");
  });

  it("does not re-claim a conflicted order on the next cycle", async () => {
    await db.pendingOrders.add({
      ...makePendingOrder("parked-order"),
      sync_status: "conflict",
    });
    const syncOrders = vi.spyOn(mockApi, "syncOrders");

    const manager = new SyncManager();
    await manager.triggerSync();

    await waitFor(() => expect(syncOrders).not.toHaveBeenCalled());
  });
});

describe("refunded sales are excluded from takings", () => {
  it("leaves a refund out of the cash-drawer expectation", async () => {
    await db.pendingOrders.bulkAdd([
      makePendingOrder("kept"),
      { ...makePendingOrder("refunded"), refunded: true },
    ]);

    const summary = await getTodaysOrderSummary();

    expect(summary.orderCount).toBe(1);
    expect(summary.totalCents).toBe(324);
    expect(summary.byPaymentMethod.cash).toBe(324);
  });
});

describe("sales report day buckets", () => {
  it("buckets a sale by the till's own date, not the UTC date", async () => {
    /**
     * 23:30 local on whatever today is — a UTC key would move this to tomorrow
     * for any negative offset, and 00:30 local would move to yesterday for a
     * positive one. Either way it lands outside the "today" range that produced
     * it.
     */
    const lateTonight = new Date();
    lateTonight.setHours(23, 30, 0, 0);

    await db.pendingOrders.add({
      ...makePendingOrder("late-sale"),
      created_at: lateTonight.getTime(),
    });

    const rows = await getSalesReport(presetToRange("today"));
    const month = String(lateTonight.getMonth() + 1).padStart(2, "0");
    const day = String(lateTonight.getDate()).padStart(2, "0");

    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe(`${lateTonight.getFullYear()}-${month}-${day}`);
    expect(rows[0].orderCount).toBe(1);
  });
});

describe("low-stock threshold is consistent across screens", () => {
  it("classifies against the store setting, not a hard-coded 5", async () => {
    await saveStoreSettings({ low_stock_threshold: 20 });
    await seedProducts([{ ...espresso, stock_quantity: 10 }]);

    const [row] = await getInventoryReport();

    expect(row.reorderLevel).toBe(20);
    expect(row.status).toBe("low");
  });

  it("still lets a product's own reorder_level win", async () => {
    await saveStoreSettings({ low_stock_threshold: 20 });
    await seedProducts([
      { ...espresso, stock_quantity: 10, reorder_level: 3 },
    ]);

    const [row] = await getInventoryReport();

    expect(row.reorderLevel).toBe(3);
    expect(row.status).toBe("ok");
  });
});
