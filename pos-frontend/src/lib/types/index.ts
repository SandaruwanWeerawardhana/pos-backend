/**
 * Shared domain types. Money is ALWAYS integer cents — never floats.
 */

export type PaymentMethod = "cash" | "card" | "qr" | "other";

export type SyncStatus = "pending" | "syncing" | "synced" | "conflict" | "error";

/**
 * How a product's quantity is entered at the till. "unit" products are
 * counted (1 tin, 2 loaves); "weight" products are priced per kg and the
 * cart quantity carries a fractional weight read from the scale.
 *
 * The built-in literals stay for autocomplete; `(string & {})` keeps the
 * type from collapsing to plain `string` while still accepting a custom
 * unit's `short_name` (see `ProductUnitRecord`) created from the catalogue.
 */
export type ProductUnit =
  | "unit"
  | "kg"
  | "g"
  | "l"
  | "ml"
  | "pack"
  | "box"
  | (string & {});

/** `quantity_in_short_name (operator) operation_value = quantity_in_base_unit`. */
export type UnitOperator = "*" | "/";

/**
 * A user-defined unit of measure (e.g. "Meter"/"m"), created either from the
 * product form's quick "+" or from the Units management screen. `base_unit`
 * is an optional reference to another unit's `short_name`; when set,
 * `operator`/`operation_value` convert this unit into that base unit (e.g.
 * "g", base "kg", operator "/", value 1000 — 1000 g makes 1 kg). A unit with
 * no base is its own base, kept at the identity `"*" 1`.
 */
export interface ProductUnitRecord {
  id: string;
  name: string;
  short_name: string;
  base_unit?: string;
  operator?: UnitOperator;
  operation_value?: number;
  created_at: string;
}

/**
 * How a product behaves in the catalogue. "standard" is a single sellable
 * line; "service" carries no stock; "variable" and "combo" are placeholders
 * for Phase 2 variants and bundles.
 */
export type ProductType = "standard" | "variable" | "service" | "combo";

/** Symbology the shelf label is printed in. */
export type BarcodeSymbology =
  | "CODE128"
  | "CODE39"
  | "EAN13"
  | "EAN8"
  | "UPCA"
  | "UPCE";

/** Whether `price_cents` already contains the tax or has it added on top. */
export type TaxType = "exclusive" | "inclusive";

/** Shape of a product's standing discount — not the cart-level DiscountType. */
export type ProductDiscountType = "percent" | "fixed";

export type WarrantyUnit = "days" | "months" | "years";

export interface ProductWarranty {
  period: number;
  unit: WarrantyUnit;
  /** Manufacturer guarantee on top of the warranty period. */
  has_guarantee: boolean;
  terms?: string;
}

/**
 * Opening quantity per warehouse, captured once when the product is created.
 * `stock_quantity` is the sum of these; the per-warehouse split is what the
 * inventory screens read. `location` is a rack/shelf reference only — stock is
 * tracked by warehouse, never by location.
 */
export interface ProductOpeningStock {
  warehouse_id: string;
  quantity: number;
  location?: string;
}

/**
 * Fields the pharmacy business type adds. Kept as one nested object so a
 * grocery product carries none of them rather than eight empty strings.
 */
export interface ProductPharmacy {
  /** Capture batch numbers and expiry dates on purchase and sale. */
  track_batches: boolean;
  prescription_required: boolean;
  generic_name?: string;
  strength?: string;
  dosage_form?: string;
  pack_size?: string;
  manufacturer?: string;
  drug_schedule?: string;
}

export interface ProductBatch {
  batch_no: string;
  /** ISO yyyy-mm-dd, null when not perishable. */
  expiry_date: string | null;
  quantity: number;
  /** Landed cost for this batch. */
  cost_cents?: number;
  /** ISO yyyy-mm-dd. */
  manufactured_date?: string | null;
  /** Warehouse this batch's stock sits in, when known. */
  warehouse_id?: string;
}

