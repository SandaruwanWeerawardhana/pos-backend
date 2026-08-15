import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface Crumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  breadcrumbs,
}: Readonly<PageHeaderProps>) {
  return (
    <div className="animate-fade-in-up flex flex-col gap-3">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-on-surface-variant dark:text-zinc-500">
            {breadcrumbs.map((crumb, index) => (
              <li key={crumb.label} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={12} aria-hidden />}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="rounded transition-colors duration-[var(--duration-fast)] hover:text-on-surface hover:underline dark:hover:text-zinc-200"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-widest text-primary dark:text-blue-400">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-on-surface dark:text-zinc-50">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-on-surface-variant dark:text-zinc-400">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}

export function SectionHeader({
  title,
  action,
}: Readonly<{ title: string; action?: ReactNode }>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant dark:text-zinc-500">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div
      className={`animate-fade-in-up rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm transition-shadow duration-[var(--duration-base)] ease-[var(--ease-standard)] hover:shadow-elevated dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      {children}
    </div>
  );
}
