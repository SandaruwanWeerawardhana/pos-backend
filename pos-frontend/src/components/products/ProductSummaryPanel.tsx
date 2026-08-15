"use client";

import Image from "next/image";
import { Eye, Lightbulb, Package } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useSettings } from "@/lib/hooks/use-settings";
import { PRODUCT_TYPE_OPTIONS } from "@/lib/products/constants";
import { summarisePricing, totalOpeningStock } from "@/lib/products/schema";
import type { ProductFormValues } from "@/lib/products/schema";
import { parseMoneyToCents } from "@/lib/format";

interface ProductSummaryPanelProps {
  values: ProductFormValues;
}

function Row({
  label,
  value,
  mono = false,
  accent = false,
}: Readonly<{
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}>) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-outline-variant py-2 first:border-t-0 dark:border-zinc-800">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant dark:text-zinc-500">
        {label}
      </dt>
      <dd
        className={`min-w-0 truncate text-sm font-semibold tabular-nums ${
          accent
            ? "text-primary dark:text-blue-400"
            : "text-on-surface dark:text-zinc-50"
        } ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Desktop's sticky right rail: what the record being built currently says,
 * updated as the form is filled in. The actions live in the form's own footer
 * bar so there is exactly one Save on the page at any width.
 */
export function ProductSummaryPanel({
  values,
}: Readonly<ProductSummaryPanelProps>) {
  const { money } = useSettings();
  const pricing = summarisePricing(values);
  const primaryImage = values.images[0];
  const costCents = parseMoneyToCents(values.cost_price);
  const stock = totalOpeningStock(values.opening_stock);

  const typeLabel =
    PRODUCT_TYPE_OPTIONS.find((option) => option.value === values.product_type)
      ?.label ?? "Standard Product";

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest/80 p-4 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <p className="flex items-center gap-2 pb-3 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant dark:text-zinc-500">
          <Eye size={13} aria-hidden />
          Live summary
        </p>

        <div className="flex items-center gap-3 border-t border-outline-variant pt-3 dark:border-zinc-800">
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-container text-on-surface-variant dark:bg-zinc-800 dark:text-zinc-400">
            {primaryImage ? (
              <Image
                src={primaryImage}
                alt=""
                fill
                unoptimized
                sizes="48px"
                className="object-cover"
              />
            ) : (
              <Package size={20} />
            )}
          </span>
          <span className="flex flex-wrap gap-1.5">
            <Badge>{typeLabel.replace(" Product", "")}</Badge>
            <Badge variant={values.is_active ? "success" : "neutral"}>
              {values.is_active ? "Active" : "Inactive"}
            </Badge>
          </span>
        </div>

        <dl className="mt-3 flex flex-col">
          <Row label="Name" value={values.name || "—"} />
          <Row label="Code" value={values.barcode || "—"} mono />
          <Row label="SKU" value={values.sku || "—"} mono />
          <Row
            label="Cost"
            value={costCents === null ? money(0) : money(costCents)}
          />
          <Row
            label="Retail price"
            value={
              pricing.grossPriceCents === null
                ? money(0)
                : money(pricing.grossPriceCents)
            }
            accent
          />
          <Row label="Order tax" value={`${values.tax_rate || "0"}%`} />
          <Row
            label="Opening stock"
            value={`${stock}${values.unit === "unit" ? "" : ` ${values.unit}`}`}
          />
        </dl>
      </section>

      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest/80 p-4 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <p className="flex items-center gap-2 pb-3 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant dark:text-zinc-500">
          <Lightbulb size={13} aria-hidden />
          Tips
        </p>
        <p className="border-t border-outline-variant pt-3 text-xs leading-relaxed text-on-surface-variant dark:border-zinc-800 dark:text-zinc-400">
          Use clear product names and a unique code — the code is what the
          scanner matches at the till. Opening stock is entered per warehouse;
          its total is the quantity the till sells against.
        </p>
      </section>
    </div>
  );
}
