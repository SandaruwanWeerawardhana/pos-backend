"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, FileText, Printer } from "lucide-react";
import {
  getInventoryReport,
  getProfitReport,
  getPurchaseReport,
  getSalesReport,
  getSupplierReport,
  presetToRange,
  type InventoryReportRow,
  type ProfitRow,
  type PurchaseReportRow,
  type RangePreset,
  type SalesRow,
  type SupplierReportRow,
} from "@/lib/db";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { useSettings } from "@/lib/hooks/use-settings";
import {
  exportCsv,
  exportExcel,
  exportPdf,
  type ExportColumn,
} from "@/lib/export";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";

type ReportKey =
  | "sales"
  | "profit"
  | "inventory"
  | "suppliers"
  | "purchases";

const REPORTS: { value: ReportKey; label: string }[] = [
  { value: "sales", label: "Sales" },
  { value: "profit", label: "Profit & margin" },
  { value: "inventory", label: "Inventory" },
  { value: "suppliers", label: "Suppliers" },
  { value: "purchases", label: "Purchases" },
];

const RANGES: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

// Each report supplies its own row type, so the page holds one discriminated
// bundle rather than six parallel state slots that can drift out of sync.
type ReportData =
  | { key: "sales"; rows: SalesRow[] }
  | { key: "profit"; rows: ProfitRow[] }
  | { key: "inventory"; rows: InventoryReportRow[] }
  | { key: "suppliers"; rows: SupplierReportRow[] }
  | { key: "purchases"; rows: PurchaseReportRow[] };

