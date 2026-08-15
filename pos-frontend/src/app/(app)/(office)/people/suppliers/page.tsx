"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Filter,
  FileSpreadsheet,
  FileText,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import { deleteSupplier, listSuppliers } from "@/lib/db";
import type { Supplier } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Card, PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { useSettings } from "@/lib/hooks/use-settings";
import { exportExcel, exportPdf, type ExportColumn } from "@/lib/export";
import { ROUTES } from "@/lib/types/routes";

const ACTION_BUTTON_CLASSES =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-outline-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-700";

type DueFilter = "" | "due" | "no-due";

function filterSuppliers(
  suppliers: Supplier[],
  query: string,
  dueFilter: DueFilter,
): Supplier[] {
  const needle = query.trim().toLowerCase();
  return suppliers.filter((supplier) => {
    if (dueFilter === "due" && supplier.total_purchase_due_cents <= 0) return false;
    if (dueFilter === "no-due" && supplier.total_purchase_due_cents > 0) return false;
    if (!needle) return true;
    return (
      supplier.code.toLowerCase().includes(needle) ||
      supplier.name.toLowerCase().includes(needle) ||
      (supplier.phone?.toLowerCase().includes(needle) ?? false) ||
      (supplier.email?.toLowerCase().includes(needle) ?? false) ||
      (supplier.city?.toLowerCase().includes(needle) ?? false) ||
      (supplier.tax_number?.toLowerCase().includes(needle) ?? false)
    );
  });
}

export default function SuppliersManagementPage() {
  const { money } = useSettings();
  const { showToast } = useToast();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [query, setQuery] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [dueFilter, setDueFilter] = useState<DueFilter>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionsFor, setActionsFor] = useState<Supplier | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  function reload() {
    listSuppliers().then(setSuppliers);
  }

  useEffect(reload, []);

  const visible = useMemo(
    () => filterSuppliers(suppliers, query, dueFilter),
    [suppliers, query, dueFilter],
  );

  const exportColumns: ExportColumn<Supplier>[] = [
    { key: "code", header: "Code", value: (s) => s.code },
    { key: "name", header: "Name", value: (s) => s.name },
    { key: "phone", header: "Phone", value: (s) => s.phone ?? "" },
    { key: "email", header: "Email", value: (s) => s.email ?? "" },
    { key: "city", header: "City", value: (s) => s.city ?? "" },
    { key: "tax_number", header: "Tax Number", value: (s) => s.tax_number ?? "" },
    {
      key: "total_purchase_due",
      header: "Total Purchase Due",
      value: (s) => (s.total_purchase_due_cents / 100).toFixed(2),
    },
    {
      key: "total_purchase_return_due",
      header: "Total Purchase Return Due",
      value: (s) => (s.total_purchase_return_due_cents / 100).toFixed(2),
    },
  ];

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteSupplier(pendingDelete.id);
      showToast(`Deleted ${pendingDelete.name}`, "success");
      setSelectedIds((current) => current.filter((id) => id !== pendingDelete.id));
      setPendingDelete(null);
      reload();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not delete supplier",
        "error",
      );
    } finally {
      setDeleting(false);
    }
  }

  const columns: DataColumn<Supplier>[] = [
    {
      key: "code",
      header: "Code",
      sortValue: (supplier) => supplier.code,
      render: (supplier) => supplier.code,
    },
    {
      key: "name",
      header: "Name",
      sortValue: (supplier) => supplier.name,
      render: (supplier) => (
        <span className="font-medium text-secondary dark:text-blue-400">{supplier.name}</span>
      ),
    },
    { key: "phone", header: "Phone", render: (supplier) => supplier.phone ?? "—" },
    {
      key: "email",
      header: "Email",
      render: (supplier) => (
        <span className="text-secondary dark:text-blue-400">{supplier.email ?? "—"}</span>
      ),
    },
    {
      key: "city",
      header: "City",
      hideOnMobile: true,
      render: (supplier) => supplier.city ?? "—",
    },
    {
      key: "tax_number",
      header: "Tax Number",
      hideOnMobile: true,
      render: (supplier) => supplier.tax_number ?? "—",
    },
    {
      key: "total_purchase_due",
      header: "Total Purchase Due",
      align: "right",
      sortValue: (supplier) => supplier.total_purchase_due_cents,
      render: (supplier) => money(supplier.total_purchase_due_cents),
    },
    {
      key: "total_purchase_return_due",
      header: "Total Purchase Return Due",
      align: "right",
      hideOnMobile: true,
      sortValue: (supplier) => supplier.total_purchase_return_due_cents,
      render: (supplier) => money(supplier.total_purchase_return_due_cents),
    },
    {
      key: "action",
      header: "Action",
      render: (supplier) => (
        <button
          type="button"
          onClick={() => setActionsFor(supplier)}
          aria-label={`Actions for ${supplier.name}`}
          title="Actions"
          className={ACTION_BUTTON_CLASSES}
        >
          <MoreHorizontal size={15} aria-hidden />
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        title="Suppliers Management"
        breadcrumbs={[
          { label: "Suppliers", href: ROUTES.suppliers },
          { label: "Suppliers Management" },
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
              aria-label="Search suppliers"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowFilter((open) => !open)}
              aria-expanded={showFilter}
            >
              <Filter size={15} />
              Filter
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportPdf("Suppliers Management", visible, exportColumns)}
            >
              <FileText size={15} />
              PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportExcel("suppliers", "Suppliers Management", visible, exportColumns)}
            >
              <FileSpreadsheet size={15} />
              EXCEL
            </Button>
            <Link
              href={ROUTES.suppliersNew}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-medium text-on-primary transition-colors hover:bg-primary/90"
            >
              <Plus size={15} />
              Create
            </Link>
          </div>
        </div>

        {showFilter && (
          <div className="animate-fade-in mt-4 max-w-xs">
            <Select
              label="Purchase due"
              value={dueFilter}
              onChange={(event) => setDueFilter(event.target.value as DueFilter)}
              placeholder="All suppliers"
              options={[
                { value: "due", label: "Has purchase due" },
                { value: "no-due", label: "No purchase due" },
              ]}
            />
          </div>
        )}

        <div className="-mx-5 mt-4">
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(supplier) => supplier.id}
            emptyMessage="No suppliers yet."
            caption="Suppliers"
            textSizeClassName="text-xs"
            pageSizeOptions={[10, 25, 50]}
            selection={{ selectedIds, onChange: setSelectedIds }}
          />
        </div>
      </Card>

      <Modal
        open={actionsFor !== null}
        onClose={() => setActionsFor(null)}
        title={actionsFor?.name ?? "Actions"}
        size="sm"
      >
        {actionsFor && (
          <div className="flex flex-col gap-2">
            <Link
              href={ROUTES.suppliersEdit(actionsFor.id)}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-outline-variant text-sm font-medium text-on-surface transition-colors hover:bg-surface-container dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Edit
            </Link>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setPendingDelete(actionsFor);
                setActionsFor(null);
              }}
            >
              Delete
            </Button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete supplier"
        message={`Delete ${pendingDelete?.name ?? "this supplier"}? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