/**
 * A catalogue row.
 *
 * Every field below `stock_quantity` is optional: server payloads that predate
 * a field still validate, and the UI falls back to sensible defaults.
 */
export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  /**
   * "package" = GTIN printed by the supplier, "generated" = in-store code we
   * print ourselves. Absent on rows that predate the field; treat as "package".
   */
  barcode_source?: "package" | "generated";
  /** Integer cents. */
  price_cents: number;
  /** Fractional rate, e.g. 0.08 = 8%. */
  tax_rate: number;
  stock_quantity: number;
  category?: string;
  brand?: string;
  unit?: ProductUnit;
  /** Purchase cost, basis for profit margin. */
  cost_cents?: number;
  image_url?: string;
  /** Variable-weight item priced per `unit`. */
  is_weighted?: boolean;
  /** Triggers the low-stock alert for this product. */
  reorder_level?: number;
  /** e.g. "A3-04". */
  shelf_location?: string;
  supplier_id?: string;
  /** Batch/expiry tracking for perishables. */
  batches?: ProductBatch[];
  description?: string;
  /** Standing line discount, 0-100. */
  discount_percent?: number;
  /** Hard floor; `reorder_level` is the alert trigger. */
  min_stock_level?: number;
  /** Data URLs; `image_url` mirrors images[0] for older UI. */
  images?: string[];
  /**
   * Values for the active business-type plugin's declared fields, keyed by
   * PluginField.key. Opaque to the core app.
   */
  plugin_data?: Record<string, string | number | boolean>;

  /* ── Catalogue detail ──────────────────────────────────────────────────
   * Everything below is captured by the product form and stored locally.
   * The Phase 1 API does not carry these yet (docs/API_CONTRACT.md), so a
   * pull from the server leaves them untouched rather than clearing them.
   */
  subcategory?: string;
  /** Symbology the shelf label prints `barcode` in. Defaults to CODE128. */
  barcode_symbology?: BarcodeSymbology;
  product_type?: ProductType;
  /** Unit the till sells in, when it differs from `unit`. */
  sale_unit?: ProductUnit;
  /** Unit goods are bought in, when it differs from `unit`. */
  purchase_unit?: ProductUnit;
  /** Shipping weight in kilograms — not the sold quantity. */
  weight?: number;
  /** Packaging size in inches, for shipping estimates. */
  dimensions?: { length: number; width: number; height: number };
  /** Integer cents. */
  wholesale_price_cents?: number;
  /** Integer cents. Floor the till may not sell below. */
  min_price_cents?: number;
  tax_type?: TaxType;
  discount_type?: ProductDiscountType;
  /** Integer cents, set instead of `discount_percent` for fixed discounts. */
  discount_cents?: number;
  /** Loyalty points awarded per sale of this product. */
  loyalty_points?: number;
  warranty?: ProductWarranty;
  opening_stock?: ProductOpeningStock[];
  /** Each unit carries an IMEI/serial captured at sale time. */
  has_serial?: boolean;
  /** Stocked but not sellable — raw materials, packaging. */
  not_for_selling?: boolean;
  /** Inactive products stay in reports but leave the till's search. */
  is_active?: boolean;
  is_featured?: boolean;
  hide_from_online?: boolean;
  enable_preorder?: boolean;
  pharmacy?: ProductPharmacy;
  /**
   * Groups variant rows created from one Excel import under the sheet's
   * `product_code`. There is no separate parent row — each variant is a
   * normal sellable `Product` with its own unique `sku`/`barcode`.
   */
  variant_of?: string;
  /** e.g. "Small", "Red" — the specific variant this row represents. */
  variant_name?: string;

  /**
   * Created on this device and not yet accepted by the server. Cleared by the
   * sync manager once POST /products has stored it, so a pull can safely
   * replace the row with the server's canonical copy.
   */
  _local_only?: boolean;
  /**
   * Edited on this device since the last successful push. Set by updateProduct
   * and cleared once PUT /products/{id} has stored the edit; a pull leaves
   * flagged rows alone so an edit made offline is not undone by the server's
   * older copy. Never set on a row that is still `_local_only` — that one is
   * pushed by its create, edits and all.
   */
  _pending_update?: boolean;
}

