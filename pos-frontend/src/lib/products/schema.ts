import { z } from "zod";
import { parseMoneyToCents } from "@/lib/format";
import { MAX_IMAGES, SYMBOLOGY_LENGTHS, WEIGHT_UNITS } from "./constants";
import { isGtinLength, isValidEan13, isValidGtin } from "./generate";
import type { Product, ProductBatch, ProductOpeningStock } from "@/lib/types";

/**
 * Every field below is backed by a rendered input. A field with no control can
 * only ever be saved at its default, which makes its validation rules
 * unreachable and its column permanently empty — so add the input and the field
 * together, and remove them together.
 *
 * Numeric inputs are held as strings so a half-typed value ("1.", "") is a
 * legal intermediate state rather than NaN. Conversion to integer cents /
 * numbers happens once, in `toProduct`.
 *
 * Opening stock and rack locations are keyed by warehouse id: the warehouse
 * list is loaded at runtime, so the shape has to be a record rather than a
 * fixed pair of fields.
 */

function toNumber(value: string): number | null {
  const cleaned = value.trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function moneyField(label: string, required: boolean) {
  return z
    .string()
    .trim()
    .refine((value) => !required || value.length > 0, `${label} is required`)
    .refine(
      (value) => value === "" || parseMoneyToCents(value) !== null,
      `${label} must be a number`,
    )
    .refine(
      (value) => value === "" || (parseMoneyToCents(value) ?? 0) >= 0,
      `${label} cannot be negative`,
    );
}

interface QuantityOptions {
  required?: boolean;
  integer?: boolean;
  max?: number;
}

function quantityField(label: string, options: QuantityOptions = {}) {
  const { required = false, integer = false, max } = options;
  return z
    .string()
    .trim()
    .refine((value) => !required || value.length > 0, `${label} is required`)
    .refine(
      (value) => value === "" || toNumber(value) !== null,
      `${label} must be a number`,
    )
    .refine(
      (value) => value === "" || (toNumber(value) ?? 0) >= 0,
      `${label} cannot be negative`,
    )
    .refine(
      (value) => !integer || value === "" || Number.isInteger(toNumber(value)),
      `${label} must be a whole number`,
    )
    .refine(
      (value) => max === undefined || value === "" || (toNumber(value) ?? 0) <= max,
      `${label} cannot exceed ${max}`,
    );
}

/** Per-warehouse quantities, keyed by warehouse id. */
const quantityRecord = z.record(
  z.string(),
  quantityField("Opening stock", { integer: false }),
);

const textRecord = z.record(z.string(), z.string().trim().max(60));

const isoDate = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || !Number.isNaN(Date.parse(value)),
    "Enter a valid date",
  );

// Not a fixed enum: the catalogue's "+" lets a user define a custom unit
// (see `ProductUnitRecord`), so any non-empty short name is valid here.
const unitField = z.string().trim().min(1, "Unit is required");

