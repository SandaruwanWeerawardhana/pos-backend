"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select, type SelectOption } from "@/components/ui/Select";
import { addProductUnit } from "@/lib/db";
import {
  PRODUCT_TYPE_OPTIONS,
  PRODUCT_UNIT_OPTIONS,
} from "@/lib/products/constants";
import type { ProductUnitRecord } from "@/lib/types";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Package, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Controller, useWatch } from "react-hook-form";
import { FormSection, RequiredMark } from "./FormSection";
import type { ProductSectionProps } from "./types";

interface InventorySectionProps extends ProductSectionProps {
  errorCount: number;
  productUnits: ProductUnitRecord[];
}

/**
 * The "Create Product Unit" popup opened by the "+" beside Product Unit.
 * `short_name` is what actually gets stored on the product (`unit` /
 * `sale_unit` / `purchase_unit`); `base_unit` is informational only — no
 * conversion factor exists yet, it just groups a derived unit under one it
 * was defined from.
 */
function CreateProductUnitModal({
  open,
  onClose,
  baseUnitOptions,
  onCreated,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  baseUnitOptions: SelectOption[];
  onCreated: (unit: ProductUnitRecord) => void;
}>) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [baseUnit, setBaseUnit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setShortName("");
    setBaseUnit("");
    setError(null);
  }

  async function handleSubmit() {
    if (!name.trim() || !shortName.trim()) {
      setError("Name and short name are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const unit = await addProductUnit({
        name,
        short_name: shortName,
        base_unit: baseUnit || undefined,
      });
      await queryClient.invalidateQueries({
        queryKey: ["product-options", "product-units"],
      });
      onCreated(unit);
      reset();
      onClose();
    } catch (creationError) {
      setError(
        creationError instanceof Error ? creationError.message : "Failed to add unit",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Create Product Unit"
      size="sm"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void handleSubmit();
        }}
      >
        <Input
          label={
            <>
              Name
              <RequiredMark />
            </>
          }
          placeholder="Enter Unit Name"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          label={
            <>
              Short Name
              <RequiredMark />
            </>
          }
          placeholder="Enter shortname Unit"
          value={shortName}
          onChange={(event) => setShortName(event.target.value)}
        />
        <Select
          label="Base Unit"
          placeholder="Choose Base Unit"
          options={baseUnitOptions}
          value={baseUnit}
          onChange={(event) => setBaseUnit(event.target.value)}
        />
        {error && <p className="text-xs text-error">{error}</p>}
        <Button type="submit" loading={saving} className="self-start">
          <Check size={16} />
          Submit
        </Button>
      </form>
    </Modal>
  );
}

/**
 * Product type, the three units, the low-stock trigger and the shipping
 * envelope. Opening quantities live in their own section because they are
 * per-warehouse; everything here is a property of the product itself.
 *
 * A service carries no stock, so the alert and the shipping figures are hidden
 * for it rather than collected and ignored.
 */
export function InventorySection({
  form,
  errorCount,
  productUnits,
}: Readonly<InventorySectionProps>) {
  const { control, register, setValue, formState } = form;
  const errors = formState.errors;
  const [createUnitOpen, setCreateUnitOpen] = useState(false);

  const [productType, unit] = useWatch({ control, name: ["product_type", "unit"] });
  const stocked = productType !== "service";
  const weighedUnit = unit !== "unit";

  // Built-ins plus whatever has been created from the "+" button, shared by
  // all three unit fields so a custom unit is usable wherever a unit is.
  const unitOptions = useMemo(
    () => [
      ...PRODUCT_UNIT_OPTIONS,
      ...productUnits.map((custom) => ({
        value: custom.short_name,
        label: `${custom.name} (${custom.short_name})`,
      })),
    ],
    [productUnits],
  );

  return (
    <FormSection
      id="inventory"
      title="Inventory"
      icon={<Package size={18} />}
      errorCount={errorCount}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="product_type"
          render={({ field }) => (
            <Select
              label={
                <>
                  Type
                  <RequiredMark />
                </>
              }
              options={PRODUCT_TYPE_OPTIONS}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={errors.product_type?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="unit"
          render={({ field }) => (
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  label={
                    <>
                      Product Unit
                      <RequiredMark />
                    </>
                  }
                  options={unitOptions}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={errors.unit?.message}
                />
              </div>
              <button
                type="button"
                onClick={() => setCreateUnitOpen(true)}
                aria-label="Add new product unit"
                title="Add new product unit"
                className="flex h-[42px] w-12 shrink-0 items-center justify-center rounded-lg bg-secondary text-on-secondary transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-secondary/90 active:scale-95 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-600"
              >
                <Plus size={18} />
              </button>

              <CreateProductUnitModal
                open={createUnitOpen}
                onClose={() => setCreateUnitOpen(false)}
                baseUnitOptions={unitOptions}
                onCreated={(created) => {
                  setValue("unit", created.short_name, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
              />
            </div>
          )}
        />

        <Controller
          control={control}
          name="sale_unit"
          render={({ field }) => (
            <Select
              label={
                <>
                  Sale Unit
                  <RequiredMark />
                </>
              }
              options={unitOptions}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={errors.sale_unit?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="purchase_unit"
          render={({ field }) => (
            <Select
              label={
                <>
                  Purchase Unit
                  <RequiredMark />
                </>
              }
              options={unitOptions}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={errors.purchase_unit?.message}
            />
          )}
        />

        {stocked && (
          <>
            <Input
              label="Stock Alert"
              placeholder="0"
              hint={
                weighedUnit
                  ? `Flags the product as low once stock falls to this level (${unit}).`
                  : "Flags the product as low once stock falls to this level."
              }
              inputMode="numeric"
              autoComplete="off"
              className="text-right tabular-nums"
              error={errors.stock_alert?.message}
              {...register("stock_alert")}
            />

            <Input
              label="Weight"
              placeholder="0.00"
              hint="Shipping weight in kilograms."
              inputMode="decimal"
              autoComplete="off"
              className="text-right tabular-nums"
              error={errors.weight?.message}
              {...register("weight")}
            />
          </>
        )}
      </div>

      {stocked && (
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-on-surface-variant dark:text-zinc-300">
            Dimensions (in)
          </legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Length"
              placeholder="0.00"
              inputMode="decimal"
              autoComplete="off"
              className="text-right tabular-nums"
              error={errors.length?.message}
              {...register("length")}
            />
            <Input
              label="Width"
              placeholder="0.00"
              inputMode="decimal"
              autoComplete="off"
              className="text-right tabular-nums"
              error={errors.width?.message}
              {...register("width")}
            />
            <Input
              label="Height"
              placeholder="0.00"
              inputMode="decimal"
              autoComplete="off"
              className="text-right tabular-nums"
              error={errors.height?.message}
              {...register("height")}
            />
          </div>
        </fieldset>
      )}
    </FormSection>
  );
}
