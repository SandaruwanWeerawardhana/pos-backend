"use client";

import { useEffect, useMemo, useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import {
  createPurchaseOrder,
  listSuppliers,
  purchaseOrderTotalCents,
  searchProducts,
} from "@/lib/db";
import type { Product, PurchaseOrderLine, Supplier } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useSettings } from "@/lib/hooks/use-settings";
import { parseMoneyToCents } from "@/lib/format";
import { ROUTES } from "@/lib/types/routes";

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { money } = useSettings();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PurchaseOrderLine[]>([]);
  const [saving, setSaving] = useState(false);

  const [draftProductId, setDraftProductId] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("");
  const [draftCost, setDraftCost] = useState("");
  const [lineError, setLineError] = useState("");

  useEffect(() => {
    listSuppliers().then(setSuppliers);
    searchProducts("").then(setProducts);
  }, []);

  // Pre-fills the unit cost from the product's last known cost so a buyer only
  // has to type it when the price has actually changed.
  useEffect(() => {
    if (!draftProductId) return;
    const product = products.find((item) => item.id === draftProductId);
    if (product?.cost_cents) {
      setDraftCost((product.cost_cents / 100).toFixed(2));
    }
  }, [draftProductId, products]);

  const totalCents = useMemo(() => purchaseOrderTotalCents(lines), [lines]);

  function handleAddLine() {
    setLineError("");
    const product = products.find((item) => item.id === draftProductId);
    const quantity = Number(draftQuantity);
    const unitCost = parseMoneyToCents(draftCost);

    if (!product) {
      setLineError("Choose a product.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setLineError("Enter a quantity greater than zero.");
      return;
    }
    if (unitCost === null || unitCost < 0) {
      setLineError("Enter a valid unit cost.");
      return;
    }
    if (lines.some((line) => line.product_id === product.id)) {
      setLineError("That product is already on this order.");
      return;
    }

    setLines((current) => [
      ...current,
      {
        product_id: product.id,
        product_name: product.name,
        quantity_ordered: quantity,
        quantity_received: 0,
        unit_cost_cents: unitCost,
      },
    ]);
    setDraftProductId("");
    setDraftQuantity("");
    setDraftCost("");
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const supplier = suppliers.find((item) => item.id === supplierId);
    if (!supplier) {
      showToast("Choose a supplier", "error");
      return;
    }
    if (lines.length === 0) {
      showToast("Add at least one line", "error");
      return;
    }

    setSaving(true);
    try {
      const order = await createPurchaseOrder({
        supplierId: supplier.id,
        supplierName: supplier.name,
        lines,
        status: "ordered",
        expectedAt: expectedAt ? new Date(expectedAt).getTime() : undefined,
        notes: notes.trim() || undefined,
      });
      showToast(`Purchase order ${order.reference} created`, "success");
      router.push(ROUTES.purchases.detail(order.id));
    } catch {
      showToast("Failed to create purchase order", "error");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        eyebrow="Supply"
        title="New purchase order"
        description="Build an order, then book the goods in when the delivery arrives."
        breadcrumbs={[
          { label: "Purchases", href: ROUTES.purchases.root },
          { label: "New order" },
        ]}
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Card>
          <SectionHeader title="Order details" />
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Select
              label="Supplier"
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              placeholder="Choose a supplier"
              options={suppliers.map((supplier) => ({
                value: supplier.id,
                label: supplier.name,
              }))}
              required
            />
            <Input
              label="Expected delivery"
              type="date"
              value={expectedAt}
              onChange={(event) => setExpectedAt(event.target.value)}
            />
            <Input
              label="Notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional"
            />
          </div>
          {suppliers.length === 0 && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
              No suppliers yet — add one on the Suppliers page first.
            </p>
          )}
        </Card>

        <Card>
          <SectionHeader title="Order lines" />
          <div className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
            <Select
              label="Product"
              value={draftProductId}
              onChange={(event) => setDraftProductId(event.target.value)}
              placeholder="Choose a product"
              options={products.map((product) => ({
                value: product.id,
                label: `${product.name} (${product.stock_quantity} in stock)`,
              }))}
            />
            <Input
              label="Quantity"
              type="number"
              min="0"
              step="any"
              value={draftQuantity}
              onChange={(event) => setDraftQuantity(event.target.value)}
            />
            <Input
              label="Unit cost"
              type="number"
              min="0"
              step="0.01"
              value={draftCost}
              onChange={(event) => setDraftCost(event.target.value)}
            />
            <Button type="button" variant="outline" onClick={handleAddLine}>
              <Plus size={16} />
              Add
            </Button>
          </div>
          {lineError && (
            <p className="mt-2 text-xs text-error" role="alert">
              {lineError}
            </p>
          )}

          {lines.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {lines.map((line, index) => (
                <li
                  key={line.product_id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant px-3 py-2.5 text-sm dark:border-zinc-800"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-on-surface dark:text-zinc-100">
                      {line.product_name}
                    </span>
                    <span className="block text-xs text-on-surface-variant dark:text-zinc-400">
                      {line.quantity_ordered} × {money(line.unit_cost_cents)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums text-on-surface dark:text-zinc-50">
                      {money(line.unit_cost_cents * line.quantity_ordered)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${line.product_name}`}
                      onClick={() =>
                        setLines((current) =>
                          current.filter((_, position) => position !== index),
                        )
                      }
                      className="rounded p-1 text-on-surface-variant transition-colors hover:text-error"
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-outline-variant pt-4 dark:border-zinc-800">
            <span className="text-sm font-medium text-on-surface-variant dark:text-zinc-400">
              Order total
            </span>
            <span className="text-xl font-bold tabular-nums text-on-surface dark:text-zinc-50">
              {money(totalCents)}
            </span>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving || lines.length === 0}>
            <Save size={16} />
            {saving ? "Creating…" : "Create purchase order"}
          </Button>
        </div>
      </form>
    </div>
  );
}