const baseProductSchema = z.object({
  /* ── Basic information ─────────────────────────────────────────────── */
  name: z.string().trim().min(2, "Product name is required").max(120),
  barcode_symbology: z.enum([
    "CODE128",
    "CODE39",
    "EAN13",
    "EAN8",
    "UPCA",
    "UPCE",
  ]),
  barcode: z.string().trim().min(4, "Product code is required").max(48),
  barcode_source: z.enum(["package", "generated"]),
  sku: z
    .string()
    .trim()
    .min(2, "SKU is required")
    .max(48)
    .regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dot, dash or underscore"),
  category: z.string().trim().min(1, "Category is required").max(60),
  subcategory: z.string().trim().max(60),
  brand: z.string().trim().max(60),
  description: z.string().trim().max(1000),

  /* ── Media ─────────────────────────────────────────────────────────── */
  images: z.array(z.string()).max(MAX_IMAGES, `Up to ${MAX_IMAGES} images`),

  /* ── Inventory ─────────────────────────────────────────────────────── */
  product_type: z.enum(["standard", "variable", "service", "combo"]),
  unit: unitField,
  sale_unit: unitField,
  purchase_unit: unitField,
  stock_alert: quantityField("Stock alert", { integer: true }),
  weight: quantityField("Weight"),
  length: quantityField("Length"),
  width: quantityField("Width"),
  height: quantityField("Height"),

  /* ── Pricing and tax ───────────────────────────────────────────────── */
  cost_price: moneyField("Product cost", false),
  selling_price: moneyField("Retail price", true),
  wholesale_price: moneyField("Wholesale price", false),
  min_selling_price: moneyField("Minimum selling price", false),
  tax_rate: quantityField("Order tax", { max: 100 }),
  tax_type: z.enum(["exclusive", "inclusive"]),
  discount_type: z.enum(["percent", "fixed"]),
  discount_value: quantityField("Discount"),
  points: quantityField("Points", { integer: true }),

  /* ── Warranty and guarantee ────────────────────────────────────────── */
  warranty_period: quantityField("Warranty period", { integer: true }),
  warranty_unit: z.enum(["days", "months", "years"]),
  has_guarantee: z.boolean(),
  warranty_terms: z.string().trim().max(1000),

  /* ── Opening stock and internal location ───────────────────────────── */
  opening_stock: quantityRecord,
  rack_locations: textRecord,

  /* ── Options ───────────────────────────────────────────────────────── */
  has_serial: z.boolean(),
  not_for_selling: z.boolean(),
  is_active: z.boolean(),
  is_featured: z.boolean(),
  hide_from_online: z.boolean(),
  enable_preorder: z.boolean(),

  /* ── Pharmacy ──────────────────────────────────────────────────────── */
  track_batches: z.boolean(),
  prescription_required: z.boolean(),
  generic_name: z.string().trim().max(120),
  strength: z.string().trim().max(60),
  dosage_form: z.string().trim().max(60),
  pack_size: z.string().trim().max(60),
  manufacturer: z.string().trim().max(120),
  drug_schedule: z.string().trim().max(60),
  expiry_date: isoDate,
  manufacturing_date: isoDate,
});

function startOfToday(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

/**
 * Cross-field rules the per-field schemas cannot express.
 *
 * The symbology is a printing contract, not decoration: a code that is not a
 * well-formed EAN-13 will not scan off a label printed as EAN-13, so the fixed
 * length and the check digit are enforced whenever a GTIN symbology is chosen.
 * A cost above the selling price is a margin the till would book as a loss on
 * every sale — almost always a typo or a cents/units slip.
 */
export const productFormSchema = baseProductSchema.superRefine((values, ctx) => {
  const expectedLength = SYMBOLOGY_LENGTHS[values.barcode_symbology];

  if (expectedLength !== undefined) {
    if (!/^\d+$/.test(values.barcode)) {
      ctx.addIssue({
        code: "custom",
        path: ["barcode"],
        message: `${values.barcode_symbology} codes are digits only`,
      });
    } else if (values.barcode.length !== expectedLength) {
      ctx.addIssue({
        code: "custom",
        path: ["barcode"],
        message: `${values.barcode_symbology} needs exactly ${expectedLength} digits`,
      });
    }
  }

  // A scanned package code is check-digit tested at any GTIN length, whatever
  // symbology the shelf label uses: the digits either came off a real barcode
  // or they were mistyped, and the symbology setting cannot change that.
  if (
    values.barcode_source === "package" &&
    isGtinLength(values.barcode) &&
    !isValidGtin(values.barcode)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["barcode"],
      message: "Check digit does not match — re-scan the package barcode",
    });
  }

  if (
    values.barcode_symbology === "CODE39" &&
    !/^[A-Z0-9\-. $/+%]+$/.test(values.barcode)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["barcode"],
      message: "Code 39 allows A–Z, 0–9 and - . $ / + % only",
    });
  }

  // An in-store code we print ourselves is always minted as an EAN-13, so it
  // is held to that standard whatever symbology the label uses.
  if (values.barcode_source === "generated" && !isValidEan13(values.barcode)) {
    ctx.addIssue({
      code: "custom",
      path: ["barcode"],
      message: "Use Generate to create a valid EAN-13 in-store barcode",
    });
  }

  if (values.discount_type === "percent" && (toNumber(values.discount_value) ?? 0) > 100) {
    ctx.addIssue({
      code: "custom",
      path: ["discount_value"],
      message: "Discount cannot exceed 100%",
    });
  }

  const priceCents = parseMoneyToCents(values.selling_price);
  const costCents = parseMoneyToCents(values.cost_price);
  const minPriceCents = parseMoneyToCents(values.min_selling_price);

  if (priceCents !== null && costCents !== null && costCents > priceCents) {
    ctx.addIssue({
      code: "custom",
      path: ["cost_price"],
      message: "Product cost is above the retail price",
    });
  }

  if (priceCents !== null && minPriceCents !== null && minPriceCents > priceCents) {
    ctx.addIssue({
      code: "custom",
      path: ["min_selling_price"],
      message: "Minimum selling price is above the retail price",
    });
  }

  if (values.expiry_date && Date.parse(values.expiry_date) < startOfToday()) {
    ctx.addIssue({
      code: "custom",
      path: ["expiry_date"],
      message: "Expiry date cannot be in the past",
    });
  }

  if (
    values.manufacturing_date &&
    Date.parse(values.manufacturing_date) > startOfToday()
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["manufacturing_date"],
      message: "Manufacturing date cannot be in the future",
    });
  }

  if (
    values.expiry_date &&
    values.manufacturing_date &&
    Date.parse(values.expiry_date) <= Date.parse(values.manufacturing_date)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["expiry_date"],
      message: "Expiry date must come after the manufacturing date",
    });
  }
});

