import { db } from "./index";
import { getStoreSettings } from "./settings";
import type { PendingOrder, Product } from "@/lib/types";

/**
 * Every report reads the local order/product/movement tables, so reports work
 * offline exactly like the till does.
 */

export interface DateRange {
  from: number; /* epoch ms, inclusive */
  to: number; /* epoch ms, inclusive */
}

export type RangePreset = "today" | "7d" | "30d" | "90d" | "month" | "year" | "all";

export function presetToRange(preset: RangePreset): DateRange {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  switch (preset) {
    case "today":
      break;
    case "7d":
      start.setDate(start.getDate() - 6);
      break;
    case "30d":
      start.setDate(start.getDate() - 29);
      break;
    case "90d":
      start.setDate(start.getDate() - 89);
      break;
    case "month":
      start.setDate(1);
      break;
    case "year":
      start.setMonth(0, 1);
      break;
    case "all":
      start.setTime(0);
      break;
  }
  return { from: start.getTime(), to: end.getTime() };
}

/**
 * yyyy-mm-dd in the till's own timezone. Deliberately not
 * `toISOString().slice(0, 10)`, which is the UTC day: presetToRange builds its
 * bounds from local midnight, so a UTC key put every evening sale (or every
 * early-morning one, depending on the offset) in the wrong bucket — and in a
 * "today" range, in a bucket outside the range that produced it.
 */
export function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function ordersInRange(range: DateRange): Promise<PendingOrder[]> {
  return db.pendingOrders
    .where("created_at")
    .between(range.from, range.to, true, true)
    .toArray();
}

/* ── Sales ────────────────────────────────────────────────────────────────── */

export interface SalesRow {
  date: string; /* yyyy-mm-dd */
  orderCount: number;
  grossCents: number;
  discountCents: number;
  taxCents: number;
  netCents: number;
}

export async function getSalesReport(range: DateRange): Promise<SalesRow[]> {
  const orders = await ordersInRange(range);
  const byDay = new Map<string, SalesRow>();

  for (const order of orders) {
    if (order.refunded) continue;
    const date = localDateKey(order.created_at);
    const row = byDay.get(date) ?? {
      date,
      orderCount: 0,
      grossCents: 0,
      discountCents: 0,
      taxCents: 0,
      netCents: 0,
    };
    row.orderCount += 1;
    row.grossCents += order.total_cents + (order.discount_cents ?? 0);
    row.discountCents += order.discount_cents ?? 0;
    row.taxCents += order.tax_total_cents;
    row.netCents += order.total_cents;
    byDay.set(date, row);
  }

  return Array.from(byDay.values()).sort((a, b) => b.date.localeCompare(a.date));
}

/* ── Profit ───────────────────────────────────────────────────────────────── */

export interface ProfitRow {
  productId: string;
  name: string;
  quantitySold: number;
  revenueCents: number;
  costCents: number;
  profitCents: number;
  marginPercent: number;
}

/**
 * Cost basis comes from the product's current `cost_cents`. Products with no
 * recorded cost contribute zero cost, which would overstate profit — they are
 * surfaced with a 100% margin so the gap is visible rather than silent.
 */
export async function getProfitReport(range: DateRange): Promise<ProfitRow[]> {
  const [orders, products] = await Promise.all([
    ordersInRange(range),
    db.products.toArray(),
  ]);
  const costById = new Map(products.map((p) => [p.id, p.cost_cents ?? 0]));
  const rows = new Map<string, ProfitRow>();

  for (const order of orders) {
    if (order.refunded) continue;
    for (const item of order.items) {
      const row = rows.get(item.product_id) ?? {
        productId: item.product_id,
        name: item.name,
        quantitySold: 0,
        revenueCents: 0,
        costCents: 0,
        profitCents: 0,
        marginPercent: 0,
      };
      row.quantitySold += item.quantity;
      row.revenueCents += item.unit_price_cents * item.quantity;
      row.costCents += (costById.get(item.product_id) ?? 0) * item.quantity;
      rows.set(item.product_id, row);
    }
  }

  return Array.from(rows.values())
    .map((row) => {
      const profitCents = row.revenueCents - row.costCents;
      return {
        ...row,
        profitCents,
        marginPercent:
          row.revenueCents > 0
            ? Math.round((profitCents / row.revenueCents) * 1000) / 10
            : 0,
      };
    })
    .sort((a, b) => b.profitCents - a.profitCents);
}

/* ── Inventory ────────────────────────────────────────────────────────────── */

export interface InventoryReportRow {
  id: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  reorderLevel: number;
  costCents: number;
  priceCents: number;
  stockValueCents: number;
  status: "ok" | "low" | "out";
}

/**
 * The low/out classification here is the same rule getInventoryAlerts applies:
 * the product's own reorder_level wins, and the store-wide threshold is the
 * fallback. It used to fall back to a hard-coded 5, so a shop that changed its
 * threshold in Settings got a report that disagreed with the Stock alerts page
 * about which products were low.
 */
