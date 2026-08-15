import { db } from "./index";
import { getInventoryAlerts } from "./inventory";
import { ROUTES } from "@/lib/types/routes";
import type { NotificationKind } from "@/lib/types";

/* Local-only table, no server sync yet (no backend endpoint exists). */

export async function pushNotification(input: {
  id?: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
}): Promise<void> {
  /**
   * A caller-supplied id makes the write idempotent: the inventory sweep
   * re-derives the same ids each run, so a standing alert updates in place
   * instead of piling up a duplicate every refresh.
   */
  const id = input.id ?? crypto.randomUUID();
  const existing = await db.notifications.get(id);
  await db.notifications.put({
    id,
    kind: input.kind,
    title: input.title,
    read: existing?.read ?? false,
    created_at: existing?.created_at ?? Date.now(),
    ...(input.body ? { body: input.body } : {}),
    ...(input.href ? { href: input.href } : {}),
  });
}

export async function markNotificationRead(id: string): Promise<void> {
  await db.notifications.update(id, { read: true });
}

export async function markAllNotificationsRead(): Promise<void> {
  await db.notifications.toCollection().modify({ read: true });
}

/**
 * Rebuilds the stock/expiry alert set from current inventory. Stale alerts
 * (the product was restocked, the batch was sold) are removed so the panel
 * only ever shows conditions that are still true right now.
 */
export async function refreshInventoryNotifications(): Promise<void> {
  const alerts = await getInventoryAlerts();
  const liveIds = new Set<string>();

  for (const product of alerts.outOfStock) {
    const id = `out_of_stock:${product.id}`;
    liveIds.add(id);
    await pushNotification({
      id,
      kind: "out_of_stock",
      title: `${product.name} is out of stock`,
      body: "Reorder to keep it sellable at the till.",
      href: ROUTES.inventory.root,
    });
  }

  for (const product of alerts.lowStock) {
    const id = `low_stock:${product.id}`;
    liveIds.add(id);
    await pushNotification({
      id,
      kind: "low_stock",
      title: `${product.name} is running low`,
      body: `${product.stock_quantity} left in stock.`,
      href: ROUTES.inventory.root,
    });
  }

  for (const entry of alerts.expired) {
    const id = `expired:${entry.product.id}:${entry.batch.batch_no}`;
    liveIds.add(id);
    await pushNotification({
      id,
      kind: "expired",
      title: `${entry.product.name} batch ${entry.batch.batch_no} has expired`,
      body: `Expired on ${entry.batch.expiry_date}. Remove from shelf.`,
      href: ROUTES.inventory.alerts,
    });
  }

  for (const entry of alerts.nearExpiry) {
    const id = `expiry:${entry.product.id}:${entry.batch.batch_no}`;
    liveIds.add(id);
    await pushNotification({
      id,
      kind: "expiry",
      title: `${entry.product.name} expires in ${entry.daysRemaining} day${
        entry.daysRemaining === 1 ? "" : "s"
      }`,
      body: `Batch ${entry.batch.batch_no} — consider a markdown.`,
      href: ROUTES.inventory.alerts,
    });
  }

  const inventoryKinds: NotificationKind[] = [
    "low_stock",
    "out_of_stock",
    "expiry",
    "expired",
  ];
  const stale = await db.notifications
    .filter(
      (notification) =>
        inventoryKinds.includes(notification.kind) && !liveIds.has(notification.id),
    )
    .primaryKeys();
  if (stale.length > 0) await db.notifications.bulkDelete(stale);
}
