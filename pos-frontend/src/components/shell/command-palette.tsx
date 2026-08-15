"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart2,
  Box,
  CornerDownLeft,
  DollarSign,
  LayoutDashboard,
  Monitor,
  Package,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Tag,
  Truck,
} from "lucide-react";
import { db, searchProducts } from "@/lib/db";
import { useAuthStore } from "@/lib/store/auth";
import { ROUTES } from "@/lib/types/routes";
import { formatMoney } from "@/lib/format";
import type { ReactNode } from "react";

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  group: "Navigate" | "Products" | "Sales";
  icon: ReactNode;
  href: string;
}

const NAV_COMMANDS: CommandItem[] = [
  { id: "nav-dashboard", label: "Dashboard", group: "Navigate", icon: <LayoutDashboard size={16} />, href: ROUTES.dashboard },
  { id: "nav-pos", label: "POS Terminal", group: "Navigate", icon: <Monitor size={16} />, href: ROUTES.pos.root },
  { id: "nav-products", label: "Products", group: "Navigate", icon: <Package size={16} />, href: ROUTES.products },
  { id: "nav-inventory", label: "Inventory", group: "Navigate", icon: <Box size={16} />, href: ROUTES.inventory.root },
  { id: "nav-alerts", label: "Stock alerts", group: "Navigate", icon: <ShieldCheck size={16} />, href: ROUTES.inventory.alerts },
  { id: "nav-purchases", label: "Purchase orders", group: "Navigate", icon: <ShoppingCart size={16} />, href: ROUTES.purchases.root },
  { id: "nav-sales", label: "Sales", group: "Navigate", icon: <DollarSign size={16} />, href: ROUTES.sales.root },
  { id: "nav-suppliers", label: "Suppliers", group: "Navigate", icon: <Truck size={16} />, href: ROUTES.suppliers },
  { id: "nav-reports", label: "Reports", group: "Navigate", icon: <BarChart2 size={16} />, href: ROUTES.reports },
  { id: "nav-discounts", label: "Discounts & promotions", group: "Navigate", icon: <Tag size={16} />, href: ROUTES.discounts },
  { id: "nav-users", label: "Users", group: "Navigate", icon: <ShieldCheck size={16} />, href: ROUTES.users.root },
  { id: "nav-permissions", label: "Group permissions", group: "Navigate", icon: <ShieldCheck size={16} />, href: ROUTES.users.permissions },
  { id: "nav-settings", label: "Settings", group: "Navigate", icon: <Settings size={16} />, href: ROUTES.settings.root },
];

const GROUP_ORDER: CommandItem["group"][] = [
  "Navigate",
  "Products",
  "Sales",
];

// Global search + command launcher. Opens on Ctrl/Cmd+K anywhere in the app;
// results span static routes and live Dexie records so one box reaches both.
// Minimum query length before the palette searches Dexie records. Below this
// almost everything matches, so short queries stay on routes only.
const RECORD_SEARCH_MIN_LENGTH = 2;