export type ProductFormValues = z.infer<typeof baseProductSchema>;
export type BarcodeSource = ProductFormValues["barcode_source"];

export const DEFAULT_PRODUCT_FORM_VALUES: ProductFormValues = {
  name: "",
  barcode_symbology: "CODE128",
  barcode: "",
  barcode_source: "package",
  sku: "",
  category: "",
  subcategory: "",
  brand: "",
  description: "",

  images: [],

  product_type: "standard",
  unit: "unit",
  sale_unit: "unit",
  purchase_unit: "unit",
  stock_alert: "0",
  weight: "",
  length: "",
  width: "",
  height: "",

  cost_price: "",
  selling_price: "",
  wholesale_price: "",
  min_selling_price: "",
  tax_rate: "0",
  tax_type: "exclusive",
  discount_type: "percent",
  discount_value: "",
  points: "",

  warranty_period: "",
  warranty_unit: "months",
  has_guarantee: false,
  warranty_terms: "",

  opening_stock: {},
  rack_locations: {},

  has_serial: false,
  not_for_selling: false,
  is_active: true,
  is_featured: false,
  hide_from_online: false,
  enable_preorder: false,

  track_batches: false,
  prescription_required: false,
  generic_name: "",
  strength: "",
  dosage_form: "",
  pack_size: "",
  manufacturer: "",
  drug_schedule: "",
  expiry_date: "",
  manufacturing_date: "",
};

// ── Mapping from the stored entity ─────────────────────────────────────────

function centsToInput(cents: number | undefined): string {
  return cents === undefined ? "" : (cents / 100).toFixed(2);
}

