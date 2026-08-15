import { db } from "./index";
import { getStoreSettings } from "./settings";
import type {
  Product,
  ProductBatch,
  StockMovement,
  StockMovementType,
  Warehouse,
} from "@/lib/types";

/* Local-only tables, no server sync yet (no backend endpoint exists). */

const DAY_MS = 86_400_000;

export interface StockAdjustmentInput {
  productId: string;
  quantityDelta: number; /* signed */
  type: StockMovementType;
  reason?: string;
  warehouseId?: string;
  batchNo?: string;
  createdBy?: string;
  referenceId?: string;
}

/**
 * Single entry point for every stock change outside the sale path: applies
 * the delta to the product and journals it atomically, so the product's
 * `stock_quantity` and the movement ledger can never disagree.
 */
export async function recordStockMovement(
  input: StockAdjustmentInput,
): Promise<StockMovement | null> {
  return db.transaction("rw", db.products, db.stockMovements, async () => {
    const product = await db.products.get(input.productId);
    if (!product) return null;

    const balanceAfter = Math.max(
      0,
      product.stock_quantity + input.quantityDelta,
    );
    await db.products.update(product.id, { stock_quantity: balanceAfter });

    const movement: StockMovement = {
      id: crypto.randomUUID(),
      product_id: product.id,
      product_name: product.name,
      type: input.type,
      quantity_delta: input.quantityDelta,
      balance_after: balanceAfter,
      created_at: Date.now(),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.warehouseId ? { warehouse_id: input.warehouseId } : {}),
      ...(input.batchNo ? { batch_no: input.batchNo } : {}),
      ...(input.createdBy ? { created_by: input.createdBy } : {}),
      ...(input.referenceId ? { reference_id: input.referenceId } : {}),
    };
    await db.stockMovements.add(movement);
    return movement;
  });
}

/**
 * Moves stock between warehouses as a matched out/in pair sharing a reason,
 * so a transfer reads as one event in the history even though the ledger
 * stores both legs.
 */
export async function transferStock(input: {
  productId: string;
  quantity: number;
  fromWarehouseId: string;
  toWarehouseId: string;
  reason?: string;
}): Promise<void> {
  const reason = input.reason ?? "Warehouse transfer";
  await recordStockMovement({
    productId: input.productId,
    quantityDelta: -Math.abs(input.quantity),
    type: "transfer_out",
    warehouseId: input.fromWarehouseId,
    reason,
  });
  await recordStockMovement({
    productId: input.productId,
    quantityDelta: Math.abs(input.quantity),
    type: "transfer_in",
    warehouseId: input.toWarehouseId,
    reason,
  });
}

export async function listStockMovements(options?: {
  productId?: string;
  type?: StockMovementType;
  limit?: number;
}): Promise<StockMovement[]> {
  let movements = await db.stockMovements
    .orderBy("created_at")
    .reverse()
    .toArray();

  if (options?.productId) {
    movements = movements.filter((m) => m.product_id === options.productId);
  }
  if (options?.type) {
    movements = movements.filter((m) => m.type === options.type);
  }
  return options?.limit ? movements.slice(0, options.limit) : movements;
}

/* ── Alerts ───────────────────────────────────────────────────────────────── */

export interface ExpiringBatch {
  product: Product;
  batch: ProductBatch;
  daysRemaining: number;
}

export interface InventoryAlerts {
  lowStock: Product[];
  outOfStock: Product[];
  nearExpiry: ExpiringBatch[];
  expired: ExpiringBatch[];
}

