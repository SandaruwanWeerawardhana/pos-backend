import { db } from "./index";
import { listWarehouses } from "./inventory";
import type { DateRange } from "./reports";
import type { PaymentMethod, PendingOrder, Product } from "@/lib/types";

/**
 * Data for the 3D sales dashboard. Every figure is derived from the same
 * pendingOrders/products tables the rest of the app reads — nothing is
 * fabricated. Two things worth knowing before reading the aggregation code:
 *
 *  - Orders carry no warehouse id (the till doesn't record where a sale was
 *    rung up from). "Filter by warehouse" is answered by tracing each sold
 *    line back to its product's recorded warehouse (opening stock, falling
 *    back to a batch) and bucketing by that. A product with no recorded
 *    warehouse falls into "Unassigned" rather than being guessed at.
 *  - Orders carry no customer id either (see dashboard.ts), so the fourth
 *    headline tile is cashier count, not customer count.
 */

const UNASSIGNED_WAREHOUSE_ID = "__unassigned__";
const UNASSIGNED_WAREHOUSE_NAME = "Unassigned";

async function salesOrdersInRange(range: DateRange): Promise<PendingOrder[]> {
  const orders = await db.pendingOrders
    .where("created_at")
    .between(range.from, range.to, true, true)
    .toArray();
  return orders.filter((order) => !order.refunded);
}

function monthKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function productWarehouseId(product: Product | undefined): string {
  if (!product) return UNASSIGNED_WAREHOUSE_ID;
  const opening = product.opening_stock?.find((entry) => entry.warehouse_id);
  if (opening) return opening.warehouse_id;
  const batch = product.batches?.find((entry) => entry.warehouse_id);
  return batch?.warehouse_id ?? UNASSIGNED_WAREHOUSE_ID;
}

interface AttributedLine {
  order: PendingOrder;
  productId: string;
  name: string;
  quantity: number;
  revenueCents: number;
  warehouseId: string;
}

function flattenLines(
  orders: PendingOrder[],
  productsById: Map<string, Product>,
): AttributedLine[] {
  const lines: AttributedLine[] = [];
  for (const order of orders) {
    for (const item of order.items) {
      lines.push({
        order,
        productId: item.product_id,
        name: item.name,
        quantity: item.quantity,
        revenueCents: item.unit_price_cents * item.quantity,
        warehouseId: productWarehouseId(productsById.get(item.product_id)),
      });
    }
  }
  return lines;
}

export interface Report3DStats {
  revenueCents: number;
  orders: number;
  avgOrderCents: number;
  cashiers: number;
}

export interface GridSeries {
  key: string;
  label: string;
}

/** A month x warehouse (or product x month) grid, ready for the iso bar chart. */
export interface Grid3D {
  columns: GridSeries[]; /* x axis, e.g. months or hours */
  rows: GridSeries[]; /* depth axis, e.g. warehouses, products or days */
  /** values[rowIndex][columnIndex] */
  values: number[][];
}

export interface ProductMetric {
  productId: string;
  name: string;
  quantity: number;
  avgPriceCents: number;
  revenueCents: number;
}

export interface PaymentMethodSlice {
  method: PaymentMethod;
  amountCents: number;
  percent: number;
}

export interface Report3DResult {
  stats: Report3DStats;
  salesByMonthWarehouse: Grid3D;
  topProductsByMonth: Grid3D;
  productMetrics: ProductMetric[];
  paymentMethods: PaymentMethodSlice[];
  /** rows = day of week (Sun-Sat), columns = hour of day (0-23) */
  heatmap: Grid3D;
  warehouses: { id: string; name: string }[];
}

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "card", "qr", "other"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TOP_PRODUCT_LIMIT = 7;
const SCATTER_PRODUCT_LIMIT = 40;

