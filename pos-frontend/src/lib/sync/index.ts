import { apiClient, type SyncOrderResult } from "@/lib/api";
import { ApiError } from "@/lib/services/http-client";
import {
  clearPendingProductDelete,
  db,
  listEditedProducts,
  listPendingProductDeletes,
  listUnpushedProducts,
  markProductPushed,
  markProductUpdatePushed,
  seedProducts,
  setLastSyncedAt,
} from "@/lib/db";
import type { PendingOrder, SyncStatus } from "@/lib/types";
import { SYNC_CONFIG } from "@/lib/types/sync.config";
import { useConnectionStore } from "@/lib/store/connection";

const BASE_INTERVAL_MS: number = SYNC_CONFIG.baseIntervalMs;
const MAX_BACKOFF_MS: number = SYNC_CONFIG.maxBackoffMs;
const MAX_BATCH_SIZE: number = SYNC_CONFIG.maxBatchSize;
const SYNCABLE_STATUSES: SyncStatus[] = ["pending", "error"];

/**
 * Atomically claims up to maxBatchSize syncable orders by flipping them to
 * "syncing" inside the same transaction that reads them. This is what
 * prevents a second concurrent sync run (e.g. the 30s tick firing right as
 * an online-transition run is still in flight) from picking up and
 * double-sending the same orders - once claimed, a row is no longer
 * "pending"/"error" so a concurrent read simply won't see it.
 */
async function claimBatch(maxBatchSize: number): Promise<PendingOrder[]> {
  return db.transaction("rw", db.pendingOrders, async () => {
    const batch = await db.pendingOrders
      .where("sync_status")
      .anyOf(SYNCABLE_STATUSES)
      .limit(maxBatchSize)
      .toArray();

    if (batch.length === 0) return [];

    await db.pendingOrders.bulkUpdate(
      batch.map((order) => ({
        key: order.client_generated_id,
        changes: { sync_status: "syncing" satisfies SyncStatus },
      })),
    );

    return batch;
  });
}

/**
 * A "syncing" claim only lives for the duration of one in-process run, so any
 * order still marked "syncing" at startup was orphaned by a reload or crash
 * mid-push. Nothing would ever pick those up again (they're neither "pending"
 * nor "error"), so release them back to "pending" before the first cycle.
 */
async function releaseOrphanedClaims(): Promise<void> {
  await db.pendingOrders
    .where("sync_status")
    .equals("syncing")
    .modify({ sync_status: "pending" satisfies SyncStatus });
}

/**
 * Statuses that mean "this exact body will never be accepted, however often it
 * is resent". POST /orders/sync validates the whole batch before it looks at
 * any order, so one malformed sale 400s the entire request — and marking the
 * batch "error" put it straight back in the claim queue, blocking every sale
 * behind it forever. Those go to "conflict" instead, which is terminal on the
 * client and leaves the rest of the queue draining.
 *
 * Deliberately excluded: 401/403 (a re-login fixes them), 408/429 (explicitly
 * "try later") and every 5xx. Stranding a real sale is worse than retrying one.
 */
const PERMANENT_REJECTION_STATUSES = new Set([400, 413, 422]);

function isPermanentRejection(error: unknown): boolean {
  return (
    error instanceof ApiError && PERMANENT_REJECTION_STATUSES.has(error.status)
  );
}

function mapSyncResultToStatus(result: SyncOrderResult): SyncStatus {
  switch (result) {
    case "synced":
    case "already_synced":
      return "synced";
    case "conflict":
      return "conflict";
    case "error":
      return "error";
    default:
      return "error";
  }
}

