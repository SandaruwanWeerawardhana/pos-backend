"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Copy,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Package,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  addProduct,
  deleteProduct,
  listBrands,
  listCategories,
  searchProducts,
} from "@/lib/db";
import type { Product, ProductType } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useSettings } from "@/lib/hooks/use-settings";
import { exportExcel, exportPdf, type ExportColumn } from "@/lib/export";
import { generateBarcode, generateSku } from "@/lib/products/generate";
import { ROUTES } from "@/lib/types/routes";

/*
 * Short labels for the table; the full wording lives in PRODUCT_TYPE_OPTIONS
 * and is too long for a column this narrow.
 */
const TYPE_LABELS: Record<ProductType, string> = {
  standard: "Single",
  variable: "Variable",
  service: "Service",
  combo: "Combo",
};

const ACTION_BUTTON_CLASSES =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-outline-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-700";

type ProductColumnsParams = Readonly<{
  lowStockThreshold: number;
  money: (amount: number) => string;
  onDelete: (product: Product) => void;
  onDuplicate: (product: Product) => void;
}>;

const PRODUCT_EXPORT_COLUMNS: ExportColumn<Product>[] = [
  { key: "name", header: "Name", value: (product) => product.name },
  {
    key: "type",
    header: "Type",
    value: (product) => TYPE_LABELS[product.product_type ?? "standard"],
  },
  { key: "code", header: "Code", value: (product) => product.barcode },
  { key: "sku", header: "SKU", value: (product) => product.sku },
  { key: "brand", header: "Brand", value: (product) => product.brand ?? "" },
  {
    key: "category",
    header: "Category",
    value: (product) => product.category ?? "",
  },
  {
    key: "cost",
    header: "Cost",
    value: (product) => ((product.cost_cents ?? 0) / 100).toFixed(2),
  },
  {
    key: "price",
    header: "Price",
    value: (product) => (product.price_cents / 100).toFixed(2),
  },
  { key: "unit", header: "Unit", value: (product) => product.unit ?? "pc" },
  {
    key: "stock",
    header: "Quantity",
    value: (product) => product.stock_quantity,
  },
];

function createSelectOptions(names: string[]) {
  return names.map((name) => ({ value: name, label: name }));
}

function filterProductsByFacets(
  products: Product[],
  category: string,
  brand: string,
) {
  return products.filter((product) => {
    if (category && (product.category ?? "Uncategorised") !== category) {
      return false;
    }
    if (brand && product.brand !== brand) return false;
    return true;
  });
}

function selectProductsByIds(products: Product[], selectedIds: string[]) {
  return products.filter((product) => selectedIds.includes(product.id));
}

function removeProductsFromSelection(
  selectedIds: string[],
  productsToRemove: Product[],
) {
  const removedIds = new Set(productsToRemove.map((product) => product.id));
  return selectedIds.filter((id) => !removedIds.has(id));
}

/*
 * Barcodes run 8-14 digits and only crowd the table; the cell shows the first
 * six with the full code on hover, and the Product Details page prints it whole.
 */
function shortCode(code: string) {
  return code.length > 6 ? `${code.slice(0, 6)}…` : code;
}

function getProductStockTone(product: Product, lowStockThreshold: number) {
  const threshold = product.reorder_level ?? lowStockThreshold;

  if (product.stock_quantity <= 0) return "text-error dark:text-red-400";
  if (product.stock_quantity <= threshold) {
    return "text-amber-600 dark:text-amber-400";
  }
  return "text-on-surface dark:text-zinc-50";
}

function ProductThumbnail({ product }: Readonly<{ product: Product }>) {
  const source = product.image_url ?? product.images?.[0];

  if (!source) {
    return (
      <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-outline-variant bg-white text-on-surface-variant dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
        <Package size={18} aria-hidden />
      </span>
    );
  }

  return (
    /* Supplier URLs and data URLs both land here, so a plain <img> skips
       next/image's remote-host allowlist. */
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={source}
      alt=""
      loading="lazy"
      className="h-12 w-12 rounded-lg border border-outline-variant bg-white object-cover dark:border-zinc-700"
    />
  );
}

