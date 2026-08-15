import type { Product } from "@/lib/types";

export function InventoryPanel({ product }: Readonly<{ product: Product }>) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
      <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
        Weighted item settings
      </h3>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        {product.name} is sold by weight. The price above (
        {(product.price_cents / 100).toFixed(2)}) is per kg, weighed live at
        the scale when added to a cart.
      </p>
    </div>
  );
}
