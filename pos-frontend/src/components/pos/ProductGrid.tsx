"use client";

import type { CSSProperties } from "react";
import { Plus, Scale, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useSettings } from "@/lib/hooks/use-settings";
import { staggerDelay } from "@/lib/motion";
import type { Product, StoreSettings } from "@/lib/types";

interface ProductGridProps {
  products: Product[];
  onAdd: (product: Product) => void;
}

function StockBadge({
  product,
  threshold,
}: Readonly<{ product: Product; threshold: number }>) {
  const quantity = product.stock_quantity;
  if (quantity <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-error dark:text-red-400">
        <span className="h-1.5 w-1.5 rounded-full bg-error" aria-hidden />
        Out of Stock
      </span>
    );
  }
  if (quantity <= (product.reorder_level ?? threshold)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
        Low Stock
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-on-tertiary-container dark:text-emerald-400">
      <span
        className="h-1.5 w-1.5 rounded-full bg-on-tertiary-container"
        aria-hidden
      />
      In Stock
    </span>
  );
}

function ProductCard({
  product,
  settings,
  money,
  onAdd,
  style,
}: Readonly<{
  product: Product;
  settings: StoreSettings;
  money: (cents: number) => string;
  onAdd: (product: Product) => void;
  style?: CSSProperties;
}>) {
  const disabled = product.stock_quantity <= 0;

  return (
    <button
      type="button"
      onClick={() => onAdd(product)}
      disabled={disabled}
      style={style}
      aria-label={`Add ${product.name} to cart`}
      className="group animate-fade-in-up relative flex flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest p-3 text-left transition-[box-shadow,transform,border-color] duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:border-outline hover:shadow-elevated active:translate-y-0 active:scale-[0.97] active:duration-[var(--duration-instant)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      <div className="relative mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-surface-container text-3xl font-semibold text-on-surface-variant dark:bg-zinc-800 dark:text-zinc-600">
        {product.image_url ? (
          // Product images come from arbitrary supplier URLs, so a plain <img>
          // avoids next/image's remote-host allowlist for user-entered data.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-[var(--duration-slow)] ease-[var(--ease-standard)] group-hover:scale-105"
          />
        ) : (
          product.name.charAt(0).toUpperCase()
        )}
        {product.is_weighted && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-on-primary">
            <Scale size={10} aria-hidden />
            {product.unit ?? "kg"}
          </span>
        )}
      </div>

      <p className="line-clamp-2 text-sm font-semibold text-on-surface dark:text-zinc-50">
        {product.name}
      </p>
      <p className="mt-0.5 truncate font-mono text-xs text-on-surface-variant">
        {product.barcode || product.sku}
      </p>

      <p className="mt-2 text-lg font-bold text-on-surface dark:text-zinc-50">
        {money(product.price_cents)}
        {product.is_weighted && (
          <span className="ml-1 text-xs font-medium text-on-surface-variant">
            / {product.unit ?? "kg"}
          </span>
        )}
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <StockBadge product={product} threshold={settings.low_stock_threshold} />
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-on-secondary transition-all duration-[var(--duration-fast)] ease-[var(--ease-spring)] group-hover:scale-110 group-hover:bg-secondary/90 group-active:scale-90 group-disabled:scale-100 group-disabled:bg-zinc-300 dark:group-disabled:bg-zinc-700"
        >
          <Plus
            size={20}
            aria-hidden
            className="transition-transform duration-[var(--duration-base)] ease-[var(--ease-spring)] group-hover:rotate-90"
          />
        </span>
      </div>
    </button>
  );
}

export function ProductGrid({ products, onAdd }: Readonly<ProductGridProps>) {
  const { settings, money } = useSettings();

  if (products.length === 0) {
    return (
      <EmptyState
        icon={<Search size={22} />}
        title="No products found"
        description="Try a different search term, scan a barcode, or pick another category."
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4 2xl:grid-cols-5">
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          settings={settings}
          money={money}
          onAdd={onAdd}
          style={staggerDelay(index)}
        />
      ))}
    </div>
  );
}
