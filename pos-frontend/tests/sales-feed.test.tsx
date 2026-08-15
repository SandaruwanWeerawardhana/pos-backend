import { renderHook, waitFor } from "@testing-library/react";
import { db } from "@/lib/db";
import { mockApi } from "@/lib/api/mock";
import { useConnectionStore } from "@/lib/store/connection";
import { useSalesFeed } from "@/lib/hooks/use-sales-feed";
import type { OrderPage, PendingOrder, ServerOrder } from "@/lib/types";

function makeLocalOrder(
  id: string,
  overrides: Partial<PendingOrder> = {},
): PendingOrder {
  return {
    client_generated_id: id,
    items: [
      {
        product_id: "p_espresso",
        name: "Espresso",
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
    receipt_no: `R-${id}`,
    ...overrides,
  };
}

function makeServerOrder(
  id: string,
  overrides: Partial<ServerOrder> = {},
): ServerOrder {
  return {
    id: `srv_${id}`,
    client_generated_id: id,
    receipt_no: `R-${id}`,
    payment_method: "card",
    subtotal_cents: 300,
    discount_cents: 0,
    tax_total_cents: 24,
    total_cents: 324,
    refunded: false,
    totals_mismatch: false,
    sold_at: Date.now() - 86_400_000,
    synced_at: Date.now(),
    items: [
      {
        product_id: "p_latte",
        name: "Latte",
        quantity: 1,
        unit_price_cents: 300,
        tax_rate: 0.08,
        line_discount_cents: 0,
      },
    ],
    payments: [],
    ...overrides,
  };
}

function page(orders: ServerOrder[], total = orders.length): OrderPage {
  return {
    orders,
    meta: {
      page: 1,
      per_page: 25,
      total,
      total_pages: Math.max(1, Math.ceil(total / 25)),
      has_next: total > 25,
      has_prev: false,
    },
  };
}

beforeEach(async () => {
  await db.pendingOrders.clear();
  useConnectionStore.setState({ online: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSalesFeed", () => {
  it("reads the sales list from the backend", async () => {
    const getOrders = vi
      .spyOn(mockApi, "getOrders")
      .mockResolvedValue(page([makeServerOrder("remote-1")]));

    const { result } = renderHook(() => useSalesFeed({}));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getOrders).toHaveBeenCalled();
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].source).toBe("server");
    expect(result.current.rows[0].server_id).toBe("srv_remote-1");
    expect(result.current.meta?.total).toBe(1);
  });

  it("overlays local orders the server has not stored yet", async () => {
    await db.pendingOrders.add(makeLocalOrder("local-only"));
    vi.spyOn(mockApi, "getOrders").mockResolvedValue(
      page([makeServerOrder("remote-1")]),
    );

    const { result } = renderHook(() => useSalesFeed({}));

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    /* Unsynced first: they are the newest sales on this device. */
    expect(result.current.rows[0].client_generated_id).toBe("local-only");
    expect(result.current.rows[0].source).toBe("local");
    expect(result.current.rows[0].sync_status).toBe("pending");
    expect(result.current.rows[1].source).toBe("server");
  });

  it("does not show a sale twice once the server holds it", async () => {
    /*
     * Still marked "syncing" locally — the response was lost in flight — while
     * the server has already stored it.
     */
    await db.pendingOrders.add(
      makeLocalOrder("both-sides", { sync_status: "syncing" }),
    );
    vi.spyOn(mockApi, "getOrders").mockResolvedValue(
      page([makeServerOrder("both-sides")]),
    );

    const { result } = renderHook(() => useSalesFeed({}));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toHaveLength(1);
    /* The server's copy wins: it is the authority on what was stored. */
    expect(result.current.rows[0].source).toBe("server");
    expect(result.current.rows[0].sync_status).toBe("synced");
  });

  it("falls back to the full local list when the server is unreachable", async () => {
    useConnectionStore.setState({ online: false });
    await db.pendingOrders.bulkAdd([
      makeLocalOrder("synced-local", { sync_status: "synced" }),
      makeLocalOrder("pending-local"),
    ]);
    vi.spyOn(mockApi, "getOrders").mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useSalesFeed({}));

    await waitFor(() => expect(result.current.loading).toBe(false));
    /* Synced local rows included: offline, they are the only history there is. */
    expect(result.current.rows).toHaveLength(2);
    expect(result.current.offline).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("reports a server rejection as an error, not as being offline", async () => {
    vi.spyOn(mockApi, "getOrders").mockRejectedValue(new Error("invalid sort field"));

    const { result } = renderHook(() => useSalesFeed({}));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.offline).toBe(false);
    expect(result.current.error).toBe("invalid sort field");
  });

  it("forwards filters to the backend", async () => {
    const getOrders = vi.spyOn(mockApi, "getOrders").mockResolvedValue(page([]));

    renderHook(() =>
      useSalesFeed({ search: "  R-42 ", paymentMethod: "card", page: 2, perPage: 25 }),
    );

    await waitFor(() => expect(getOrders).toHaveBeenCalled());
    expect(getOrders).toHaveBeenCalledWith({
      search: "R-42",
      payment_method: "card",
      page: 2,
      per_page: 25,
    });
  });

  it("applies the same filters to the local overlay", async () => {
    await db.pendingOrders.bulkAdd([
      makeLocalOrder("cash-sale", { payment_method: "cash" }),
      makeLocalOrder("card-sale", { payment_method: "card" }),
    ]);
    vi.spyOn(mockApi, "getOrders").mockResolvedValue(page([]));

    const { result } = renderHook(() => useSalesFeed({ paymentMethod: "card" }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows.map((row) => row.client_generated_id)).toEqual([
      "card-sale",
    ]);
  });

  it("skips the request entirely for an unsynced-only status filter", async () => {
    await db.pendingOrders.add(makeLocalOrder("conflicted", { sync_status: "conflict" }));
    const getOrders = vi.spyOn(mockApi, "getOrders").mockResolvedValue(page([]));

    const { result } = renderHook(() => useSalesFeed({ syncStatus: "conflict" }));

    /*
     * No fetch means `loading` is false from the first render, so wait on the
     * local subscription delivering instead.
     */
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    /* The server only holds synced sales, so there is nothing to ask it for. */
    expect(getOrders).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.rows[0].sync_status).toBe("conflict");
  });

  it("surfaces the server's totals_mismatch flag", async () => {
    vi.spyOn(mockApi, "getOrders").mockResolvedValue(
      page([makeServerOrder("mismatched", { totals_mismatch: true })]),
    );

    const { result } = renderHook(() => useSalesFeed({}));

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0].totals_mismatch).toBe(true);
  });
});

describe("mockApi.getOrders", () => {
  it("stores a synced order and pages it back", async () => {
    mockApi.setNextSyncResult(null);
    mockApi.setSyncDelay(0);
    const order = makeLocalOrder(`paged-${crypto.randomUUID()}`);

    await mockApi.syncOrders([order]);
    const result = await mockApi.getOrders({
      search: order.client_generated_id,
    });

    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].client_generated_id).toBe(order.client_generated_id);
    /* sold_at is the till's clock, not the server's receive time. */
    expect(result.orders[0].sold_at).toBe(order.created_at);
    expect(result.meta.per_page).toBe(20);
  });
});
