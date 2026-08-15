"use client";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { WARRANTY_UNIT_OPTIONS } from "@/lib/products/constants";
import { ShieldCheck } from "lucide-react";
import { Controller } from "react-hook-form";
import { FormSection } from "./FormSection";
import type { ProductSectionProps } from "./types";

interface WarrantySectionProps extends ProductSectionProps {
  errorCount: number;
}

/**
 * Warranty length and terms, printed on the receipt and quoted back when a
 * customer returns an item.
 */
export function WarrantySection({
  form,
  errorCount,
}: Readonly<WarrantySectionProps>) {
  const { control, register, formState } = form;
  const errors = formState.errors;

  return (
    <FormSection
      id="warranty"
      title="Warranty & Guarantee Tracking"
      icon={<ShieldCheck size={18} />}
      errorCount={errorCount}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <Input
            label="Warranty Period"
            placeholder="0"
            inputMode="numeric"
            autoComplete="off"
            className="text-right tabular-nums"
            error={errors.warranty_period?.message}
            {...register("warranty_period")}
          />
          <Controller
            control={control}
            name="warranty_unit"
            render={({ field }) => (
              <Select
                aria-label="Warranty period unit"
                options={WARRANTY_UNIT_OPTIONS}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                className="w-32"
                error={errors.warranty_unit?.message}
              />
            )}
          />
        </div>

        <Controller
          control={control}
          name="has_guarantee"
          render={({ field }) => (
            <Switch
              label="Has Guarantee"
              description="A manufacturer guarantee applies on top of the warranty."
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />

        <div className="sm:col-span-2">
          <Textarea
            label="Warranty Terms"
            placeholder="Enter warranty terms"
            error={errors.warranty_terms?.message}
            {...register("warranty_terms")}
          />
        </div>
      </div>
    </FormSection>
  );
}