export async function getReports3D(
  range: DateRange,
  warehouseId: string | "all",
): Promise<Report3DResult> {
  const [orders, products, warehouses] = await Promise.all([
    salesOrdersInRange(range),
    db.products.toArray(),
    listWarehouses(),
  ]);
  const productsById = new Map(products.map((product) => [product.id, product]));
  const allLines = flattenLines(orders, productsById);
  const lines =
    warehouseId === "all"
      ? allLines
      : allLines.filter((line) => line.warehouseId === warehouseId);

  const matchingOrderIds =
    warehouseId === "all"
      ? new Set(orders.map((order) => order.client_generated_id))
      : new Set(lines.map((line) => line.order.client_generated_id));
  const matchingOrders = orders.filter((order) =>
    matchingOrderIds.has(order.client_generated_id),
  );

  /* ── Headline stats ──────────────────────────────────────────────────── */
  const revenueCents = matchingOrders.reduce((sum, o) => sum + o.total_cents, 0);
  const cashierIds = new Set(
    matchingOrders.map((o) => o.cashier_id).filter((id): id is string => Boolean(id)),
  );
  const stats: Report3DStats = {
    revenueCents,
    orders: matchingOrders.length,
    avgOrderCents:
      matchingOrders.length > 0 ? Math.round(revenueCents / matchingOrders.length) : 0,
    cashiers: cashierIds.size,
  };

  /* ── Sales by month x warehouse (always shows every warehouse, ignores the
     filter — that's the one chart whose entire point is the split) ──────── */
  const monthKeys = Array.from(new Set(allLines.map((l) => monthKey(l.order.created_at)))).sort();
  const warehouseRows: GridSeries[] = [
    ...warehouses.map((w) => ({ key: w.id, label: w.name })),
  ];
  if (allLines.some((l) => l.warehouseId === UNASSIGNED_WAREHOUSE_ID)) {
    warehouseRows.push({ key: UNASSIGNED_WAREHOUSE_ID, label: UNASSIGNED_WAREHOUSE_NAME });
  }
  const salesByMonthWarehouse: Grid3D = {
    columns: monthKeys.map((k) => ({ key: k, label: k })),
    rows: warehouseRows,
    values: warehouseRows.map((row) =>
      monthKeys.map((col) =>
        allLines
          .filter((l) => l.warehouseId === row.key && monthKey(l.order.created_at) === col)
          .reduce((sum, l) => sum + l.revenueCents, 0),
      ),
    ),
  };

  /* ── Top products by month (respects the warehouse filter) ─────────────── */
  const revenueByProduct = new Map<string, { name: string; revenueCents: number }>();
  for (const line of lines) {
    const entry = revenueByProduct.get(line.productId) ?? { name: line.name, revenueCents: 0 };
    entry.revenueCents += line.revenueCents;
    revenueByProduct.set(line.productId, entry);
  }
  const topProductIds = Array.from(revenueByProduct.entries())
    .sort((a, b) => b[1].revenueCents - a[1].revenueCents)
    .slice(0, TOP_PRODUCT_LIMIT)
    .map(([id]) => id);
  const topProductMonthKeys =
    monthKeys.length > 0 ? monthKeys : [monthKey(range.from)];
  const topProductsByMonth: Grid3D = {
    columns: topProductMonthKeys.map((k) => ({ key: k, label: k })),
    rows: topProductIds.map((id) => ({
      key: id,
      label: revenueByProduct.get(id)?.name ?? id,
    })),
    values: topProductIds.map((id) =>
      topProductMonthKeys.map((col) =>
        lines
          .filter((l) => l.productId === id && monthKey(l.order.created_at) === col)
          .reduce((sum, l) => sum + l.revenueCents, 0),
      ),
    ),
  };

  /* ── Quantity vs price vs revenue scatter (respects the warehouse filter) */
  const productMetrics: ProductMetric[] = Array.from(revenueByProduct.entries())
    .map(([productId, entry]) => {
      const productLines = lines.filter((l) => l.productId === productId);
      const quantity = productLines.reduce((sum, l) => sum + l.quantity, 0);
      return {
        productId,
        name: entry.name,
        quantity,
        avgPriceCents: quantity > 0 ? Math.round(entry.revenueCents / quantity) : 0,
        revenueCents: entry.revenueCents,
      };
    })
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, SCATTER_PRODUCT_LIMIT);

  /* ── Payment methods (respects the warehouse filter via matching orders,
     using each order's full payment split — a payment isn't itemised per
     product line, so it can't be split further than "this order touched the
     selected warehouse") ─────────────────────────────────────────────────── */
  const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, qr: 0, other: 0 };
  for (const order of matchingOrders) {
    if (order.payments?.length) {
      for (const split of order.payments) byMethod[split.method] += split.amount_cents;
    } else {
      byMethod[order.payment_method] += order.total_cents;
    }
  }
  const paymentTotal = PAYMENT_METHODS.reduce((sum, m) => sum + byMethod[m], 0);
  const paymentMethods: PaymentMethodSlice[] = PAYMENT_METHODS.filter(
    (m) => byMethod[m] > 0,
  ).map((method) => ({
    method,
    amountCents: byMethod[method],
    percent: paymentTotal > 0 ? Math.round((byMethod[method] / paymentTotal) * 100) : 0,
  }));

  /* ── Sales heatmap: hour x day-of-week, order-level (same reasoning as
     payment methods — an hour/day belongs to the whole order) ───────────── */
  const heatmapValues = DAY_LABELS.map(() => Array.from({ length: 24 }, () => 0));
  for (const order of matchingOrders) {
    const date = new Date(order.created_at);
    heatmapValues[date.getDay()][date.getHours()] += order.total_cents;
  }
  const heatmap: Grid3D = {
    columns: Array.from({ length: 24 }, (_, hour) => ({
      key: String(hour),
      label: `${String(hour).padStart(2, "0")}h`,
    })),
    rows: DAY_LABELS.map((label, index) => ({ key: String(index), label })),
    values: heatmapValues,
  };

  return {
    stats,
    salesByMonthWarehouse,
    topProductsByMonth,
    productMetrics,
    paymentMethods,
    heatmap,
    warehouses: warehouses.map((w) => ({ id: w.id, name: w.name })),
  };
}
