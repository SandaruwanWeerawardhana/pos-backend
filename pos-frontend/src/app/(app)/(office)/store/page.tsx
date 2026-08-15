"use client";

import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  Bell,
  Boxes,
  Coins,
  Download,
  History,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import {
  getInventoryValuation,
  listCategories,
  recordStockMovement,
  searchProducts,
  type InventoryValuation,
} from "@/lib/db";
import type { Product, StockMovementType } from "@/lib/types";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useSettings } from "@/lib/hooks/use-settings";
import { exportCsv, exportExcel, type ExportColumn } from "@/lib/export";
import { ROUTES } from "@/lib/types/routes";

type StockFilter = "all" | "low" | "out" | "in";

// Reasons an adjustment can be booked against, mapped to the movement types
// the ledger understands. Waste and damage are separate so shrinkage can be
// reported on independently of ordinary corrections.
const ADJUSTMENT_TYPES: { value: StockMovementType; label: string }[] = [
  { value: "adjustment", label: "Stock correction" },
  { value: "waste", label: "Waste / spoilage" },
  { value: "damage", label: "Damaged goods" },
  { value: "return", label: "Customer return" },
];

const INVENTORY_STAT_TINTS = {
  primary: "bg-primary text-on-primary",
  secondary: "bg-secondary text-on-secondary",
  success: "bg-[#004b1e] text-[#22c55e]",
} as const;

