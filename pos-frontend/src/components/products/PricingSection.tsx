"use client";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { parseMoneyToCents } from "@/lib/format";
import { useSettings } from "@/lib/hooks/use-settings";
import {
  DISCOUNT_TYPE_OPTIONS,
  TAX_TYPE_OPTIONS,
} from "@/lib/products/constants";
import { summarisePricing } from "@/lib/products/schema";
import { Tags } from "lucide-react";
import { Controller, useWatch } from "react-hook-form";
import { FormSection, RequiredMark } from "./FormSection";
import type { ProductSectionProps } from "./types";

interface PricingSectionProps extends ProductSectionProps {
  errorCount: number;
}

function Metric({
  label,
  value,
  tone = "neutral",
  hint,
}: Readonly<{
  label: string;
  value: string;
  tone?: "neutral" | "good" | "bad";
  hint?: string;
}>) {
  const toneClass = {
    neutral: "text-on-surface dark:text-zinc-50",
    good: "text-on-tertiary-container dark:text-green-400",
    bad: "text-error dark:text-red-400",
  }[tone];

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low/70 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/50">
      <p className="text-xs font-medium text-on-surface-variant dark:text-zinc-400">
        {label}
      </p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${toneClass}`}>
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[11px] text-on-surface-variant dark:text-zinc-500">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Cost, the three prices, tax and the standing discount, with the derived
 * margin.
 *
 * Margin is measured against the net price — what the till actually charges
 * after the standing discount and with any inclusive tax taken back out — not
 * the list price, so a product discounted below cost reads as the loss it is.
 */
export function PricingSection({
  form,
  errorCount,
}: Readonly<PricingSectionProps>) {
  const { control, register, formState } = form;
  const errors = formState.errors;
  const { money } = useSettings();

  const [
    sellingPrice,
    costPrice,
    taxRate,
    taxType,
    discountType,
    discountValue,
  ] = useWatch({
    control,
    name: [
      "selling_price",
      "cost_price",
      "tax_rate",
      "tax_type",
      "discount_type",
      "discount_value",
    ],
  });

  const summary = summarisePricing({
    selling_price: sellingPrice,
    tax_rate: taxRate,
    tax_type: taxType,
    discount_type: discountType,
    discount_value: discountValue,
  });

  const costCents = parseMoneyToCents(costPrice);
  const marginCents =
    costCents === null || summary.netPriceCents === null
      ? null
      : summary.netPriceCents - costCents;
  const marginPercent =
    marginCents === null || !summary.netPriceCents
      ? null
      : (marginCents / summary.netPriceCents) * 100;

  const fixedDiscount = discountType === "fixed";

  return (
    <FormSection
      id="pricing"
      title="Pricing And Tax"
      icon={<Tags size={18} />}
      errorCount={errorCount}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={
            <>
              Product Cost
              <RequiredMark />
            </>
          }
          placeholder="0.00"
          hint="What the shop pays. Drives the margin and profit reports."
          inputMode="decimal"
          autoComplete="off"
          className="text-right tabular-nums"
          error={errors.cost_price?.message}
          {...register("cost_price")}
        />

        <Input
          label={
            <>
              Retail Price
              <RequiredMark />
            </>
          }
          placeholder="Enter Product Price"
          inputMode="decimal"
          autoComplete="off"
          className="text-right tabular-nums"
          error={errors.selling_price?.message}
          {...register("selling_price")}
        />

        <Input
          label="Wholesale Price"
          placeholder="Enter Wholesale Price"
          inputMode="decimal"
          autoComplete="off"
          className="text-right tabular-nums"
          error={errors.wholesale_price?.message}
          {...register("wholesale_price")}
        />

        <Input
          label="Minimum Selling Price"
          placeholder="Enter Minimum Selling Price"
          hint="Floor the till may not discount below."
          inputMode="decimal"
          autoComplete="off"
          className="text-right tabular-nums"
          error={errors.min_selling_price?.message}
          {...register("min_selling_price")}
        />

        <Input
          label="Order Tax"
          placeholder="0"
          hint="Percent, e.g. 8 for 8%."
          inputMode="decimal"
          autoComplete="off"
          className="text-right tabular-nums"
          error={errors.tax_rate?.message}
          {...register("tax_rate")}
        />

        <Controller
          control={control}
          name="tax_type"
          render={({ field }) => (
            <Select
              label={
                <>
                  Tax Type
                  <RequiredMark />
                </>
              }
              options={TAX_TYPE_OPTIONS}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={errors.tax_type?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="discount_type"
          render={({ field }) => (
            <Select
              label={
                <>
                  Discount Type
                  <RequiredMark />
                </>
              }
              options={DISCOUNT_TYPE_OPTIONS}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={errors.discount_type?.message}
            />
          )}
        />

        <Input
          label="Discount"
          placeholder="0"
          hint={fixedDiscount ? "Amount off every sale." : "Percent off, 0–100."}
          inputMode="decimal"
          autoComplete="off"
          className="text-right tabular-nums"
          error={errors.discount_value?.message}
          {...register("discount_value")}
        />

        <Input
          label="Points"
          placeholder="0"
          hint="Loyalty points awarded per sale."
          inputMode="numeric"
          autoComplete="off"
          className="text-right tabular-nums"
          error={errors.points?.message}
          {...register("points")}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric
          label="Charged at the till"
          value={
            summary.grossPriceCents === null
              ? "—"
              : money(summary.grossPriceCents)
          }
          hint="After discount, including tax"
        />
        <Metric
          label="Tax"
          value={summary.taxCents === null ? "—" : money(summary.taxCents)}
          hint={taxType === "inclusive" ? "Included in the price" : "Added on top"}
        />
        <Metric
          label="Margin"
          value={marginCents === null ? "—" : money(marginCents)}
          tone={marginCents !== null && marginCents < 0 ? "bad" : "good"}
          hint={
            marginPercent === null ? undefined : `${marginPercent.toFixed(1)}%`
          }
        />
      </div>
    </FormSection>
  );
}
