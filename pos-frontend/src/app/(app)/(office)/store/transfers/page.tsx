"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeftRight, Plus, Warehouse as WarehouseIcon } from "lucide-react";
import {
  createWarehouse,
  listStockMovements,
  listWarehouses,
  searchProducts,
  transferStock,
} from "@/lib/db";
import type { Product, StockMovement, Warehouse } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Card, PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format";
import { ROUTES } from "@/lib/types/routes";

export default function StockTransfersPage() {
  const { showToast } = useToast();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transfers, setTransfers] = useState<StockMovement[]>([]);

  const [productId, setProductId] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [warehouseName, setWarehouseName] = useState("");
  const [warehouseLocation, setWarehouseLocation] = useState("");

  async function refresh() {
    const [houses, found, out] = await Promise.all([
      listWarehouses(),
      searchProducts(""),
      listStockMovements({ type: "transfer_out" }),
    ]);
    setWarehouses(houses);
    setProducts(found);
    // Only the "out" leg is listed: every transfer writes a matched in/out
    // pair, so showing both would double every row.
    setTransfers(out);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const amount = Number(quantity);
    if (!productId || !fromId || !toId) {
      setError("Choose a product and both locations.");
      return;
    }
    if (fromId === toId) {
      setError("Source and destination must differ.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a quantity greater than zero.");
      return;
    }

    const product = products.find((item) => item.id === productId);
    if (product && amount > product.stock_quantity) {
      setError(`Only ${product.stock_quantity} in stock.`);
      return;
    }

    setSaving(true);
    try {
      await transferStock({
        productId,
        quantity: amount,
        fromWarehouseId: fromId,
        toWarehouseId: toId,
      });
      setQuantity("");
      await refresh();
      showToast("Transfer recorded", "success");
    } catch {
      showToast("Failed to record transfer", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateWarehouse() {
    if (!warehouseName.trim()) return;
    await createWarehouse({
      name: warehouseName.trim(),
      ...(warehouseLocation.trim() ? { location: warehouseLocation.trim() } : {}),
    });
    setWarehouseName("");
    setWarehouseLocation("");
    setWarehouseModalOpen(false);
    await refresh();
    showToast("Location added", "success");
  }

  const warehouseName_ = (id?: string) =>
    warehouses.find((house) => house.id === id)?.name ?? "—";

  const columns: DataColumn<StockMovement>[] = [
    {
      key: "date",
      header: "When",
      sortValue: (movement) => movement.created_at,
      render: (movement) => formatDateTime(movement.created_at),
    },
    {
      key: "product",
      header: "Product",
      sortValue: (movement) => movement.product_name,
      render: (movement) => movement.product_name,
    },
    {
      key: "from",
      header: "From",
      hideOnMobile: true,
      render: (movement) => warehouseName_(movement.warehouse_id),
    },
    {
      key: "quantity",
      header: "Quantity",
      align: "right",
      sortValue: (movement) => Math.abs(movement.quantity_delta),
      render: (movement) => String(Math.abs(movement.quantity_delta)),
    },
  ];

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        eyebrow="Stock control"
        title="Warehouse transfers"
        description="Move stock between the shop floor, stockroom, and any other location."
        breadcrumbs={[
          { label: "Inventory", href: ROUTES.inventory.root },
          { label: "Transfers" },
        ]}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWarehouseModalOpen(true)}
          >
            <Plus size={15} />
            Add location
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <SectionHeader title="New transfer" />
          <form onSubmit={handleTransfer} className="mt-4 flex flex-col gap-3">
            <Select
              label="Product"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              placeholder="Choose a product"
              options={products.map((product) => ({
                value: product.id,
                label: `${product.name} (${product.stock_quantity} in stock)`,
              }))}
            />
            <Select
              label="From"
              value={fromId}
              onChange={(event) => setFromId(event.target.value)}
              placeholder="Source location"
              options={warehouses.map((house) => ({
                value: house.id,
                label: house.name,
              }))}
            />
            <Select
              label="To"
              value={toId}
              onChange={(event) => setToId(event.target.value)}
              placeholder="Destination location"
              options={warehouses.map((house) => ({
                value: house.id,
                label: house.name,
              }))}
            />
            <Input
              label="Quantity"
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              error={error}
            />
            <Button type="submit" disabled={saving}>
              <ArrowLeftRight size={16} />
              {saving ? "Recording…" : "Record transfer"}
            </Button>
          </form>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <SectionHeader title="Locations" />
            <ul className="mt-3 flex flex-col gap-2">
              {warehouses.length === 0 && (
                <li className="text-sm text-on-surface-variant dark:text-zinc-400">
                  No locations yet.
                </li>
              )}
              {warehouses.map((house) => (
                <li
                  key={house.id}
                  className="flex items-center gap-2.5 rounded-lg border border-outline-variant px-3 py-2 text-sm dark:border-zinc-800"
                >
                  <WarehouseIcon
                    size={15}
                    className="text-on-surface-variant"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-on-surface dark:text-zinc-100">
                    {house.name}
                  </span>
                  <span className="text-xs text-on-surface-variant dark:text-zinc-400">
                    {house.location ?? (house.is_default ? "Default" : "")}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="flex flex-col gap-2">
            <SectionHeader title="Recent transfers" />
            <DataTable
              columns={columns}
              rows={transfers}
              rowKey={(movement) => movement.id}
              pageSize={10}
              emptyMessage="No transfers recorded yet."
              caption="Recent warehouse transfers"
            />
          </div>
        </div>
      </div>

      <Modal
        open={warehouseModalOpen}
        onClose={() => setWarehouseModalOpen(false)}
        title="Add location"
      >
        <div className="flex flex-col gap-3">
          <Input
            label="Name"
            value={warehouseName}
            onChange={(event) => setWarehouseName(event.target.value)}
            placeholder="Stockroom"
            autoFocus
          />
          <Input
            label="Location (optional)"
            value={warehouseLocation}
            onChange={(event) => setWarehouseLocation(event.target.value)}
            placeholder="Rear of store"
          />
          <Button
            type="button"
            onClick={handleCreateWarehouse}
            disabled={!warehouseName.trim()}
          >
            Save location
          </Button>
        </div>
      </Modal>
    </div>
  );
}
