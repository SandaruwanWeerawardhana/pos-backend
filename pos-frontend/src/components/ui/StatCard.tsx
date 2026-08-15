import type { ReactNode } from "react";
import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";

export type StatAccent =
  | "primary"
  | "secondary"
  | "warning"
  | "error"
  | "success"
  | "info"
  | "orange";

interface StatCardProps {
  label: string;
  value: string;
  icon?: ReactNode;
  accent?: StatAccent;
  sub?: string;
  /** Percentage change vs. the previous period; sign drives the arrow + colour. */
  deltaPercent?: number;
  href?: string;
}

const ACCENT_CLASSES: Record<StatAccent, string> = {
  primary: "bg-primary text-on-primary",
  secondary: "bg-secondary text-on-secondary",
  warning: "bg-amber-500 text-white",
  error: "bg-error text-on-error",
  success: "bg-[#004b1e] text-[#22c55e]",
  info: "bg-sky-600 text-white dark:bg-sky-500",
  orange: "bg-orange-600 text-white dark:bg-orange-500",
};

export function StatCard({
  label,
  value,
  icon,
  accent = "primary",
  sub,
  deltaPercent,
  href,
}: Readonly<StatCardProps>) {
  const positive = (deltaPercent ?? 0) >= 0;

  const body = (
    <div className="group animate-fade-in-up flex h-full flex-col gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm transition-all duration-[var(--duration-base)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:border-outline hover:shadow-elevated dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <div className="flex items-start justify-between gap-2">
        {icon && (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-[var(--duration-base)] ease-[var(--ease-spring)] group-hover:scale-110 ${ACCENT_CLASSES[accent]}`}
          >
            {icon}
          </span>
        )}
        {deltaPercent !== undefined && (
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
              positive
                ? "bg-[#004b1e] text-[#bbf7d0] dark:bg-green-900/40 dark:text-green-400"
                : "bg-error/15 text-error dark:bg-red-900/40 dark:text-red-400"
            }`}
          >
            {positive ? (
              <TrendingUp size={12} aria-hidden />
            ) : (
              <TrendingDown size={12} aria-hidden />
            )}
            {positive ? "+" : ""}
            {deltaPercent.toFixed(1)}%
          </span>
        )}
      </div>
      <div>
        <p className="font-display text-2xl font-bold tracking-tight text-on-surface sm:text-3xl dark:text-zinc-50">
          {value}
        </p>
        <p className="mt-0.5 text-sm text-on-surface-variant dark:text-zinc-400">
          {label}
        </p>
        {sub && (
          <p className="mt-1 text-xs text-on-surface-variant/60 dark:text-zinc-500">
            {sub}
          </p>
        )}
      </div>
    </div>
  );

  if (!href) return body;
  return (
    <Link
      href={href}
      className="block rounded-2xl transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {body}
    </Link>
  );
}
