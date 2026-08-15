import type { ReactNode } from "react";

type BadgeVariant = "neutral" | "success" | "warning" | "danger";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: "bg-surface-container text-on-surface-variant dark:bg-zinc-800 dark:text-zinc-300",
  success:
    "bg-[#004b1e] text-[#bbf7d0] dark:bg-green-900/50 dark:text-green-300",
  warning:
    "bg-amber-600 text-white dark:bg-amber-900/50 dark:text-amber-300",
  danger: "bg-error text-on-error dark:bg-red-900/50 dark:text-red-300",
};

export function Badge({
  variant = "neutral",
  children,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
