import type { Product } from "@/lib/types";
import {
  addToCart,
  createDiscount,
  createLocalOrder,
  createSupplier,
  db,
  getActiveDiscounts,
  getCartTotal,
  getTodaysOrderSummary,
  holdCart,
  listHeldCarts,
  recordCashReconciliation,
  resumeHeldCart,
  seedProducts,
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

beforeEach(async () => {
  await Promise.all([
    db.products.clear(),
    db.cartItems.clear(),
    db.pendingOrders.clear(),
    db.suppliers.clear(),
    db.discounts.clear(),
    db.heldCarts.clear(),
    db.cashReconciliations.clear(),
  ]);
});

describe("suppliers", () => {
  it("creates a supplier", async () => {
    const supplier = await createSupplier({ name: "Acme Roasters" });
    expect(supplier.name).toBe("Acme Roasters");
  });
});

describe("discounts", () => {
  it("filters to only active discounts", async () => {
    await createDiscount({ name: "Staff", type: "percentage", value: 10, active: true });
    await createDiscount({ name: "Expired", type: "percentage", value: 5, active: false });

    const active = await getActiveDiscounts();
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe("Staff");
  });
});

describe("getCartTotal with a discount", () => {
  it("reduces subtotal and tax proportionally, clamped at the subtotal", async () => {
    await addToCart(espresso, 2); // 600 subtotal, 48 tax

    const noDiscount = await getCartTotal();
    expect(noDiscount).toEqual({ subtotal_cents: 600, tax_total_cents: 48, total_cents: 648 });

    const halfOff = await getCartTotal(300);
    expect(halfOff).toEqual({ subtotal_cents: 300, tax_total_cents: 24, total_cents: 324 });

    const overDiscount = await getCartTotal(10_000);
    expect(overDiscount).toEqual({ subtotal_cents: 0, tax_total_cents: 0, total_cents: 0 });
  });
});

describe("createLocalOrder with discount options", () => {
  beforeEach(async () => {
    await seedProducts([espresso, latte]);
  });

  it("stamps discount_cents onto the order", async () => {
    await addToCart(espresso, 2);
    const order = await createLocalOrder("cash", { discountCents: 100 });

    expect(order.discount_cents).toBe(100);
    expect(order.total_cents).toBeLessThan(648);
  });

  it("omits discount_cents when not provided", async () => {
    await addToCart(espresso, 1);
    const order = await createLocalOrder("cash");

    expect(order.discount_cents).toBeUndefined();
  });
});

describe("held carts", () => {
  it("holds the current cart and empties the live cart", async () => {
    await addToCart(espresso, 2);
    await addToCart(latte, 1);

    const held = await holdCart("Table 4");

    expect(held.items).toHaveLength(2);
    expect(await db.cartItems.count()).toBe(0);

    const list = await listHeldCarts();
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe("Table 4");
  });

  it("resumes a held cart back into the live cart and removes the hold", async () => {
    await addToCart(espresso, 2);
    const held = await holdCart("Table 4");

    await resumeHeldCart(held.id);

    const items = await db.cartItems.toArray();
    expect(items).toHaveLength(1);
    expect(items[0].product_id).toBe(espresso.id);
    expect(items[0].quantity).toBe(2);
    expect(await listHeldCarts()).toEqual([]);
  });

  it("merges a resumed cart into whatever is already in the live cart", async () => {
    await addToCart(espresso, 1);
    const held = await holdCart("First");
    await addToCart(latte, 1);

    await resumeHeldCart(held.id);

    const items = await db.cartItems.toArray();
    expect(items.map((i) => i.product_id).sort()).toEqual(
      [espresso.id, latte.id].sort(),
    );
  });
});

describe("cash reconciliation", () => {
  it("summarizes today's orders by payment method", async () => {
    await addToCart(espresso, 1);
    await createLocalOrder("cash");
    await addToCart(latte, 1);
    await createLocalOrder("card");

    const summary = await getTodaysOrderSummary();
    expect(summary.orderCount).toBe(2);
    expect(summary.byPaymentMethod.cash).toBe(324);
    expect(summary.byPaymentMethod.card).toBe(486);
  });

  it("records the counted-vs-expected cash difference", async () => {
    await addToCart(espresso, 1);
    await createLocalOrder("cash"); // 324 expected

    const record = await recordCashReconciliation(300, "short by 24");

    expect(record.expected_cents).toBe(324);
    expect(record.counted_cents).toBe(300);
    expect(record.difference_cents).toBe(-24);
    expect(record.notes).toBe("short by 24");
  });
});
