"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, Pencil, Plus, Search, Tag, X } from "lucide-react";
import { addBrand, deleteBrand, listBrandRecords, updateBrand } from "@/lib/db";
import type { Brand } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Card, PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/products/constants";
import { ROUTES } from "@/lib/types/routes";

const ACTION_BUTTON_CLASSES =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-outline-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-700";

function RequiredMark() {
  return (
    <span className="text-error" aria-hidden>
      {" "}
      *
    </span>
  );
}

function filterBrands(brands: Brand[], query: string): Brand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return brands;
  return brands.filter(
    (brand) =>
      brand.name.toLowerCase().includes(needle) ||
      brand.description?.toLowerCase().includes(needle),
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error(`Could not read ${file.name}`));
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function BrandThumbnail({ brand }: Readonly<{ brand: Brand }>) {
  if (!brand.image_url) {
    return (
      <span className="flex h-11 w-16 items-center justify-center rounded-lg border border-outline-variant bg-surface-container text-on-surface-variant dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
        <Tag size={16} aria-hidden />
      </span>
    );
  }
  return (
    <Image
      src={brand.image_url}
      alt=""
      width={64}
      height={44}
      unoptimized
      className="h-11 w-16 rounded-lg border border-outline-variant bg-white object-contain p-1 dark:border-zinc-700"
    />
  );
}

interface BrandFormProps {
  brand: Brand | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Mounted only while its `Modal` is open (see `Modal`'s own `if (!open)
 * return null`), so field state initialises fresh from `brand` every time it
 * opens rather than needing an effect to reset it.
 */
function BrandForm({ brand, onClose, onSaved }: Readonly<BrandFormProps>) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(brand?.name ?? "");
  const [description, setDescription] = useState(brand?.description ?? "");
  const [imageUrl, setImageUrl] = useState(brand?.image_url ?? "");
  const [imageName, setImageName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleImageChange(file: File | undefined) {
    if (!file) {
      setImageUrl("");
      setImageName("");
      return;
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("Use a JPG, PNG, WebP or AVIF image");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image must be under 2 MB");
      return;
    }
    setError(null);
    setImageUrl(await readAsDataUrl(file));
    setImageName(file.name);
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Brand name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (brand) {
        await updateBrand(brand.id, { name, description, image_url: imageUrl });
        showToast(`${name} updated`, "success");
      } else {
        await addBrand({ name, description, image_url: imageUrl });
        showToast(`${name} added`, "success");
      }
      onSaved();
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Could not save brand",
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
            Brand Name
            <RequiredMark />
          </>
        }
        placeholder="Enter brand name"
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        label="Brand Description"
        placeholder="Enter brand description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-on-surface-variant dark:text-zinc-300">
          Brand Image
        </span>
        <div className="flex items-center gap-3">
          {imageUrl && (
            <Image
              src={imageUrl}
              alt=""
              width={44}
              height={44}
              unoptimized
              className="h-11 w-11 shrink-0 rounded-lg border border-outline-variant bg-white object-contain p-1 dark:border-zinc-700"
            />
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            aria-label="Brand image"
            onChange={(event) => void handleImageChange(event.target.files?.[0])}
            className="min-h-10 w-full cursor-pointer rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface-variant outline-none file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface-container file:px-3 file:py-1.5 file:text-sm file:text-on-surface hover:border-outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-100"
          />
          {imageUrl && (
            <button
              type="button"
              aria-label="Remove image"
              onClick={() => {
                setImageUrl("");
                setImageName("");
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-error/40 text-error transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-error/10 active:scale-90"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <span className="text-xs text-on-surface-variant dark:text-zinc-500">
          {imageName || "No file chosen"} · JPG, PNG, WebP or AVIF, under 2 MB.
        </span>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}
      <Button type="submit" loading={saving} className="self-start">
        <Check size={16} />
        {brand ? "Save changes" : "Submit"}
      </Button>
    </form>
  );
}

interface BrandFormModalProps {
  open: boolean;
  brand: Brand | null;
  onClose: () => void;
  onSaved: () => void;
}

function BrandFormModal({ open, brand, onClose, onSaved }: Readonly<BrandFormModalProps>) {
  return (
    <Modal open={open} onClose={onClose} title={brand ? "Edit" : "Create"} size="sm">
      {/* Keyed so switching from editing one brand to another (or to
          "create") while a fresh modal mounts starts the form from that
          brand's own values instead of the previous one's. */}
      <BrandForm
        key={brand?.id ?? "new"}
        brand={brand}
        onClose={onClose}
        onSaved={onSaved}
      />
    </Modal>
  );
}

export default function BrandsPage() {
  const { showToast } = useToast();

  const [query, setQuery] = useState("");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Brand | null>(null);
  const [deleting, setDeleting] = useState(false);

  function reload() {
    listBrandRecords().then(setBrands);
  }

  useEffect(reload, []);

  const visible = filterBrands(brands, query);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteBrand(pendingDelete.id);
      showToast(`Deleted ${pendingDelete.name}`, "success");
      setSelectedIds((current) => current.filter((id) => id !== pendingDelete.id));
      setPendingDelete(null);
      reload();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not delete brand",
        "error",
      );
    } finally {
      setDeleting(false);
    }
  }

  const columns: DataColumn<Brand>[] = [
    {
      key: "image",
      header: "Brand Image",
      render: (brand) => <BrandThumbnail brand={brand} />,
    },
    {
      key: "name",
      header: "Brand Name",
      sortValue: (brand) => brand.name,
      render: (brand) => (
        <span className="font-medium text-secondary dark:text-blue-400">
          {brand.name}
        </span>
      ),
    },
    {
      key: "description",
      header: "Brand Description",
      sortValue: (brand) => brand.description ?? "",
      render: (brand) => (
        <span className="text-on-surface dark:text-zinc-50">
          {brand.description || "—"}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (brand) => (
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setEditing(brand);
              setFormOpen(true);
            }}
            aria-label={`Edit ${brand.name}`}
            title="Edit"
            className={`${ACTION_BUTTON_CLASSES} text-emerald-600 hover:bg-surface-container dark:text-emerald-400 dark:hover:bg-zinc-800`}
          >
            <Pencil size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setPendingDelete(brand)}
            aria-label={`Delete ${brand.name}`}
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
        title="Brand"
        breadcrumbs={[
          { label: "Dashboard", href: ROUTES.dashboard },
          { label: "Products", href: ROUTES.products },
          { label: "Brand" },
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
              aria-label="Search brands"
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
            rowKey={(brand) => brand.id}
            emptyMessage="No brands yet."
            caption="Brands"
            pageSizeOptions={[10, 25, 50]}
            selection={{ selectedIds, onChange: setSelectedIds }}
          />
        </div>
      </Card>

      <BrandFormModal
        open={formOpen}
        brand={editing}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete brand"
        message={`Delete ${pendingDelete?.name ?? "this brand"}? Products already filed under it keep their brand text.`}
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
