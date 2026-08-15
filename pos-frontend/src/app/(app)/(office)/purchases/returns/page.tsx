"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { listPurchaseReturns } from "@/lib/db";
import type { PurchaseReturn } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { useSettings } from "@/lib/hooks/use-settings";
import { exportCsv, type ExportColumn } from "@/lib/export";
import { formatDateTime } from "@/lib/format";
import { ROUTES } from "@/lib/types/routes";

export default function PurchaseReturnsPage() {
  const { money } = useSettings();
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);

  useEffect(() => {
    listPurchaseReturns().then(setReturns);
  }, []);

  const exportColumns: ExportColumn<PurchaseReturn>[] = [
    { key: "date", header: "Date", value: (r) => new Date(r.created_at).toISOString() },
    { key: "supplier", header: "Supplier", value: (r) => r.supplier_name },
    { key: "reason", header: "Reason", value: (r) => r.reason },
    { key: "lines", header: "Lines", value: (r) => r.lines.length },
    { key: "total", header: "Value", value: (r) => (r.total_cents / 100).toFixed(2) },
  ];

  const columns: DataColumn<PurchaseReturn>[] = [
    {
      key: "date",
      header: "When",
      sortValue: (record) => record.created_at,
      render: (record) => formatDateTime(record.created_at),
    },
    {
      key: "supplier",
      header: "Supplier",
      sortValue: (record) => record.supplier_name,
      render: (record) => record.supplier_name,
    },
    {
      key: "reason",
      header: "Reason",
      hideOnMobile: true,
      render: (record) => record.reason,
    },
    {
      key: "items",
      header: "Items",
      hideOnMobile: true,
      render: (record) => (
        <span className="text-xs text-on-surface-variant dark:text-zinc-400">
          {record.lines
            .map((line) => `${line.quantity} × ${line.product_name}`)
            .join(", ")}
        </span>
      ),
    },
    {
      key: "total",
      header: "Value",
      align: "right",
      sortValue: (record) => record.total_cents,
      render: (record) => money(record.total_cents),
    },
  ];

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        eyebrow="Supply"
        title="Purchase returns"
        description="Stock sent back to suppliers, with the reason recorded against each return."
        breadcrumbs={[
          { label: "Purchases", href: ROUTES.purchases.root },
          { label: "Returns" },
        ]}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => exportCsv("purchase-returns", returns, exportColumns)}
          >
            <Download size={15} />
            Export CSV
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={returns}
        rowKey={(record) => record.id}
        emptyMessage="No purchase returns recorded. Raise one from a purchase order."
        caption="Purchase returns"
      />
    </div>
  );
}
