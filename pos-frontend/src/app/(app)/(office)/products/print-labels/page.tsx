"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Inbox,
  Package,
  Power,
  Printer,
  QrCode,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { listWarehouses, searchProducts } from "@/lib/db";
import type { Product, Warehouse } from "@/lib/types";
import { BarcodeScanner } from "@/components/hardware/BarcodeScanner";
import { Button } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { useSettings } from "@/lib/hooks/use-settings";
import { LABEL_PAPER_SIZES, printLabelSheet } from "@/lib/products/labels";
import { ROUTES } from "@/lib/types/routes";

interface SelectedLabel {
  product: Product;
  quantity: number;
}

function CardHeader({
  icon,
  title,
  action,
}: Readonly<{ icon: ReactNode; title: string; action?: ReactNode }>) {
  return (
    <div className="-mx-5 -mt-5 mb-4 flex items-center justify-between gap-3 rounded-t-2xl border-b border-outline-variant bg-surface-container-low px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface dark:text-zinc-100">
        {icon}
        {title}
      </h2>
      {action}
    </div>
  );
}

function ToggleOption({
  label,
  checked,
  onChange,
}: Readonly<{ label: string; checked: boolean; onChange: (value: boolean) => void }>) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg bg-surface-container-low px-3.5 dark:bg-zinc-800/60">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 cursor-pointer rounded border-outline-variant accent-secondary dark:border-zinc-700 dark:accent-blue-500"
      />
      <span className="text-sm font-medium text-on-surface dark:text-zinc-100">
        {label}
      </span>
    </label>
  );
}

