import type { ComponentType } from "react";
import type { Product, CartItem } from "./index";
import type { ScaleReading } from "./hardware";

export type PluginFieldType = "text" | "number" | "boolean" | "select";

export interface PluginField {
  key: string;
  label: string;
  type: PluginFieldType;
  required?: boolean;
  unit?: string;
  options?: string[]; // for type: "select"
}

export interface PluginDefinition {
  key: string;
  label: string;
  fields: PluginField[];
  appliesTo?: (product: Product) => boolean;
  CartRow?: ComponentType<{ item: CartItem }>;
  InventoryPanel?: ComponentType<{ product: Product }>;
  DashboardWidget?: ComponentType;
  ReceiptExtras?: ComponentType<{ item: CartItem }>;
  ProductForm?: ComponentType<{
    values: Record<string, string | number | boolean>;
    onChange: (key: string, value: string | number | boolean) => void;
  }>;
  // Lets a plugin control what quantity gets added to the cart when a
  // product tile is tapped - e.g. weighted-item reads the live scale
  // instead of defaulting to 1.
  computeAddQuantity?: (context: {
    product: Product;
    scaleReading: ScaleReading | null;
  }) => number;
}
