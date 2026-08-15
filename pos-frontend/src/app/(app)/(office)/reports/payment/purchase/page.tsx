"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Copy,
  FileSpreadsheet,
  Filter,
  Printer,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getPaymentPurchasesReport,
  presetToRange,
  type PaymentPurchaseRow,
  type RangePreset,
} from "@/lib/db";
import { ROUTES } from "@/lib/types/routes";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useSettings } from "@/lib/hooks/use-settings";
import { exportExcel, exportPdf, type ExportColumn } from "@/lib/export";
import { formatDate } from "@/lib/format";

const RANGES: { value: RangePreset; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "month", label: "Month to date" },
  { value: "year", label: "Year to date" },
];

/*
 * Report dates stay in English regardless of the store's configured locale
 * (which drives currency formatting app-wide) so month names read
 * consistently across reports.
 */
const REPORT_DATE_LOCALE = "en-US";

function rowMatches(row: PaymentPurchaseRow, search: string, supplier: string): boolean {
  if (supplier !== "all" && row.supplierName !== supplier) return false;
  if (!search.trim()) return true;
  const needle = search.trim().toLowerCase();
  return (
    row.reference.toLowerCase().includes(needle) ||
    row.purchaseRef.toLowerCase().includes(needle) ||
    row.supplierName.toLowerCase().includes(needle)
  );
}

