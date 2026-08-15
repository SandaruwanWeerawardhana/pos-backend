import { db } from "./index";
import { recordStockMovement } from "./inventory";
import type {
  ProductBatch,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  PurchaseReturn,
} from "@/lib/types";

// Local-only tables, no server sync yet (no backend endpoint exists).

function lineTotalCents(line: PurchaseOrderLine): number {
  return line.unit_cost_cents * line.quantity_ordered;
}

export function purchaseOrderTotalCents(lines: PurchaseOrderLine[]): number {
  return lines.reduce((total, line) => total + lineTotalCents(line), 0);
}

// PO references are sequential per day, mirroring receipt numbering so staff
// see one consistent document-number format across the app.
async function nextPurchaseReference(): Promise<string> {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const record = await db.syncMeta.get("purchase_sequence");
  const previous =
    typeof record?.value === "object" && record.value !== null
      ? (record.value as { date: string; seq: number })
      : { date: "", seq: 0 };
  const seq = previous.date === datePart ? previous.seq + 1 : 1;
  await db.syncMeta.put({
    key: "purchase_sequence",
    value: { date: datePart, seq },
  });
  return `PO-${datePart}-${String(seq).padStart(3, "0")}`;
}

export async function listPurchaseOrders(options?: {
  status?: PurchaseOrderStatus;
  supplierId?: string;
}): Promise<PurchaseOrder[]> {
  let orders = await db.purchaseOrders
    .orderBy("created_at")
    .reverse()
    .toArray();
  if (options?.status) {
    orders = orders.filter((order) => order.status === options.status);
  }
  if (options?.supplierId) {
    orders = orders.filter((order) => order.supplier_id === options.supplierId);
  }
  return orders;
}

export async function getPurchaseOrder(
  id: string,
): Promise<PurchaseOrder | undefined> {
  return db.purchaseOrders.get(id);
}

export async function createPurchaseOrder(input: {
  supplierId: string;
  supplierName: string;
  lines: PurchaseOrderLine[];
  status?: PurchaseOrderStatus;
  expectedAt?: number;
  notes?: string;
}): Promise<PurchaseOrder> {
  const order: PurchaseOrder = {
    id: crypto.randomUUID(),
    reference: await nextPurchaseReference(),
    supplier_id: input.supplierId,
    supplier_name: input.supplierName,
    status: input.status ?? "draft",
    lines: input.lines,
    total_cents: purchaseOrderTotalCents(input.lines),
    created_at: Date.now(),
    ...(input.expectedAt ? { expected_at: input.expectedAt } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  };
  await db.purchaseOrders.add(order);
  return order;
}

export async function updatePurchaseOrderStatus(
  id: string,
  status: PurchaseOrderStatus,
): Promise<void> {
  await db.purchaseOrders.update(id, { status });
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  await db.purchaseOrders.delete(id);
}

export interface ReceiptLineInput {
  productId: string;
  quantity: number;
  batchNo?: string;
  expiryDate?: string | null;
}

// Books goods in against a PO: raises stock, appends the batch to the
// product (so expiry tracking has something to watch), and advances the PO
// to "partial" or "received" depending on whether anything is still owed.
export async function receiveGoods(
  purchaseOrderId: string,
  received: ReceiptLineInput[],
): Promise<PurchaseOrder | undefined> {
  const order = await db.purchaseOrders.get(purchaseOrderId);
  if (!order) return undefined;

  for (const entry of received) {
    if (entry.quantity <= 0) continue;
    const line = order.lines.find((l) => l.product_id === entry.productId);
    if (!line) continue;

    line.quantity_received = Math.min(
      line.quantity_ordered,
      line.quantity_received + entry.quantity,
    );

    await recordStockMovement({
      productId: entry.productId,
      quantityDelta: entry.quantity,
      type: "purchase",
      reason: `Goods received ${order.reference}`,
      referenceId: order.id,
      batchNo: entry.batchNo,
    });

    if (entry.batchNo) {
      const product = await db.products.get(entry.productId);
      if (product) {
        const batch: ProductBatch = {
          batch_no: entry.batchNo,
          expiry_date: entry.expiryDate ?? null,
          quantity: entry.quantity,
          cost_cents: line.unit_cost_cents,
        };
        await db.products.update(entry.productId, {
          batches: [...(product.batches ?? []), batch],
          cost_cents: line.unit_cost_cents,
        });
      }
    }
  }

  const fullyReceived = order.lines.every(
    (line) => line.quantity_received >= line.quantity_ordered,
  );
  const anyReceived = order.lines.some((line) => line.quantity_received > 0);
  order.status = fullyReceived ? "received" : anyReceived ? "partial" : order.status;
  if (fullyReceived) order.received_at = Date.now();

  await db.purchaseOrders.put(order);
  return order;
}

export async function listPurchaseReturns(): Promise<PurchaseReturn[]> {
  return db.purchaseReturns.orderBy("created_at").reverse().toArray();
}

// Sends stock back to the supplier: journals a negative "return" movement per
// line so the ledger explains where the units went.
export async function createPurchaseReturn(input: {
  purchaseOrderId: string;
  supplierName: string;
  reason: string;
  lines: {
    product_id: string;
    product_name: string;
    quantity: number;
    unit_cost_cents: number;
  }[];
}): Promise<PurchaseReturn> {
  const record: PurchaseReturn = {
    id: crypto.randomUUID(),
    purchase_order_id: input.purchaseOrderId,
    supplier_name: input.supplierName,
    reason: input.reason,
    lines: input.lines,
    total_cents: input.lines.reduce(
      (total, line) => total + line.unit_cost_cents * line.quantity,
      0,
    ),
    created_at: Date.now(),
  };

  await db.purchaseReturns.add(record);

  for (const line of input.lines) {
    await recordStockMovement({
      productId: line.product_id,
      quantityDelta: -Math.abs(line.quantity),
      type: "return",
      reason: `Purchase return: ${input.reason}`,
    });
  }

  return record;
}
