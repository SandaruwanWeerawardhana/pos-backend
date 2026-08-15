"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Calculator,
  Calendar,
  Clock,
  Package,
  Receipt,
  Settings as SettingsIcon,
  Sparkles,
  Store,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts";
import {
  getReports3D,
  presetToRange,
  type DateRange,
  type Grid3D,
  type PaymentMethodSlice,
  type RangePreset,
  type Report3DResult,
} from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Switch } from "@/components/ui/Switch";
import { IsoGridBarChart } from "@/components/reports/threeD/IsoGridBarChart";
import { IsoScatterChart } from "@/components/reports/threeD/IsoScatterChart";
import { useSettings } from "@/lib/hooks/use-settings";
import { useConnectionStore } from "@/lib/store/connection";
import type { PaymentMethod, StoreSettings } from "@/lib/types";

/**
 * The dataviz skill's validated 8-hue categorical ramp (dark surface steps —
 * every canvas chart here renders on a near-black plot). Slot order is the
 * CVD-safety mechanism, so rows/series always draw from it in this fixed
 * order rather than being assigned an arbitrary colour.
 */
const CATEGORICAL_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
];

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  qr: "QR",
  other: "Other",
};
const PAYMENT_COLORS: Record<PaymentMethod, string> = {
  cash: "#2a78d6",
  card: "#eb6834",
  qr: "#1baf7a",
  other: "#eda100",
};

const RANGES: { value: RangePreset; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const EMPTY_GRID: Grid3D = { columns: [], rows: [], values: [] };
const EMPTY_RESULT: Report3DResult = {
  stats: { revenueCents: 0, orders: 0, avgOrderCents: 0, cashiers: 0 },
  salesByMonthWarehouse: EMPTY_GRID,
  topProductsByMonth: EMPTY_GRID,
  productMetrics: [],
  paymentMethods: [],
  heatmap: EMPTY_GRID,
  warehouses: [],
};

/**
 * The comparison window immediately before the selected one, same length, so
 * the headline tiles can carry a "vs previous period" delta. "All time" has no
 * previous window, so the caller skips the second query for it.
 */
function previousRange(range: DateRange): DateRange {
  const span = range.to - range.from;
  return { from: range.from - span - 1, to: range.from - 1 };
}

/** Short money for axis ticks and bar captions, where the full format is too wide. */
function compactMoneyFor(settings: StoreSettings): (cents: number) => string {
  return (cents: number) => {
    const body = (cents / 100).toLocaleString(settings.locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    });
    return settings.currency_position === "after"
      ? `${body}${settings.currency_symbol}`
      : `${settings.currency_symbol}${body}`;
  };
}

