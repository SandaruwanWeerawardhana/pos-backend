import { db } from "./index";
import type { CashReconciliation, PaymentMethod } from "@/lib/types";

export interface TodaysOrderSummary {
  byPaymentMethod: Record<PaymentMethod, number>; /* cents */
  orderCount: number;
  totalCents: number;
}

function startOfToday(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

/**
 * Groups today's local orders by payment method - the basis for an
 * end-of-day cash count. Includes every local order regardless of
 * sync_status (an order that failed to sync still took real cash).
 *
 * Refunded orders are excluded, matching the sales list and every report. The
 * drawer is counted against this figure, so leaving a refund in it reported the
 * till as short by the refunded amount every single day after the refund.
 */
export async function getTodaysOrderSummary(): Promise<TodaysOrderSummary> {
  const since = startOfToday();
  const orders = (
    await db.pendingOrders.where("created_at").aboveOrEqual(since).toArray()
  ).filter((order) => !order.refunded);

  const byPaymentMethod: Record<PaymentMethod, number> = {
    cash: 0,
    card: 0,
    qr: 0,
    other: 0,
  };
  let totalCents = 0;

  for (const order of orders) {
    /*
     * Split-tender orders record each leg separately so the cash drawer
     * expectation only counts the part actually paid in cash.
     */
    if (order.payments?.length) {
      for (const split of order.payments) {
        byPaymentMethod[split.method] += split.amount_cents;
      }
    } else {
      byPaymentMethod[order.payment_method] += order.total_cents;
    }
    totalCents += order.total_cents;
  }

  return { byPaymentMethod, orderCount: orders.length, totalCents };
}

export async function recordCashReconciliation(
  countedCents: number,
  notes?: string,
): Promise<CashReconciliation> {
  const { byPaymentMethod } = await getTodaysOrderSummary();
  const expected_cents = byPaymentMethod.cash;

  const record: CashReconciliation = {
    id: crypto.randomUUID(),
    expected_cents,
    counted_cents: countedCents,
    difference_cents: countedCents - expected_cents,
    ...(notes ? { notes } : {}),
    created_at: Date.now(),
  };

  await db.cashReconciliations.add(record);
  return record;
}

export async function listCashReconciliations(): Promise<CashReconciliation[]> {
  return db.cashReconciliations.orderBy("created_at").reverse().toArray();
}
