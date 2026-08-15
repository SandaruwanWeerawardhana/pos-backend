"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { addWarehouseLocation } from "@/lib/db";
import type { Warehouse, WarehouseLocation } from "@/lib/types";
import { useQueryClient } from "@tanstack/react-query";
import { Check, MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { Controller } from "react-hook-form";
import { FormSection, RequiredMark } from "./FormSection";
import type { ProductSectionProps } from "./types";

interface LocationSectionProps extends ProductSectionProps {
  warehouses: Warehouse[];
  /** Named rack/shelf locations across all warehouses. */
  locations: WarehouseLocation[];
  errorCount: number;
}

/**
 * The "Create Warehouse Location" popup opened by the "+" beside a warehouse.
 *
 * The warehouse field is shown but locked: which warehouse the location belongs
 * to is decided by the "+" that was pressed, and letting it be changed here
 * would silently file the new shelf under a row the user is not looking at.
 */
function CreateLocationModal({
  warehouse,
  onClose,
  onCreated,
}: Readonly<{
  warehouse: Warehouse | null;
  onClose: () => void;
  onCreated: (location: WarehouseLocation) => void;
}>) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setCode("");
    setName("");
    setError(null);
  }

  async function handleSubmit() {
    if (!warehouse) return;
    if (!code.trim()) {
      setError("Rack/location code is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const location = await addWarehouseLocation({
        warehouse_id: warehouse.id,
        code,
        name,
      });
      await queryClient.invalidateQueries({
        queryKey: ["product-options", "locations"],
      });
      onCreated(location);
      reset();
      onClose();
    } catch (creationError) {
      setError(
        creationError instanceof Error
          ? creationError.message
          : "Failed to add location",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={warehouse !== null}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Create Warehouse Location"
      size="sm"
    >
      {/* The modal is portalled out of the product form's DOM, but React still
          bubbles events up the component tree — without stopping it, adding a
          location would submit the whole product. */}
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void handleSubmit();
        }}
      >
        <Select
          label={
            <>
              Warehouse
              <RequiredMark />
            </>
          }
          options={
            warehouse ? [{ value: warehouse.id, label: warehouse.name }] : []
          }
          value={warehouse?.id ?? ""}
          disabled
          onChange={() => undefined}
          className="cursor-not-allowed bg-surface-container text-on-surface-variant dark:bg-zinc-800 dark:text-zinc-400"
        />
        <Input
          label={
            <>
              Rack/Location Code
              <RequiredMark />
            </>
          }
          placeholder="Enter Rack/Location Code"
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <Input
          label="Location Name"
          placeholder="Enter Location Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
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
 * Rack/shelf reference per warehouse. Reference data only: stock is tracked by
 * warehouse, never by location, so an empty or stale value here can never make
 * a quantity wrong.
 */
export function LocationSection({
  form,
  warehouses,
  locations,
  errorCount,
}: Readonly<LocationSectionProps>) {
  const { control, setValue, formState } = form;
  const errors = formState.errors;
  const [creatingFor, setCreatingFor] = useState<Warehouse | null>(null);

  return (
    <FormSection
      id="location"
      title="Internal Location (Rack/Shelf)"
      icon={<MapPin size={18} />}
      errorCount={errorCount}
    >
      <p className="mb-3 rounded-xl bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant dark:bg-zinc-800/60 dark:text-zinc-400">
        <strong className="font-semibold">Warehouse Location (Optional):</strong>{" "}
        This field helps you identify the physical position of the product in
        the warehouse (Rack / Shelf / Zone / Bin). It&apos;s for reference and
        faster picking during inventory checks. Stock is still tracked by
        warehouse, not by location.
      </p>

      {warehouses.length === 0 ? (
        <p className="text-sm text-on-surface-variant dark:text-zinc-400">
          No warehouses to place this product in yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {warehouses.map((warehouse) => {
            // The code is what gets stored; the name only widens the label so
            // "A3-04" is recognisable to someone who knows it as "Chiller 2".
            const options = locations
              .filter((location) => location.warehouse_id === warehouse.id)
              .map((location) => ({
                value: location.code,
                label: location.name
                  ? `${location.code} — ${location.name}`
                  : location.code,
              }));

            return (
              <Controller
                key={warehouse.id}
                control={control}
                name={`rack_locations.${warehouse.id}`}
                render={({ field }) => (
                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <Select
                        label={warehouse.name}
                        placeholder="Choose"
                        options={options}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        error={errors.rack_locations?.[warehouse.id]?.message}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setCreatingFor(warehouse)}
                      aria-label={`Add a location in ${warehouse.name}`}
                      title={`Add a location in ${warehouse.name}`}
                      className="flex h-[42px] w-12 shrink-0 items-center justify-center rounded-lg border border-secondary text-secondary transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-secondary/10 active:scale-95 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-500/10"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                )}
              />
            );
          })}
        </div>
      )}

      {/* One modal for all warehouses — which one it writes to is whichever
          "+" opened it, so the dialog cannot target a stale warehouse. */}
      <CreateLocationModal
        warehouse={creatingFor}
        onClose={() => setCreatingFor(null)}
        onCreated={(created) => {
          setValue(`rack_locations.${created.warehouse_id}`, created.code, {
            shouldDirty: true,
            shouldValidate: true,
          });
        }}
      />
    </FormSection>
  );
}