function InventoryStatTile({
  label,
  value,
  icon,
  tint,
}: Readonly<{
  label: string;
  value: string;
  icon: ReactNode;
  tint: keyof typeof INVENTORY_STAT_TINTS;
}>) {
  return (
    <div className="flex animate-fade-in-up items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm transition-all duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:shadow-elevated dark:border-zinc-800 dark:bg-zinc-900">
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-[var(--duration-fast)] ${INVENTORY_STAT_TINTS[tint]}`}
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

export default function InventoryPage() {
  const { settings, money } = useSettings();
  const { showToast } = useToast();

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [valuation, setValuation] = useState<InventoryValuation | null>(null);

  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [adjustType, setAdjustType] = useState<StockMovementType>("adjustment");
  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustError, setAdjustError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listCategories().then(setCategories);
  }, []);

  async function refresh() {
    const [found, value] = await Promise.all([
      searchProducts(query),
      getInventoryValuation(),
    ]);
    setProducts(found);
    setValuation(value);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refresh();
    }, 200);
    return () => window.clearTimeout(timeout);
    // `refresh` closes over `query` only; re-running on every render would
    // re-query the catalogue on each keystroke without the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const visible = useMemo(() => {
    return products.filter((product) => {
      if (category && (product.category ?? "Uncategorised") !== category) {
        return false;
      }
      const threshold = product.reorder_level ?? settings.low_stock_threshold;
      switch (stockFilter) {
        case "out":
          return product.stock_quantity <= 0;
        case "low":
          return product.stock_quantity > 0 && product.stock_quantity <= threshold;
        case "in":
          return product.stock_quantity > threshold;
        default:
          return true;
      }
    });
  }, [products, category, stockFilter, settings.low_stock_threshold]);

  function openAdjust(product: Product) {
    setAdjusting(product);
    setAdjustType("adjustment");
    setAdjustQuantity("");
    setAdjustReason("");
    setAdjustError("");
  }

  async function handleAdjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjusting) return;

    const delta = Number(adjustQuantity);
    if (!Number.isFinite(delta) || delta === 0) {
      setAdjustError("Enter a non-zero quantity. Use a minus sign to remove stock.");
      return;
    }
    // Waste and damage always remove stock, so the sign is forced rather than
    // relying on the operator to remember the minus.
    const signed =
      adjustType === "waste" || adjustType === "damage"
        ? -Math.abs(delta)
        : delta;

    setSaving(true);
    try {
      await recordStockMovement({
        productId: adjusting.id,
        quantityDelta: signed,
        type: adjustType,
        reason: adjustReason.trim() || undefined,
      });
      await refresh();
      showToast("Stock adjusted", "success");
      setAdjusting(null);
    } catch {
      showToast("Failed to adjust stock", "error");
    } finally {
      setSaving(false);
    }
  }

  const exportColumns: ExportColumn<Product>[] = [
    { key: "name", header: "Product", value: (p) => p.name },
    { key: "sku", header: "SKU", value: (p) => p.sku },
    { key: "barcode", header: "Barcode", value: (p) => p.barcode },
    { key: "category", header: "Category", value: (p) => p.category ?? "" },
    { key: "shelf", header: "Shelf", value: (p) => p.shelf_location ?? "" },
    { key: "stock", header: "Stock", value: (p) => p.stock_quantity },
    { key: "reorder", header: "Reorder level", value: (p) => p.reorder_level ?? "" },
    { key: "cost", header: "Cost", value: (p) => ((p.cost_cents ?? 0) / 100).toFixed(2) },
    { key: "price", header: "Price", value: (p) => (p.price_cents / 100).toFixed(2) },
    {
      key: "value",
      header: "Stock value",
      value: (p) => ((p.price_cents * p.stock_quantity) / 100).toFixed(2),
    },
  ];

  const columns: DataColumn<Product>[] = [
    {
      key: "name",
      header: "Product",
      sortValue: (product) => product.name,
      render: (product) => (
        <Link
          href={ROUTES.inventory.detail(product.id)}
          className="font-medium hover:underline"
        >
          {product.name}
          <span className="block text-xs font-normal text-on-surface-variant dark:text-zinc-400">
            {product.sku} · {product.shelf_location ?? "No shelf"}
          </span>
        </Link>
      ),
    },
    {
      key: "category",
      header: "Category",
      hideOnMobile: true,
      sortValue: (product) => product.category ?? "",
      render: (product) => product.category ?? "—",
    },
    {
      key: "cost",
      header: "Cost",
      align: "right",
      hideOnMobile: true,
      sortValue: (product) => product.cost_cents ?? 0,
      render: (product) =>
        product.cost_cents ? money(product.cost_cents) : "—",
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      sortValue: (product) => product.price_cents,
      render: (product) => money(product.price_cents),
    },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      hideOnMobile: true,
      sortValue: (product) =>
        product.cost_cents
          ? (product.price_cents - product.cost_cents) / product.price_cents
          : 0,
      render: (product) => {
        if (!product.cost_cents) return "—";
        const margin =
          ((product.price_cents - product.cost_cents) / product.price_cents) * 100;
        return `${margin.toFixed(1)}%`;
      },
    },
    {
      key: "stock",
      header: "Stock",
      align: "right",
      sortValue: (product) => product.stock_quantity,
      render: (product) => {
        const threshold = product.reorder_level ?? settings.low_stock_threshold;
        let variant: "neutral" | "warning" | "danger" | "success" = "success";
        if (product.stock_quantity <= 0) variant = "danger";
        else if (product.stock_quantity <= threshold) variant = "warning";
        return (
          <Badge variant={variant}>
            {product.stock_quantity}
            {product.unit && product.unit !== "unit" ? ` ${product.unit}` : ""}
          </Badge>
        );
      },
    },
    {
      key: "actions",
      header: "",
      render: (product) => (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => openAdjust(product)}
        >
          <SlidersHorizontal size={14} />
          Adjust
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        eyebrow="Stock control"
        title="Inventory"
        description="Live stock levels, valuation, and adjustments across the catalogue."
        breadcrumbs={[
          { label: "Dashboard", href: ROUTES.dashboard },
          { label: "Inventory" },
        ]}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportCsv("inventory", visible, exportColumns)}
            >
              <Download size={15} />
              CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                exportExcel("inventory", "Inventory", visible, exportColumns)
              }
            >
              <Download size={15} />
              Excel
            </Button>
            <Link
              href={ROUTES.inventory.movements}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-outline-variant px-3 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <History size={15} />
              History
            </Link>
            <Link
              href={ROUTES.inventory.transfers}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-outline-variant px-3 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <ArrowLeftRight size={15} />
              Transfers
            </Link>
            <Link
              href={ROUTES.inventory.alerts}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-secondary px-3 text-xs font-medium text-on-secondary transition-colors hover:bg-secondary/90 dark:bg-white dark:text-zinc-900"
            >
              <Bell size={15} />
              Alerts
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InventoryStatTile
          label="Retail stock value"
          value={valuation ? money(valuation.retailValueCents) : "—"}
          icon={<Coins size={20} />}
          tint="primary"
        />
        <InventoryStatTile
          label="Stock at cost"
          value={valuation ? money(valuation.costValueCents) : "—"}
          icon={<Boxes size={20} />}
          tint="secondary"
        />
        <InventoryStatTile
          label="Potential profit"
          value={valuation ? money(valuation.potentialProfitCents) : "—"}
          icon={<TrendingUp size={20} />}
          tint="success"
        />
        <InventoryStatTile
          label="Units on hand"
          value={valuation ? valuation.unitCount.toLocaleString() : "—"}
          icon={<Boxes size={20} />}
          tint="secondary"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, SKU, or barcode…"
          aria-label="Search inventory"
        />
        <Select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          placeholder="All categories"
          aria-label="Filter by category"
          options={categories.map((name) => ({ value: name, label: name }))}
        />
        <Select
          value={stockFilter}
          onChange={(event) => setStockFilter(event.target.value as StockFilter)}
          aria-label="Filter by stock level"
          options={[
            { value: "all", label: "All stock levels" },
            { value: "in", label: "In stock" },
            { value: "low", label: "Low stock" },
            { value: "out", label: "Out of stock" },
          ]}
        />
      </div>

      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(product) => product.id}
        emptyMessage="No products match these filters."
        caption="Inventory list with stock levels and margins"
      />

      <Modal
        open={adjusting !== null}
        onClose={() => !saving && setAdjusting(null)}
        title="Adjust stock"
        description={adjusting?.name}
      >
        <form className="flex flex-col gap-4" onSubmit={handleAdjust}>
          <p className="text-sm text-on-surface-variant dark:text-zinc-400">
            Current stock:{" "}
            <strong className="text-on-surface dark:text-zinc-100">
              {adjusting?.stock_quantity}
            </strong>
          </p>
          <Select
            label="Reason type"
            value={adjustType}
            onChange={(event) =>
              setAdjustType(event.target.value as StockMovementType)
            }
            options={ADJUSTMENT_TYPES}
          />
          <Input
            label="Quantity change"
            type="number"
            step="any"
            value={adjustQuantity}
            onChange={(event) => {
              setAdjustQuantity(event.target.value);
              setAdjustError("");
            }}
            error={adjustError}
            placeholder="e.g. -3 to remove three"
            autoFocus
          />
          <Input
            label="Note (optional)"
            value={adjustReason}
            onChange={(event) => setAdjustReason(event.target.value)}
            placeholder="Damaged in transit, recount, …"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAdjusting(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Apply adjustment"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
