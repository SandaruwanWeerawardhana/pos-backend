"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  ChevronRight,
  DollarSign,
  FileText,
  Info,
  Receipt,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Undo2,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getDashboardInsights,
  getDashboardOverview,
  getPaymentBreakdown,
  getRecentSalesRows,
  getSalesPurchasesSeries,
  getStockAlertRows,
  getStockValueSummary,
  getTopSellingProducts,
  getTopSellingProductsTable,
  type DashboardInsight,
  type DashboardOverview,
  type PaymentBreakdownRow,
  type SeriesPoint,
  type StockAlertRow,
  type StockValueSummary,
  type TopProductsResult,
  type TopProductTableRow,
} from "@/lib/db/dashboard";
import { presetToRange, type RangePreset } from "@/lib/db/reports";
import { useAuth } from "@/lib/hooks/use-auth";
import { useSettings } from "@/lib/hooks/use-settings";
import { useTheme } from "@/components/providers/theme-provider";
import { PluginDashboardWidget } from "@/components/plugin-slots/PluginDashboardWidget";
import { Card, SectionHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Table, type TableColumn } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/format";
import type { PaymentMethod, PendingOrder } from "@/lib/types";
import { ROUTES } from "@/lib/types/routes";

/**
 * Series colours follow the dataviz skill's validated 8-hue categorical
 * ramp (see the skill's palette.md). Sales/Purchases and the payment-method
 * breakdown reuse the same entity -> hue mapping across every chart on this
 * page, so "blue" always means the same thing wherever it appears.
 */
interface ChartPalette {
  sales: string;
  purchases: string;
  cash: string;
  card: string;
  qr: string;
  other: string;
  donutOther: string;
  grid: string;
  ink: string;
  muted: string;
  surface: string;
}

const CHART_COLORS: Record<"light" | "dark", ChartPalette> = {
  light: {
    sales: "#2a78d6",
    purchases: "#eb6834",
    cash: "#2a78d6",
    card: "#eb6834",
    qr: "#1baf7a",
    other: "#eda100",
    donutOther: "#898781",
    grid: "#e1e0d9",
    ink: "#52514e",
    muted: "#898781",
    surface: "#fcfcfb",
  },
  dark: {
    sales: "#3987e5",
    purchases: "#d95926",
    cash: "#3987e5",
    card: "#d95926",
    qr: "#199e70",
    other: "#c98500",
    donutOther: "#898781",
    grid: "#2c2c2a",
    ink: "#c3c2b7",
    muted: "#898781",
    surface: "#1a1a19",
  },
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  qr: "QR",
  other: "Other",
};

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

interface DashboardData {
  overview: DashboardOverview;
  series: SeriesPoint[];
  payments: PaymentBreakdownRow[];
  donut: TopProductsResult;
  stockValue: StockValueSummary;
  stockAlerts: StockAlertRow[];
  recentSales: PendingOrder[];
  insights: DashboardInsight[];
}

function rangeLabel(preset: RangePreset, locale: string): string {
  const range = presetToRange(preset);
  const fmt = (ts: number) =>
    new Date(ts).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
  return `${fmt(range.from)} - ${fmt(range.to)}`;
}

function DashboardHero({
  greeting,
  preset,
  onPresetChange,
  locale,
}: Readonly<{
  greeting: string;
  preset: RangePreset;
  onPresetChange: (value: RangePreset) => void;
  locale: string;
}>) {
  return (
    <div className="flex animate-fade-in-up flex-col gap-4 rounded-2xl bg-gradient-to-r from-primary to-secondary p-6 text-on-primary transition-shadow duration-[var(--duration-base)] hover:shadow-elevated sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-on-primary/80">{greeting}</p>
      </div>
      <div className="flex flex-col gap-2 sm:items-end">
        <select
          value={preset}
          onChange={(event) => onPresetChange(event.target.value as RangePreset)}
          className="min-h-11 rounded-lg border border-on-primary/30 bg-on-primary/15 px-3 text-sm font-medium text-on-primary backdrop-blur-sm transition-colors duration-[var(--duration-fast)] hover:bg-on-primary/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-primary [&>option]:text-on-surface"
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="rounded-lg bg-on-primary/15 px-3 py-1.5 text-xs font-medium text-on-primary/90 backdrop-blur-sm transition-colors duration-[var(--duration-base)]">
          {rangeLabel(preset, locale)}
        </span>
      </div>
    </div>
  );
}

