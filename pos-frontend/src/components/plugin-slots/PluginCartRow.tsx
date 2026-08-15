"use client";

import { usePlugin } from "@/lib/hooks/use-plugin";
import type { CartItem } from "@/lib/types";

type PluginCartRowProps = Readonly<{
  item: CartItem;
}>;

export function PluginCartRow({ item }: PluginCartRowProps) {
  const { active } = usePlugin();
  if (!active?.CartRow) return null;

  const CartRowComponent = active.CartRow;
  return <CartRowComponent item={item} />;
}