function daysUntil(isoDate: string): number {
  const target = new Date(`${isoDate}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / DAY_MS);
}

/**
 * A product's own `reorder_level` wins when set; otherwise the store-wide
 * low-stock threshold applies. Out-of-stock is reported separately so the
 * two badges never double-count the same product.
 */
export async function getInventoryAlerts(): Promise<InventoryAlerts> {
  const [products, settings] = await Promise.all([
    db.products.toArray(),
    getStoreSettings(),
  ]);

  const lowStock: Product[] = [];
  const outOfStock: Product[] = [];
  const nearExpiry: ExpiringBatch[] = [];
  const expired: ExpiringBatch[] = [];

  for (const product of products) {
    const threshold = product.reorder_level ?? settings.low_stock_threshold;
    if (product.stock_quantity <= 0) {
      outOfStock.push(product);
    } else if (product.stock_quantity <= threshold) {
      lowStock.push(product);
    }

    for (const batch of product.batches ?? []) {
      if (!batch.expiry_date || batch.quantity <= 0) continue;
      const daysRemaining = daysUntil(batch.expiry_date);
      if (daysRemaining < 0) {
        expired.push({ product, batch, daysRemaining });
      } else if (daysRemaining <= settings.expiry_warning_days) {
        nearExpiry.push({ product, batch, daysRemaining });
      }
    }
  }

  nearExpiry.sort((a, b) => a.daysRemaining - b.daysRemaining);
  expired.sort((a, b) => a.daysRemaining - b.daysRemaining);
  return { lowStock, outOfStock, nearExpiry, expired };
}

export type BatchStatus = "active" | "expiring_soon" | "expired" | "depleted";

export interface ProductBatchRow {
  product_id: string;
  product_name: string;
  batch_no: string;
  warehouse_id?: string;
  expiry_date: string | null;
  quantity: number;
  cost_cents?: number;
  status: BatchStatus;
  days_remaining: number | null;
}

/**
 * Every batch across every product, flattened for the Batches screen. Status
 * mirrors `getInventoryAlerts`' near-expiry/expired split, plus "depleted"
 * for a batch whose quantity has been sold or adjusted down to zero.
 */
export async function listProductBatches(): Promise<ProductBatchRow[]> {
  const [products, settings] = await Promise.all([
    db.products.toArray(),
    getStoreSettings(),
  ]);

  const rows: ProductBatchRow[] = [];
  for (const product of products) {
    for (const batch of product.batches ?? []) {
      const daysRemaining = batch.expiry_date ? daysUntil(batch.expiry_date) : null;

      let status: BatchStatus;
      if (batch.quantity <= 0) {
        status = "depleted";
      } else if (daysRemaining === null) {
        status = "active";
      } else if (daysRemaining < 0) {
        status = "expired";
      } else if (daysRemaining <= settings.expiry_warning_days) {
        status = "expiring_soon";
      } else {
        status = "active";
      }

      rows.push({
        product_id: product.id,
        product_name: product.name,
        batch_no: batch.batch_no,
        warehouse_id: batch.warehouse_id,
        expiry_date: batch.expiry_date,
        quantity: batch.quantity,
        cost_cents: batch.cost_cents,
        status,
        days_remaining: daysRemaining,
      });
    }
  }

  return rows;
}

/* ── Valuation ────────────────────────────────────────────────────────────── */

export interface InventoryValuation {
  retailValueCents: number;
  costValueCents: number;
  potentialProfitCents: number;
  productCount: number;
  unitCount: number;
}

export async function getInventoryValuation(): Promise<InventoryValuation> {
  const products = await db.products.toArray();
  let retailValueCents = 0;
  let costValueCents = 0;
  let unitCount = 0;

  for (const product of products) {
    retailValueCents += product.price_cents * product.stock_quantity;
    costValueCents += (product.cost_cents ?? 0) * product.stock_quantity;
    unitCount += product.stock_quantity;
  }

  return {
    retailValueCents,
    costValueCents,
    potentialProfitCents: retailValueCents - costValueCents,
    productCount: products.length,
    unitCount,
  };
}

/* ── Warehouses ───────────────────────────────────────────────────────────── */

export async function listWarehouses(): Promise<Warehouse[]> {
  return db.warehouses.orderBy("name").toArray();
}

export async function createWarehouse(
  input: Omit<Warehouse, "id" | "created_at">,
): Promise<Warehouse> {
  const warehouse: Warehouse = {
    ...input,
    id: crypto.randomUUID(),
    created_at: Date.now(),
  };
  await db.warehouses.add(warehouse);
  return warehouse;
}

/**
 * Seeds the single default location so transfer UI has something to point at
 * on a fresh install. No-op once any warehouse exists.
 */
export async function ensureDefaultWarehouse(): Promise<void> {
  const count = await db.warehouses.count();
  if (count > 0) return;
  await createWarehouse({ name: "Main store", is_default: true });
}
