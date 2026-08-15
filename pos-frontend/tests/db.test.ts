import type { Product } from "@/lib/types";
import {
  addToCart,
  clearCart,
  createLocalOrder,
  db,
  getCartTotal,
  getDeviceId,
  getLastSyncedAt,
  removeFromCart,
  searchProducts,
  seedProducts,
  setLastSyncedAt,
  updateCartQuantity,
} from "@/lib/db";

const espresso: Product = {
  id: "p_espresso",
  name: "Espresso",
  sku: "COF-ESP",
  barcode: "1111111111",
  price_cents: 300,
  tax_rate: 0.08,
  stock_quantity: 10,
};

const latte: Product = {
  id: "p_latte",
  name: "Latte",
  sku: "COF-LAT",
  barcode: "2222222222",
  price_cents: 450,
  tax_rate: 0.08,
  stock_quantity: 5,
};

// Deliberately awkward price/rate so per-line vs per-unit tax rounding differ.
const muffin: Product = {
  id: "p_muffin",
  name: "Blueberry Muffin",
  sku: "BAK-MUF",
  barcode: "3333333333",
  price_cents: 333,
  tax_rate: 0.085,
  stock_quantity: 6,
};

beforeEach(async () => {
  await Promise.all([
    db.products.clear(),
    db.cartItems.clear(),
    db.pendingOrders.clear(),
    db.syncMeta.clear(),
  ]);
});

describe("seedProducts", () => {
  it("replaces the catalog rather than merging into it", async () => {
    await seedProducts([espresso, latte]);
    await seedProducts([latte]);

    const products = await db.products.toArray();
    expect(products.map((product) => product.id)).toEqual([latte.id]);
  });
});

describe("searchProducts", () => {
  beforeEach(async () => {
    await seedProducts([espresso, latte, muffin]);
  });

  it("returns the whole catalog for an empty or whitespace query", async () => {
    expect(await searchProducts("")).toHaveLength(3);
    expect(await searchProducts("   ")).toHaveLength(3);
  });

  it("matches name case-insensitively", async () => {
    const results = await searchProducts("eSpReSsO");
    expect(results.map((product) => product.id)).toEqual([espresso.id]);
  });

  it("matches on sku", async () => {
    const results = await searchProducts("cof-lat");
    expect(results.map((product) => product.id)).toEqual([latte.id]);
  });

  it("matches on barcode", async () => {
    const results = await searchProducts("3333333333");
    expect(results.map((product) => product.id)).toEqual([muffin.id]);
  });

  it("matches on a partial substring", async () => {
    const results = await searchProducts("COF-");
    expect(results.map((product) => product.id).sort()).toEqual(
      [espresso.id, latte.id].sort(),
    );
  });

  it("returns an empty array when nothing matches", async () => {
    expect(await searchProducts("no-such-product")).toEqual([]);
  });
});

describe("cart mutations", () => {
  it("adds a new line and snapshots price + tax rate from the product", async () => {
    await addToCart(espresso, 2);

    const items = await db.cartItems.toArray();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      product_id: espresso.id,
      name: espresso.name,
      quantity: 2,
      unit_price_cents: espresso.price_cents,
      tax_rate: espresso.tax_rate,
    });
  });

  it("increments the existing line instead of duplicating it", async () => {
    await addToCart(espresso, 2);
    await addToCart(espresso, 3);

    const items = await db.cartItems.toArray();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(5);
  });

  it("keeps the original snapshotted price when the product price later changes", async () => {
    await addToCart(espresso, 1);
    await addToCart({ ...espresso, price_cents: 999 }, 1);

    const items = await db.cartItems.toArray();
    expect(items).toHaveLength(1);
    expect(items[0].unit_price_cents).toBe(espresso.price_cents);
  });

  it("defaults the quantity to 1", async () => {
    await addToCart(espresso);

    const items = await db.cartItems.toArray();
    expect(items[0].quantity).toBe(1);
  });

  it("updates a line quantity", async () => {
    await addToCart(espresso, 1);
    const [item] = await db.cartItems.toArray();

    await updateCartQuantity(item.id!, 4);

    expect((await db.cartItems.get(item.id!))?.quantity).toBe(4);
  });

  it("deletes the line when the quantity drops to zero or below", async () => {
    await addToCart(espresso, 1);
    await addToCart(latte, 1);
    const items = await db.cartItems.toArray();

    await updateCartQuantity(items[0].id!, 0);
    await updateCartQuantity(items[1].id!, -3);

    expect(await db.cartItems.count()).toBe(0);
  });

  it("removes a single line and clears the whole cart", async () => {
    await addToCart(espresso, 1);
    await addToCart(latte, 1);
    const [first] = await db.cartItems.toArray();

    await removeFromCart(first.id!);
    expect(await db.cartItems.count()).toBe(1);

    await clearCart();
    expect(await db.cartItems.count()).toBe(0);
  });
});