export default function PaymentPurchasesReportPage() {
  const { money } = useSettings();
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [rows, setRows] = useState<PaymentPurchaseRow[]>([]);
  const [search, setSearch] = useState("");
  const [supplier, setSupplier] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);

  function reload() {
    getPaymentPurchasesReport(presetToRange(preset)).then(setRows);
  }

  useEffect(() => {
    let cancelled = false;
    getPaymentPurchasesReport(presetToRange(preset)).then((result) => {
      if (!cancelled) setRows(result);
    });
    return () => {
      cancelled = true;
    };
  }, [preset]);

  const range = presetToRange(preset);
  const rangeLabel = `${formatDate(range.from, REPORT_DATE_LOCALE)} — ${formatDate(range.to, REPORT_DATE_LOCALE)}`;

  const suppliers = [...new Set(rows.map((row) => row.supplierName))].sort((a, b) => a.localeCompare(b));
  const filtered = rows.filter((row) => rowMatches(row, search, supplier));
  const totalCents = filtered.reduce((sum, row) => sum + row.amountCents, 0);

  const byDay = new Map<string, number>();
  for (const row of filtered) byDay.set(row.date, (byDay.get(row.date) ?? 0) + row.amountCents);
  const lineData = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amountCents]) => ({ date, amount: amountCents / 100 }));

  const byMethod = new Map<string, number>();
  for (const row of filtered) byMethod.set(row.paidBy, (byMethod.get(row.paidBy) ?? 0) + row.amountCents);
  const methodData = [...byMethod.entries()].map(([method, amountCents]) => ({
    method,
    amount: amountCents / 100,
  }));

  const columns: DataColumn<PaymentPurchaseRow>[] = [
    {
      key: "date",
      header: "Date",
      sortValue: (r) => r.createdAt,
      render: (r) => formatDate(r.createdAt, REPORT_DATE_LOCALE),
    },
    { key: "reference", header: "Reference", sortValue: (r) => r.reference, render: (r) => r.reference },
    {
      key: "purchase",
      header: "Purchase",
      sortValue: (r) => r.purchaseRef,
      render: (r) => (
        <Link
          href={ROUTES.purchases.detail(r.id)}
          className="font-medium text-primary hover:underline dark:text-blue-400"
        >
          {r.purchaseRef}
        </Link>
      ),
    },
    { key: "supplier", header: "Supplier", sortValue: (r) => r.supplierName, render: (r) => r.supplierName },
    {
      key: "paidBy",
      header: "Paid by",
      hideOnMobile: true,
      sortValue: (r) => r.paidBy,
      render: (r) => <Badge variant="neutral">{r.paidBy}</Badge>,
    },
    { key: "account", header: "Account", hideOnMobile: true, sortValue: (r) => r.account, render: (r) => r.account },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortValue: (r) => r.amountCents,
      render: (r) => <span className="font-semibold">{money(r.amountCents)}</span>,
    },
    { key: "addedBy", header: "Added By", hideOnMobile: true, sortValue: (r) => r.addedBy, render: (r) => r.addedBy },
  ];

  const exportColumns: ExportColumn<PaymentPurchaseRow>[] = [
    { key: "date", header: "Date", value: (r) => r.date },
    { key: "reference", header: "Reference", value: (r) => r.reference },
    { key: "purchase", header: "Purchase", value: (r) => r.purchaseRef },
    { key: "supplier", header: "Supplier", value: (r) => r.supplierName },
    { key: "paidBy", header: "Paid by", value: (r) => r.paidBy },
    { key: "account", header: "Account", value: (r) => r.account },
    { key: "amount", header: "Amount", value: (r) => (r.amountCents / 100).toFixed(2) },
    { key: "addedBy", header: "Added By", value: (r) => r.addedBy },
  ];

  const title = `Payment Purchases — ${rangeLabel}`;

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        eyebrow="Reports"
        title="Payment Purchases"
        breadcrumbs={[{ label: "Reports", href: ROUTES.reports }, { label: "Payment Purchases" }]}
      />

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-on-surface-variant dark:text-zinc-300">
              Date range
            </span>
            <span className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container px-3 py-2.5 text-sm text-on-surface dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50">
              <Calendar size={15} aria-hidden className="text-on-surface-variant dark:text-zinc-400" />
              {rangeLabel}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-on-surface-variant dark:text-zinc-300">
              Quick ranges
            </span>
            <div className="flex flex-wrap gap-1.5">
              {RANGES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPreset(option.value)}
                  className={`min-h-9 rounded-lg border px-3 text-xs font-semibold transition-colors duration-[var(--duration-fast)] ${
                    preset === option.value
                      ? "border-primary bg-primary/10 text-primary dark:border-blue-400 dark:bg-blue-400/10 dark:text-blue-400"
                      : "border-outline-variant text-on-surface-variant hover:bg-surface-container dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-outline-variant pt-4 dark:border-zinc-800">
          <Button type="button" variant="outline" size="sm" onClick={() => setFilterOpen((open) => !open)}>
            <Filter size={15} />
            Filter
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer size={15} />
            Print
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => exportPdf(title, filtered, exportColumns)}
            disabled={filtered.length === 0}
          >
            <Copy size={15} />
            PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => exportExcel(`payment-purchases-${preset}`, title, filtered, exportColumns)}
            disabled={filtered.length === 0}
          >
            <FileSpreadsheet size={15} />
            EXCEL
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={reload}>
            <RefreshCw size={15} />
            Refresh
          </Button>
        </div>

        {filterOpen && (
          <div className="animate-fade-in border-t border-outline-variant pt-4 dark:border-zinc-800">
            <div className="max-w-xs">
              <Select
                label="Supplier"
                value={supplier}
                onChange={(event) => setSupplier(event.target.value)}
                options={[
                  { value: "all", label: "All suppliers" },
                  ...suppliers.map((name) => ({ value: name, label: name })),
                ]}
              />
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-on-surface dark:text-zinc-50">
            Payments Over Time
          </h3>
          {lineData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-on-surface-variant dark:text-zinc-500">
              No payments in this period.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-outline-variant dark:stroke-zinc-800" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => money(Number(value) * 100)} />
                  <Line type="monotone" dataKey="amount" stroke="#3987e5" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-semibold text-on-surface dark:text-zinc-50">
            Payments By Method
          </h3>
          {methodData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-on-surface-variant dark:text-zinc-500">
              No payments in this period.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={methodData} layout="vertical" margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-outline-variant dark:stroke-zinc-800" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="method" tick={{ fontSize: 11 }} width={60} />
                  <Tooltip formatter={(value) => money(Number(value) * 100)} />
                  <Bar dataKey="amount" fill="#3987e5" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card className="flex flex-col gap-4">
        <Input
          leading={<Search size={15} aria-hidden />}
          placeholder="Search this table"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-xs"
        />

        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.id}
          pageSize={10}
          pageSizeOptions={[10, 25, 50]}
          emptyMessage="No payments for this period."
          caption={title}
        />

        <div className="flex justify-end border-t border-outline-variant pt-3 text-sm font-semibold text-on-surface dark:border-zinc-800 dark:text-zinc-50">
          Total&nbsp;{money(totalCents)}
        </div>
      </Card>
    </div>
  );
}