const KPI_TINTS = {
  violet: "bg-violet-600 text-white dark:bg-violet-500",
  emerald: "bg-emerald-500 text-white dark:bg-emerald-500",
  amber: "bg-amber-500 text-white dark:bg-amber-500",
  rose: "bg-rose-500 text-white dark:bg-rose-500",
  sky: "bg-sky-500 text-white dark:bg-sky-500",
  orange: "bg-orange-500 text-white dark:bg-orange-500",
} as const;

function KpiTile({
  label,
  value,
  icon,
  tint,
  delayMs = 0,
}: Readonly<{
  label: string;
  value: string;
  icon: React.ReactNode;
  tint: keyof typeof KPI_TINTS;
  delayMs?: number;
}>) {
  return (
    <div
      style={{ animationDelay: `${delayMs}ms` }}
      className="flex animate-fade-in-up items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm transition-all duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:shadow-elevated dark:border-zinc-800 dark:bg-zinc-900"
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-[var(--duration-fast)] ${KPI_TINTS[tint]}`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-on-surface-variant dark:text-zinc-400">{label}</span>
        <span className="block text-lg font-semibold text-on-surface transition-all duration-[var(--duration-base)] dark:text-zinc-50">{value}</span>
      </span>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  money,
}: Readonly<{
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  money: (cents: number) => string;
}>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-xs shadow-elevated dark:border-zinc-800 dark:bg-zinc-900">
      <p className="mb-1 font-semibold text-on-surface dark:text-zinc-100">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 text-on-surface-variant dark:text-zinc-400">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: {money(entry.value)}
        </p>
      ))}
    </div>
  );
}

/*
 * Lightens (amount > 0) or darkens (amount < 0) a #rrggbb colour. The lit top
 * face and shaded side face of an extruded bar are derived from the series'
 * own hue this way, so the 3D shading never introduces a colour outside the
 * validated palette.
 */
function shadeHex(hex: string, amount: number): string {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return `#${channels
    .map((channel) => {
      const mixed =
        amount >= 0
          ? channel + (255 - channel) * amount
          : channel * (1 + amount);
      return Math.min(255, Math.max(0, Math.round(mixed)))
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

/*
 * Extrusion depth in px. Deliberately shallow: the top cap of a 3D bar sits
 * above the value it encodes, so the deeper the prism the more the eye
 * over-reads the magnitude. The gridlines and y-axis stay aligned to the
 * front face, which is the true value.
 */
const BAR_DEPTH_PX = 7;

interface Bar3DProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  gradientId?: string;
}

function Bar3D({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  fill = "#000000",
  gradientId,
}: Readonly<Bar3DProps>) {
  if (width <= 0 || height <= 0) return null;

  const depth = Math.min(BAR_DEPTH_PX, width * 0.4);
  const right = x + width;
  const bottom = y + height;

  return (
    <g>
      {/* Side face — the darkest plane, so the light reads as coming from the
          upper left across every bar in the chart. */}
      <path
        d={`M ${right} ${y} L ${right + depth} ${y - depth} L ${right + depth} ${bottom - depth} L ${right} ${bottom} Z`}
        fill={shadeHex(fill, -0.3)}
      />
      <path
        d={`M ${x} ${y} L ${x + depth} ${y - depth} L ${right + depth} ${y - depth} L ${right} ${y} Z`}
        fill={shadeHex(fill, 0.24)}
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={gradientId ? `url(#${gradientId})` : fill}
      />
    </g>
  );
}

function SalesPurchasesChart({
  series,
  money,
  colors,
}: Readonly<{
  series: SeriesPoint[];
  money: (cents: number) => string;
  colors: ChartPalette;
}>) {
  const data = series.map((point) => ({
    label: point.label,
    Sales: point.salesCents,
    Purchases: point.purchasesCents,
  }));

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-on-surface dark:text-zinc-50">
        Sales &amp; Purchases
      </h3>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {/* The extra top and right margin is the room the extrusion needs —
              without it the tallest bar's cap and the rightmost bar's side
              face clip against the plot edge. */}
          <BarChart
            data={data}
            barGap={6}
            barCategoryGap="26%"
            margin={{ top: BAR_DEPTH_PX + 4, right: BAR_DEPTH_PX + 4, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="bar3d-sales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={shadeHex(colors.sales, 0.12)} />
                <stop offset="100%" stopColor={colors.sales} />
              </linearGradient>
              <linearGradient id="bar3d-purchases" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={shadeHex(colors.purchases, 0.12)} />
                <stop offset="100%" stopColor={colors.purchases} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="label"
              tick={{ fill: colors.muted, fontSize: 11 }}
              axisLine={{ stroke: colors.grid }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: colors.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => money(value)}
              width={80}
            />
            <Tooltip content={<ChartTooltip money={money} />} cursor={{ fill: colors.grid, opacity: 0.4 }} />
            <Legend wrapperStyle={{ fontSize: 12, color: colors.ink }} />
            {/* `fill` stays a flat hex so the legend swatch resolves — the
                gradient only reaches the front face, via the custom shape. */}
            <Bar
              dataKey="Sales"
              fill={colors.sales}
              shape={<Bar3D gradientId="bar3d-sales" />}
              maxBarSize={26}
              animationDuration={700}
              animationEasing="ease-out"
            />
            <Bar
              dataKey="Purchases"
              fill={colors.purchases}
              shape={<Bar3D gradientId="bar3d-purchases" />}
              maxBarSize={26}
              animationDuration={700}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function TopSellingDonut({
  donut,
  colors,
}: Readonly<{ donut: TopProductsResult; colors: ChartPalette }>) {
  const slotColors = [colors.sales, colors.purchases, colors.qr];
  const data = donut.items.map((item, index) => ({
    name: `${item.name} (${item.percent}%)`,
    value: item.quantitySold,
    fill: slotColors[index] ?? colors.donutOther,
  }));
  if (donut.otherQuantity > 0) {
    const otherPercent =
      donut.totalQuantity > 0 ? Math.round((donut.otherQuantity / donut.totalQuantity) * 100) : 0;
    data.push({
      name: `Other (${otherPercent}%)`,
      value: donut.otherQuantity,
      fill: colors.donutOther,
    });
  }

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-on-surface dark:text-zinc-50">
        Top selling products
      </h3>
      {data.length === 0 ? (
        <EmptyState icon={<ShoppingBag size={20} />} title="No sales in this period" />
      ) : (
        <div className="relative h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="60%"
                outerRadius="85%"
                paddingAngle={2}
                stroke="none"
                animationDuration={700}
                animationEasing="ease-out"
              />
              <Tooltip formatter={(value) => `${value} sold`} />
              <Legend position="bottom" wrapperStyle={{ fontSize: 12, color: colors.ink }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 top-2 flex flex-col items-center justify-center">
            <p className="text-xs text-on-surface-variant dark:text-zinc-400">total sold</p>
            <p className="text-2xl font-bold text-on-surface dark:text-zinc-50">
              {donut.totalQuantity}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function PaymentBreakdownCard({
  rows,
  money,
  colors,
}: Readonly<{
  rows: PaymentBreakdownRow[];
  money: (cents: number) => string;
  colors: ChartPalette;
}>) {
  const dotColor: Record<PaymentMethod, string> = {
    cash: colors.cash,
    card: colors.card,
    qr: colors.qr,
    other: colors.other,
  };

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-on-surface dark:text-zinc-50">
        Sales by payment
      </h3>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.method}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-on-surface dark:text-zinc-100">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: dotColor[row.method] }}
                />
                {PAYMENT_LABELS[row.method]}
              </span>
              <span className="text-on-surface-variant dark:text-zinc-400">
                {money(row.amountCents)} ({row.percent}%)
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-surface-container dark:bg-zinc-800">
              <div
                className="h-1.5 rounded-full transition-all duration-[var(--duration-slow)] ease-out"
                style={{ width: `${row.percent}%`, backgroundColor: dotColor[row.method] }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function StockValueCard({
  summary,
  money,
}: Readonly<{ summary: StockValueSummary; money: (cents: number) => string }>) {
  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-on-surface dark:text-zinc-50">
        Stock value
      </h3>
      <ul className="flex flex-col gap-4">
        <li className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white dark:bg-sky-500">
            <DollarSign size={18} />
          </span>
          <span className="flex-1">
            <span className="block text-xs text-on-surface-variant dark:text-zinc-400">
              Stock value by cost
            </span>
            <span className="block text-sm font-semibold text-on-surface dark:text-zinc-50">
              {money(summary.costCents)}
            </span>
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white dark:bg-orange-500">
            <Receipt size={18} />
          </span>
          <span className="flex-1">
            <span className="block text-xs text-on-surface-variant dark:text-zinc-400">
              Stock value by retail
            </span>
            <span className="block text-sm font-semibold text-on-surface dark:text-zinc-50">
              {money(summary.retailCents)}
            </span>
          </span>
        </li>
      </ul>
    </Card>
  );
}

function PaymentSentReceivedChart({
  series,
  money,
  colors,
}: Readonly<{
  series: SeriesPoint[];
  money: (cents: number) => string;
  colors: ChartPalette;
}>) {
  const data = series.map((point) => ({
    label: point.label,
    Received: point.salesCents,
    Sent: point.purchasesCents,
  }));

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-on-surface dark:text-zinc-50">
        Payment sent &amp; received
      </h3>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="label"
              tick={{ fill: colors.muted, fontSize: 11 }}
              axisLine={{ stroke: colors.grid }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: colors.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => money(value)}
              width={80}
            />
            <Tooltip content={<ChartTooltip money={money} />} />
            <Legend wrapperStyle={{ fontSize: 12, color: colors.ink }} />
            <Area
              type="monotone"
              dataKey="Sent"
              stroke={colors.purchases}
              fill={colors.purchases}
              fillOpacity={0.1}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
              animationDuration={700}
              animationEasing="ease-out"
            />
            <Area
              type="monotone"
              dataKey="Received"
              stroke={colors.sales}
              fill={colors.sales}
              fillOpacity={0.1}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
              animationDuration={700}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function StockAlertTable({ rows }: Readonly<{ rows: StockAlertRow[] }>) {
  const columns: TableColumn<StockAlertRow>[] = [
    { key: "sku", header: "Code", render: (row) => row.sku },
    { key: "name", header: "Product name", render: (row) => row.name },
    { key: "quantity", header: "Quantity", render: (row) => row.quantity },
    {
      key: "alert",
      header: "Alert quantity",
      render: (row) => (
        <Badge variant={row.severity === "out" ? "danger" : "warning"}>
          {row.alertQuantity}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title="Stock alert"
        action={
          <Link
            href={ROUTES.inventory.alerts}
            className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline dark:text-blue-400 transition-colors duration-[var(--duration-fast)]"
          >
            View all
            <ChevronRight size={13} aria-hidden />
          </Link>
        }
      />
      <Table
        columns={columns}
        rows={rows}
        rowKey={(row) => row.productId}
        emptyMessage="No products at or below reorder level."
      />
    </div>
  );
}

function TopProductsTable({
  rows,
  money,
  preset,
  onPresetChange,
}: Readonly<{
  rows: TopProductTableRow[];
  money: (cents: number) => string;
  preset: "month" | "year";
  onPresetChange: (preset: "month" | "year") => void;
}>) {
  const columns: TableColumn<TopProductTableRow>[] = [
    { key: "name", header: "Product name", render: (row) => row.name },
    { key: "qty", header: "Total sales", render: (row) => row.quantitySold },
    {
      key: "amount",
      header: "Total amount",
      render: (row) => (
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
          {money(row.revenueCents)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title="Top selling products"
        action={
          <div className="flex gap-1 rounded-lg bg-surface-container p-0.5 dark:bg-zinc-800">
            {(["month", "year"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onPresetChange(value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-[var(--duration-fast)] active:scale-95 ${
                  preset === value
                    ? "bg-surface-container-lowest text-on-surface shadow-sm dark:bg-zinc-900 dark:text-zinc-50"
                    : "text-on-surface-variant hover:text-on-surface dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {value === "month" ? "This month" : "This year"}
              </button>
            ))}
          </div>
        }
      />
      <Table
        columns={columns}
        rows={rows}
        rowKey={(row) => row.productId}
        emptyMessage="No sales in this period."
      />
    </div>
  );
}

function RecentSalesTable({
  orders,
  money,
}: Readonly<{ orders: PendingOrder[]; money: (cents: number) => string }>) {
  const columns: TableColumn<PendingOrder>[] = [
    {
      key: "reference",
      header: "Reference",
      render: (row) => (
        <Link
          href={ROUTES.sales.detail(row.client_generated_id)}
          className="font-medium text-primary hover:underline dark:text-blue-400 transition-colors duration-[var(--duration-fast)]"
        >
          {row.receipt_no ?? row.client_generated_id.slice(0, 8)}
        </Link>
      ),
    },
    { key: "items", header: "Items", render: (row) => row.items.length },
    {
      key: "date",
      header: "Date",
      render: (row) => formatDateTime(row.created_at),
    },
    {
      key: "payment",
      header: "Payment",
      render: (row) => PAYMENT_LABELS[row.payment_method],
    },
    {
      key: "total",
      header: "Total",
      render: (row) => (
        <span className="font-semibold text-on-surface dark:text-zinc-50">
          {money(row.total_cents)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        if (row.refunded) return <Badge variant="danger">Refunded</Badge>;
        if (row.sync_status === "synced") return <Badge variant="success">Synced</Badge>;
        if (row.sync_status === "conflict" || row.sync_status === "error") {
          return <Badge variant="warning">{row.sync_status}</Badge>;
        }
        return <Badge variant="neutral">{row.sync_status}</Badge>;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title="Recent sales"
        action={
          <Link
            href={ROUTES.sales.root}
            className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline dark:text-blue-400 transition-colors duration-[var(--duration-fast)]"
          >
            View all
            <ChevronRight size={13} aria-hidden />
          </Link>
        }
      />
      {orders.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShoppingBag size={20} />}
            title="No sales yet"
            description="Sales recorded at the till appear here."
            action={
              <Link
                href={ROUTES.pos.root}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-secondary px-5 text-sm font-medium text-on-secondary dark:bg-white dark:text-zinc-900"
              >
                Open till
                <ArrowRight size={15} aria-hidden />
              </Link>
            }
          />
        </Card>
      ) : (
        <Table columns={columns} rows={orders} rowKey={(row) => row.client_generated_id} />
      )}
    </div>
  );
}

const INSIGHT_ICON = {
  up: TrendingUp,
  down: TrendingDown,
  warning: AlertTriangle,
  neutral: Info,
};

const INSIGHT_CLASSES = {
  up: "bg-[#004b1e] text-[#4ade80] dark:bg-green-900/40",
  down: "bg-error/15 text-error dark:bg-red-900/40 dark:text-red-400",
  warning: "bg-amber-500/15 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
  neutral: "bg-sky-500/15 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400",
};

function InsightsCard({ insights }: Readonly<{ insights: DashboardInsight[] }>) {
  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-on-surface dark:text-zinc-50">
        Insights
      </h3>
      {insights.length === 0 ? (
        <p className="text-sm text-on-surface-variant dark:text-zinc-400">
          Not enough data yet to generate insights for this period.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {insights.map((insight) => {
            const Icon = INSIGHT_ICON[insight.tone];
            return (
              <li key={insight.text} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${INSIGHT_CLASSES[insight.tone]}`}
                >
                  <Icon size={14} aria-hidden />
                </span>
                <p className="text-sm text-on-surface dark:text-zinc-100">{insight.text}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const EMPTY_OVERVIEW: DashboardOverview = {
  salesCents: 0,
  purchasesCents: 0,
  salesReturnCents: 0,
  purchaseReturnCents: 0,
  invoiceCount: 0,
  profitCents: 0,
  salesDueCents: 0,
  purchaseDueCents: 0,
};

export default function DashboardPage() {
  const { money, settings } = useSettings();
  const { user, staff } = useAuth();
  const { resolvedTheme } = useTheme();
  const colors = CHART_COLORS[resolvedTheme];

  const [preset, setPreset] = useState<RangePreset>("7d");
  const [topProductsPreset, setTopProductsPreset] = useState<"month" | "year">("month");
  const [data, setData] = useState<DashboardData>({
    overview: EMPTY_OVERVIEW,
    series: [],
    payments: [],
    donut: { items: [], otherQuantity: 0, totalQuantity: 0 },
    stockValue: { costCents: 0, retailCents: 0 },
    stockAlerts: [],
    recentSales: [],
    insights: [],
  });
  const [topProductsRows, setTopProductsRows] = useState<TopProductTableRow[]>([]);

  const range = useMemo(() => presetToRange(preset), [preset]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getDashboardOverview(range),
      getSalesPurchasesSeries(range, settings.locale),
      getPaymentBreakdown(range),
      getTopSellingProducts(range),
      getStockValueSummary(),
      getStockAlertRows(),
      getRecentSalesRows(),
      getDashboardInsights(range),
    ]).then(
      ([overview, series, payments, donut, stockValue, stockAlerts, recentSales, insights]) => {
        if (cancelled) return;
        setData({ overview, series, payments, donut, stockValue, stockAlerts, recentSales, insights });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [range, settings.locale]);

  useEffect(() => {
    let cancelled = false;
    const productsRange = presetToRange(topProductsPreset);
    getTopSellingProductsTable(productsRange).then((rows) => {
      if (!cancelled) setTopProductsRows(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [topProductsPreset]);

  const greeting = `Welcome back, ${staff?.name ?? user?.name ?? "there"}! Here's what's happening today.`;

  const kpis: {
    label: string;
    value: string;
    icon: React.ReactNode;
    tint: keyof typeof KPI_TINTS;
  }[] = [
    { label: "Sales", value: money(data.overview.salesCents), icon: <ShoppingCart size={20} />, tint: "violet" },
    { label: "Purchases", value: money(data.overview.purchasesCents), icon: <ShoppingBag size={20} />, tint: "emerald" },
    { label: "Sales Return", value: money(data.overview.salesReturnCents), icon: <Undo2 size={20} />, tint: "amber" },
    { label: "Purchases Return", value: money(data.overview.purchaseReturnCents), icon: <RotateCcw size={20} />, tint: "rose" },
    { label: "Sales Due", value: money(data.overview.salesDueCents), icon: <Banknote size={20} />, tint: "sky" },
    { label: "Total Purchase Due", value: money(data.overview.purchaseDueCents), icon: <Wallet size={20} />, tint: "orange" },
    { label: "Invoice", value: String(data.overview.invoiceCount), icon: <FileText size={20} />, tint: "violet" },
    { label: "Profit", value: money(data.overview.profitCents), icon: <Banknote size={20} />, tint: "emerald" },
  ];

  return (
    <div className="flex animate-fade-in-up flex-col gap-6 pb-8">
      <DashboardHero
        greeting={greeting}
        preset={preset}
        onPresetChange={setPreset}
        locale={settings.locale}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, index) => (
          <KpiTile
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            tint={kpi.tint}
            delayMs={index * 50}
          />
        ))}
      </div>

      <SalesPurchasesChart series={data.series} money={money} colors={colors} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopSellingDonut donut={data.donut} colors={colors} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <PaymentBreakdownCard rows={data.payments} money={money} colors={colors} />
          <StockValueCard summary={data.stockValue} money={money} />
        </div>
      </div>

      <PaymentSentReceivedChart series={data.series} money={money} colors={colors} />

      <div className="flex flex-col gap-3">
        <SectionHeader title="Top customers" />
        <Card>
          <EmptyState
            icon={<Users size={20} />}
            title="Customer tracking isn't recorded on sales yet"
            description="Sales made at the till aren't linked to a customer record, so this widget has nothing real to show. Adding customer selection at checkout would unlock it."
          />
        </Card>
      </div>

      <InsightsCard insights={data.insights} />

      <StockAlertTable rows={data.stockAlerts} />

      <TopProductsTable
        rows={topProductsRows}
        money={money}
        preset={topProductsPreset}
        onPresetChange={setTopProductsPreset}
      />

      <RecentSalesTable orders={data.recentSales} money={money} />

      <PluginDashboardWidget />
    </div>
  );
}
