"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { listStockMovements } from "@/lib/db";
import type { StockMovement, StockMovementType } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { exportCsv, type ExportColumn } from "@/lib/export";
import { formatDateTime } from "@/lib/format";
import { ROUTES } from "@/lib/types/routes";

const TYPE_LABELS: Record<StockMovementType, string> = {
  sale: "Sale",
  purchase: "Goods received",
  adjustment: "Adjustment",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  waste: "Waste",
  damage: "Damage",
  return: "Return",
};

function getMovementBadgeVariant(
  movement: StockMovement,
): "success" | "danger" | "neutral" {
  if (movement.quantity_delta >= 0) return "success";
  if (movement.type === "waste" || movement.type === "damage") {
    return "danger";
  }
  return "neutral";
}

export default function StockMovementsPage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");

  useEffect(() => {
    listStockMovements().then(setMovements);
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return movements.filter((movement) => {
      if (type && movement.type !== type) return false;
      if (!needle) return true;
      return (
        movement.product_name.toLowerCase().includes(needle) ||
        (movement.reason ?? "").toLowerCase().includes(needle)
      );
    });
  }, [movements, query, type]);

  const exportColumns: ExportColumn<StockMovement>[] = [
    { key: "date", header: "Date", value: (m) => new Date(m.created_at).toISOString() },
    { key: "product", header: "Product", value: (m) => m.product_name },
    { key: "type", header: "Type", value: (m) => TYPE_LABELS[m.type] },
    { key: "delta", header: "Change", value: (m) => m.quantity_delta },
    { key: "balance", header: "Balance after", value: (m) => m.balance_after },
    { key: "reason", header: "Reason", value: (m) => m.reason ?? "" },
    { key: "batch", header: "Batch", value: (m) => m.batch_no ?? "" },
  ];

  const columns: DataColumn<StockMovement>[] = [
    {
      key: "date",
      header: "When",
      sortValue: (movement) => movement.created_at,
      render: (movement) => formatDateTime(movement.created_at),
    },
    {
      key: "product",
      header: "Product",
      sortValue: (movement) => movement.product_name,
      render: (movement) => (
        <span className="font-medium">
          {movement.product_name}
          {movement.reason && (
            <span className="block text-xs font-normal text-on-surface-variant dark:text-zinc-400">
              {movement.reason}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      hideOnMobile: true,
      sortValue: (movement) => movement.type,
      render: (movement) => (
        <Badge variant={getMovementBadgeVariant(movement)}>
          {TYPE_LABELS[movement.type]}
        </Badge>
      ),
    },
    {
      key: "delta",
      header: "Change",
      align: "right",
      sortValue: (movement) => movement.quantity_delta,
      render: (movement) => (
        <span
          className={
            movement.quantity_delta >= 0
              ? "font-semibold text-on-tertiary-container dark:text-emerald-400"
              : "font-semibold text-error dark:text-red-400"
          }
        >
          {movement.quantity_delta > 0 ? "+" : ""}
          {movement.quantity_delta}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      hideOnMobile: true,
      sortValue: (movement) => movement.balance_after,
      render: (movement) => String(movement.balance_after),
    },
  ];

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        eyebrow="Stock control"
        title="Stock movement history"
        description="Every change to stock levels, from sales and goods-in to waste and transfers."
        breadcrumbs={[
          { label: "Inventory", href: ROUTES.inventory.root },
          { label: "Movement history" },
        ]}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => exportCsv("stock-movements", visible, exportColumns)}
          >
            <Download size={15} />
            Export CSV
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search product or reason…"
          aria-label="Search movements"
        />
        <Select
          value={type}
          onChange={(event) => setType(event.target.value)}
          placeholder="All movement types"
          aria-label="Filter by movement type"
          options={Object.entries(TYPE_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </div>

      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(movement) => movement.id}
        emptyMessage="No stock movements recorded yet."
        caption="Stock movement ledger"
      />
    </div>
  );
}