export default function ReportsPage() {
  const { settings, money } = useSettings();
  const [report, setReport] = useState<ReportKey>("sales");
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [data, setData] = useState<ReportData | null>(null);

  const load = useCallback(async () => {
    const range = presetToRange(preset);
    switch (report) {
      case "sales":
        setData({ key: "sales", rows: await getSalesReport(range) });
        break;
      case "profit":
        setData({ key: "profit", rows: await getProfitReport(range) });
        break;
      case "inventory":
        setData({ key: "inventory", rows: await getInventoryReport() });
        break;
      case "suppliers":
        setData({ key: "suppliers", rows: await getSupplierReport() });
        break;
      case "purchases":
        setData({ key: "purchases", rows: await getPurchaseReport(range) });
        break;
    }
  }, [report, preset]);

  useEffect(() => {
    void load();
  }, [load]);

  const cents = (value: number) => formatMoney(value, settings);

  // Column definitions do double duty: the on-screen table and the exporters
  // read from the same shape, so an export can never drift from what's shown.
  function buildColumns(): {
    table: DataColumn<never>[];
    exports: ExportColumn<never>[];
  } {
    switch (data?.key) {
      case "sales": {
        const table: DataColumn<SalesRow>[] = [
          { key: "date", header: "Date", sortValue: (r) => r.date, render: (r) => r.date },
          { key: "orders", header: "Orders", align: "right", sortValue: (r) => r.orderCount, render: (r) => String(r.orderCount) },
          { key: "gross", header: "Gross", align: "right", hideOnMobile: true, sortValue: (r) => r.grossCents, render: (r) => cents(r.grossCents) },
          { key: "discount", header: "Discounts", align: "right", hideOnMobile: true, sortValue: (r) => r.discountCents, render: (r) => cents(r.discountCents) },
          { key: "tax", header: "Tax", align: "right", hideOnMobile: true, sortValue: (r) => r.taxCents, render: (r) => cents(r.taxCents) },
          { key: "net", header: "Net", align: "right", sortValue: (r) => r.netCents, render: (r) => cents(r.netCents) },
        ];
        const exports: ExportColumn<SalesRow>[] = [
          { key: "date", header: "Date", value: (r) => r.date },
          { key: "orders", header: "Orders", value: (r) => r.orderCount },
          { key: "gross", header: "Gross", value: (r) => (r.grossCents / 100).toFixed(2) },
          { key: "discount", header: "Discounts", value: (r) => (r.discountCents / 100).toFixed(2) },
          { key: "tax", header: "Tax", value: (r) => (r.taxCents / 100).toFixed(2) },
          { key: "net", header: "Net", value: (r) => (r.netCents / 100).toFixed(2) },
        ];
        return { table: table as DataColumn<never>[], exports: exports as ExportColumn<never>[] };
      }
      case "profit": {
        const table: DataColumn<ProfitRow>[] = [
          { key: "name", header: "Product", sortValue: (r) => r.name, render: (r) => r.name },
          { key: "qty", header: "Sold", align: "right", sortValue: (r) => r.quantitySold, render: (r) => String(r.quantitySold) },
          { key: "revenue", header: "Revenue", align: "right", sortValue: (r) => r.revenueCents, render: (r) => cents(r.revenueCents) },
          { key: "cost", header: "Cost", align: "right", hideOnMobile: true, sortValue: (r) => r.costCents, render: (r) => cents(r.costCents) },
          { key: "profit", header: "Profit", align: "right", sortValue: (r) => r.profitCents, render: (r) => cents(r.profitCents) },
          { key: "margin", header: "Margin", align: "right", hideOnMobile: true, sortValue: (r) => r.marginPercent, render: (r) => formatPercent(r.marginPercent) },
        ];
        const exports: ExportColumn<ProfitRow>[] = [
          { key: "name", header: "Product", value: (r) => r.name },
          { key: "qty", header: "Quantity sold", value: (r) => r.quantitySold },
          { key: "revenue", header: "Revenue", value: (r) => (r.revenueCents / 100).toFixed(2) },
          { key: "cost", header: "Cost", value: (r) => (r.costCents / 100).toFixed(2) },
          { key: "profit", header: "Profit", value: (r) => (r.profitCents / 100).toFixed(2) },
          { key: "margin", header: "Margin %", value: (r) => r.marginPercent },
        ];
        return { table: table as DataColumn<never>[], exports: exports as ExportColumn<never>[] };
      }
      case "inventory": {
        const table: DataColumn<InventoryReportRow>[] = [
          { key: "name", header: "Product", sortValue: (r) => r.name, render: (r) => r.name },
          { key: "category", header: "Category", hideOnMobile: true, sortValue: (r) => r.category, render: (r) => r.category },
          { key: "stock", header: "Stock", align: "right", sortValue: (r) => r.stock, render: (r) => String(r.stock) },
          { key: "reorder", header: "Reorder at", align: "right", hideOnMobile: true, sortValue: (r) => r.reorderLevel, render: (r) => String(r.reorderLevel) },
          { key: "value", header: "Stock value", align: "right", sortValue: (r) => r.stockValueCents, render: (r) => cents(r.stockValueCents) },
          {
            key: "status",
            header: "Status",
            sortValue: (r) => r.status,
            render: (r) => (
              <Badge
                variant={
                  r.status === "out" ? "danger" : r.status === "low" ? "warning" : "success"
                }
              >
                {r.status}
              </Badge>
            ),
          },
        ];
        const exports: ExportColumn<InventoryReportRow>[] = [
          { key: "name", header: "Product", value: (r) => r.name },
          { key: "sku", header: "SKU", value: (r) => r.sku },
          { key: "category", header: "Category", value: (r) => r.category },
          { key: "stock", header: "Stock", value: (r) => r.stock },
          { key: "reorder", header: "Reorder level", value: (r) => r.reorderLevel },
          { key: "cost", header: "Cost", value: (r) => (r.costCents / 100).toFixed(2) },
          { key: "price", header: "Price", value: (r) => (r.priceCents / 100).toFixed(2) },
          { key: "value", header: "Stock value", value: (r) => (r.stockValueCents / 100).toFixed(2) },
          { key: "status", header: "Status", value: (r) => r.status },
        ];
        return { table: table as DataColumn<never>[], exports: exports as ExportColumn<never>[] };
      }
      case "suppliers": {
        const table: DataColumn<SupplierReportRow>[] = [
          { key: "name", header: "Supplier", sortValue: (r) => r.name, render: (r) => r.name },
          { key: "orders", header: "Orders", align: "right", sortValue: (r) => r.purchaseOrderCount, render: (r) => String(r.purchaseOrderCount) },
          { key: "products", header: "Products", align: "right", hideOnMobile: true, sortValue: (r) => r.productCount, render: (r) => String(r.productCount) },
          { key: "spend", header: "Purchased", align: "right", sortValue: (r) => r.purchasedCents, render: (r) => cents(r.purchasedCents) },
          { key: "last", header: "Last order", hideOnMobile: true, sortValue: (r) => r.lastOrderAt ?? 0, render: (r) => (r.lastOrderAt ? formatDate(r.lastOrderAt, settings.locale) : "—") },
        ];
        const exports: ExportColumn<SupplierReportRow>[] = [
          { key: "name", header: "Supplier", value: (r) => r.name },
          { key: "orders", header: "Purchase orders", value: (r) => r.purchaseOrderCount },
          { key: "products", header: "Products supplied", value: (r) => r.productCount },
          { key: "spend", header: "Purchased", value: (r) => (r.purchasedCents / 100).toFixed(2) },
          { key: "last", header: "Last order", value: (r) => (r.lastOrderAt ? new Date(r.lastOrderAt).toISOString() : "") },
        ];
        return { table: table as DataColumn<never>[], exports: exports as ExportColumn<never>[] };
      }
      case "purchases": {
        const table: DataColumn<PurchaseReportRow>[] = [
          { key: "ref", header: "Reference", sortValue: (r) => r.reference, render: (r) => r.reference },
          { key: "supplier", header: "Supplier", sortValue: (r) => r.supplierName, render: (r) => r.supplierName },
          { key: "status", header: "Status", hideOnMobile: true, sortValue: (r) => r.status, render: (r) => <Badge variant="neutral">{r.status}</Badge> },
          { key: "lines", header: "Lines", align: "right", hideOnMobile: true, sortValue: (r) => r.lineCount, render: (r) => String(r.lineCount) },
          { key: "total", header: "Total", align: "right", sortValue: (r) => r.totalCents, render: (r) => cents(r.totalCents) },
          { key: "date", header: "Raised", sortValue: (r) => r.createdAt, render: (r) => formatDate(r.createdAt, settings.locale) },
        ];
        const exports: ExportColumn<PurchaseReportRow>[] = [
          { key: "ref", header: "Reference", value: (r) => r.reference },
          { key: "supplier", header: "Supplier", value: (r) => r.supplierName },
          { key: "status", header: "Status", value: (r) => r.status },
          { key: "lines", header: "Lines", value: (r) => r.lineCount },
          { key: "total", header: "Total", value: (r) => (r.totalCents / 100).toFixed(2) },
          { key: "date", header: "Raised", value: (r) => new Date(r.createdAt).toISOString() },
        ];
        return { table: table as DataColumn<never>[], exports: exports as ExportColumn<never>[] };
      }
      default:
        return { table: [], exports: [] };
    }
  }

  const { table, exports } = buildColumns();
  const rows = (data?.rows ?? []) as never[];
  const reportLabel = REPORTS.find((entry) => entry.value === report)?.label ?? "";
  const rangeLabel = RANGES.find((entry) => entry.value === preset)?.label ?? "";
  const title = `${reportLabel} report — ${rangeLabel}`;
  const filename = `${report}-report-${preset}`;

  // Summary tiles are report-specific; only the money-shaped reports have a
  // meaningful single headline number.
  let headline: { label: string; value: string; sub: string } | null = null;
  if (data?.key === "sales") {
    const net = data.rows.reduce((sum, row) => sum + row.netCents, 0);
    const orders = data.rows.reduce((sum, row) => sum + row.orderCount, 0);
    headline = {
      label: "Net sales",
      value: money(net),
      sub: `${orders} orders across ${data.rows.length} days`,
    };
  } else if (data?.key === "profit") {
    const profit = data.rows.reduce((sum, row) => sum + row.profitCents, 0);
    const revenue = data.rows.reduce((sum, row) => sum + row.revenueCents, 0);
    headline = {
      label: "Gross profit",
      value: money(profit),
      sub:
        revenue > 0
          ? `${((profit / revenue) * 100).toFixed(1)}% blended margin`
          : "No revenue in range",
    };
  } else if (data?.key === "inventory") {
    const value = data.rows.reduce((sum, row) => sum + row.stockValueCents, 0);
    headline = {
      label: "Stock at retail",
      value: money(value),
      sub: `${data.rows.length} products`,
    };
  }

  const rangeApplies = report !== "inventory" && report !== "suppliers";

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        eyebrow="Insight"
        title="Reports"
        description="Filter, sort, and export any report. All figures come from local data, so reports work offline."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportCsv(filename, rows, exports)}
              disabled={rows.length === 0}
            >
              <FileText size={15} />
              CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportExcel(filename, title, rows, exports)}
              disabled={rows.length === 0}
            >
              <FileSpreadsheet size={15} />
              Excel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportPdf(title, rows, exports)}
              disabled={rows.length === 0}
            >
              <Printer size={15} />
              PDF
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Report"
          value={report}
          onChange={(event) => setReport(event.target.value as ReportKey)}
          options={REPORTS}
        />
        <Select
          label="Date range"
          value={preset}
          onChange={(event) => setPreset(event.target.value as RangePreset)}
          options={RANGES}
          disabled={!rangeApplies}
        />
      </div>

      {!rangeApplies && (
        <p className="text-xs text-on-surface-variant dark:text-zinc-500">
          This report reflects current state rather than a period, so the date
          range does not apply.
        </p>
      )}

      {headline && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label={headline.label}
            value={headline.value}
            sub={headline.sub}
            accent="primary"
          />
        </div>
      )}

      <DataTable
        columns={table}
        rows={rows}
        rowKey={(row) => JSON.stringify(row).slice(0, 80)}
        pageSize={20}
        emptyMessage="No data for this report and date range."
        caption={title}
      />
    </div>
  );
}