export async function getInventoryReport(): Promise<InventoryReportRow[]> {
  const [products, settings] = await Promise.all([
    db.products.toArray(),
    getStoreSettings(),
  ]);
  return products
    .map((product: Product): InventoryReportRow => {
      const reorderLevel = product.reorder_level ?? settings.low_stock_threshold;
      let status: InventoryReportRow["status"] = "ok";
      if (product.stock_quantity <= 0) status = "out";
      else if (product.stock_quantity <= reorderLevel) status = "low";

      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category ?? "Uncategorised",
        stock: product.stock_quantity,
        reorderLevel,
        costCents: product.cost_cents ?? 0,
        priceCents: product.price_cents,
        stockValueCents: product.price_cents * product.stock_quantity,
        status,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ── Suppliers & purchases ────────────────────────────────────────────────── */

export interface SupplierReportRow {
  id: string;
  name: string;
  purchaseOrderCount: number;
  purchasedCents: number;
  productCount: number;
  lastOrderAt: number | null;
}

export async function getSupplierReport(): Promise<SupplierReportRow[]> {
  const [suppliers, purchaseOrders, products] = await Promise.all([
    db.suppliers.toArray(),
    db.purchaseOrders.toArray(),
    db.products.toArray(),
  ]);

  return suppliers
    .map((supplier): SupplierReportRow => {
      const orders = purchaseOrders.filter((o) => o.supplier_id === supplier.id);
      return {
        id: supplier.id,
        name: supplier.name,
        purchaseOrderCount: orders.length,
        purchasedCents: orders.reduce((sum, o) => sum + o.total_cents, 0),
        productCount: products.filter((p) => p.supplier_id === supplier.id).length,
        lastOrderAt: orders.length
          ? Math.max(...orders.map((o) => o.created_at))
          : null,
      };
    })
    .sort((a, b) => b.purchasedCents - a.purchasedCents);
}

export interface PurchaseReportRow {
  id: string;
  reference: string;
  supplierName: string;
  status: string;
  lineCount: number;
  totalCents: number;
  createdAt: number;
}

export async function getPurchaseReport(
  range: DateRange,
): Promise<PurchaseReportRow[]> {
  const orders = await db.purchaseOrders
    .where("created_at")
    .between(range.from, range.to, true, true)
    .toArray();

  return orders
    .map((order): PurchaseReportRow => ({
      id: order.id,
      reference: order.reference,
      supplierName: order.supplier_name,
      status: order.status,
      lineCount: order.lines.length,
      totalCents: order.total_cents,
      createdAt: order.created_at,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * PurchaseOrder does not (yet) record how or by whom it was paid, so
 * `paidBy`/`account`/`addedBy` are fixed placeholders rather than read off
 * the order. Draft and cancelled orders never became a payment, so they are
 * excluded.
 */
export interface PaymentPurchaseRow {
  id: string;
  createdAt: number;
  date: string; /* yyyy-mm-dd */
  reference: string;
  purchaseRef: string;
  supplierName: string;
  paidBy: string;
  account: string;
  amountCents: number;
  addedBy: string;
}

export async function getPaymentPurchasesReport(
  range: DateRange,
): Promise<PaymentPurchaseRow[]> {
  const orders = await db.purchaseOrders
    .where("created_at")
    .between(range.from, range.to, true, true)
    .toArray();

  return orders
    .filter((order) => order.status !== "draft" && order.status !== "cancelled")
    .map((order): PaymentPurchaseRow => ({
      id: order.id,
      createdAt: order.created_at,
      date: localDateKey(order.created_at),
      reference: `INV/${order.reference}`,
      purchaseRef: order.reference,
      supplierName: order.supplier_name,
      paidBy: "Cash",
      account: "—",
      amountCents: order.total_cents,
      addedBy: "—",
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * PendingOrder does not (yet) record a customer or the cashier's display
 * name, so `customerName`/`addedBy` fall back to placeholders rather than
 * `cashier_id`, matching the placeholder approach `getPaymentPurchasesReport`
 * already takes for fields the order doesn't carry. `account` is likewise a
 * placeholder — the till has no concept of a bank account per tender.
 * Refunded sales never resulted in a kept payment, so they are excluded.
 */
export interface PaymentSaleRow {
  id: string;
  createdAt: number;
  date: string; /* yyyy-mm-dd */
  reference: string;
  saleRef: string;
  customerName: string;
  paidBy: string;
  account: string;
  amountCents: number;
  addedBy: string;
}

function paymentMethodLabel(method: PendingOrder["payment_method"]): string {
  switch (method) {
    case "cash":
      return "Cash";
    case "card":
      return "Card";
    case "qr":
      return "QR";
    default:
      return "Other";
  }
}

export async function getPaymentSalesReport(
  range: DateRange,
): Promise<PaymentSaleRow[]> {
  const orders = await ordersInRange(range);

  return orders
    .filter((order) => !order.refunded)
    .map((order): PaymentSaleRow => {
      const saleRef = order.receipt_no ?? `SL_${order.client_generated_id.slice(0, 6)}`;
      return {
        id: order.client_generated_id,
        createdAt: order.created_at,
        date: localDateKey(order.created_at),
        reference: `INV/${saleRef}`,
        saleRef,
        customerName: "walk-in-customer",
        paidBy: paymentMethodLabel(order.payment_method),
        account: "—",
        amountCents: order.total_cents,
        addedBy: "—",
      };
    })
    .sort((a, b) => a.createdAt - b.createdAt);
}
