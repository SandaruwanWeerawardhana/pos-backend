import { db } from "./index";
import { getStoreSettings } from "./settings";
import { getInventoryAlerts } from "./inventory";
import { getProfitReport, localDateKey, type DateRange } from "./reports";
import type { PaymentMethod, PendingOrder, Product } from "@/lib/types";

/**
 * Dashboard-specific aggregates. Every figure here comes from the same local
 * tables the rest of the app reads (pendingOrders, purchaseOrders,
 * purchaseReturns, products) — nothing is fabricated. Two Stocky-style
 * widgets have no backing data in this schema and are intentionally left out
 * of this module rather than faked:
 *  - "Sales due" / "purchase due": the till has no credit-sale or partial-
 *    payment-on-purchase concept, every order is paid in full at checkout.
 *  - "Top customers": orders don't carry a customer id/name.
 */

const DAY_MS = 86_400_000;
const MONTHLY_BUCKET_THRESHOLD_DAYS = 31;

function previousPeriod(range: DateRange): DateRange {
  const span = range.to - range.from + 1;
  return { from: range.from - span, to: range.from - 1 };
}

async function salesOrdersInRange(range: DateRange): Promise<PendingOrder[]> {
  return db.pendingOrders
    .where("created_at")
    .between(range.from, range.to, true, true)
    .toArray();
}

async function purchaseOrdersInRange(range: DateRange) {
  return db.purchaseOrders
    .where("created_at")
    .between(range.from, range.to, true, true)
    .toArray();
}

async function purchaseReturnsInRange(range: DateRange) {
  return db.purchaseReturns
    .where("created_at")
    .between(range.from, range.to, true, true)
    .toArray();
}

/* ── Overview KPIs ────────────────────────────────────────────────────────── */

export interface DashboardOverview {
  salesCents: number;
  purchasesCents: number;
  salesReturnCents: number;
  purchaseReturnCents: number;
  invoiceCount: number;
  profitCents: number;
  /**
   * Always 0 in this schema: the till has no credit-sale concept (every
   * order is paid in full at checkout) and purchase orders carry no
   * paid/due split. Kept as a real field rather than a literal in the UI so
   * the "why" lives next to the number, not hidden in a component.
   */
  salesDueCents: number;
  purchaseDueCents: number;
}

export async function getDashboardOverview(
  range: DateRange,
): Promise<DashboardOverview> {
  const [orders, purchaseOrders, purchaseReturns, profitRows] =
    await Promise.all([
      salesOrdersInRange(range),
      purchaseOrdersInRange(range),
      purchaseReturnsInRange(range),
      getProfitReport(range),
    ]);

  let salesCents = 0;
  let salesReturnCents = 0;
  let invoiceCount = 0;
  for (const order of orders) {
    if (order.refunded) {
      salesReturnCents += order.total_cents;
    } else {
      salesCents += order.total_cents;
      invoiceCount += 1;
    }
  }

  const purchasesCents = purchaseOrders.reduce(
    (sum, order) => sum + order.total_cents,
    0,
  );
  const purchaseReturnCents = purchaseReturns.reduce(
    (sum, ret) => sum + ret.total_cents,
    0,
  );
  const profitCents = profitRows.reduce((sum, row) => sum + row.profitCents, 0);

  return {
    salesCents,
    purchasesCents,
    salesReturnCents,
    purchaseReturnCents,
    invoiceCount,
    profitCents,
    salesDueCents: 0,
    purchaseDueCents: 0,
  };
}

/* ── Sales vs purchases series ────────────────────────────────────────────── */

export interface SeriesPoint {
  key: string; /* yyyy-mm-dd or yyyy-mm, bucket identity */
  label: string; /* short display label */
  salesCents: number;
  purchasesCents: number;
}

function monthKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Daily buckets for ranges up to a month; monthly buckets beyond that, so a
 * "this year" filter renders 12 bars instead of 365 unreadable slivers.
 */
