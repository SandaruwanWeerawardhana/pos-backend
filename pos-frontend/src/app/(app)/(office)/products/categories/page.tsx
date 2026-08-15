"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Search, X } from "lucide-react";
import {
  addCategory,
  deleteCategory,
  listCategoryRecords,
  updateCategory,
} from "@/lib/db";
import type { Category } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Card, PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { CATEGORY_ICONS, CATEGORY_ICON_OPTIONS } from "@/lib/products/constants";
import { ROUTES } from "@/lib/types/routes";

function RequiredMark() {
  return (
    <span className="text-error" aria-hidden>
      {" "}
      *
    </span>
  );
}

function CategoryIcon({ icon }: Readonly<{ icon?: string }>) {
  const Icon = icon ? CATEGORY_ICONS[icon] : undefined;
  if (!Icon) {
    return <span className="text-on-surface-variant dark:text-zinc-400">—</span>;
  }
  return <Icon size={16} className="text-on-surface-variant dark:text-zinc-400" />;
}

const ACTION_BUTTON_CLASSES =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-outline-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-700";

function filterCategories(categories: Category[], query: string): Category[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return categories;
  return categories.filter(
    (category) =>
      category.name.toLowerCase().includes(needle) ||
      category.code.toLowerCase().includes(needle),
  );
}

interface CategoryFormProps {
  category: Category | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Mounted only while its `Modal` is open (see `Modal`'s own `if (!open)
 * return null`), so field state initialises fresh from `category` every time
 * it opens rather than needing an effect to reset it.
 */
function CategoryForm({ category, onClose, onSaved }: Readonly<CategoryFormProps>) {
  const { showToast } = useToast();
  const [code, setCode] = useState(category?.code ?? "");
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const iconLabel = CATEGORY_ICON_OPTIONS.find((option) => option.value === icon)?.label;

  async function handleSubmit() {
    if (!code.trim()) {
      setError("Category code is required");
      return;
    }
    if (!name.trim()) {
      setError("Category name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (category) {
        await updateCategory(category.id, { code, name, icon });
        showToast(`${name} updated`, "success");
      } else {
        await addCategory({ code, name, icon });
        showToast(`${name} added`, "success");
      }
      onSaved();
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Could not save category",
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
            Category Code
            <RequiredMark />
          </>
        }
        placeholder="Enter category Code"
        autoFocus
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      <Input
        label={
          <>
            Category Name
            <RequiredMark />
          </>
        }
        placeholder="Enter category Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <div>
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <Select
              label="Icon"
              options={CATEGORY_ICON_OPTIONS}
              placeholder="None"
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
            />
          </div>
          <span className="mb-2.5 shrink-0 text-xs text-on-surface-variant dark:text-zinc-400">
            {iconLabel ? `${iconLabel} selected` : "No icon selected"}
          </span>
        </div>
        <p className="mt-1 text-xs text-on-surface-variant dark:text-zinc-400">
          Pick an icon for this category.
        </p>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      <Button type="submit" loading={saving} className="self-start">
        <Check size={16} />
        {category ? "Save changes" : "Submit"}
      </Button>
    </form>
  );
}

interface CategoryFormModalProps {
  open: boolean;
  category: Category | null;
  onClose: () => void;
  onSaved: () => void;
}

function CategoryFormModal({
  open,
  category,
  onClose,
  onSaved,
}: Readonly<CategoryFormModalProps>) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? "Edit" : "Create"}
      size="sm"
    >
      {/* Keyed so switching from editing one category to another (or to
          "create") while a fresh modal mounts starts the form from that
          category's own values instead of the previous one's. */}
      <CategoryForm
        key={category?.id ?? "new"}
        category={category}
        onClose={onClose}
        onSaved={onSaved}
      />
    </Modal>
  );
}

export default function CategoriesPage() {
  const { showToast } = useToast();

  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  function reload() {
    listCategoryRecords().then(setCategories);
  }

  useEffect(reload, []);

  const visible = filterCategories(categories, query);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteCategory(pendingDelete.id);
      showToast(`Deleted ${pendingDelete.name}`, "success");
      setSelectedIds((current) => current.filter((id) => id !== pendingDelete.id));
      setPendingDelete(null);
      reload();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not delete category",
        "error",
      );
    } finally {
      setDeleting(false);
    }
  }

  const columns: DataColumn<Category>[] = [
    {
      key: "code",
      header: "Category Code",
      sortValue: (category) => category.code,
      render: (category) => (
        <span className="font-medium text-secondary dark:text-blue-400">
          {category.code}
        </span>
      ),
    },
    {
      key: "name",
      header: "Category Name",
      sortValue: (category) => category.name,
      render: (category) => (
        <span className="text-on-surface dark:text-zinc-50">{category.name}</span>
      ),
    },
    {
      key: "icon",
      header: "Icon",
      render: (category) => <CategoryIcon icon={category.icon} />,
    },
    {
      key: "action",
      header: "Action",
      render: (category) => (
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setEditing(category);
              setFormOpen(true);
            }}
            aria-label={`Edit ${category.name}`}
            title="Edit"
            className={`${ACTION_BUTTON_CLASSES} text-emerald-600 hover:bg-surface-container dark:text-emerald-400 dark:hover:bg-zinc-800`}
          >
            <Pencil size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setPendingDelete(category)}
            aria-label={`Delete ${category.name}`}
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
        title="Categories"
        breadcrumbs={[
          { label: "Dashboard", href: ROUTES.dashboard },
          { label: "Products", href: ROUTES.products },
          { label: "Categories" },
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
              aria-label="Search categories"
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
            rowKey={(category) => category.id}
            emptyMessage="No categories yet."
            caption="Categories"
            pageSizeOptions={[10, 25, 50]}
            selection={{ selectedIds, onChange: setSelectedIds }}
          />
        </div>
      </Card>

      <CategoryFormModal
        open={formOpen}
        category={editing}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete category"
        message={`Delete ${pendingDelete?.name ?? "this category"}? Products already filed under it keep their category text.`}
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
