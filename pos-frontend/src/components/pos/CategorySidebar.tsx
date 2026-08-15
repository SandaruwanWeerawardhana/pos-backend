"use client";

import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { listCategories } from "@/lib/db";

interface CategorySidebarProps {
  totalCount: number;
  /** Product counts keyed by category name, for the badge on each row. */
  counts: Record<string, number>;
  active: string;
  onSelect: (category: string) => void;
}

export const ALL_CATEGORIES = "all";

// Categories are read from the product catalogue rather than hard-coded, so a
// store's own departments drive the filter instead of a fixed grocery list.
export function CategorySidebar({
  totalCount,
  counts,
  active,
  onSelect,
}: Readonly<CategorySidebarProps>) {
  const [collapsed, setCollapsed] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    listCategories().then(setCategories);
  }, []);

  return (
    <aside
      suppressHydrationWarning
      aria-label="Product categories"
      className={`hidden shrink-0 flex-col gap-1 overflow-y-auto rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-decelerate)] xl:flex dark:border-zinc-800 dark:bg-zinc-900 ${
        collapsed ? "w-14" : "w-56"
      }`}
    >
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        aria-label={collapsed ? "Expand categories" : "Collapse categories"}
        aria-expanded={!collapsed}
        className={`mb-1 flex items-center rounded-lg p-2 text-on-surface-variant transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:hover:bg-zinc-800 ${
          collapsed ? "justify-center" : "justify-end"
        }`}
      >
        <ChevronLeft
          size={16}
          className={`transition-transform duration-[var(--duration-slow)] ease-[var(--ease-decelerate)] ${
            collapsed ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      <CategoryRow
        label="All Products"
        count={totalCount}
        active={active === ALL_CATEGORIES}
        collapsed={collapsed}
        onClick={() => onSelect(ALL_CATEGORIES)}
      />
      <div className="my-1 border-t border-outline-variant/50 dark:border-zinc-800" />
      {categories.map((category) => (
        <CategoryRow
          key={category}
          label={category}
          count={counts[category] ?? 0}
          active={active === category}
          collapsed={collapsed}
          onClick={() => onSelect(category)}
        />
      ))}
    </aside>
  );
}

function CategoryRow({
  label,
  count,
  active,
  collapsed,
  onClick,
}: Readonly<{
  label: string;
  count?: number;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={collapsed ? label : undefined}
      className={`flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        collapsed ? "justify-center" : "justify-between gap-2"
      } ${
        active
          ? "bg-primary font-bold text-on-primary"
          : "font-medium text-on-surface-variant hover:bg-surface-container dark:text-zinc-300 dark:hover:bg-zinc-800"
      }`}
    >
      {collapsed ? (
        <span className="text-xs font-semibold uppercase">
          {label.charAt(0)}
        </span>
      ) : (
        <>
          <span className="min-w-0 truncate text-left">{label}</span>
          {count !== undefined && (
            <span
              className={`shrink-0 text-xs tabular-nums ${
                active ? "text-on-primary/70" : "text-on-surface-variant"
              }`}
            >
              {count}
            </span>
          )}
        </>
      )}
    </button>
  );
}
