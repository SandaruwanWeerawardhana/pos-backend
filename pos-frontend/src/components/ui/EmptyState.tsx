import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: Readonly<EmptyStateProps>) {
  return (
    <div className="group animate-fade-in-up flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-outline-variant px-6 py-14 text-center transition-colors duration-[var(--duration-base)] hover:border-outline dark:border-zinc-800 dark:hover:border-zinc-700">
      {icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container text-on-surface-variant transition-transform duration-[var(--duration-base)] ease-[var(--ease-spring)] group-hover:scale-110 dark:bg-zinc-800 dark:text-zinc-400">
          {icon}
        </span>
      )}
      <p className="text-sm font-semibold text-on-surface dark:text-zinc-100">
        {title}
      </p>
      {description && (
        <p className="max-w-sm text-sm text-on-surface-variant dark:text-zinc-400">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
