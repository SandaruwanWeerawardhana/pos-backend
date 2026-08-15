"use client";

import { useCallback, useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { apiClient } from "@/lib/api";
import { db } from "@/lib/db";
import { useConnectionStore } from "@/lib/store/connection";
import type {
  OrderListParams,
  PageMeta,
  PaymentMethod,
  PaymentSplit,
  PendingOrder,
  ServerOrder,
  SyncStatus,
} from "@/lib/types";

/**
 * One row of the sales list, from either side.
 *
 * The two sources are shaped differently — the server has an `id`, a business
 * date and a mismatch flag; the till has a sync status and a local refund
 * annotation — so both are normalised here rather than leaving the table to
 * branch on which kind of row it is holding.
 */
export interface SaleRow {
  /** The till's own id for the sale. Stable across both sources, so it is the key. */
  client_generated_id: string;
  server_id: string | null;
  receipt_no: string | null;
  /** Epoch ms. `sold_at` server-side, `created_at` locally — the same instant. */
  created_at: number;
  payment_method: PaymentMethod;
  payments: PaymentSplit[];
  item_count: number;
  total_cents: number;
  tax_total_cents: number;
  discount_cents: number;
  refunded: boolean;
  sync_status: SyncStatus;
  /** Server recomputed different totals for this sale; needs review. */
  totals_mismatch: boolean;
  source: "server" | "local";
}

export interface SalesFilters {
  search?: string;
  paymentMethod?: PaymentMethod;
  /** Local sync state. A value other than "synced" can only match local rows. */
  syncStatus?: SyncStatus;
  from?: number;
  to?: number;
  page?: number;
  perPage?: number;
}

export interface SalesFeed {
  rows: SaleRow[];
  meta: PageMeta | null;
  loading: boolean;
  /** Server unreachable, so `rows` is the local-only view. Not an error state. */
  offline: boolean;
  /** Server rejected the request (bad filter, expired session). */
  error: string | null;
  refresh: () => void;
}

const UNSYNCED = new Set<SyncStatus>(["pending", "syncing", "error", "conflict"]);

function serverRowToSale(order: ServerOrder): SaleRow {
  return {
    client_generated_id: order.client_generated_id,
    server_id: order.id,
    receipt_no: order.receipt_no,
    created_at: order.sold_at,
    payment_method: order.payment_method,
    payments: order.payments,
    item_count: order.items.length,
    total_cents: order.total_cents,
    tax_total_cents: order.tax_total_cents,
    discount_cents: order.discount_cents,
    refunded: order.refunded,
    /*
     * A sale the server holds has, by definition, synced. The local row's own
     * status is not consulted: it can still say "syncing" if the response was
     * lost in flight, and the server is the authority on what it stored.
     */
    sync_status: "synced",
    totals_mismatch: order.totals_mismatch,
    source: "server",
  };
}

function localRowToSale(order: PendingOrder): SaleRow {
  return {
    client_generated_id: order.client_generated_id,
    server_id: order.server_id,
    receipt_no: order.receipt_no ?? null,
    created_at: order.created_at,
    payment_method: order.payment_method,
    payments: order.payments ?? [],
    item_count: order.items.length,
    total_cents: order.total_cents,
    tax_total_cents: order.tax_total_cents,
    discount_cents: order.discount_cents ?? 0,
    refunded: order.refunded ?? false,
    sync_status: order.sync_status,
    /* Only the server recomputes, so a row it has never seen cannot be flagged. */
    totals_mismatch: false,
    source: "local",
  };
}

/**
 * The same predicate the server applies, so the unsynced overlay is filtered on
 * the same terms as the page it is laid over. Without this a search would return
 * a filtered server page plus every local order regardless of the query.
 */
function matchesFilters(order: PendingOrder, filters: SalesFilters): boolean {
  if (filters.paymentMethod && order.payment_method !== filters.paymentMethod) {
    return false;
  }
  if (filters.syncStatus && order.sync_status !== filters.syncStatus) return false;
  if (filters.from !== undefined && order.created_at < filters.from) return false;
  if (filters.to !== undefined && order.created_at > filters.to) return false;

  const needle = filters.search?.trim().toLowerCase();
  if (!needle) return true;
  return (
    (order.receipt_no ?? "").toLowerCase().includes(needle) ||
    order.client_generated_id.toLowerCase().includes(needle) ||
    order.items.some((item) => item.name.toLowerCase().includes(needle))
  );
}

/**
 * The server's error bodies are {"message": "..."} and httpClient rethrows that
 * string, so a rejection usually already carries something a shop owner can act
 * on ("invalid sort field"). Anything else gets a generic line rather than a
 * stringified object.
 */
function describeFailure(cause: unknown): string {
  if (cause instanceof Error && cause.message) return cause.message;
  return "Could not load sales from the server";
}

function toListParams(filters: SalesFilters): OrderListParams {
  return {
    ...(filters.page ? { page: filters.page } : {}),
    ...(filters.perPage ? { per_page: filters.perPage } : {}),
    ...(filters.search?.trim() ? { search: filters.search.trim() } : {}),
    ...(filters.paymentMethod ? { payment_method: filters.paymentMethod } : {}),
    ...(filters.from !== undefined ? { from: filters.from } : {}),
    ...(filters.to !== undefined ? { to: filters.to } : {}),
  };
}

/**
 * The sales list: the server's stored history with this device's unsynced sales
 * laid over it.
 *
 * Neither source alone is correct. The server is the only place that knows about
 * sales rung up on the shop's other tills, and it is the authority on what was
 * actually banked. But it does not yet hold anything this till has not pushed,
 * and a POS sells offline by design — a cashier who cannot see the sale they
 * rang up sixty seconds ago will ring it up again.
 *
 * So: server page as the base, local rows whose sync_status is not "synced"
 * merged in on top, keyed on client_generated_id so a sale that has just synced
 * does not appear twice. When the server is unreachable the local table is the
 * whole list, which is the pre-existing offline behaviour rather than an error.
 */
export function useSalesFeed(filters: SalesFilters): SalesFeed {
  const [serverOrders, setServerOrders] = useState<ServerOrder[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [localOrders, setLocalOrders] = useState<PendingOrder[]>([]);
  /**
   * The request whose response is currently in state. Compared against the key
   * the current filters describe to derive `loading`, so nothing has to flip a
   * spinner flag synchronously inside the effect — an effect that sets state in
   * its own body triggers the cascading render react-hooks warns about.
   */
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [fetchOffline, setFetchOffline] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const online = useConnectionStore((state) => state.online);

  /*
   * The local table drives its own subscription: a sale rung up on this device,
   * or one that finishes syncing, must move the list without a refetch.
   */
  useEffect(() => {
    const subscription = liveQuery(() =>
      db.pendingOrders.orderBy("created_at").reverse().toArray(),
    ).subscribe({ next: setLocalOrders });
    return () => subscription.unsubscribe();
  }, []);

  const {
    search,
    paymentMethod,
    syncStatus,
    from,
    to,
    page,
    perPage,
  } = filters;

  /**
   * A status filter for unsynced work has no server-side counterpart — the
   * server only holds synced sales — so there is nothing to ask it for.
   * Derived during render rather than written into state from the effect: the
   * effect would then be clearing state it had just caused to be set, which is
   * the cascading-render pattern react-hooks/set-state-in-effect flags.
   */
  const skipServer = Boolean(syncStatus && syncStatus !== "synced");

  const listParams = toListParams({ search, paymentMethod, from, to, page, perPage });
  /**
   * Identifies one request, so a response can be recognised as belonging to the
   * filters currently on screen. reloadToken is part of it: a manual refresh has
   * to count as a new request even when nothing else changed.
   */
  const requestKey = `${reloadToken}:${JSON.stringify(listParams)}`;

  useEffect(() => {
    let cancelled = false;
    if (skipServer) return;

    apiClient
      .getOrders(listParams)
      .then((result) => {
        if (cancelled) return;
        setServerOrders(result.orders);
        setMeta(result.meta);
        setFetchOffline(false);
        setFetchError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setServerOrders([]);
        setMeta(null);
        /**
         * Offline is expected on a till and is not an error the cashier needs
         * to act on; a rejection while online is.
         */
        const isOffline = !useConnectionStore.getState().online;
        setFetchOffline(isOffline);
        setFetchError(isOffline ? null : describeFailure(cause));
      })
      .finally(() => {
        if (!cancelled) setResolvedKey(requestKey);
      });

    return () => {
      cancelled = true;
    };
    /*
     * listParams is rebuilt every render; requestKey is its stable identity, so
     * that is what the effect depends on.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipServer, requestKey, online]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  /**
   * Every server-derived value is masked while skipServer holds, so a stale page
   * left in state from a previous filter cannot leak into the rendered list.
   */
  const serverRows = skipServer ? [] : serverOrders.map(serverRowToSale);
  const syncedIds = new Set(serverRows.map((row) => row.client_generated_id));

  /* In flight until the response for exactly these filters has landed. */
  const loading = !skipServer && resolvedKey !== requestKey;
  const offline = !skipServer && fetchOffline;
  const error = skipServer ? null : fetchError;

  /**
   * With no server page to lay over — offline, or the request failed — the local
   * table is the whole list, synced rows included. Restricting to unsynced ones
   * there would blank out the history a cashier can normally still read offline,
   * which is worse than the stale-but-complete view this gives.
   */
  const serverUnavailable = offline || error !== null;

  /**
   * Otherwise: only rows the server does not already hold. A sale it does hold is
   * rendered from the server's copy, which carries the mismatch flag and the
   * authoritative totals; the local copy of the same sale would shadow both.
   */
  const localRows = localOrders
    .filter((order) => {
      if (!matchesFilters(order, filters)) return false;
      if (serverUnavailable) return true;
      return (
        !syncedIds.has(order.client_generated_id) &&
        UNSYNCED.has(order.sync_status)
      );
    })
    .map(localRowToSale);

  /**
   * Unsynced first, then the server page. They are the newest sales on this
   * device and the ones a cashier is most likely to be looking for; sorting them
   * into the server's page order would also be wrong, because the server page is
   * a window over a larger set this device cannot see.
   */
  const rows = [...localRows, ...serverRows];

  return { rows, meta: skipServer ? null : meta, loading, offline, error, refresh };
}
