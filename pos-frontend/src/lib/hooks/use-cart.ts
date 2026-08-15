"use client";

import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import {
  addToCart,
  clearCart,
  db,
  removeFromCart,
  updateCartQuantity,
} from "@/lib/db";
import { computeCartTotal } from "@/lib/cart-math";
import type { CartItem, CartTotal, Product } from "@/lib/types";

export interface UseCartResult {
  items: CartItem[];
  computeTotal: (discountCents?: number) => CartTotal;
  add: (product: Product, quantity?: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  updateQuantity: (id: number, quantity: number) => Promise<void>;
  clear: () => Promise<void>;
}

// Live view over db.cartItems - per CLAUDE.md, cart state lives in Dexie's
// cartItems table, not a separate store. Components should use this hook
// instead of importing src/lib/db directly. computeTotal is synchronous
// (derived from the already-loaded items) so callers like the POS terminal
// can preview a discount's effect without a second async round-trip.
export function useCart(): UseCartResult {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    const subscription = liveQuery(() => db.cartItems.toArray()).subscribe({
      next: setItems,
    });
    return () => subscription.unsubscribe();
  }, []);

  return {
    items,
    computeTotal: (discountCents = 0) => computeCartTotal(items, discountCents),
    add: addToCart,
    remove: removeFromCart,
    updateQuantity: updateCartQuantity,
    clear: clearCart,
  };
}