/* Background reconciliation between IndexedDB and the server. */
export class SyncManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeConnection: (() => void) | null = null;
  private running = false;
  private failureStreak = 0;

  constructor(
    private readonly intervalMs = BASE_INTERVAL_MS,
    private readonly maxBackoffMs = MAX_BACKOFF_MS,
    private readonly maxBatchSize = MAX_BATCH_SIZE,
  ) {}

  /*
   * Runs immediately if already online, then re-runs on a timer while
   * online, and on every offline -> online transition.
   */
  start() {
    if (this.unsubscribeConnection) return; /* already started */

    this.unsubscribeConnection = useConnectionStore.subscribe((curr, prev) => {
      if (curr.online === prev.online) return;
      if (curr.online) {
        this.failureStreak = 0;
        this.scheduleNext(0);
      } else {
        this.clearTimer();
      }
    });

    /*
     * Recover orphaned claims before the first cycle so they're visible as
     * "pending" to the very first claimBatch() rather than a cycle later.
     */
    void releaseOrphanedClaims().finally(() => {
      if (!this.unsubscribeConnection) return; /* stopped while recovering */
      if (useConnectionStore.getState().online) {
        this.scheduleNext(0);
      }
    });
  }

  stop() {
    this.clearTimer();
    this.unsubscribeConnection?.();
    this.unsubscribeConnection = null;
  }

  /* Manual trigger for the useSyncStatus() hook's triggerSync(). */
  async triggerSync(): Promise<void> {
    await this.syncOnce();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleNext(delayMs: number) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      void this.syncOnce().finally(() => {
        if (useConnectionStore.getState().online) {
          this.scheduleNext(this.nextDelayMs());
        }
      });
    }, delayMs);
  }

  /*
   * Exponential backoff so a downed server doesn't get hammered every 30s
   * forever - resets to the base interval as soon as a sync call succeeds.
   */
  private nextDelayMs(): number {
    if (this.failureStreak === 0) return this.intervalMs;
    return Math.min(this.intervalMs * 2 ** this.failureStreak, this.maxBackoffMs);
  }

  async syncOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.pushPendingOrders();
      this.failureStreak = 0;
      /*
       * Push before pull, and in this order: a create must land before the
       * edit that refers to it, and a delete last so it is not undone by an
       * update pushed in the same cycle. The pull then overwrites the local
       * catalogue with a server copy that already reflects all three.
       */
      await this.pushNewProducts();
      await this.pushEditedProducts();
      await this.pushDeletedProducts();
      await this.pullProducts();
      await setLastSyncedAt(Date.now());
    } catch {
      this.failureStreak += 1;
    } finally {
      this.running = false;
    }
  }

  /* Claims a batch of pending/error orders and pushes them to the server. */
  private async pushPendingOrders(): Promise<void> {
    const batch = await claimBatch(this.maxBatchSize);
    if (batch.length === 0) return;

    try {
      const { results } = await apiClient.syncOrders(batch);
      await db.pendingOrders.bulkUpdate(
        results.map(({ client_generated_id, result, server_id }) => ({
          key: client_generated_id,
          changes: {
            sync_status: mapSyncResultToStatus(result),
            ...(server_id ? { server_id } : {}),
          },
        })),
      );
    } catch (error) {
      /**
       * Transport-level failure (server unreachable): release the claim so
       * these orders are retried next cycle, and let the caller back off. A
       * rejection the server will never accept is parked as "conflict" instead,
       * so it stops re-claiming the queue ahead of every later sale.
       */
      const status: SyncStatus = isPermanentRejection(error)
        ? "conflict"
        : "error";
      await db.pendingOrders.bulkUpdate(
        batch.map((order) => ({
          key: order.client_generated_id,
          changes: { sync_status: status },
        })),
      );
      throw error;
    }
  }

  /*
   * Pushes products created on this device to the server, one request each —
   * the catalogue endpoint takes a single product, and a shop adds them a few
   * at a time rather than in the batches order sync is built for.
   *
   * A rejected product (duplicate SKU or barcode against a different row) is
   * left flagged so it stays visible on this till and keeps selling. Retrying it
   * is harmless: the push is idempotent on the product id, and the clash needs
   * an operator to rename the product before it can ever succeed.
   */
  private async pushNewProducts(): Promise<void> {
    const unpushed = await listUnpushedProducts();

    for (const product of unpushed) {
      try {
        await apiClient.createProduct(product);
        await markProductPushed(product.id);
      } catch {
        /*
         * Transport failure or a clash the server will not accept. Either way
         * the row stays local; the next pull leaves it alone because it is
         * still flagged.
         */
      }
    }
  }

  /*
   * Pushes catalogue edits made on this device. A row keeps its flag until the
   * server accepts it, which both retries it next cycle and stops the pull from
   * replacing it with the server's older copy.
   *
   * A rejected edit (its SKU or barcode now belongs to another product) stays
   * flagged too. Retrying is harmless — the write is a replacement, so a repeat
   * is the same request — and the clash needs an operator to rename the product
   * before it can succeed.
   */
  private async pushEditedProducts(): Promise<void> {
    const edited = await listEditedProducts();

    for (const product of edited) {
      try {
        await apiClient.updateProduct(product);
        await markProductUpdatePushed(product.id);
      } catch {
        /*
         * Transport failure or a clash the server will not accept; leave the
         * flag on so the next cycle tries again.
         */
      }
    }
  }

  /*
   * Drains the delete outbox. The tombstone is removed only once the server has
   * confirmed, so a failed delete is retried and the pull keeps filtering the
   * product out in the meantime rather than resurrecting it.
   */
  private async pushDeletedProducts(): Promise<void> {
    const tombstones = await listPendingProductDeletes();

    for (const { id } of tombstones) {
      try {
        await apiClient.deleteProduct(id);
        await clearPendingProductDelete(id);
      } catch {
        /* Server unreachable. The tombstone stays; retried next cycle. */
      }
    }
  }

  /* Refresh the local product cache from the server. */
  private async pullProducts(): Promise<void> {
    try {
      const products = await apiClient.getProducts();
      await seedProducts(products);
    } catch {
      /* non-fatal: a stale product cache shouldn't back off order syncing. */
    }
  }
}

export const syncManager = new SyncManager();
