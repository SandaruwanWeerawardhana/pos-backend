import { db } from "./index";
import type { Discount } from "@/lib/types";

// Local-only table, no server sync yet (no backend endpoint exists).

export async function listDiscounts(): Promise<Discount[]> {
  return db.discounts.toArray();
}

export async function getActiveDiscounts(): Promise<Discount[]> {
  return db.discounts.filter((discount) => discount.active).toArray();
}

// Active, inside its campaign window, and above any minimum-spend threshold.
// The till only ever offers discounts that would actually apply right now.
export async function getEligibleDiscounts(
  subtotalCents: number,
  now = Date.now(),
): Promise<Discount[]> {
  const active = await getActiveDiscounts();
  return active.filter((discount) => {
    if (discount.starts_at && now < discount.starts_at) return false;
    if (discount.ends_at && now > discount.ends_at) return false;
    if (
      discount.min_subtotal_cents &&
      subtotalCents < discount.min_subtotal_cents
    ) {
      return false;
    }
    return true;
  });
}

export async function getDiscount(id: string): Promise<Discount | undefined> {
  return db.discounts.get(id);
}

export async function createDiscount(
  input: Omit<Discount, "id" | "created_at">,
): Promise<Discount> {
  const discount: Discount = {
    ...input,
    id: crypto.randomUUID(),
    created_at: Date.now(),
  };
  await db.discounts.add(discount);
  return discount;
}

export async function updateDiscount(
  id: string,
  changes: Partial<Omit<Discount, "id" | "created_at">>,
): Promise<void> {
  await db.discounts.update(id, changes);
}

export async function deleteDiscount(id: string): Promise<void> {
  await db.discounts.delete(id);
}
