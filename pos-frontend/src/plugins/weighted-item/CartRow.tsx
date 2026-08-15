"use client";

import { useScale } from "@/lib/hooks/use-scale";
import type { CartItem } from "@/lib/types";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type CartRowProps = Readonly<{
  item: CartItem;
}>;

// item.quantity is the weight in kg for a weighted-item line; unit_price_cents
// is price per kg. Shows the live scale reading alongside the stored line so
// an operator can see whether the cart quantity still matches the scale.
export function CartRow({ item }: CartRowProps) {
  const { reading } = useScale();
  const lineTotalCents = Math.round(item.unit_price_cents * item.quantity);

  return (
    <p className="text-xs text-zinc-500 dark:text-zinc-400">
      {item.quantity.toFixed(3)} kg × {formatCents(item.unit_price_cents)}/kg
      {" = "}
      {formatCents(lineTotalCents)}
      {reading && (
        <span className="ml-2 text-zinc-400 dark:text-zinc-500">
          (scale: {(reading.grams / 1000).toFixed(3)} kg
          {reading.stable ? "" : "…"})
        </span>
      )}
    </p>
  );
}
