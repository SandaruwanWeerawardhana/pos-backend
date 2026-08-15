import { db } from "./index";
import type { HeldCart } from "@/lib/types";

// Parks the current cart under a label and empties the live cart so the
// terminal is free for the next customer. Local-only, no sync.
export async function holdCart(label: string): Promise<HeldCart> {
  return db.transaction("rw", db.cartItems, db.heldCarts, async () => {
    const items = await db.cartItems.toArray();

    const held: HeldCart = {
      id: crypto.randomUUID(),
      label,
      items,
      created_at: Date.now(),
    };

    await db.heldCarts.add(held);
    await db.cartItems.clear();

    return held;
  });
}

// Restores a held cart's lines into the live cart and removes the hold.
// Merges into whatever is already in the cart rather than overwriting it.
export async function resumeHeldCart(id: string): Promise<void> {
  await db.transaction("rw", db.cartItems, db.heldCarts, async () => {
    const held = await db.heldCarts.get(id);
    if (!held) return;

    for (const item of held.items) {
      await db.cartItems.add({
        product_id: item.product_id,
        name: item.name,
        quantity: item.quantity,
        unit_price_cents: item.unit_price_cents,
        tax_rate: item.tax_rate,
      });
    }

    await db.heldCarts.delete(id);
  });
}

export async function listHeldCarts(): Promise<HeldCart[]> {
  return db.heldCarts.orderBy("created_at").reverse().toArray();
}

export async function deleteHeldCart(id: string): Promise<void> {
  await db.heldCarts.delete(id);
}
