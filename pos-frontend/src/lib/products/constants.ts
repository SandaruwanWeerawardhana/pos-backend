import {
  Book,
  Car,
  Coffee,
  Footprints,
  Gift,
  Heart,
  Home,
  Package,
  Shirt,
  ShoppingBag,
  Smartphone,
  Tag,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type {
  BarcodeSymbology,
  ProductDiscountType,
  ProductType,
  ProductUnit,
  TaxType,
  WarrantyUnit,
} from "@/lib/types";

export interface Option<T extends string> {
  value: T;
  label: string;
}

export const PRODUCT_UNIT_OPTIONS: Option<ProductUnit>[] = [
  { value: "unit", label: "Unit (each)" },
  { value: "kg", label: "Kilogram (kg)" },
  { value: "g", label: "Gram (g)" },
  { value: "l", label: "Litre (l)" },
  { value: "ml", label: "Millilitre (ml)" },
  { value: "pack", label: "Pack" },
  { value: "box", label: "Box" },
];

/**
 * Weight-priced units — selecting one of these implies a weighed product.
 */
export const WEIGHT_UNITS: ProductUnit[] = ["kg", "g", "l", "ml"];

export const PRODUCT_TYPE_OPTIONS: Option<ProductType>[] = [
  { value: "standard", label: "Standard Product" },
  { value: "variable", label: "Variable Product" },
  { value: "service", label: "Service" },
  { value: "combo", label: "Combo" },
];

/**
 * Symbologies a shelf-label printer can render. CODE128 is the default because
 * it is the only one here that accepts an arbitrary-length alphanumeric code;
 * the GTIN family is fixed-length and numeric.
 */
export const BARCODE_SYMBOLOGY_OPTIONS: Option<BarcodeSymbology>[] = [
  { value: "CODE128", label: "Code 128" },
  { value: "CODE39", label: "Code 39" },
  { value: "EAN13", label: "EAN-13" },
  { value: "EAN8", label: "EAN-8" },
  { value: "UPCA", label: "UPC-A" },
  { value: "UPCE", label: "UPC-E" },
];

/** Fixed digit counts the numeric symbologies demand, check digit included. */
export const SYMBOLOGY_LENGTHS: Partial<Record<BarcodeSymbology, number>> = {
  EAN13: 13,
  EAN8: 8,
  UPCA: 12,
  UPCE: 8,
};

export const TAX_TYPE_OPTIONS: Option<TaxType>[] = [
  { value: "exclusive", label: "Exclusive" },
  { value: "inclusive", label: "Inclusive" },
];

export const DISCOUNT_TYPE_OPTIONS: Option<ProductDiscountType>[] = [
  { value: "percent", label: "Percent %" },
  { value: "fixed", label: "Fixed" },
];

export const WARRANTY_UNIT_OPTIONS: Option<WarrantyUnit>[] = [
  { value: "days", label: "Days" },
  { value: "months", label: "Months" },
  { value: "years", label: "Years" },
];

/**
 * Fixed icon choices for the Categories screen. `value` is what's stored on
 * `Category.icon`; `CATEGORY_ICONS` maps it back to the component to render.
 */
export const CATEGORY_ICON_OPTIONS: Option<string>[] = [
  { value: "package", label: "Package" },
  { value: "shopping-bag", label: "Shopping Bag" },
  { value: "shirt", label: "Apparel" },
  { value: "footprints", label: "Shoes" },
  { value: "coffee", label: "Food & Drink" },
  { value: "smartphone", label: "Electronics" },
  { value: "home", label: "Home" },
  { value: "book", label: "Books" },
  { value: "gift", label: "Gift" },
  { value: "wrench", label: "Tools" },
  { value: "car", label: "Automotive" },
  { value: "heart", label: "Health & Beauty" },
  { value: "tag", label: "Other" },
];

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  package: Package,
  "shopping-bag": ShoppingBag,
  shirt: Shirt,
  footprints: Footprints,
  coffee: Coffee,
  smartphone: Smartphone,
  home: Home,
  book: Book,
  gift: Gift,
  wrench: Wrench,
  car: Car,
  heart: Heart,
  tag: Tag,
};

/**
 * Per-image upload ceiling, 2 MB.
 */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGES = 6;
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];