/**
 * A product deleted on this device whose DELETE has not reached the server yet.
 *
 * Kept as its own table rather than a flag on the product, so the row can leave
 * `products` immediately: a deleted product must vanish from the till, the
 * catalogue and every report at once, and a tombstone in the products table
 * would mean auditing every read path for it.
 */
export interface DeletedProductRecord {
  id: string;
  /** Epoch milliseconds. */
  deleted_at: number;
}

export interface CartItem {
  id?: number; /* Dexie auto-increment pk; present once persisted */
  product_id: string;
  name: string;
  quantity: number; /* fractional for weighted items (kg), whole otherwise */
  unit_price_cents: number; /* integer cents, per `unit` */
  tax_rate: number; /* captured from the product at add-to-cart time, not re-fetched */
  unit?: ProductUnit;
  is_weighted?: boolean;
  line_discount_cents?: number; /* per-line override, applied before cart discount */
}

/**
 * One leg of a payment. A single-tender sale has exactly one; a split sale
 * has several whose amounts sum to the order total.
 */
export interface PaymentSplit {
  method: PaymentMethod;
  amount_cents: number;
  tendered_cents?: number; /* cash only — what the customer handed over */
  change_cents?: number; /* cash only — tendered minus amount */
  reference?: string; /* card auth code / QR transaction id */
}

export interface PendingOrder {
  client_generated_id: string;
  items: CartItem[];
  total_cents: number; /* integer cents */
  tax_total_cents: number; /* integer cents */
  payment_method: PaymentMethod; /* primary tender; see `payments` for splits */
  created_at: number; /* epoch milliseconds */
  sync_status: SyncStatus;
  server_id: string | null;
  discount_cents?: number; /* integer cents, applied before tax */
  refunded?: boolean; /* local-only annotation, not synced (no backend refund endpoint yet) */
  payments?: PaymentSplit[]; /* present for every order created after split-payment support */
  cashier_id?: string;
  receipt_no?: string;
}

/**
 * A sale as `GET /orders` returns it — the server's stored copy, not the till's.
 *
 * Keyed on `client_generated_id` as well as `id`, because the till already holds
 * the same sale under that key. That is what lets the sales screen overlay its
 * unsynced local orders on a server page without showing the same sale twice.
 *
 * Money is integer cents. `sold_at` is the business date the sale was rung up
 * on (epoch ms), not when the server received it — an order that syncs three
 * days late still belongs to the day it happened.
 */
export interface ServerOrder {
  id: string;
  client_generated_id: string;
  receipt_no: string | null;
  payment_method: PaymentMethod;
  subtotal_cents: number;
  discount_cents: number;
  tax_total_cents: number;
  total_cents: number;
  refunded: boolean;
  /** The server's recompute disagreed with the till's figures; needs review. */
  totals_mismatch: boolean;
  server_total_cents?: number;
  server_tax_total_cents?: number;
  cashier_id?: string;
  branch_id?: string;
  sold_at: number;
  synced_at: number;
  items: ServerOrderItem[];
  payments: PaymentSplit[];
}

export interface ServerOrderItem {
  product_id: string | null;
  name: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate: number;
  unit?: ProductUnit;
  is_weighted?: boolean;
  line_discount_cents: number;
}

/** Pagination metadata returned alongside a server list page. */
export interface PageMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface OrderPage {
  orders: ServerOrder[];
  meta: PageMeta;
}

/** Query for `GET /orders`. Every field is optional; the server has defaults. */
export interface OrderListParams {
  page?: number;
  per_page?: number;
  /** Matched against receipt no, client id, and item names. */
  search?: string;
  payment_method?: PaymentMethod;
  /** Epoch ms bounds on `sold_at`. */
  from?: number;
  to?: number;
  sort?: "sold_at" | "total_cents" | "synced_at" | "created_at";
  order?: "asc" | "desc";
}

