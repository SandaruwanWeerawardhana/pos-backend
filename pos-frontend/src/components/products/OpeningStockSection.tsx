"use client";

import { Input } from "@/components/ui/Input";
import { totalOpeningStock } from "@/lib/products/schema";
import type { Warehouse } from "@/lib/types";
import { ShoppingBag } from "lucide-react";
import { useWatch } from "react-hook-form";
import { FormSection } from "./FormSection";
import type { ProductSectionProps } from "./types";

interface OpeningStockSectionProps extends ProductSectionProps {
  warehouses: Warehouse[];
  errorCount: number;
}

/**
 * The quantity on hand in each warehouse at the moment the product is created.
 * Their sum becomes `stock_quantity`, which is the figure the till sells
 * against — so the split here is the only place opening stock is ever entered.
 */
export function OpeningStockSection({
  form,
  warehouses,
  errorCount,
}: Readonly<OpeningStockSectionProps>) {
  const { control, register, formState } = form;
  const errors = formState.errors;

  const [unit, openingStock] = useWatch({
    control,
    name: ["unit", "opening_stock"],
  });

  const total = totalOpeningStock(openingStock ?? {});

  return (
    <FormSection
      id="opening-stock"
      title="Opening Stock"
      icon={<ShoppingBag size={18} />}
      errorCount={errorCount}
    >
      {warehouses.length === 0 ? (
        <p className="rounded-xl bg-surface-container-low px-3 py-2 text-sm text-on-surface-variant dark:bg-zinc-800/60 dark:text-zinc-400">
          No warehouses yet. The product will be created with no stock; add a
          warehouse in Settings and adjust stock afterwards.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {warehouses.map((warehouse) => (
            <Input
              key={warehouse.id}
              label={warehouse.name}
              placeholder="0"
              inputMode="decimal"
              autoComplete="off"
              className="tabular-nums"
              error={errors.opening_stock?.[warehouse.id]?.message}
              {...register(`opening_stock.${warehouse.id}`)}
            />
          ))}
        </div>
      )}

      {warehouses.length > 1 && (
        <p
          aria-live="polite"
          className="mt-3 text-xs text-on-surface-variant dark:text-zinc-400"
        >
          Total opening stock: <strong className="tabular-nums">{total}</strong>
          {unit === "unit" ? "" : ` ${unit}`}
        </p>
      )}
    </FormSection>
  );
}
