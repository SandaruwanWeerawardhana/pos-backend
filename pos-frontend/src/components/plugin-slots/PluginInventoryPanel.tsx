"use client";

import { usePlugin } from "@/lib/hooks/use-plugin";
import type { Product } from "@/lib/types";

type PluginInventoryPanelProps = Readonly<{
  product: Product;
}>;

export function PluginInventoryPanel({ product }: PluginInventoryPanelProps) {
  const { active } = usePlugin();
  if (!active?.InventoryPanel) return null;

  const InventoryPanelComponent = active.InventoryPanel;
  return <InventoryPanelComponent product={product} />;
}
