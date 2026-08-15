"use client";

import { usePlugin } from "@/lib/hooks/use-plugin";
import type { CartItem } from "@/lib/types";

export function PluginReceiptExtras({ item }: { item: CartItem }) {
  const { active } = usePlugin();
  if (!active?.ReceiptExtras) return null;

  const ReceiptExtrasComponent = active.ReceiptExtras;
  return <ReceiptExtrasComponent item={item} />;
}