function createProductColumns({
  lowStockThreshold,
  money,
  onDelete,
  onDuplicate,
}: ProductColumnsParams): DataColumn<Product>[] {
  return [
    {
      key: "image",
      header: "Image",
      render: (product) => <ProductThumbnail product={product} />,
    },
    {
      key: "type",
      header: "Type",
      hideOnMobile: true,
      sortValue: (product) => TYPE_LABELS[product.product_type ?? "standard"],
      render: (product) => (
        <span className="text-on-surface dark:text-zinc-50">
          {TYPE_LABELS[product.product_type ?? "standard"]}
        </span>
      ),
    },
    {
      key: "name",
      header: "Name",
      sortValue: (product) => product.name,
      render: (product) => (
        <Link
          href={ROUTES.productDetail(product.id)}
          className="font-medium text-amber-700 hover:underline dark:text-amber-400"
        >
          {product.name}
        </Link>
      ),
    },
    {
      key: "code",
      header: "Code",
      hideOnMobile: true,
      minWidth: "56px",
      sortValue: (product) => product.barcode,
      render: (product) => (
        <span
          title={product.barcode}
          className="whitespace-nowrap text-on-surface dark:text-zinc-50"
        >
          {shortCode(product.barcode)}
        </span>
      ),
    },
    {
      key: "brand",
      header: "Brand",
      hideOnMobile: true,
      sortValue: (product) => product.brand ?? "",
      render: (product) => (
        <span className="text-amber-700 dark:text-amber-400">
          {product.brand ?? "N/D"}
        </span>
      ),
    },
    {
      key: "category",
      header: "Category",
      hideOnMobile: true,
      sortValue: (product) => product.category ?? "",
      render: (product) => (
        <span className="text-amber-700 dark:text-amber-400">
          {product.category ?? "Uncategorised"}
        </span>
      ),
    },
    {
      key: "cost",
      header: "Cost",
      hideOnMobile: true,
      minWidth: "90px",
      sortValue: (product) => product.cost_cents ?? 0,
      render: (product) => (
        <span className="text-on-surface dark:text-zinc-50">
          {product.cost_cents ? money(product.cost_cents) : "—"}
        </span>
      ),
    },
    {
      key: "price",
      header: "Price",
      minWidth: "90px",
      sortValue: (product) => product.price_cents,
      render: (product) => (
        <span className="font-medium text-on-surface dark:text-zinc-50">
          {money(product.price_cents)}
        </span>
      ),
    },
    {
      key: "unit",
      header: "Unit",
      hideOnMobile: true,
      sortValue: (product) => product.unit ?? "pc",
      render: (product) => (
        <span className="text-on-surface dark:text-zinc-50">
          {product.unit ?? "pc"}
        </span>
      ),
    },
    {
      key: "quantity",
      header: "Quantity",
      minWidth: "110px",
      sortValue: (product) => product.stock_quantity,
      render: (product) => (
        <span
          className={`font-medium ${getProductStockTone(
            product,
            lowStockThreshold,
          )}`}
        >
          {product.stock_quantity.toFixed(2)} {product.unit ?? "pc"}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (product) => (
        <span className="flex items-center gap-1.5">
          <Link
            href={ROUTES.productDetail(product.id)}
            aria-label={`View ${product.name}`}
            title="View"
            className={`${ACTION_BUTTON_CLASSES} text-secondary hover:bg-surface-container dark:text-blue-400 dark:hover:bg-zinc-800`}
          >
            <Eye size={15} aria-hidden />
          </Link>
          <Link
            href={ROUTES.productEdit(product.id)}
            aria-label={`Edit ${product.name}`}
            title="Edit"
            className={`${ACTION_BUTTON_CLASSES} text-emerald-600 hover:bg-surface-container dark:text-emerald-400 dark:hover:bg-zinc-800`}
          >
            <Pencil size={15} aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => onDuplicate(product)}
            aria-label={`Duplicate ${product.name}`}
            title="Duplicate"
            className={`${ACTION_BUTTON_CLASSES} text-amber-600 hover:bg-surface-container dark:text-amber-400 dark:hover:bg-zinc-800`}
          >
            <Copy size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onDelete(product)}
            aria-label={`Delete ${product.name}`}
            title="Delete"
            className={`${ACTION_BUTTON_CLASSES} text-error hover:bg-surface-container dark:text-red-400 dark:hover:bg-zinc-800`}
          >
            <X size={15} aria-hidden />
          </button>
        </span>
      ),
    },
  ];
}