export function CommandPalette() {
  const router = useRouter();
  // Every command here leads into the back office, so a till-only session gets
  // no palette at all rather than a list of links it cannot follow.
  const posOnly = useAuthStore((state) => state.staff?.posOnly ?? false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recordItems, setRecordItems] = useState<CommandItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  function closePalette() {
    setOpen(false);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isToggle =
        (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (isToggle) {
        event.preventDefault();
        setOpen((current) => {
          if (current) return false;
          setQuery("");
          setRecordItems([]);
          setActiveIndex(0);
          return true;
        });
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  const navMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return NAV_COMMANDS;
    return NAV_COMMANDS.filter((item) =>
      item.label.toLowerCase().includes(needle),
    );
  }, [query]);

  // Record lookups are the external system this effect subscribes to; the
  // debounce keeps a keystroke from issuing a Dexie query each time.
  useEffect(() => {
    const needle = query.trim();
    if (!open || needle.length < RECORD_SEARCH_MIN_LENGTH) return;

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void Promise.all([
        searchProducts(needle),
        db.pendingOrders.toArray(),
      ]).then(([products, orders]) => {
        if (cancelled) return;

        const lowered = needle.toLowerCase();
        setRecordItems([
          ...products.slice(0, 6).map(
            (product): CommandItem => ({
              id: `product-${product.id}`,
              label: product.name,
              hint: `${product.sku} · ${formatMoney(product.price_cents)}`,
              group: "Products",
              icon: <Package size={16} />,
              href: ROUTES.inventory.detail(product.id),
            }),
          ),
          ...orders
            .filter((order) =>
              (order.receipt_no ?? order.client_generated_id)
                .toLowerCase()
                .includes(lowered),
            )
            .slice(0, 5)
            .map(
              (order): CommandItem => ({
                id: `order-${order.client_generated_id}`,
                label: order.receipt_no ?? order.client_generated_id.slice(0, 8),
                hint: formatMoney(order.total_cents),
                group: "Sales",
                icon: <DollarSign size={16} />,
                href: ROUTES.sales.detail(order.client_generated_id),
              }),
            ),
        ]);
      });
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [open, query]);

  // Flattened in group order, so the arrow-key index and the rendered order
  // are the same list rather than two things kept in step by hand.
  const results = useMemo(() => {
    const all =
      query.trim().length < RECORD_SEARCH_MIN_LENGTH
        ? navMatches
        : [...navMatches, ...recordItems];
    return GROUP_ORDER.flatMap((group) =>
      all.filter((item) => item.group === group),
    );
  }, [navMatches, recordItems, query]);

  function selectItem(item: CommandItem | undefined) {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectItem(results[activeIndex]);
    }
  }

  // Keeps the highlighted row inside the scroll viewport when navigating with
  // the arrow keys.
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (posOnly || !open) return null;

  return (
    <div className="animate-fade-in fixed inset-0 z-[150] flex items-start justify-center bg-black/50 p-4 pt-[10vh] backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close search"
        tabIndex={-1}
        onClick={closePalette}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search and commands"
        className="animate-scale-in relative flex w-full max-w-xl origin-top flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-popover dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-center gap-3 border-b border-outline-variant px-4 dark:border-zinc-800">
          <Search size={18} className="shrink-0 text-on-surface-variant" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search products, receipts, or jump to a page…"
            aria-label="Search"
            aria-controls="command-palette-results"
            className="min-w-0 flex-1 bg-transparent py-4 text-sm text-on-surface outline-none placeholder:text-on-surface-variant dark:text-zinc-50"
          />
          <kbd className="hidden shrink-0 rounded border border-outline-variant px-1.5 py-0.5 text-[10px] font-medium text-on-surface-variant sm:block dark:border-zinc-700">
            Esc
          </kbd>
        </div>

        <ul
          ref={listRef}
          id="command-palette-results"
          className="max-h-[52vh] overflow-y-auto p-2"
        >
          {results.length === 0 && (
            <li className="animate-fade-in px-3 py-8 text-center text-sm text-on-surface-variant dark:text-zinc-400">
              No matches for “{query}”.
            </li>
          )}
          {/* `results` is already flattened in group order, so the rendered
              position and the keyboard index are the same number. */}
          {results.map((item, index) => {
            const isActive = index === activeIndex;
            const startsGroup = index === 0 || results[index - 1].group !== item.group;
            return (
              <li key={item.id}>
                {startsGroup && (
                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/60 dark:text-zinc-600">
                    {item.group}
                  </p>
                )}
                <button
                  type="button"
                  data-active={isActive}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectItem(item)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-[var(--duration-instant)] ease-[var(--ease-standard)] ${
                    isActive
                      ? "bg-primary text-on-primary"
                      : "text-on-surface hover:bg-surface-container dark:text-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span
                    className={`transition-opacity duration-[var(--duration-instant)] ${
                      isActive ? "opacity-90" : "opacity-60"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && (
                    <span
                      className={`truncate text-xs ${
                        isActive
                          ? "text-on-primary/70"
                          : "text-on-surface-variant dark:text-zinc-500"
                      }`}
                    >
                      {item.hint}
                    </span>
                  )}
                  {isActive && (
                    <CornerDownLeft
                      size={13}
                      className="animate-slide-in-right"
                      aria-hidden
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
