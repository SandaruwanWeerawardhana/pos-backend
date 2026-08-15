"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Plus, Undo2 } from "lucide-react";
import { listPurchaseOrders } from "@/lib/db";
import type { PurchaseOrder, PurchaseOrderStatus } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { useSettings } from "@/lib/hooks/use-settings";
import { exportCsv, type ExportColumn } from "@/lib/export";
import { formatDate } from "@/lib/format";
import { ROUTES } from "@/lib/types/routes";

const STATUS_VARIANT: Record<
  PurchaseOrderStatus,
  "neutral" | "success" | "warning" | "danger"
> = {
  draft: "neutral",
  ordered: "warning",
  partial: "warning",
  received: "success",
  cancelled: "danger",
};

export default function PurchasesPage() {
  const { money } = useSettings();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    listPurchaseOrders().then(setOrders);
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (status && order.status !== status) return false;
      if (!needle) return true;
      return (
        order.reference.toLowerCase().includes(needle) ||
        order.supplier_name.toLowerCase().includes(needle)
      );
    });
  }, [orders, query, status]);

  const exportColumns: ExportColumn<PurchaseOrder>[] = [
    { key: "ref", header: "Reference", value: (o) => o.reference },
    { key: "supplier", header: "Supplier", value: (o) => o.supplier_name },
    { key: "status", header: "Status", value: (o) => o.status },
    { key: "lines", header: "Lines", value: (o) => o.lines.length },
    { key: "total", header: "Total", value: (o) => (o.total_cents / 100).toFixed(2) },
    {
      key: "created",
      header: "Created",
      value: (o) => new Date(o.created_at).toISOString(),
    },
  ];

  const columns: DataColumn<PurchaseOrder>[] = [
    {
      key: "reference",
      header: "Reference",
      sortValue: (order) => order.reference,
      render: (order) => (
        <Link
          href={ROUTES.purchases.detail(order.id)}
          className="font-medium hover:underline"
        >
          {order.reference}
          <span className="block text-xs font-normal text-on-surface-variant dark:text-zinc-400">
            {formatDate(order.created_at)}
          </span>
        </Link>
      ),
    },
    {
      key: "supplier",
      header: "Supplier",
      sortValue: (order) => order.supplier_name,
      render: (order) => order.supplier_name,
    },
    {
      key: "lines",
      header: "Lines",
      align: "right",
      hideOnMobile: true,
      sortValue: (order) => order.lines.length,
      render: (order) => String(order.lines.length),
    },
    {
      key: "received",
      header: "Received",
      align: "right",
      hideOnMobile: true,
      render: (order) => {
        const ordered = order.lines.reduce(
          (sum, line) => sum + line.quantity_ordered,
          0,
        );
        const received = order.lines.reduce(
          (sum, line) => sum + line.quantity_received,
          0,
        );
        return `${received} / ${ordered}`;
      },
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sortValue: (order) => order.total_cents,
      render: (order) => money(order.total_cents),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (order) => order.status,
      render: (order) => (
        <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        eyebrow="Supply"
        title="Purchase orders"
        description="Order stock from suppliers, book goods in, and track what is still owed."
        breadcrumbs={[
          { label: "Dashboard", href: ROUTES.dashboard },
          { label: "Purchases" },
        ]}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportCsv("purchase-orders", visible, exportColumns)}
            >
              <Download size={15} />
              Export
            </Button>
            <Link
              href={ROUTES.purchases.returns}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-outline-variant px-3 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <Undo2 size={15} />
              Returns
            </Link>
            <Link
              href={ROUTES.purchases.new}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-secondary px-3 text-xs font-medium text-on-secondary transition-colors hover:bg-secondary/90 dark:bg-white dark:text-zinc-900"
            >
              <Plus size={15} />
              New order
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search reference or supplier…"
          aria-label="Search purchase orders"
        />
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          placeholder="All statuses"
          aria-label="Filter by status"
          options={[
            { value: "draft", label: "Draft" },
            { value: "ordered", label: "Ordered" },
            { value: "partial", label: "Partially received" },
            { value: "received", label: "Received" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
      </div>

      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(order) => order.id}
        emptyMessage="No purchase orders yet. Create one to start ordering stock."
        caption="Purchase orders"
      />
    </div>
  );
}