export default function ProductsPage() {
  const { money, settings } = useSettings();
  const { showToast } = useToast();

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /* Either one product (row action) or the current selection (bulk action). */
  const [pendingDelete, setPendingDelete] = useState<Product[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  function reload() {
    searchProducts(query).then(setProducts);
  }

  function reloadFacets() {
    listCategories().then(setCategories);
    listBrands().then(setBrands);
  }

  useEffect(() => {
    listCategories().then(setCategories);
    listBrands().then(setBrands);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      searchProducts(query).then(setProducts);
    }, 200);
    return () => window.clearTimeout(timeoutId);
  }, [query]);

  const visible = filterProductsByFacets(products, category, brand);
  const selectedProducts = selectProductsByIds(visible, selectedIds);
  const categoryOptions = createSelectOptions(categories);
  const brandOptions = createSelectOptions(brands);

  async function duplicateProduct(product: Product) {
    /*
     * A duplicate starts empty of stock and carries fresh identifiers: SKU and
     * barcode are unique in Dexie, and copied batches would claim stock the new
     * row does not have.
     */
    const copy: Product = {
      ...product,
      id: crypto.randomUUID(),
      name: `${product.name} (copy)`,
      sku: generateSku({
        name: product.name,
        category: product.category,
        brand: product.brand,
      }),
      barcode: generateBarcode(),
      barcode_source: "generated",
      stock_quantity: 0,
      batches: undefined,
      opening_stock: undefined,
      _pending_update: undefined,
    };

    try {
      await addProduct(copy);
      showToast(`Duplicated ${product.name}`, "success");
      reload();
      reloadFacets();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not duplicate product",
        "error",
      );
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      for (const product of pendingDelete) {
        await deleteProduct(product.id);
      }
      showToast(
        pendingDelete.length === 1
          ? `Deleted ${pendingDelete[0].name}`
          : `Deleted ${pendingDelete.length} products`,
        "success",
      );
      setSelectedIds((current) =>
        removeProductsFromSelection(current, pendingDelete),
      );
      setPendingDelete(null);
      reload();
      reloadFacets();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not delete product",
        "error",
      );
    } finally {
      setDeleting(false);
    }
  }

  const columns = createProductColumns({
    lowStockThreshold: settings.low_stock_threshold,
    money,
    onDelete: (product) => setPendingDelete([product]),
    onDuplicate: duplicateProduct,
  });

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        title="All Products"
        breadcrumbs={[
          { label: "Dashboard", href: ROUTES.dashboard },
          { label: "Products" },
          { label: "All Products" },
        ]}
      />

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative lg:w-72">
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant dark:text-zinc-500"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this table"
              aria-label="Search products"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Filter size={15} />
              Filter
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                exportPdf("All Products", visible, PRODUCT_EXPORT_COLUMNS)
              }
            >
              <FileText size={15} />
              PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                exportExcel(
                  "products",
                  "All Products",
                  visible,
                  PRODUCT_EXPORT_COLUMNS,
                )
              }
            >
              <FileSpreadsheet size={15} />
              EXCEL
            </Button>
            <Link
              href={ROUTES.productsNew}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-secondary px-3 text-xs font-medium text-on-secondary transition-all duration-[var(--duration-fast)] hover:bg-secondary/90 dark:bg-white dark:text-zinc-900"
            >
              <Plus size={15} />
              Create
            </Link>
          </div>
        </div>

        {filtersOpen && (
          <div className="animate-fade-in grid gap-3 rounded-xl border border-outline-variant p-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-zinc-800">
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="All categories"
              aria-label="Filter by category"
              options={categoryOptions}
            />
            <Select
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              placeholder="All brands"
              aria-label="Filter by brand"
              options={brandOptions}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setCategory("");
                setBrand("");
              }}
              className="justify-self-start"
            >
              Clear filters
            </Button>
          </div>
        )}

        {selectedProducts.length > 0 && (
          <div className="animate-fade-in flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <span className="text-on-surface-variant dark:text-zinc-400">
              {selectedProducts.length} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds([])}
              >
                Clear
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setPendingDelete(selectedProducts)}
              >
                Delete selected
              </Button>
            </div>
          </div>
        )}

        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(product) => product.id}
          emptyMessage="No products match these filters."
          caption="All products"
          pageSizeOptions={[10, 25, 50]}
          selection={{ selectedIds, onChange: setSelectedIds }}
        />
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete && pendingDelete.length > 1
            ? "Delete products"
            : "Delete product"
        }
        message={
          pendingDelete && pendingDelete.length > 1
            ? `Delete ${pendingDelete.length} products? They leave the till and every report immediately.`
            : `Delete ${pendingDelete?.[0]?.name ?? "this product"}? It leaves the till and every report immediately.`
        }
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
