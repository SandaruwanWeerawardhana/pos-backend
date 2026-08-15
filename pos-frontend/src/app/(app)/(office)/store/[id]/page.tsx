"use client";

import { use, useEffect, useState, type SubmitEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import {
  deleteProduct,
  getProduct,
  listStockMovements,
  listSuppliers,
  updateProduct,
} from "@/lib/db";
import type { Product, ProductUnit, StockMovement, Supplier } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useSettings } from "@/lib/hooks/use-settings";
import { formatDateTime, parseMoneyToCents } from "@/lib/format";
import { ROUTES } from "@/lib/types/routes";

const UNITS: { value: ProductUnit; label: string }[] = [
  { value: "unit", label: "Each" },
  { value: "kg", label: "Kilogram" },
  { value: "g", label: "Gram" },
  { value: "l", label: "Litre" },
  { value: "ml", label: "Millilitre" },
  { value: "pack", label: "Pack" },
  { value: "box", label: "Box" },
];

export default function ProductDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  const router = useRouter();
  const { showToast } = useToast();
  const { money } = useSettings();

  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode: "",
    category: "",
    brand: "",
    unit: "unit" as ProductUnit,
    price: "",
    cost: "",
    taxRate: "",
    reorderLevel: "",
    shelfLocation: "",
    supplierId: "",
    isWeighted: false,
  });

  useEffect(() => {
    Promise.all([
      getProduct(id),
      listStockMovements({ productId: id, limit: 25 }),
      listSuppliers(),
    ]).then(([found, history, supplierList]) => {
      setProduct(found ?? null);
      setMovements(history);
      setSuppliers(supplierList);
      if (found) {
        setForm({
          name: found.name,
          sku: found.sku,
          barcode: found.barcode,
          category: found.category ?? "",
          brand: found.brand ?? "",
          unit: found.unit ?? "unit",
          price: (found.price_cents / 100).toFixed(2),
          cost: found.cost_cents ? (found.cost_cents / 100).toFixed(2) : "",
          taxRate: (found.tax_rate * 100).toString(),
          reorderLevel: String(found.reorder_level ?? ""),
          shelfLocation: found.shelf_location ?? "",
          supplierId: found.supplier_id ?? "",
          isWeighted: Boolean(found.is_weighted),
        });
      }
    });
  }, [id]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const priceCents = parseMoneyToCents(form.price);
    if (priceCents === null || priceCents < 0) {
      showToast("Enter a valid price", "error");
      return;
    }
    const costCents = form.cost ? parseMoneyToCents(form.cost) : null;

    /**
     * reorder_level is the low-stock alert trigger, so a bad value here does
     * not surface as a form error — it silently stops the product ever being
     * reported low. NaN in particular, because `stock <= NaN` is always false.
     */
    let reorderLevel: number | undefined;
    if (form.reorderLevel.trim()) {
      reorderLevel = Number(form.reorderLevel);
      if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
        showToast("Reorder level must be zero or more", "error");
        return;
      }
    }

    setSaving(true);
    try {
      await updateProduct(id, {
        name: form.name.trim(),
        sku: form.sku.trim(),
        barcode: form.barcode.trim(),
        category: form.category.trim() || "Uncategorised",
        brand: form.brand.trim() || undefined,
        unit: form.unit,
        price_cents: priceCents,
        cost_cents: costCents ?? undefined,
        tax_rate: Number(form.taxRate) / 100,
        reorder_level: reorderLevel,
        shelf_location: form.shelfLocation.trim() || undefined,
        supplier_id: form.supplierId || undefined,
        is_weighted: form.isWeighted,
      });
      const refreshed = await getProduct(id);
      setProduct(refreshed ?? null);
      showToast("Product saved", "success");
    } catch {
      showToast("Failed to save product", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await deleteProduct(id);
    showToast("Product deleted", "success");
    router.push(ROUTES.inventory.root);
  }

  if (product === undefined) {
    return (
      <output aria-label="Loading product" className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </output>
    );
  }

  if (product === null) {
    return (
      <EmptyState
        title="Product not found"
        description="It may have been deleted, or the link is out of date."
        action={
          <Link
            href={ROUTES.inventory.root}
            className="inline-flex min-h-11 items-center rounded-lg bg-secondary px-5 text-sm font-medium text-on-secondary dark:bg-white dark:text-zinc-900"
          >
            Back to inventory
          </Link>
        }
      />
    );
  }

  const marginPercent = product.cost_cents
    ? ((product.price_cents - product.cost_cents) / product.price_cents) * 100
    : null;

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        eyebrow="Catalogue"
        title={product.name}
        description={`${product.sku} · ${product.stock_quantity} in stock`}
        breadcrumbs={[
          { label: "Inventory", href: ROUTES.inventory.root },
          { label: product.name },
        ]}
        actions={
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 size={15} />
            Delete
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <SectionHeader title="Product details" />
          <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
            <Input
              label="SKU"
              value={form.sku}
              onChange={(event) =>
                setForm((current) => ({ ...current, sku: event.target.value }))
              }
              required
            />
            <Input
              label="Barcode"
              value={form.barcode}
              onChange={(event) =>
                setForm((current) => ({ ...current, barcode: event.target.value }))
              }
              required
            />
            <Input
              label="Category"
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({ ...current, category: event.target.value }))
              }
            />
            <Input
              label="Brand"
              value={form.brand}
              onChange={(event) =>
                setForm((current) => ({ ...current, brand: event.target.value }))
              }
            />
            <Select
              label="Unit"
              value={form.unit}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  unit: event.target.value as ProductUnit,
                }))
              }
              options={UNITS}
            />
            <Input
              label="Sell price"
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(event) =>
                setForm((current) => ({ ...current, price: event.target.value }))
              }
              required
            />
            <Input
              label="Cost price"
              type="number"
              step="0.01"
              min="0"
              value={form.cost}
              onChange={(event) =>
                setForm((current) => ({ ...current, cost: event.target.value }))
              }
            />
            <Input
              label="Tax rate (%)"
              type="number"
              step="0.01"
              min="0"
              value={form.taxRate}
              onChange={(event) =>
                setForm((current) => ({ ...current, taxRate: event.target.value }))
              }
            />
            <Input
              label="Reorder level"
              type="number"
              min="0"
              step="1"
              value={form.reorderLevel}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  reorderLevel: event.target.value,
                }))
              }
            />
            <Input
              label="Shelf location"
              value={form.shelfLocation}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  shelfLocation: event.target.value,
                }))
              }
              placeholder="A3-04"
            />
            <Select
              label="Supplier"
              value={form.supplierId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  supplierId: event.target.value,
                }))
              }
              placeholder="No supplier"
              options={suppliers.map((supplier) => ({
                value: supplier.id,
                label: supplier.name,
              }))}
            />

            <label className="flex items-center gap-2.5 text-sm text-on-surface dark:text-zinc-100 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.isWeighted}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    isWeighted: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-outline-variant"
              />
              Variable-weight item — price is per unit and the quantity comes
              from the scale
            </label>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>
                <Save size={16} />
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <SectionHeader title="Margin" />
            <dl className="mt-4 flex flex-col gap-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant dark:text-zinc-400">Cost</dt>
                <dd className="font-medium tabular-nums text-on-surface dark:text-zinc-100">
                  {product.cost_cents ? money(product.cost_cents) : "Not set"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant dark:text-zinc-400">Price</dt>
                <dd className="font-medium tabular-nums text-on-surface dark:text-zinc-100">
                  {money(product.price_cents)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-outline-variant pt-3 dark:border-zinc-800">
                <dt className="text-on-surface-variant dark:text-zinc-400">
                  Gross margin
                </dt>
                <dd className="font-semibold tabular-nums text-on-surface dark:text-zinc-50">
                  {marginPercent === null ? "—" : `${marginPercent.toFixed(1)}%`}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-on-surface-variant dark:text-zinc-400">
                  Stock value
                </dt>
                <dd className="font-semibold tabular-nums text-on-surface dark:text-zinc-50">
                  {money(product.price_cents * product.stock_quantity)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <SectionHeader title="Batches & expiry" />
            {product.batches?.length ? (
              <ul className="mt-3 flex flex-col gap-2">
                {product.batches.map((batch) => (
                  <li
                    key={batch.batch_no}
                    className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant px-3 py-2 text-sm dark:border-zinc-800"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-on-surface dark:text-zinc-100">
                        {batch.batch_no}
                      </span>
                      <span className="block text-xs text-on-surface-variant dark:text-zinc-400">
                        {batch.quantity} units
                      </span>
                    </span>
                    <Badge variant={batch.expiry_date ? "warning" : "neutral"}>
                      {batch.expiry_date ?? "No expiry"}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-on-surface-variant dark:text-zinc-400">
                No batches recorded. Batches are created when goods are received
                against a purchase order.
              </p>
            )}
          </Card>

          <Card>
            <SectionHeader title="Recent movements" />
            {movements.length === 0 ? (
              <p className="mt-3 text-sm text-on-surface-variant dark:text-zinc-400">
                No stock movements yet.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {movements.map((movement) => (
                  <li
                    key={movement.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate capitalize text-on-surface dark:text-zinc-100">
                        {movement.type.replace("_", " ")}
                      </span>
                      <span className="block text-xs text-on-surface-variant dark:text-zinc-400">
                        {formatDateTime(movement.created_at)}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${
                        movement.quantity_delta >= 0
                          ? "text-on-tertiary-container dark:text-emerald-400"
                          : "text-error dark:text-red-400"
                      }`}
                    >
                      {movement.quantity_delta > 0 ? "+" : ""}
                      {movement.quantity_delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete product?"
        message={`"${product.name}" will be removed from the local catalogue. Recorded sales that include it are not affected.`}
        confirmLabel="Delete product"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