export async function getSalesPurchasesSeries(
  range: DateRange,
  locale: string,
): Promise<SeriesPoint[]> {
  const [orders, purchaseOrders] = await Promise.all([
    salesOrdersInRange(range),
    purchaseOrdersInRange(range),
  ]);

  const spanDays = Math.ceil((range.to - range.from) / DAY_MS) + 1;
  const monthly = spanDays > MONTHLY_BUCKET_THRESHOLD_DAYS;
  const keyOf = monthly ? monthKey : localDateKey;

  const buckets = new Map<string, SeriesPoint>();
  const order = (monthly ? monthlyBucketKeys : dailyBucketKeys)(range, locale);
  for (const point of order) buckets.set(point.key, point);

  for (const sale of orders) {
    if (sale.refunded) continue;
    const key = keyOf(sale.created_at);
    const bucket = buckets.get(key);
    if (bucket) bucket.salesCents += sale.total_cents;
  }
  for (const purchase of purchaseOrders) {
    const key = keyOf(purchase.created_at);
    const bucket = buckets.get(key);
    if (bucket) bucket.purchasesCents += purchase.total_cents;
  }

  return Array.from(buckets.values());
}

function dailyBucketKeys(range: DateRange, locale: string): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  const cursor = new Date(range.from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(range.to);
  while (cursor.getTime() <= end.getTime()) {
    points.push({
      key: localDateKey(cursor.getTime()),
      label: cursor.toLocaleDateString(locale, { month: "short", day: "numeric" }),
      salesCents: 0,
      purchasesCents: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

function monthlyBucketKeys(range: DateRange, locale: string): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  const cursor = new Date(range.from);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(range.to);
  while (cursor.getTime() <= end.getTime()) {
    points.push({
      key: monthKey(cursor.getTime()),
      label: cursor.toLocaleDateString(locale, { month: "short", year: "2-digit" }),
      salesCents: 0,
      purchasesCents: 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return points;
}

/* ── Payment breakdown ────────────────────────────────────────────────────── */

export interface PaymentBreakdownRow {
  method: PaymentMethod;
  amountCents: number;
  percent: number;
}

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "card", "qr", "other"];

export async function getPaymentBreakdown(
  range: DateRange,
): Promise<PaymentBreakdownRow[]> {
  const orders = (await salesOrdersInRange(range)).filter((o) => !o.refunded);
  const byMethod: Record<PaymentMethod, number> = {
    cash: 0,
    card: 0,
    qr: 0,
    other: 0,
  };

  for (const order of orders) {
    if (order.payments?.length) {
      for (const split of order.payments) {
        byMethod[split.method] += split.amount_cents;
      }
    } else {
      byMethod[order.payment_method] += order.total_cents;
    }
  }

  const total = PAYMENT_METHODS.reduce((sum, m) => sum + byMethod[m], 0);
  return PAYMENT_METHODS.map((method) => ({
    method,
    amountCents: byMethod[method],
    percent: total > 0 ? Math.round((byMethod[method] / total) * 100) : 0,
  }));
}

/* ── Top selling products ─────────────────────────────────────────────────── */

export interface TopProductSlice {
  productId: string;
  name: string;
  quantitySold: number;
  revenueCents: number;
  percent: number;
}

export interface TopProductsResult {
  items: TopProductSlice[];
  otherQuantity: number;
  totalQuantity: number;
}

/**
 * Capped at 3 named slices (plus an "Other" bucket) rather than 5 — see the
 * dataviz skill: past three categorical slots in a ring chart, the fourth
 * validated hue (yellow) sits too close to the third (orange) under
 * all-pairs comparison, so a 4th+ slice folds into a neutral "Other" wedge
 * instead of taking on a new hue.
 */
export async function getTopSellingProducts(
  range: DateRange,
  limit = 3,
): Promise<TopProductsResult> {
  const rows = await getProfitReport(range);
  const byQuantity = [...rows].sort((a, b) => b.quantitySold - a.quantitySold);
  const totalQuantity = byQuantity.reduce((sum, r) => sum + r.quantitySold, 0);
  const top = byQuantity.slice(0, limit);
  const otherQuantity = totalQuantity - top.reduce((sum, r) => sum + r.quantitySold, 0);

  return {
    items: top.map((row) => ({
      productId: row.productId,
      name: row.name,
      quantitySold: row.quantitySold,
      revenueCents: row.revenueCents,
      percent: totalQuantity > 0 ? Math.round((row.quantitySold / totalQuantity) * 100) : 0,
    })),
    otherQuantity,
    totalQuantity,
  };
}

export interface TopProductTableRow {
  productId: string;
  name: string;
  quantitySold: number;
  revenueCents: number;
}

export async function getTopSellingProductsTable(
  range: DateRange,
  limit = 5,
): Promise<TopProductTableRow[]> {
  const rows = await getProfitReport(range);
  return [...rows]
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, limit)
    .map((row) => ({
      productId: row.productId,
      name: row.name,
      quantitySold: row.quantitySold,
      revenueCents: row.revenueCents,
    }));
}

/* ── Stock value ──────────────────────────────────────────────────────────── */

export interface StockValueSummary {
  costCents: number;
  retailCents: number;
}

export async function getStockValueSummary(): Promise<StockValueSummary> {
  const products = await db.products.toArray();
  let costCents = 0;
  let retailCents = 0;
  for (const product of products) {
    costCents += (product.cost_cents ?? 0) * product.stock_quantity;
    retailCents += product.price_cents * product.stock_quantity;
  }
  return { costCents, retailCents };
}

/* ── Stock alerts ─────────────────────────────────────────────────────────── */

export interface StockAlertRow {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  alertQuantity: number;
  severity: "out" | "low";
}

export async function getStockAlertRows(limit = 5): Promise<StockAlertRow[]> {
  const [{ outOfStock, lowStock }, settings] = await Promise.all([
    getInventoryAlerts(),
    getStoreSettings(),
  ]);

  const toRow = (product: Product, severity: StockAlertRow["severity"]): StockAlertRow => ({
    productId: product.id,
    sku: product.sku,
    name: product.name,
    quantity: product.stock_quantity,
    alertQuantity: product.reorder_level ?? settings.low_stock_threshold,
    severity,
  });

  return [
    ...outOfStock.map((p) => toRow(p, "out")),
    ...lowStock.map((p) => toRow(p, "low")),
  ].slice(0, limit);
}

/* ── Recent sales ─────────────────────────────────────────────────────────── */

export async function getRecentSalesRows(limit = 5): Promise<PendingOrder[]> {
  return db.pendingOrders.orderBy("created_at").reverse().limit(limit).toArray();
}

/* ── Insights (rule-based, not a model call) ─────────────────────────────── */

export interface DashboardInsight {
  tone: "up" | "down" | "warning" | "neutral";
  text: string;
}

/**
 * Plain arithmetic over the same aggregates the rest of the dashboard shows —
 * there's no LLM or backend AI service wired into this local-first app, so
 * this is a small rule engine rather than the "AI Reports" a hosted product
 * might offer. Labelled "Insights" in the UI for that reason.
 */
export async function getDashboardInsights(
  range: DateRange,
): Promise<DashboardInsight[]> {
  const previous = previousPeriod(range);
  const [current, prior, topTable, alerts] = await Promise.all([
    getDashboardOverview(range),
    getDashboardOverview(previous),
    getTopSellingProductsTable(range, 1),
    getInventoryAlerts(),
  ]);

  const insights: DashboardInsight[] = [];

  if (prior.salesCents > 0) {
    const deltaPercent = Math.round(
      ((current.salesCents - prior.salesCents) / prior.salesCents) * 100,
    );
    insights.push({
      tone: deltaPercent >= 0 ? "up" : "down",
      text:
        deltaPercent >= 0
          ? `Sales up ${deltaPercent}% vs. the previous period.`
          : `Sales down ${Math.abs(deltaPercent)}% vs. the previous period.`,
    });
  } else if (current.salesCents > 0) {
    insights.push({ tone: "up", text: "No sales recorded in the previous period to compare against." });
  }

  if (current.salesCents > 0) {
    const marginPercent = Math.round((current.profitCents / current.salesCents) * 100);
    insights.push({
      tone: marginPercent >= 0 ? "neutral" : "down",
      text: `Profit margin is ${marginPercent}% over this period.`,
    });
  }

  if (topTable[0]) {
    insights.push({
      tone: "neutral",
      text: `${topTable[0].name} is the top mover, with ${topTable[0].quantitySold} sold.`,
    });
  }

  const alertCount = alerts.lowStock.length + alerts.outOfStock.length;
  if (alertCount > 0) {
    insights.push({
      tone: "warning",
      text: `${alertCount} product${alertCount > 1 ? "s" : ""} at or below reorder level — check Stock alerts.`,
    });
  }

  return insights;
}
