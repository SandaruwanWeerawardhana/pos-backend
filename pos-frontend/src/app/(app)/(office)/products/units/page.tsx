"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Search, X } from "lucide-react";
import {
  addProductUnit,
  deleteProductUnit,
  listProductUnits,
  updateProductUnit,
} from "@/lib/db";
import type { ProductUnitRecord, UnitOperator } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Card, PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { ROUTES } from "@/lib/types/routes";

const ACTION_BUTTON_CLASSES =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-outline-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-700";

const OPERATOR_OPTIONS: { value: UnitOperator; label: string }[] = [
  { value: "*", label: "* (multiply)" },
  { value: "/", label: "/ (divide)" },
];

function RequiredMark() {
  return (
    <span className="text-error" aria-hidden>
      {" "}
      *
    </span>
  );
}

function filterUnits(units: ProductUnitRecord[], query: string): ProductUnitRecord[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return units;
  return units.filter(
    (unit) =>
      unit.name.toLowerCase().includes(needle) ||
      unit.short_name.toLowerCase().includes(needle),
  );
}

/** Resolves a stored `base_unit` (a short_name) back to that unit's display name. */
function baseUnitLabel(unit: ProductUnitRecord, units: ProductUnitRecord[]): string {
  if (!unit.base_unit) return "—";
  const base = units.find((candidate) => candidate.short_name === unit.base_unit);
  return base?.name ?? unit.base_unit;
}