export interface SyncMetaRecord {
  key: string;
  value: unknown;
}

export interface CartTotal {
  subtotal_cents: number;
  tax_total_cents: number;
  total_cents: number;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  city?: string;
  country?: string;
  created_at: number;
  address?: string;
  tax_number?: string;
  payment_terms?: string; /* e.g. "Net 30" */
  opening_balance_cents: number;
  /* undefined = no credit limit set. */
  credit_limit_cents?: number;
  total_purchase_due_cents: number;
  total_purchase_return_due_cents: number;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  phone?: string;
  country?: string;
  city?: string;
  state?: string;
  zip?: string;
  tax_number?: string;
  address?: string;
  points: number;
  /* undefined = no credit limit set. */
  credit_limit_cents?: number;
  /* Customer's outstanding balance from before this system was adopted. */
  opening_balance_cents: number;
  total_sale_due_cents: number;
  total_sell_return_due_cents: number;
  royalty_eligible: boolean;
  created_at: number;
}

export type DiscountType =
  | "percentage"
  | "fixed_cents"
  | "bogo"
  | "bundle"
  | "seasonal";

export interface Discount {
  id: string;
  name: string;
  type: DiscountType;
  value: number; /* percentage (0-100) or integer cents, depending on type */
  active: boolean;
  created_at: number;
  starts_at?: number; /* epoch ms — campaign window start */
  ends_at?: number; /* epoch ms — campaign window end */
  product_ids?: string[]; /* limits the campaign to these products */
  buy_quantity?: number; /* BOGO: buy N… */
  get_quantity?: number; /* …get M free */
  min_subtotal_cents?: number; /* threshold before the campaign applies */
}

/**
 * ── Inventory ──────────────────────────────────────────────────────────────
 */

export type StockMovementType =
  | "sale"
  | "purchase"
  | "adjustment"
  | "transfer_in"
  | "transfer_out"
  | "waste"
  | "damage"
  | "return";

export interface StockMovement {
  id: string;
  product_id: string;
  product_name: string;
  type: StockMovementType;
  quantity_delta: number; /* signed: negative removes stock */
  balance_after: number;
  reason?: string;
  reference_id?: string; /* order id / purchase order id */
  warehouse_id?: string;
  batch_no?: string;
  created_at: number;
  created_by?: string;
}

export interface Warehouse {
  id: string;
  name: string;
  location?: string;
  is_default?: boolean;
  created_at: number;
}

/**
 * A rack/shelf/zone/bin inside one warehouse, created from the product form's
 * "+" beside Internal Location. Reference data for picking only — stock is
 * tracked against the warehouse, never against a location.
 *
 * `code` is the short identifier pickers actually call out ("A3-04") and is
 * what gets written onto the product; `name` is an optional longer label shown
 * beside it in pickers.
 */
export interface WarehouseLocation {
  id: string;
  warehouse_id: string;
  code: string;
  name?: string;
  created_at: string;
}

/**
 * A named product category, managed from the Categories screen. `code` is
 * entered by hand at creation and unique across categories. Independent of
 * the free-text `product.category` field — products keep selling under their
 * existing category text even if the matching row here is renamed or removed.
 */
export interface Category {
  id: string;
  code: string;
  name: string;
  icon?: string;
  created_at: string;
}

/**
 * A named brand, managed from the Brand screen. Independent of the free-text
 * `product.brand` field — products keep selling under their existing brand
 * text even if the matching row here is renamed or removed.
 */
export interface Brand {
  id: string;
  name: string;
  description?: string;
  /** Data URL — logos are small and stored inline like product images. */
  image_url?: string;
  created_at: string;
}

/**
 * ── Purchasing ─────────────────────────────────────────────────────────────
 */

export type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partial"
  | "received"
  | "cancelled";

