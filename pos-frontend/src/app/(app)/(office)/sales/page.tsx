"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { CloudOff, Download, ReceiptText, RefreshCw, Wallet } from "lucide-react";
import type { PaymentMethod, SyncStatus } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { useSettings } from "@/lib/hooks/use-settings";
import { useSalesFeed, type SaleRow } from "@/lib/hooks/use-sales-feed";
import { exportCsv, type ExportColumn } from "@/lib/export";
import { formatDateTime } from "@/lib/format";
import { ROUTES } from "@/lib/types/routes";

const STATUS_VARIANT: Record<
  SyncStatus,
  "neutral" | "success" | "warning" | "danger"
> = {
  pending: "neutral",
  syncing: "neutral",
  synced: "success",
  conflict: "warning",
  error: "danger",
};

/**
 * The server pages at 20 by default; asking for 25 keeps one server page and one
 * table page the same thing, so the table's own pager never splits a fetch.
 */
const PER_PAGE = 25;

const SALES_STAT_TINTS = {
  primary: "bg-primary text-on-primary",
  secondary: "bg-secondary text-on-secondary",
  warning: "bg-amber-500 text-white",
} as const;

function SalesStatTile({
  label,
  value,
  icon,
  tint,
}: Readonly<{
  label: string;
  value: string;
  icon: ReactNode;
  tint: keyof typeof SALES_STAT_TINTS;
}>) {
  return (
    <div className="flex animate-fade-in-up items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm transition-all duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:shadow-elevated dark:border-zinc-800 dark:bg-zinc-900">
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-[var(--duration-fast)] ${SALES_STAT_TINTS[tint]}`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-on-surface-variant dark:text-zinc-400">
          {label}
        </span>
        <span className="block truncate text-lg font-semibold text-on-surface transition-all duration-[var(--duration-base)] dark:text-zinc-50">
          {value}
        </span>
      </span>
    </div>
  );
}

export default function SalesPage() {
  const { money } = useSettings();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [page, setPage] = useState(1);

  const { rows, meta, loading, offline, error, refresh } = useSalesFeed({
    search: query,
    ...(method ? { paymentMethod: method as PaymentMethod } : {}),
    ...(status ? { syncStatus: status as SyncStatus } : {}),
    page,
    perPage: PER_PAGE,
  });

  /**
   * Filters narrow the result set, so a page number carried over from a wider
   * one can land past the end. Reset rather than showing an empty page the user
   * has to click their way out of.
   */
  function updateFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  const unsynced = rows.filter((row) => row.sync_status !== "synced").length;
  const totals = {
    count: rows.filter((row) => !row.refunded).length,
    revenueCents: rows
      .filter((row) => !row.refunded)
      .reduce((sum, row) => sum + row.total_cents, 0),
    refunded: rows.filter((row) => row.refunded).length,
  };

  const exportColumns: ExportColumn<SaleRow>[] = [
    { key: "receipt", header: "Receipt", value: (r) => r.receipt_no ?? r.client_generated_id },
    { key: "date", header: "Date", value: (r) => new Date(r.created_at).toISOString() },
    { key: "items", header: "Items", value: (r) => r.item_count },
    { key: "tax", header: "Tax", value: (r) => (r.tax_total_cents / 100).toFixed(2) },
    { key: "discount", header: "Discount", value: (r) => (r.discount_cents / 100).toFixed(2) },
    { key: "total", header: "Total", value: (r) => (r.total_cents / 100).toFixed(2) },
    { key: "payment", header: "Payment", value: (r) => r.payment_method },
    { key: "sync", header: "Sync status", value: (r) => r.sync_status },
    { key: "refunded", header: "Refunded", value: (r) => (r.refunded ? "yes" : "no") },
    { key: "source", header: "Source", value: (r) => r.source },
  ];

  const columns: DataColumn<SaleRow>[] = [
    {
      key: "date",
      header: "When",
      sortValue: (row) => row.created_at,
      render: (row) => (
        <Link
          href={ROUTES.sales.detail(row.client_generated_id)}
          className="font-medium hover:underline"
        >
          {formatDateTime(row.created_at)}
          <span className="block text-xs font-normal text-on-surface-variant dark:text-zinc-400">
            {row.receipt_no ?? row.client_generated_id.slice(0, 8)}
          </span>
        </Link>
      ),
    },
    {
      key: "items",
      header: "Items",
      align: "right",
      hideOnMobile: true,
      sortValue: (row) => row.item_count,
      render: (row) => String(row.item_count),
    },
    {
      key: "payment",
      header: "Payment",
      hideOnMobile: true,
      sortValue: (row) => row.payment_method,
      render: (row) =>
        row.payments.length > 1 ? (
          <Badge variant="neutral">split × {row.payments.length}</Badge>
        ) : (
          <span className="capitalize">{row.payment_method}</span>
        ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sortValue: (row) => row.total_cents,
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          {money(row.total_cents)}
          {/* The server recomputed this sale and disagreed. It is stored either
              way — see the order-totals policy — so this is a review marker. */}
          {row.totals_mismatch && (
            <span title="Server recomputed a different total for this sale">
              <Badge variant="warning">
                <span aria-hidden>?</span>
                <span className="sr-only">Totals mismatch</span>
              </Badge>
            </span>
          )}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.sync_status,
      render: (row) => (
        <Badge variant={row.refunded ? "danger" : STATUS_VARIANT[row.sync_status]}>
          {row.refunded ? "refunded" : row.sync_status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        eyebrow="Operate"
        title="Sales"
        description="Sales recorded across the business, with anything still waiting to sync from this device."
        breadcrumbs={[
          { label: "Dashboard", href: ROUTES.dashboard },
          { label: "Sales" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw size={15} />
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportCsv("sales", rows, exportColumns)}
            >
              <Download size={15} />
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Offline is normal on a till, so it is stated rather than raised as an
          error — but the list is this device's only, and saying so stops a
          cashier reading a partial history as the whole business's. */}
      {offline && (
        <p className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          <CloudOff size={16} aria-hidden />
          Offline — showing sales recorded on this device only.
        </p>
      )}
      {error && (
        <output className="flex items-center gap-2 rounded-xl border border-error/30 px-4 py-3 text-sm text-error">
          {error}
        </output>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SalesStatTile
          label="Revenue shown"
          value={money(totals.revenueCents)}
          icon={<Wallet size={20} />}
          tint="primary"
        />
        <SalesStatTile
          label="Sales shown"
          value={String(totals.count)}
          icon={<ReceiptText size={20} />}
          tint="secondary"
        />
        <SalesStatTile
          label="Awaiting sync"
          value={String(unsynced)}
          icon={<RefreshCw size={20} />}
          tint={unsynced > 0 ? "warning" : "secondary"}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          value={query}
          onChange={(event) => updateFilter(() => setQuery(event.target.value))}
          placeholder="Search receipt or product…"
          aria-label="Search sales"
        />
        <Select
          value={method}
          onChange={(event) => updateFilter(() => setMethod(event.target.value))}
          placeholder="All payment methods"
          aria-label="Filter by payment method"
          options={[
            { value: "cash", label: "Cash" },
            { value: "card", label: "Card" },
            { value: "qr", label: "QR / Wallet" },
            { value: "other", label: "Other" },
          ]}
        />
        <Select
          value={status}
          onChange={(event) => updateFilter(() => setStatus(event.target.value))}
          placeholder="All sync statuses"
          aria-label="Filter by sync status"
          options={[
            { value: "pending", label: "Pending" },
            { value: "syncing", label: "Syncing" },
            { value: "synced", label: "Synced" },
            { value: "conflict", label: "Conflict" },
            { value: "error", label: "Error" },
          ]}
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.client_generated_id}
        pageSize={PER_PAGE + 1}
        emptyMessage={
          loading ? "Loading sales…" : "No sales match these filters."
        }
        caption="Sales history"
      />

      {/* Server-side paging. The table's own pager only ever sees one page at a
          time, so it cannot reach the rest of the history on its own. */}
      {meta && meta.total_pages > 1 && (
        <nav
          aria-label="Sales pages"
          className="flex items-center justify-between gap-3 text-sm"
        >
          <p className="text-on-surface-variant dark:text-zinc-400">
            Page {meta.page} of {meta.total_pages} · {meta.total} synced sales
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={!meta.has_prev || loading}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => current + 1)}
              disabled={!meta.has_next || loading}
            >
              Next
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
