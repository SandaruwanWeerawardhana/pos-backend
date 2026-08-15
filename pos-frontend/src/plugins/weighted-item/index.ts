import type { PluginDefinition } from "@/lib/types";
import { weightedItemFields } from "./fields";
import { CartRow } from "./CartRow";
import { InventoryPanel } from "./InventoryPanel";
import { DashboardWidget } from "./DashboardWidget";

export const weightedItemPlugin: PluginDefinition = {
  key: "weighted-item",
  label: "Weighted items (scale)",
  fields: weightedItemFields,
  CartRow,
  InventoryPanel,
  DashboardWidget,
  computeAddQuantity: ({ scaleReading }) =>
    scaleReading ? Number((scaleReading.grams / 1000).toFixed(3)) : 1,
};
