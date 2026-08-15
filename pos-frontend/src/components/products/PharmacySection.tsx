"use client";

import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { HeartPulse } from "lucide-react";
import { Controller, useWatch } from "react-hook-form";
import { FormSection } from "./FormSection";
import type { ProductSectionProps } from "./types";

interface PharmacySectionProps extends ProductSectionProps {
  errorCount: number;
}

/**
 * Dispensing detail for pharmacy stock.
 *
 * The expiry and manufacturing dates only appear once batch tracking is on:
 * with tracking off there is no batch to hang them on, and either date filled
 * in writes the opening stock as the product's first batch, which is what the
 * expiry and batch reports read from. See toProduct().
 */
export function PharmacySection({
  form,
  errorCount,
}: Readonly<PharmacySectionProps>) {
  const { control, register, formState } = form;
  const errors = formState.errors;

  const [trackBatches, expiryDate, manufacturingDate] = useWatch({
    control,
    name: ["track_batches", "expiry_date", "manufacturing_date"],
  });
  const opensBatch = trackBatches && Boolean(expiryDate || manufacturingDate);

  return (
    <FormSection
      id="pharmacy"
      title="Pharmacy Settings"
      icon={<HeartPulse size={18} />}
      errorCount={errorCount}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Controller
          control={control}
          name="track_batches"
          render={({ field }) => (
            <Switch
              label="Track batches & expiry"
              description="Capture batch numbers and expiry dates on purchase and sale."
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="prescription_required"
          render={({ field }) => (
            <Switch
              label="Prescription Required"
              description="The till asks for a prescription before this line can be sold."
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label="Generic Name"
          placeholder="Generic Name"
          autoComplete="off"
          error={errors.generic_name?.message}
          {...register("generic_name")}
        />
        <Input
          label="Strength"
          placeholder="Strength"
          autoComplete="off"
          error={errors.strength?.message}
          {...register("strength")}
        />
        <Input
          label="Dosage Form"
          placeholder="Dosage Form"
          autoComplete="off"
          error={errors.dosage_form?.message}
          {...register("dosage_form")}
        />
        <Input
          label="Pack Size"
          placeholder="Pack Size"
          autoComplete="off"
          error={errors.pack_size?.message}
          {...register("pack_size")}
        />
        <Input
          label="Manufacturer"
          placeholder="Manufacturer"
          autoComplete="off"
          error={errors.manufacturer?.message}
          {...register("manufacturer")}
        />
        <Input
          label="Drug Schedule"
          placeholder="Drug Schedule"
          autoComplete="off"
          error={errors.drug_schedule?.message}
          {...register("drug_schedule")}
        />
      </div>

      {trackBatches && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label="Manufacturing date"
            type="date"
            className="min-h-12"
            error={errors.manufacturing_date?.message}
            {...register("manufacturing_date")}
          />
          <Input
            label="Expiry date"
            type="date"
            className="min-h-12"
            error={errors.expiry_date?.message}
            {...register("expiry_date")}
          />
        </div>
      )}

      {opensBatch && (
        <p className="mt-3 rounded-xl bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant dark:bg-zinc-800/60 dark:text-zinc-400">
          The opening stock will be recorded as the first batch, so expiry and
          batch reports have something to report on from day one.
        </p>
      )}
    </FormSection>
  );
}
