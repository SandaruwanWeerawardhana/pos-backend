"use client";

import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, PackageX } from "lucide-react";
import { getInventoryAlerts, type InventoryAlerts } from "@/lib/db";
import { Badge } from "@/components/ui/Badge";
import { Card, PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSettings } from "@/lib/hooks/use-settings";
import { ROUTES } from "@/lib/types/routes";

const ALERT_STAT_TINTS = {
  error: "bg-error text-on-error",
  secondary: "bg-secondary text-on-secondary",
  warning: "bg-amber-500 text-white",
} as const;

function AlertStatTile({
  label,
  value,
  icon,
  tint,
}: Readonly<{
  label: string;
  value: string;
  icon: ReactNode;
  tint: keyof typeof ALERT_STAT_TINTS;
}>) {
  return (
    <div className="flex animate-fade-in-up items-center gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm transition-all duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:shadow-elevated dark:border-zinc-800 dark:bg-zinc-900">
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-[var(--duration-fast)] ${ALERT_STAT_TINTS[tint]}`}
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

export default function InventoryAlertsPage() {
  const { settings } = useSettings();
  const [alerts, setAlerts] = useState<InventoryAlerts | null>(null);

  useEffect(() => {
    getInventoryAlerts().then(setAlerts);
  }, []);

  if (!alerts) {
    return (
      <output aria-label="Loading alerts" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[90px] rounded-2xl" />
          ))}
        </div>
      </output>
    );
  }

  const totalIssues =
    alerts.lowStock.length +
    alerts.outOfStock.length +
    alerts.nearExpiry.length +
    alerts.expired.length;

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        eyebrow="Stock control"
        title="Stock alerts"
        description={`Products needing attention. Expiry warnings use a ${settings.expiry_warning_days}-day window.`}
        breadcrumbs={[
          { label: "Inventory", href: ROUTES.inventory.root },
          { label: "Stock alerts" },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AlertStatTile
          label="Out of stock"
          value={String(alerts.outOfStock.length)}
          icon={<PackageX size={20} />}
          tint={alerts.outOfStock.length > 0 ? "error" : "secondary"}
        />
        <AlertStatTile
          label="Low stock"
          value={String(alerts.lowStock.length)}
          icon={<AlertTriangle size={20} />}
          tint={alerts.lowStock.length > 0 ? "warning" : "secondary"}
        />
        <AlertStatTile
          label="Near expiry"
          value={String(alerts.nearExpiry.length)}
          icon={<CalendarClock size={20} />}
          tint={alerts.nearExpiry.length > 0 ? "warning" : "secondary"}
        />
        <AlertStatTile
          label="Expired"
          value={String(alerts.expired.length)}
          icon={<CalendarClock size={20} />}
          tint={alerts.expired.length > 0 ? "error" : "secondary"}
        />
      </div>

      {totalIssues === 0 && (
        <EmptyState
          icon={<CheckCircle2 size={22} />}
          title="Everything is in good shape"
          description="No products are out of stock, below their reorder level, or approaching expiry."
        />
      )}

      {alerts.outOfStock.length > 0 && (
        <Card>
          <SectionHeader title="Out of stock" />
          <ul className="mt-3 flex flex-col gap-2">
            {alerts.outOfStock.map((product) => (
              <li
                key={product.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-error/30 px-3 py-2.5"
              >
                <Link
                  href={ROUTES.inventory.detail(product.id)}
                  className="min-w-0 text-sm font-medium text-on-surface hover:underline dark:text-zinc-100"
                >
                  {product.name}
                  <span className="block text-xs font-normal text-on-surface-variant dark:text-zinc-400">
                    {product.sku} · {product.shelf_location ?? "No shelf"}
                  </span>
                </Link>
                <Badge variant="danger">0 left</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {alerts.lowStock.length > 0 && (
        <Card>
          <SectionHeader title="Low stock" />
          <ul className="mt-3 flex flex-col gap-2">
            {alerts.lowStock.map((product) => (
              <li
                key={product.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant px-3 py-2.5 dark:border-zinc-800"
              >
                <Link
                  href={ROUTES.inventory.detail(product.id)}
                  className="min-w-0 text-sm font-medium text-on-surface hover:underline dark:text-zinc-100"
                >
                  {product.name}
                  <span className="block text-xs font-normal text-on-surface-variant dark:text-zinc-400">
                    Reorder at{" "}
                    {product.reorder_level ?? settings.low_stock_threshold}
                  </span>
                </Link>
                <Badge variant="warning">{product.stock_quantity} left</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(alerts.expired.length > 0 || alerts.nearExpiry.length > 0) && (
        <Card>
          <SectionHeader title="Expiry tracking" />
          <ul className="mt-3 flex flex-col gap-2">
            {[...alerts.expired, ...alerts.nearExpiry].map((entry) => (
              <li
                key={`${entry.product.id}-${entry.batch.batch_no}`}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${
                  entry.daysRemaining < 0
                    ? "border-error/30"
                    : "border-outline-variant dark:border-zinc-800"
                }`}
              >
                <Link
                  href={ROUTES.inventory.detail(entry.product.id)}
                  className="min-w-0 text-sm font-medium text-on-surface hover:underline dark:text-zinc-100"
                >
                  {entry.product.name}
                  <span className="block text-xs font-normal text-on-surface-variant dark:text-zinc-400">
                    Batch {entry.batch.batch_no} · {entry.batch.quantity} units ·
                    expires {entry.batch.expiry_date}
                  </span>
                </Link>
                <Badge variant={entry.daysRemaining < 0 ? "danger" : "warning"}>
                  {entry.daysRemaining < 0
                    ? `${Math.abs(entry.daysRemaining)}d overdue`
                    : `${entry.daysRemaining}d left`}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