describe("getCartTotal", () => {
  it("returns all zeros for an empty cart", async () => {
    expect(await getCartTotal()).toEqual({
      subtotal_cents: 0,
      tax_total_cents: 0,
      total_cents: 0,
    });
  });

  it("sums integer cents across lines with total = subtotal + tax", async () => {
    await addToCart(espresso, 2); // 600 subtotal, 48 tax
    await addToCart(latte, 1); // 450 subtotal, 36 tax

    const total = await getCartTotal();
    expect(total).toEqual({
      subtotal_cents: 1050,
      tax_total_cents: 84,
      total_cents: 1134,
    });
    expect(Number.isInteger(total.total_cents)).toBe(true);
  });

  it("rounds tax once per line, not per unit", async () => {
    await addToCart(muffin, 2);

    // 333 * 2 * 0.085 = 56.61 -> 57. Rounding per unit would give 28 * 2 = 56.
    const total = await getCartTotal();
    expect(total.subtotal_cents).toBe(666);
    expect(total.tax_total_cents).toBe(57);
    expect(total.total_cents).toBe(723);
  });

  it("charges no tax on a zero-rated product", async () => {
    await addToCart({ ...espresso, tax_rate: 0 }, 3);

    const total = await getCartTotal();
    expect(total.tax_total_cents).toBe(0);
    expect(total.total_cents).toBe(total.subtotal_cents);
  });
});

describe("createLocalOrder", () => {
  beforeEach(async () => {
    await seedProducts([espresso, latte, muffin]);
  });

  it("moves the cart into a pending order and clears the cart", async () => {
    await addToCart(espresso, 2);
    await addToCart(latte, 1);

    const order = await createLocalOrder("cash");

    expect(order.sync_status).toBe("pending");
    expect(order.server_id).toBeNull();
    expect(order.payment_method).toBe("cash");
    expect(order.total_cents).toBe(1134);
    expect(order.tax_total_cents).toBe(84);
    expect(order.items).toHaveLength(2);
    expect(order.client_generated_id).toEqual(expect.any(String));

    expect(await db.cartItems.count()).toBe(0);
    expect(await db.pendingOrders.get(order.client_generated_id)).toBeDefined();
  });

  it("optimistically deducts stock for each ordered line", async () => {
    await addToCart(espresso, 3);

    await createLocalOrder("card");

    expect((await db.products.get(espresso.id))?.stock_quantity).toBe(7);
    expect((await db.products.get(latte.id))?.stock_quantity).toBe(
      latte.stock_quantity,
    );
  });

  it("clamps stock at zero instead of going negative", async () => {
    await addToCart(latte, 7); // only 5 in stock

    await createLocalOrder("cash");

    expect((await db.products.get(latte.id))?.stock_quantity).toBe(0);
  });

  it("does not fail when a cart line references a product missing from the catalog", async () => {
    await addToCart({ ...espresso, id: "p_unknown" }, 1);

    const order = await createLocalOrder("other");

    expect(order.items).toHaveLength(1);
    expect(await db.cartItems.count()).toBe(0);
  });

  it("gives each order a distinct client_generated_id", async () => {
    await addToCart(espresso, 1);
    const first = await createLocalOrder("cash");
    await addToCart(espresso, 1);
    const second = await createLocalOrder("cash");

    expect(first.client_generated_id).not.toBe(second.client_generated_id);
  });
});

describe("syncMeta helpers", () => {
  it("generates a device id once and returns the same one afterwards", async () => {
    const first = await getDeviceId();
    const second = await getDeviceId();

    expect(first).toEqual(expect.any(String));
    expect(second).toBe(first);
  });

  it("round-trips lastSyncedAt and returns null when unset", async () => {
    expect(await getLastSyncedAt()).toBeNull();

    await setLastSyncedAt(1_700_000_000_000);
    expect(await getLastSyncedAt()).toBe(1_700_000_000_000);
  });

  it("returns null when lastSyncedAt holds a non-numeric value", async () => {
    await db.syncMeta.put({ key: "last_synced_at", value: "not-a-number" });

    expect(await getLastSyncedAt()).toBeNull();
  });
});