interface UnitFormProps {
  unit: ProductUnitRecord | null;
  units: ProductUnitRecord[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Mounted only while its `Modal` is open (see `Modal`'s own `if (!open)
 * return null`), so field state initialises fresh from `unit` every time it
 * opens rather than needing an effect to reset it.
 */
function UnitForm({ unit, units, onClose, onSaved }: Readonly<UnitFormProps>) {
  const { showToast } = useToast();
  const [name, setName] = useState(unit?.name ?? "");
  const [shortName, setShortName] = useState(unit?.short_name ?? "");
  const [baseUnit, setBaseUnit] = useState(unit?.base_unit ?? "");
  const [operator, setOperator] = useState<UnitOperator>(unit?.operator ?? "*");
  const [operationValue, setOperationValue] = useState(
    String(unit?.operation_value ?? 1),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const baseUnitOptions = units
    .filter((candidate) => candidate.id !== unit?.id)
    .map((candidate) => ({
      value: candidate.short_name,
      label: `${candidate.name} (${candidate.short_name})`,
    }));

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Unit name is required");
      return;
    }
    if (!shortName.trim()) {
      setError("Short name is required");
      return;
    }
    const value = Number(operationValue);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Operation value must be a positive number");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (unit) {
        await updateProductUnit(unit.id, {
          name,
          short_name: shortName,
          base_unit: baseUnit,
          operator,
          operation_value: value,
        });
        showToast(`${name} updated`, "success");
      } else {
        await addProductUnit({
          name,
          short_name: shortName,
          base_unit: baseUnit,
          operator,
          operation_value: value,
        });
        showToast(`${name} added`, "success");
      }
      onSaved();
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Could not save unit",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
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
        placeholder="Enter unit name"
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
        placeholder="Enter short name"
        value={shortName}
        onChange={(event) => setShortName(event.target.value)}
      />
      <Select
        label="Base Unit"
        placeholder="None"
        options={baseUnitOptions}
        value={baseUnit}
        onChange={(event) => setBaseUnit(event.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Operator"
          options={OPERATOR_OPTIONS}
          value={operator}
          onChange={(event) => setOperator(event.target.value as UnitOperator)}
        />
        <Input
          label="Operation Value"
          type="number"
          min="0"
          step="any"
          value={operationValue}
          onChange={(event) => setOperationValue(event.target.value)}
        />
      </div>
      <p className="text-xs text-on-surface-variant dark:text-zinc-500">
        {baseUnit
          ? `1 ${shortName || "unit"} ${operator} ${operationValue || "?"} = 1 ${baseUnit}`
          : "No base unit — this is its own base, kept at * 1."}
      </p>
      {error && <p className="text-xs text-error">{error}</p>}
      <Button type="submit" loading={saving} className="self-start">
        <Check size={16} />
        {unit ? "Save changes" : "Submit"}
      </Button>
    </form>
  );
}

interface UnitFormModalProps {
  open: boolean;
  unit: ProductUnitRecord | null;
  units: ProductUnitRecord[];
  onClose: () => void;
  onSaved: () => void;
}

function UnitFormModal({
  open,
  unit,
  units,
  onClose,
  onSaved,
}: Readonly<UnitFormModalProps>) {
  return (
    <Modal open={open} onClose={onClose} title={unit ? "Edit" : "Create"} size="sm">
      {/* Keyed so switching from editing one unit to another (or to "create")
          while a fresh modal mounts starts the form from that unit's own
          values instead of the previous one's. */}
      <UnitForm
        key={unit?.id ?? "new"}
        unit={unit}
        units={units}
        onClose={onClose}
        onSaved={onSaved}
      />
    </Modal>
  );
}

export default function UnitsPage() {
  const { showToast } = useToast();

  const [query, setQuery] = useState("");
  const [units, setUnits] = useState<ProductUnitRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductUnitRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProductUnitRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  function reload() {
    listProductUnits().then(setUnits);
  }

  useEffect(reload, []);

  const visible = filterUnits(units, query);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteProductUnit(pendingDelete.id);
      showToast(`Deleted ${pendingDelete.name}`, "success");
      setSelectedIds((current) => current.filter((id) => id !== pendingDelete.id));
      setPendingDelete(null);
      reload();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not delete unit",
        "error",
      );
    } finally {
      setDeleting(false);
    }
  }

  const columns: DataColumn<ProductUnitRecord>[] = [
    {
      key: "name",
      header: "Name",
      sortValue: (unit) => unit.name,
      render: (unit) => (
        <span className="font-medium text-secondary dark:text-blue-400">
          {unit.name}
        </span>
      ),
    },
    {
      key: "short_name",
      header: "Short Name",
      sortValue: (unit) => unit.short_name,
      render: (unit) => (
        <span className="text-on-surface dark:text-zinc-50">{unit.short_name}</span>
      ),
    },
    {
      key: "base_unit",
      header: "Base Unit",
      render: (unit) => (
        <span className="text-on-surface dark:text-zinc-50">
          {baseUnitLabel(unit, units)}
        </span>
      ),
    },
    {
      key: "operator",
      header: "Operator",
      render: (unit) => (
        <span className="text-on-surface dark:text-zinc-50">
          {unit.operator ?? "*"}
        </span>
      ),
    },
    {
      key: "operation_value",
      header: "Operation Value",
      render: (unit) => (
        <span className="font-medium text-secondary dark:text-blue-400">
          {unit.operation_value ?? 1}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (unit) => (
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setEditing(unit);
              setFormOpen(true);
            }}
            aria-label={`Edit ${unit.name}`}
            title="Edit"
            className={`${ACTION_BUTTON_CLASSES} text-emerald-600 hover:bg-surface-container dark:text-emerald-400 dark:hover:bg-zinc-800`}
          >
            <Pencil size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setPendingDelete(unit)}
            aria-label={`Delete ${unit.name}`}
            title="Delete"
            className={`${ACTION_BUTTON_CLASSES} text-error hover:bg-surface-container dark:text-red-400 dark:hover:bg-zinc-800`}
          >
            <X size={15} aria-hidden />
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        title="Units"
        breadcrumbs={[
          { label: "Dashboard", href: ROUTES.dashboard },
          { label: "Products", href: ROUTES.products },
          { label: "Units" },
        ]}
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant dark:text-zinc-500"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this table"
              aria-label="Search units"
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={16} />
            Create
          </Button>
        </div>

        <div className="mt-4">
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(unit) => unit.id}
            emptyMessage="No units yet."
            caption="Units"
            pageSizeOptions={[10, 25, 50]}
            selection={{ selectedIds, onChange: setSelectedIds }}
          />
        </div>
      </Card>

      <UnitFormModal
        open={formOpen}
        unit={editing}
        units={units}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete unit"
        message={`Delete ${pendingDelete?.name ?? "this unit"}? Products already using it keep their unit text.`}
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