function numberToInput(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/**
 * Reverse of `toProduct`, for pre-filling the edit form. Every field the form
 * renders gets a value here so editing never silently reverts an unrendered
 * field to its create-time default (see the note atop this file).
 */
export function fromProduct(product: Product): ProductFormValues {
  const openingStock: Record<string, string> = {};
  const rackLocations: Record<string, string> = {};
  for (const entry of product.opening_stock ?? []) {
    openingStock[entry.warehouse_id] = String(entry.quantity);
    if (entry.location) rackLocations[entry.warehouse_id] = entry.location;
  }

  const batch = product.batches?.[0];
  const discountValue =
    product.discount_type === "fixed"
      ? centsToInput(product.discount_cents)
      : numberToInput(product.discount_percent);

  return {
    name: product.name,
    barcode_symbology: product.barcode_symbology ?? "CODE128",
    barcode: product.barcode,
    barcode_source: product.barcode_source ?? "package",
    sku: product.sku,
    category: product.category ?? "",
    subcategory: product.subcategory ?? "",
    brand: product.brand ?? "",
    description: product.description ?? "",

    images: product.images ?? (product.image_url ? [product.image_url] : []),

    product_type: product.product_type ?? "standard",
    unit: product.unit ?? "unit",
    sale_unit: product.sale_unit ?? product.unit ?? "unit",
    purchase_unit: product.purchase_unit ?? product.unit ?? "unit",
    stock_alert: numberToInput(product.reorder_level ?? product.min_stock_level) || "0",
    weight: numberToInput(product.weight),
    length: numberToInput(product.dimensions?.length),
    width: numberToInput(product.dimensions?.width),
    height: numberToInput(product.dimensions?.height),

    cost_price: centsToInput(product.cost_cents),
    selling_price: centsToInput(product.price_cents),
    wholesale_price: centsToInput(product.wholesale_price_cents),
    min_selling_price: centsToInput(product.min_price_cents),
    tax_rate: numberToInput(product.tax_rate ? product.tax_rate * 100 : 0) || "0",
    tax_type: product.tax_type ?? "exclusive",
    discount_type: product.discount_type ?? "percent",
    discount_value: discountValue,
    points: numberToInput(product.loyalty_points),

    warranty_period: numberToInput(product.warranty?.period),
    warranty_unit: product.warranty?.unit ?? "months",
    has_guarantee: product.warranty?.has_guarantee ?? false,
    warranty_terms: product.warranty?.terms ?? "",

    opening_stock: openingStock,
    rack_locations: rackLocations,

    has_serial: product.has_serial ?? false,
    not_for_selling: product.not_for_selling ?? false,
    is_active: product.is_active ?? true,
    is_featured: product.is_featured ?? false,
    hide_from_online: product.hide_from_online ?? false,
    enable_preorder: product.enable_preorder ?? false,

    track_batches: product.pharmacy?.track_batches ?? false,
    prescription_required: product.pharmacy?.prescription_required ?? false,
    generic_name: product.pharmacy?.generic_name ?? "",
    strength: product.pharmacy?.strength ?? "",
    dosage_form: product.pharmacy?.dosage_form ?? "",
    pack_size: product.pharmacy?.pack_size ?? "",
    manufacturer: product.pharmacy?.manufacturer ?? "",
    drug_schedule: product.pharmacy?.drug_schedule ?? "",
    expiry_date: batch?.expiry_date ?? "",
    manufacturing_date: batch?.manufactured_date ?? "",
  };
}

// ── Derived figures ────────────────────────────────────────────────────────

/**
 * Opening stock is entered per warehouse; `stock_quantity` is their sum, which
 * is the number every till and report reads.
 *
 * The argument is deliberately sparse: this is fed live from `useWatch`, where
 * a warehouse whose field has never been touched is absent or `undefined`
 * rather than "". Treating those as zero is what "no opening stock entered"
 * means, so they are skipped rather than parsed.
 */
export function totalOpeningStock(
  openingStock: Record<string, string | undefined> | undefined,
): number {
  return Object.values(openingStock ?? {}).reduce<number>(
    (total, quantity) => total + (quantity ? (toNumber(quantity) ?? 0) : 0),
    0,
  );
}

export interface PricingSummary {
  priceCents: number | null;
  /** Price after the standing discount, which is what the till will charge. */
  netPriceCents: number | null;
  taxCents: number | null;
  grossPriceCents: number | null;
}

/**
 * An exclusive tax is added to the net price; an inclusive one is already in
 * it and only has to be split back out, so the shelf price does not move when
 * the rate is edited.
 */
export function summarisePricing(
  values: Pick<
    ProductFormValues,
    "selling_price" | "tax_rate" | "tax_type" | "discount_type" | "discount_value"
  >,
): PricingSummary {
  const priceCents = parseMoneyToCents(values.selling_price);
  const taxPercent = toNumber(values.tax_rate) ?? 0;

  if (priceCents === null) {
    return {
      priceCents: null,
      netPriceCents: null,
      taxCents: null,
      grossPriceCents: null,
    };
  }

  const discounted =
    values.discount_type === "fixed"
      ? priceCents - (parseMoneyToCents(values.discount_value) ?? 0)
      : priceCents * (1 - (toNumber(values.discount_value) ?? 0) / 100);
  const afterDiscount = Math.max(0, Math.round(discounted));

  if (values.tax_type === "inclusive") {
    const netPriceCents = Math.round(afterDiscount / (1 + taxPercent / 100));
    return {
      priceCents,
      netPriceCents,
      taxCents: afterDiscount - netPriceCents,
      grossPriceCents: afterDiscount,
    };
  }

  const taxCents = Math.round(afterDiscount * (taxPercent / 100));
  return {
    priceCents,
    netPriceCents: afterDiscount,
    taxCents,
    grossPriceCents: afterDiscount + taxCents,
  };
}

// ── Mapping to the stored entity ───────────────────────────────────────────

function optional<T>(value: T | "" | null | undefined): T | undefined {
  return value === "" || value === null || value === undefined
    ? undefined
    : value;
}

function optionalNumber(value: string): number | undefined {
  return toNumber(value) ?? undefined;
}

function optionalCents(value: string): number | undefined {
  return parseMoneyToCents(value) ?? undefined;
}

/**
 * Strips empty strings so a blank optional field is absent from the record
 * rather than stored as "", which keeps `??` fallbacks working everywhere.
 *
 * An opening batch is written whenever batch tracking is on and either date is
 * filled in, since those are the only two facts a batch would carry at creation
 * time. Its number is derived from the SKU: batch numbering proper belongs to
 * goods-receiving, not to first entry of the product.
 *
 * `is_weighted` is derived from the unit rather than asked for separately:
 * choosing kg/g/l/ml *is* the statement that the item is weighed, and a second
 * control that could contradict it only creates rows the till cannot price.
 */
export function toProduct(values: ProductFormValues, id: string): Product {
  const priceCents = parseMoneyToCents(values.selling_price) ?? 0;
  const costCents = optionalCents(values.cost_price);
  const stock = totalOpeningStock(values.opening_stock);

  // Both records are keyed by warehouse id and either may be missing a key
  // entirely — a warehouse whose two fields were never touched.
  const warehouseIds = new Set([
    ...Object.keys(values.opening_stock ?? {}),
    ...Object.keys(values.rack_locations ?? {}),
  ]);

  const openingStock: ProductOpeningStock[] = Array.from(warehouseIds)
    .map((warehouseId) => {
      const location = values.rack_locations?.[warehouseId]?.trim();
      return {
        warehouse_id: warehouseId,
        quantity: toNumber(values.opening_stock?.[warehouseId] ?? "") ?? 0,
        ...(location ? { location } : {}),
      };
    })
    .filter((entry) => entry.quantity > 0 || entry.location !== undefined);

  const writesBatch =
    values.track_batches && Boolean(values.expiry_date || values.manufacturing_date);
  const batches: ProductBatch[] | undefined = writesBatch
    ? [
        {
          batch_no: `${values.sku}-B1`,
          expiry_date: optional(values.expiry_date) ?? null,
          quantity: stock,
          ...(values.manufacturing_date
            ? { manufactured_date: values.manufacturing_date }
            : {}),
          ...(costCents !== undefined ? { cost_cents: costCents } : {}),
          // Same source as `shelf_location` below: the first warehouse with
          // an opening-stock entry, since a single batch has no other way to
          // know which warehouse its stock landed in.
          ...(openingStock[0]?.warehouse_id
            ? { warehouse_id: openingStock[0].warehouse_id }
            : {}),
        },
      ]
    : undefined;

  const dimensions =
    values.length || values.width || values.height
      ? {
          length: toNumber(values.length) ?? 0,
          width: toNumber(values.width) ?? 0,
          height: toNumber(values.height) ?? 0,
        }
      : undefined;

  const warrantyPeriod = optionalNumber(values.warranty_period);
  const pharmacyFilled =
    values.track_batches ||
    values.prescription_required ||
    Boolean(
      values.generic_name ||
        values.strength ||
        values.dosage_form ||
        values.pack_size ||
        values.manufacturer ||
        values.drug_schedule,
    );

  const discountValue = optionalNumber(values.discount_value);
  const discountCents = optionalCents(values.discount_value);

  return {
    id,
    name: values.name,
    sku: values.sku,
    barcode: values.barcode,
    barcode_source: values.barcode_source,
    barcode_symbology: values.barcode_symbology,
    price_cents: priceCents,
    tax_rate: (toNumber(values.tax_rate) ?? 0) / 100,
    tax_type: values.tax_type,
    stock_quantity: stock,
    category: values.category,
    unit: values.unit,
    sale_unit: values.sale_unit,
    purchase_unit: values.purchase_unit,
    product_type: values.product_type,
    is_weighted: WEIGHT_UNITS.includes(values.unit),
    is_active: values.is_active,
    discount_type: values.discount_type,
    ...(costCents !== undefined ? { cost_cents: costCents } : {}),
    ...(optional(values.subcategory) ? { subcategory: values.subcategory } : {}),
    ...(optional(values.brand) ? { brand: values.brand } : {}),
    ...(optional(values.description) ? { description: values.description } : {}),
    ...(optionalCents(values.wholesale_price) !== undefined
      ? { wholesale_price_cents: optionalCents(values.wholesale_price) }
      : {}),
    ...(optionalCents(values.min_selling_price) !== undefined
      ? { min_price_cents: optionalCents(values.min_selling_price) }
      : {}),
    ...(values.discount_type === "percent" && discountValue !== undefined
      ? { discount_percent: discountValue }
      : {}),
    ...(values.discount_type === "fixed" && discountCents !== undefined
      ? { discount_cents: discountCents }
      : {}),
    ...(optionalNumber(values.points) !== undefined
      ? { loyalty_points: optionalNumber(values.points) }
      : {}),
    ...(optionalNumber(values.stock_alert) !== undefined
      ? {
          reorder_level: optionalNumber(values.stock_alert),
          min_stock_level: optionalNumber(values.stock_alert),
        }
      : {}),
    ...(optionalNumber(values.weight) !== undefined
      ? { weight: optionalNumber(values.weight) }
      : {}),
    ...(dimensions ? { dimensions } : {}),
    ...(warrantyPeriod !== undefined || values.has_guarantee
      ? {
          warranty: {
            period: warrantyPeriod ?? 0,
            unit: values.warranty_unit,
            has_guarantee: values.has_guarantee,
            ...(optional(values.warranty_terms)
              ? { terms: values.warranty_terms }
              : {}),
          },
        }
      : {}),
    ...(openingStock.length > 0 ? { opening_stock: openingStock } : {}),
    // The first location doubles as the product's shelf reference, which is
    // what the single-location screens (till lookup, stock count) still read.
    ...(openingStock.find((entry) => entry.location)
      ? {
          shelf_location: openingStock.find((entry) => entry.location)?.location,
        }
      : {}),
    ...(values.has_serial ? { has_serial: true } : {}),
    ...(values.not_for_selling ? { not_for_selling: true } : {}),
    ...(values.is_featured ? { is_featured: true } : {}),
    ...(values.hide_from_online ? { hide_from_online: true } : {}),
    ...(values.enable_preorder ? { enable_preorder: true } : {}),
    ...(pharmacyFilled
      ? {
          pharmacy: {
            track_batches: values.track_batches,
            prescription_required: values.prescription_required,
            ...(optional(values.generic_name)
              ? { generic_name: values.generic_name }
              : {}),
            ...(optional(values.strength) ? { strength: values.strength } : {}),
            ...(optional(values.dosage_form)
              ? { dosage_form: values.dosage_form }
              : {}),
            ...(optional(values.pack_size) ? { pack_size: values.pack_size } : {}),
            ...(optional(values.manufacturer)
              ? { manufacturer: values.manufacturer }
              : {}),
            ...(optional(values.drug_schedule)
              ? { drug_schedule: values.drug_schedule }
              : {}),
          },
        }
      : {}),
    ...(values.images.length > 0
      ? { images: values.images, image_url: values.images[0] }
      : {}),
    ...(batches ? { batches } : {}),
  };
}