export interface PurchaseOrderLine {
  product_id: string;
  product_name: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost_cents: number;
  batch_no?: string;
  expiry_date?: string | null;
}

export interface PurchaseOrder {
  id: string;
  reference: string; /* human-facing PO number */
  supplier_id: string;
  supplier_name: string;
  status: PurchaseOrderStatus;
  lines: PurchaseOrderLine[];
  total_cents: number;
  expected_at?: number;
  notes?: string;
  created_at: number;
  received_at?: number;
}

export interface PurchaseReturn {
  id: string;
  purchase_order_id: string;
  supplier_name: string;
  reason: string;
  lines: { product_id: string; product_name: string; quantity: number; unit_cost_cents: number }[];
  total_cents: number;
  created_at: number;
}

/**
 * ── Users, roles, permissions ──────────────────────────────────────────────
 */

/**
 * Coarse-grained capability strings checked by `hasPermission`. Kept flat
 * (rather than resource/action objects) so a role is just a string list.
 */
export const PERMISSIONS = [
  "pos.sell",
  "pos.refund",
  "pos.discount",
  "products.view",
  "products.manage",
  "inventory.view",
  "inventory.adjust",
  "purchases.view",
  "purchases.manage",
  "reports.view",
  "settings.manage",
  "users.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
  is_system?: boolean; /* seeded role, cannot be deleted */
  created_at: number;
}

export interface StaffUser {
  id: string;
  /**
   * Display name, kept as the single source for receipts, shift reports and
   * the till sign-in screen. `first_name`/`last_name` are the fields the users
   * screen edits; rows created before they existed only have `name`, so
   * readers fall back to splitting it (see `nameParts` in lib/db/users).
   */
  name: string;
  first_name?: string;
  last_name?: string;
  /** Optional login handle shown in the users table; defaults to `name`. */
  username?: string;
  phone?: string;
  /** Profile picture as a data URL — local-first, same as product images. */
  avatar?: string;
  /** Lets the user see every record on list screens, not only their own. */
  view_all_records?: boolean;
  /** Warehouses the user may work in. Undefined means all of them. */
  warehouse_ids?: string[];
  email: string;
  role_id: string;
  /**
   * Till PIN, stored as a salted SHA-256 digest rather than in the clear. Both
   * fields are absent until a PIN is set; a user without one cannot sign in at
   * the till. See `setStaffPin` for the (deliberately limited) threat model.
   */
  pin_hash?: string;
  pin_salt?: string;
  active: boolean;
  created_at: number;
}

/**
 * ── Notifications ──────────────────────────────────────────────────────────
 */

export type NotificationKind =
  | "low_stock"
  | "out_of_stock"
  | "expiry"
  | "expired"
  | "sync"
  | "system";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  read: boolean;
  created_at: number;
}

/**
 * ── Settings ───────────────────────────────────────────────────────────────
 */

export interface TaxRateSetting {
  id: string;
  name: string;
  rate: number; /* fractional, e.g. 0.08 */
  is_default?: boolean;
}

export interface StoreSettings {
  store_name: string;
  legal_name?: string;
  address?: string;
  phone?: string;
  email?: string;
  tax_id?: string;
  currency_code: string; /* ISO 4217, e.g. "USD" */
  currency_symbol: string;
  currency_position: "before" | "after";
  locale: string; /* BCP 47, drives number/date formatting */
  prices_include_tax: boolean;
  tax_rates: TaxRateSetting[];
  receipt_header?: string;
  receipt_footer?: string;
  receipt_show_logo: boolean;
  receipt_show_tax_breakdown: boolean;
  receipt_paper_width: "58mm" | "80mm";
  low_stock_threshold: number;
  expiry_warning_days: number;
}

export interface HeldCart {
  id: string;
  label: string;
  items: CartItem[];
  created_at: number;
}

export interface CashReconciliation {
  id: string;
  expected_cents: number;
  counted_cents: number;
  difference_cents: number;
  notes?: string;
  created_at: number;
}

export * from "./plugin";
export * from "./hardware";