function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function ChartCard({
  title,
  subtitle,
  badge,
  badgeTone,
  children,
}: Readonly<{
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: "violet" | "sky" | "emerald" | "orange";
  children: ReactNode;
}>) {
  const toneClasses: Record<typeof badgeTone, string> = {
    violet: "bg-violet-600 text-white dark:bg-violet-500",
    sky: "bg-sky-600 text-white dark:bg-sky-500",
    emerald: "bg-emerald-600 text-white dark:bg-emerald-500",
    orange: "bg-orange-600 text-white dark:bg-orange-500",
  };
  return (
    <div className="animate-fade-in-up rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-on-surface dark:text-zinc-50">{title}</h3>
          <p className="text-xs text-on-surface-variant dark:text-zinc-500">{subtitle}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${toneClasses[badgeTone]}`}
        >
          {badge}
        </span>
      </div>
      {children}
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
  tint,
  delta,
  loading,
}: Readonly<{
  label: string;
  value: string;
  icon: ReactNode;
  tint: string;
  delta?: number | null;
  loading?: boolean;
}>) {
  const rising = (delta ?? 0) >= 0;
  return (
    <div className="flex animate-fade-in-up items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs uppercase tracking-wide text-on-surface-variant dark:text-zinc-500">
          {label}
        </span>
        {loading ? (
          <span className="mt-1 block h-5 w-20 animate-pulse rounded bg-surface-container-highest dark:bg-zinc-800" />
        ) : (
          <span className="block text-lg font-bold text-on-surface dark:text-zinc-50">{value}</span>
        )}
        {delta !== null && delta !== undefined && !loading && (
          <span
            className={`mt-0.5 flex items-center gap-1 text-xs font-medium ${
              rising
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-red-700 dark:text-red-400"
            }`}
          >
            {rising ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
            {Math.abs(delta).toFixed(1)}% vs previous
          </span>
        )}
      </span>
    </div>
  );
}

function InsightTile({
  icon,
  label,
  value,
  detail,
}: Readonly<{ icon: ReactNode; label: string; value: string; detail: string }>) {
  return (
    <div className="flex animate-fade-in-up items-start gap-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="mt-0.5 shrink-0 text-on-surface-variant dark:text-zinc-400">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wide text-on-surface-variant dark:text-zinc-500">
          {label}
        </span>
        <span className="block truncate text-sm font-semibold text-on-surface dark:text-zinc-50">
          {value}
        </span>
        <span className="block truncate text-xs text-on-surface-variant dark:text-zinc-500">
          {detail}
        </span>
      </span>
    </div>
  );
}

function PaymentMethodsCard({
  slices,
  money,
}: Readonly<{ slices: PaymentMethodSlice[]; money: (cents: number) => string }>) {
  const data = slices.map((slice) => ({
    name: `${PAYMENT_LABELS[slice.method]} (${slice.percent}%)`,
    value: slice.amountCents,
    fill: PAYMENT_COLORS[slice.method],
  }));
  const total = slices.reduce((sum, slice) => sum + slice.amountCents, 0);

  return (
    <ChartCard
      title="Payment Methods"
      subtitle="Distribution by method"
      badge="Pie"
      badgeTone="orange"
    >
      {data.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-sm text-on-surface-variant dark:text-zinc-500">
          No payments in this period.
        </div>
      ) : (
        <div className="relative h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={2}
                stroke="none"
                animationDuration={700}
                animationEasing="ease-out"
              />
              <Tooltip formatter={(value) => money(Number(value))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-x-0 top-[38%] flex -translate-y-1/2 flex-col items-center">
            <span className="text-[10px] uppercase tracking-wide text-on-surface-variant dark:text-zinc-500">
              Total
            </span>
            <span className="text-base font-bold text-on-surface dark:text-zinc-50">
              {money(total)}
            </span>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

export default function Reports3DPage() {
  const { money, settings } = useSettings();
  const online = useConnectionStore((state) => state.online);

  const [preset, setPreset] = useState<RangePreset>("30d");
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [snapshot, setSnapshot] = useState<{
    key: string;
    data: Report3DResult;
    previous: Report3DResult["stats"] | null;
  }>({ key: "", data: EMPTY_RESULT, previous: null });
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotateBars, setRotateBars] = useState(false);
  const [showValues, setShowValues] = useState(false);
  const [showDropLines, setShowDropLines] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const range = useMemo(() => presetToRange(preset), [preset]);
  const compactMoney = useMemo(() => compactMoneyFor(settings), [settings]);

  /* Loading is derived from "the snapshot I hold is not the one this filter set
     asks for" rather than from a flag flipped inside the effect. */
  const requestKey = `${range.from}:${range.to}:${warehouseId}`;
  const loading = snapshot.key !== requestKey;
  const data = snapshot.data;
  const previousStats = snapshot.previous;

  useEffect(() => {
    let cancelled = false;
    const comparable = preset !== "all";
    Promise.all([
      getReports3D(range, warehouseId),
      comparable ? getReports3D(previousRange(range), warehouseId) : Promise.resolve(null),
    ]).then(([result, previous]) => {
      if (cancelled) return;
      setSnapshot({ key: requestKey, data: result, previous: previous ? previous.stats : null });
    });
    return () => {
      cancelled = true;
    };
  }, [range, warehouseId, preset, requestKey]);

  const rangeLabel = `${new Date(range.from).toLocaleDateString(settings.locale, { year: "numeric", month: "2-digit", day: "2-digit" })} - ${new Date(range.to).toLocaleDateString(settings.locale, { year: "numeric", month: "2-digit", day: "2-digit" })}`;

  const warehouseColorByRowIndex = CATEGORICAL_DARK;

  /* Derived call-outs: the same numbers the charts show, stated once in words
     so the dashboard answers "when are we busy, what sells" without a drag. */
  const insights = useMemo(() => {
    const heatmap = data.heatmap;
    let peakDay = -1;
    let peakHour = -1;
    let peakValue = 0;
    heatmap.values.forEach((row, dayIndex) => {
      row.forEach((value, hourIndex) => {
        if (value > peakValue) {
          peakValue = value;
          peakDay = dayIndex;
          peakHour = hourIndex;
        }
      });
    });
    const dayTotals = heatmap.values.map((row) => row.reduce((sum, value) => sum + value, 0));
    let bestDay = -1;
    let bestDayValue = 0;
    dayTotals.forEach((total, index) => {
      if (total > bestDayValue) {
        bestDayValue = total;
        bestDay = index;
      }
    });
    const topProduct = data.productMetrics[0];
    const warehouseTotals = data.salesByMonthWarehouse.rows.map((row, rowIndex) => ({
      label: row.label,
      total: (data.salesByMonthWarehouse.values[rowIndex] ?? []).reduce(
        (sum, value) => sum + value,
        0,
      ),
    }));
    const topWarehouse = [...warehouseTotals].sort((a, b) => b.total - a.total)[0];
    return {
      peak:
        peakHour >= 0
          ? {
              value: `${String(peakHour).padStart(2, "0")}:00 ${DAY_NAMES[peakDay]}`,
              detail: money(peakValue),
            }
          : null,
      bestDay:
        bestDay >= 0 ? { value: DAY_NAMES[bestDay], detail: money(bestDayValue) } : null,
      topProduct: topProduct
        ? {
            value: topProduct.name,
            detail: `${topProduct.quantity} sold · ${money(topProduct.revenueCents)}`,
          }
        : null,
      topWarehouse:
        topWarehouse && topWarehouse.total > 0
          ? { value: topWarehouse.label, detail: money(topWarehouse.total) }
          : null,
    };
  }, [data, money]);

  return (
    <div className="relative flex flex-col gap-6 pb-8">
      <PageHeader
        eyebrow="Insight"
        title="Reports"
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "3D Sales Dashboard" }]}
      />

      <div className="animate-fade-in-up rounded-2xl bg-gradient-to-r from-primary to-secondary p-6 text-on-primary shadow-elevated">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                online ? "bg-emerald-500/25 text-emerald-100" : "bg-on-primary/15 text-on-primary/80"
              }`}
            >
              <Sparkles size={12} aria-hidden />
              {online ? "Live insights" : "Offline — showing local data"}
            </span>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">
              3D Sales Dashboard
            </h1>
            <p className="mt-1 text-sm text-on-primary/80">
              Drag to turn, drag up or down to tilt, scroll to zoom. Front view compares heights
              honestly; top view finds the hot cells.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2">
              <select
                value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)}
                className="min-h-11 rounded-lg border border-on-primary/30 bg-on-primary/15 px-3 text-sm font-medium text-on-primary backdrop-blur-sm transition-colors duration-[var(--duration-fast)] hover:bg-on-primary/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-primary [&>option]:text-on-surface"
              >
                <option value="all">Filter by warehouse</option>
                {data.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
              <select
                value={preset}
                onChange={(event) => setPreset(event.target.value as RangePreset)}
                className="min-h-11 rounded-lg border border-on-primary/30 bg-on-primary/15 px-3 text-sm font-medium text-on-primary backdrop-blur-sm transition-colors duration-[var(--duration-fast)] hover:bg-on-primary/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-primary [&>option]:text-on-surface"
              >
                {RANGES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="flex items-center gap-1.5 rounded-lg bg-on-primary/15 px-3 py-1.5 text-xs font-medium text-on-primary/90 backdrop-blur-sm">
              <Calendar size={12} aria-hidden />
              {loading ? "Loading…" : rangeLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Revenue"
          value={money(data.stats.revenueCents)}
          icon={<Wallet size={20} />}
          tint="bg-violet-600 text-white dark:bg-violet-500"
          loading={loading}
          delta={
            previousStats
              ? percentChange(data.stats.revenueCents, previousStats.revenueCents)
              : null
          }
        />
        <StatTile
          label="Orders"
          value={String(data.stats.orders)}
          icon={<Receipt size={20} />}
          tint="bg-sky-600 text-white dark:bg-sky-500"
          loading={loading}
          delta={
            previousStats ? percentChange(data.stats.orders, previousStats.orders) : null
          }
        />
        <StatTile
          label="Average order"
          value={money(data.stats.avgOrderCents)}
          icon={<Calculator size={20} />}
          tint="bg-emerald-600 text-white dark:bg-emerald-500"
          loading={loading}
          delta={
            previousStats
              ? percentChange(data.stats.avgOrderCents, previousStats.avgOrderCents)
              : null
          }
        />
        <StatTile
          label="Cashiers"
          value={String(data.stats.cashiers)}
          icon={<Users size={20} />}
          tint="bg-orange-600 text-white dark:bg-orange-500"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InsightTile
          icon={<Clock size={16} />}
          label="Peak hour"
          value={insights.peak?.value ?? "—"}
          detail={insights.peak?.detail ?? "No sales yet"}
        />
        <InsightTile
          icon={<Calendar size={16} />}
          label="Best day"
          value={insights.bestDay?.value ?? "—"}
          detail={insights.bestDay?.detail ?? "No sales yet"}
        />
        <InsightTile
          icon={<Package size={16} />}
          label="Top product"
          value={insights.topProduct?.value ?? "—"}
          detail={insights.topProduct?.detail ?? "No sales yet"}
        />
        <InsightTile
          icon={<Store size={16} />}
          label="Top warehouse"
          value={insights.topWarehouse?.value ?? "—"}
          detail={insights.topWarehouse?.detail ?? "No sales yet"}
        />
      </div>

      <ChartCard
        title="Sales by Month and Warehouse"
        subtitle="Drag to rotate · tilt · click a warehouse in the key to isolate it"
        badge="3D"
        badgeTone="violet"
      >
        <IsoGridBarChart
          grid={data.salesByMonthWarehouse}
          rowColors={warehouseColorByRowIndex}
          valueFormatter={money}
          tickFormatter={compactMoney}
          axisLabel="Sales"
          height={340}
          showValues={showValues}
          autoRotate={rotateBars}
          exportName="sales-by-month-warehouse"
        />
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Top Products by Month"
          subtitle={`Top ${data.topProductsByMonth.rows.length || 7} products by revenue`}
          badge="3D"
          badgeTone="sky"
        >
          <IsoGridBarChart
            grid={data.topProductsByMonth}
            rowColors={CATEGORICAL_DARK}
            valueFormatter={money}
            tickFormatter={compactMoney}
            axisLabel="Revenue"
            height={300}
            showValues={showValues}
            autoRotate={rotateBars}
            exportName="top-products-by-month"
          />
        </ChartCard>
        <ChartCard
          title="Product Quantity vs Price vs Revenue"
          subtitle="Size = revenue · colour = average price"
          badge="3D"
          badgeTone="emerald"
        >
          <IsoScatterChart
            points={data.productMetrics}
            autoRotate={autoRotate}
            formatMoney={money}
            showDropLines={showDropLines}
            showLabels={showLabels}
            height={300}
            exportName="product-quantity-price-revenue"
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PaymentMethodsCard slices={data.paymentMethods} money={money} />
        <ChartCard
          title="Sales Heatmap (Hour x Day of Week)"
          subtitle="Colour and height both track takings · top view reads best"
          badge="3D"
          badgeTone="emerald"
        >
          <IsoGridBarChart
            grid={data.heatmap}
            rowColors={CATEGORICAL_DARK}
            valueFormatter={money}
            tickFormatter={compactMoney}
            axisLabel="Sales"
            height={300}
            colorMode="value"
            autoRotate={rotateBars}
            exportName="sales-heatmap"
          />
        </ChartCard>
      </div>

      <div className="fixed bottom-6 right-6 z-20">
        {settingsOpen && (
          <div className="mb-3 w-72 animate-fade-in-up rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-elevated dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-on-surface dark:text-zinc-50">
                Chart settings
              </p>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close chart settings"
                className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <Switch
                checked={autoRotate}
                onChange={setAutoRotate}
                label="Auto-rotate scatter"
                description="Spin the quantity/price/revenue cloud"
              />
              <Switch
                checked={rotateBars}
                onChange={setRotateBars}
                label="Auto-rotate bar charts"
                description="Turntable on every 3D bar scene"
              />
              <Switch
                checked={showValues}
                onChange={setShowValues}
                label="Bar value labels"
                description="Print each bar's total above it"
              />
              <Switch
                checked={showDropLines}
                onChange={setShowDropLines}
                label="Scatter drop lines"
                description="Drop each point to the floor for depth"
              />
              <Switch
                checked={showLabels}
                onChange={setShowLabels}
                label="Top product labels"
                description="Name the five biggest sellers in the cloud"
              />
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-label="Chart settings"
          aria-expanded={settingsOpen}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-white shadow-elevated transition-transform duration-[var(--duration-fast)] hover:scale-105 active:scale-95 dark:bg-violet-500"
        >
          <SettingsIcon size={22} />
        </button>
      </div>
    </div>
  );
}
