"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Search } from "lucide-react";
import { listProductBatches, listWarehouses, type BatchStatus, type ProductBatchRow } from "@/lib/db";
import type { Warehouse } from "@/lib/types";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { Card, PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { useSettings } from "@/lib/hooks/use-settings";
import { formatDate } from "@/lib/format";
import { ROUTES } from "@/lib/types/routes";

const ACTION_BUTTON_CLASSES =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-outline-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-700";

const STATUS_OPTIONS: { value: BatchStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "expiring_soon", label: "Expiring soon" },
  { value: "expired", label: "Expired" },
  { value: "depleted", label: "Depleted" },
];

const EXPIRY_WINDOW_OPTIONS = [
  { value: "7", label: "Within 7 days" },
  { value: "30", label: "Within 30 days" },
  { value: "60", label: "Within 60 days" },
  { value: "90", label: "Within 90 days" },
];

const STATUS_BADGE_CLASSES: Record<BatchStatus, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  expiring_soon: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  expired: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  depleted:
    "bg-surface-container text-on-surface-variant dark:bg-zinc-800 dark:text-zinc-400",
};

const STATUS_LABELS: Record<BatchStatus, string> = {
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  depleted: "Depleted",
};

function StatusBadge({ status }: Readonly<{ status: BatchStatus }>) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function formatExpiry(expiryDate: string | null): string {
  if (!expiryDate) return "—";
  const timestamp = Date.parse(`${expiryDate}T00:00:00`);
  return Number.isNaN(timestamp) ? "—" : formatDate(timestamp);
}

function filterBatches(
  batches: ProductBatchRow[],
  query: string,
  warehouseId: string,
  status: string,
  expiryWindowDays: string,
): ProductBatchRow[] {
  const needle = query.trim().toLowerCase();

  return batches.filter((batch) => {
    if (needle) {
      const haystack = `${batch.product_name} ${batch.batch_no}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (warehouseId && batch.warehouse_id !== warehouseId) return false;
    if (status && batch.status !== status) return false;
    if (expiryWindowDays) {
      const window = Number(expiryWindowDays);
      if (batch.days_remaining === null || batch.days_remaining > window) return false;
    }
    return true;
  });
}

export default function BatchesPage() {
  const { money, settings } = useSettings();

  const [batches, setBatches] = useState<ProductBatchRow[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [query, setQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [status, setStatus] = useState("");
  const [expiryWindow, setExpiryWindow] = useState("");

  useEffect(() => {
    listProductBatches().then(setBatches);
    listWarehouses().then(setWarehouses);
  }, []);

  const warehouseName = (id?: string) =>
    id ? (warehouses.find((warehouse) => warehouse.id === id)?.name ?? "—") : "—";

  const visible = filterBatches(batches, query, warehouseId, status, expiryWindow);

  const columns: DataColumn<ProductBatchRow>[] = [
    {
      key: "product",
      header: "Product",
      sortValue: (batch) => batch.product_name,
      render: (batch) => (
        <Link
          href={ROUTES.productDetail(batch.product_id)}
          className="font-medium text-primary hover:underline dark:text-blue-400"
        >
          {batch.product_name}
        </Link>
      ),
    },
    {
      key: "batch_no",
      header: "Batch No",
      sortValue: (batch) => batch.batch_no,
      render: (batch) => (
        <span className="font-mono text-xs text-on-surface dark:text-zinc-50">
          {batch.batch_no}
        </span>
      ),
    },
    {
      key: "warehouse",
      header: "Warehouse",
      render: (batch) => (
        <span className="text-on-surface-variant dark:text-zinc-400">
          {warehouseName(batch.warehouse_id)}
        </span>
      ),
    },
    {
      key: "expiry_date",
      header: "Expiry Date",
      sortValue: (batch) => batch.expiry_date ?? "",
      render: (batch) => (
        <span className="text-on-surface dark:text-zinc-50">
          {formatExpiry(batch.expiry_date)}
        </span>
      ),
    },
    {
      key: "quantity",
      header: "Quantity",
      align: "right",
      sortValue: (batch) => batch.quantity,
      render: (batch) => batch.quantity,
    },
    {
      key: "unit_cost",
      header: "UnitCost",
      align: "right",
      sortValue: (batch) => batch.cost_cents ?? 0,
      render: (batch) => (batch.cost_cents ? money(batch.cost_cents) : "—"),
    },
    {
      key: "status",
      header: "Status",
      render: (batch) => <StatusBadge status={batch.status} />,
    },
    {
      key: "action",
      header: "Action",
      render: (batch) => (
        <Link
          href={ROUTES.productDetail(batch.product_id)}
          aria-label={`View ${batch.product_name}`}
          title="View"
          className={`${ACTION_BUTTON_CLASSES} text-secondary hover:bg-surface-container dark:text-blue-400 dark:hover:bg-zinc-800`}
        >
          <Eye size={15} aria-hidden />
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        title="Batches"
        breadcrumbs={[
          { label: "Dashboard", href: ROUTES.dashboard },
          { label: "Products", href: ROUTES.products },
          { label: "Batches" },
        ]}
      />

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap gap-4">
            <div className="w-full sm:w-56">
              <Select
                label="Warehouse"
                placeholder="All"
                options={warehouses.map((warehouse) => ({
                  value: warehouse.id,
                  label: warehouse.name,
                }))}
                value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)}
              />
            </div>
            <div className="w-full sm:w-56">
              <Select
                label="Status"
                placeholder="All"
                options={STATUS_OPTIONS}
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              />
            </div>
            <div className="w-full sm:w-56">
              <Select
                label="Expiry Window"
                placeholder="All"
                options={EXPIRY_WINDOW_OPTIONS}
                value={expiryWindow}
                onChange={(event) => setExpiryWindow(event.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-on-surface-variant dark:text-zinc-500">
            Expiry warning window (days):{" "}
            <span className="font-medium text-secondary dark:text-blue-400">
              {settings.expiry_warning_days}
            </span>
          </p>
        </div>

        <div className="relative mt-4 sm:w-72">
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant dark:text-zinc-500"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this table"
            aria-label="Search batches"
            className="pl-9"
          />
        </div>

        <div className="mt-4">
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(batch) => `${batch.product_id}-${batch.batch_no}`}
            emptyMessage="No data for table"
            caption="Batches"
            pageSizeOptions={[10, 25, 50]}
          />
        </div>
      </Card>
    </div>
  );
}