export default function PrintLabelsPage() {
  const { money } = useSettings();
  const { showToast } = useToast();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [paperSize, setPaperSize] = useState("");
  const [displayPrice, setDisplayPrice] = useState(true);
  const [autoPrint, setAutoPrint] = useState(true);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<SelectedLabel[]>([]);

  useEffect(() => {
    listWarehouses().then(setWarehouses);
  }, []);

  useEffect(() => {
    if (!query.trim()) return;
    const timeoutId = window.setTimeout(() => {
      searchProducts(query).then((products) => setResults(products.slice(0, 8)));
    }, 200);
    return () => window.clearTimeout(timeoutId);
  }, [query]);

  function printOne(product: Product) {
    printLabelSheet(
      [
        {
          name: product.name,
          barcode: product.barcode,
          symbology: product.barcode_symbology ?? "CODE128",
          priceCents: product.price_cents,
          quantity: 1,
        },
      ],
      { displayPrice, money, paperSize },
    );
  }

  function addProduct(product: Product) {
    setSelected((current) => {
      const exists = current.some((line) => line.product.id === product.id);
      if (exists) {
        return current.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }
      return [...current, { product, quantity: 1 }];
    });
    setQuery("");
    setResults([]);
    if (autoPrint) printOne(product);
  }

  async function handleScan(code: string) {
    const matches = await searchProducts(code);
    const exact = matches.find(
      (product) => product.barcode.toLowerCase() === code.trim().toLowerCase(),
    );
    if (exact) {
      addProduct(exact);
      setScanning(false);
    } else if (matches.length === 1) {
      addProduct(matches[0]);
      setScanning(false);
    } else {
      showToast(`No exact match for "${code}"`, "warning");
    }
  }

  function updateQuantity(productId: string, quantity: number) {
    setSelected((current) =>
      current.map((line) =>
        line.product.id === productId
          ? { ...line, quantity: Math.max(1, quantity) }
          : line,
      ),
    );
  }

  function removeLine(productId: string) {
    setSelected((current) => current.filter((line) => line.product.id !== productId));
  }

  function printAll() {
    if (!warehouseId) {
      showToast("Choose a warehouse first", "warning");
      return;
    }
    if (selected.length === 0) {
      showToast("Add at least one product", "warning");
      return;
    }
    printLabelSheet(
      selected.map((line) => ({
        name: line.product.name,
        barcode: line.product.barcode,
        symbology: line.product.barcode_symbology ?? "CODE128",
        priceCents: line.product.price_cents,
        quantity: line.quantity,
      })),
      { displayPrice, money, paperSize },
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        title="Print Labels"
        breadcrumbs={[
          { label: "Dashboard", href: ROUTES.dashboard },
          { label: "Products", href: ROUTES.products },
          { label: "Print Labels" },
        ]}
      />

      <Card>
        <CardHeader icon={<SlidersHorizontal size={16} />} title="Configuration" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={
              <>
                Warehouse<span className="text-error"> *</span>
              </>
            }
            placeholder="Choose Warehouse"
            options={warehouses.map((warehouse) => ({
              value: warehouse.id,
              label: warehouse.name,
            }))}
            value={warehouseId}
            onChange={(event) => setWarehouseId(event.target.value)}
          />
          <Select
            label="Paper size"
            placeholder="Paper size"
            options={LABEL_PAPER_SIZES}
            value={paperSize}
            onChange={(event) => setPaperSize(event.target.value)}
          />
          <ToggleOption label="Display Price" checked={displayPrice} onChange={setDisplayPrice} />
          <ToggleOption label="Auto Print" checked={autoPrint} onChange={setAutoPrint} />
        </div>
      </Card>

      <Card className="relative">
        <CardHeader icon={<Search size={16} />} title="Product Name" />
        <div className="flex overflow-hidden rounded-lg border border-outline-variant dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setScanning(true)}
            aria-label="Scan barcode"
            title="Scan barcode"
            className="flex min-h-11 w-12 shrink-0 items-center justify-center bg-secondary text-on-secondary transition-colors hover:bg-secondary/90 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-500/90"
          >
            <QrCode size={18} aria-hidden />
          </button>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Scan/Search Product by Code Or Name"
            aria-label="Search product by code or name"
            className="min-h-11 flex-1 border-0 bg-surface-container-lowest px-3 text-sm text-on-surface outline-none placeholder:text-on-surface-variant dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500"
          />
        </div>

        {query.trim() && results.length > 0 && (
          <ul className="animate-fade-in absolute inset-x-5 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-popover dark:border-zinc-700 dark:bg-zinc-900">
            {results.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => addProduct(product)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-container-low dark:hover:bg-zinc-800"
                >
                  <span className="min-w-0 truncate text-on-surface dark:text-zinc-50">
                    {product.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-on-surface-variant dark:text-zinc-400">
                    {product.barcode}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          icon={<Package size={16} />}
          title="Selected Products"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelected([])}
              disabled={selected.length === 0}
            >
              <Power size={14} />
              Reset
            </Button>
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-outline-variant text-xs uppercase tracking-wide text-on-surface-variant dark:border-zinc-800 dark:text-zinc-400">
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Product Name
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Code Product
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Quantity
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50 dark:divide-zinc-800">
              {selected.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center">
                    <span className="flex flex-col items-center gap-2 text-sm text-on-surface-variant dark:text-zinc-400">
                      <Inbox size={20} aria-hidden />
                      No data Available
                    </span>
                  </td>
                </tr>
              )}
              {selected.map((line) => (
                <tr key={line.product.id}>
                  <td className="px-4 py-3 text-on-surface dark:text-zinc-50">
                    {line.product.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-on-surface-variant dark:text-zinc-400">
                    {line.product.barcode}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(event) =>
                        updateQuantity(line.product.id, Number(event.target.value))
                      }
                      className="w-20 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-sm text-on-surface outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => removeLine(line.product.id)}
                      aria-label={`Remove ${line.product.name}`}
                      title="Remove"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-outline-variant text-error transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:scale-105 hover:bg-surface-container active:scale-95 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={printAll} disabled={selected.length === 0}>
            <Printer size={16} />
            Print Labels
          </Button>
        </div>
      </Card>

      <Modal
        open={scanning}
        onClose={() => setScanning(false)}
        title="Barcode Scanner"
        size="sm"
      >
        <div className="flex flex-col gap-3">
          <p aria-live="polite" className="text-xs text-on-surface-variant dark:text-zinc-400">
            Waiting for a scan — trigger the USB scanner, or use the camera.
          </p>
          <BarcodeScanner
            onScan={handleScan}
            autoStart
            onStop={() => setScanning(false)}
          />
        </div>
      </Modal>
    </div>
  );
}
