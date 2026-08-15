"use client";

import Link from "next/link";
import type { PluginFieldValues } from "@/components/plugin-slots/PluginProductForm";
import { BasicInformationSection } from "@/components/products/BasicInformationSection";
import { InventorySection } from "@/components/products/InventorySection";
import { OnThisPageNav } from "@/components/products/OnThisPageNav";
import { PricingSection } from "@/components/products/PricingSection";
import { ProductFormSkeleton } from "@/components/products/ProductFormSkeleton";
import { ProductSummaryPanel } from "@/components/products/ProductSummaryPanel";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { getProduct, updateProduct } from "@/lib/db";
import type { Product } from "@/lib/types";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { useKeyboardShortcuts } from "@/lib/hooks/use-keyboard-shortcuts";
import { useProductCatalogueOptions } from "@/lib/hooks/use-product-catalogue-options";
import { useProductDuplicates } from "@/lib/hooks/use-product-duplicates";
import { useUnsavedChanges } from "@/lib/hooks/use-unsaved-changes";
import {
  DEFAULT_PRODUCT_FORM_VALUES,
  fromProduct,
  productFormSchema,
  toProduct,
  type ProductFormValues,
} from "@/lib/products/schema";
import { ROUTES } from "@/lib/types/routes";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  CloudUpload,
  Database,
  FileText,
  HeartPulse,
  History,
  Info,
  MapPin,
  Package,
  Save,
  ShieldCheck,
  ShoppingBag,
  Tags,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Suspense, lazy, use, useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";

/**
 * Below-the-fold sections are code-split: a cashier adding a quick line often
 * never opens Media or Pharmacy, so their bundles should not block the first
 * paint of the fields everyone fills in.
 */
const MediaSection = lazy(() =>
  import("@/components/products/MediaSection").then((module) => ({
    default: module.MediaSection,
  })),
);
const WarrantySection = lazy(() =>
  import("@/components/products/WarrantySection").then((module) => ({
    default: module.WarrantySection,
  })),
);
const OpeningStockSection = lazy(() =>
  import("@/components/products/OpeningStockSection").then((module) => ({
    default: module.OpeningStockSection,
  })),
);
const LocationSection = lazy(() =>
  import("@/components/products/LocationSection").then((module) => ({
    default: module.LocationSection,
  })),
);
const OptionsSection = lazy(() =>
  import("@/components/products/OptionsSection").then((module) => ({
    default: module.OptionsSection,
  })),
);
const PharmacySection = lazy(() =>
  import("@/components/products/PharmacySection").then((module) => ({
    default: module.PharmacySection,
  })),
);

/**
 * Drives both the jump list and the per-section issue counts, so a section
 * cannot appear in one and not the other. `fields` are the form fields whose
 * errors belong to that section; record fields (opening stock, locations) are
 * counted separately because their errors are keyed by warehouse id.
 */
const SECTIONS: {
  id: string;
  label: string;
  icon: ReactNode;
  fields: (keyof ProductFormValues)[];
}[] = [
  {
    id: "basic-information",
    label: "Basic Information",
    icon: <FileText size={15} />,
    fields: [
      "name",
      "barcode_symbology",
      "barcode",
      "barcode_source",
      "sku",
      "category",
      "subcategory",
      "brand",
      "description",
    ],
  },
  {
    id: "images",
    label: "Product images gallery",
    icon: <Upload size={15} />,
    fields: ["images"],
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: <Package size={15} />,
    fields: [
      "product_type",
      "unit",
      "sale_unit",
      "purchase_unit",
      "stock_alert",
      "weight",
      "length",
      "width",
      "height",
    ],
  },
  {
    id: "pricing",
    label: "Pricing And Tax",
    icon: <Tags size={15} />,
    fields: [
      "cost_price",
      "selling_price",
      "wholesale_price",
      "min_selling_price",
      "tax_rate",
      "tax_type",
      "discount_type",
      "discount_value",
      "points",
    ],
  },
  {
    id: "warranty",
    label: "Warranty & Guarantee Tracking",
    icon: <ShieldCheck size={15} />,
    fields: ["warranty_period", "warranty_unit", "warranty_terms"],
  },
  {
    id: "opening-stock",
    label: "Opening Stock",
    icon: <ShoppingBag size={15} />,
    fields: ["opening_stock"],
  },
  {
    id: "location",
    label: "Internal Location (Rack/Shelf)",
    icon: <MapPin size={15} />,
    fields: ["rack_locations"],
  },
  {
    id: "options",
    label: "Options",
    icon: <Database size={15} />,
    fields: [],
  },
  {
    id: "pharmacy",
    label: "Pharmacy Settings",
    icon: <HeartPulse size={15} />,
    fields: [
      "generic_name",
      "strength",
      "dosage_form",
      "pack_size",
      "manufacturer",
      "drug_schedule",
      "expiry_date",
      "manufacturing_date",
    ],
  },
];

function SectionFallback() {
  return <Skeleton className="h-20 w-full rounded-2xl" />;
}

export default function ProductEditPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const draftKey = `pos:draft:product-edit:${id}`;

  const [product, setProduct] = useState<Product | null | undefined>(undefined);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: DEFAULT_PRODUCT_FORM_VALUES,
    mode: "onBlur",
    reValidateMode: "onChange",
  });
  const { control, formState, handleSubmit, reset, setError, setFocus } = form;

  const [saving, setSaving] = useState(false);
  const [pluginValues, setPluginValues] = useState<PluginFieldValues>({});

  useEffect(() => {
    getProduct(id).then((found) => {
      setProduct(found ?? null);
      if (found) {
        reset(fromProduct(found));
        setPluginValues(found.plugin_data ?? {});
      }
    });
  }, [id, reset]);
  const [draftPromptOpen, setDraftPromptOpen] = useState(true);

  const values = useWatch({ control }) as ProductFormValues;
  const options = useProductCatalogueOptions();
  const duplicates = useProductDuplicates(values.sku ?? "", values.barcode ?? "", id);

  const dirty = formState.isDirty && !saving;
  const draft = useFormDraft<ProductFormValues>(draftKey, values, {
    enabled: dirty,
  });
  const guard = useUnsavedChanges(dirty);

  const errors = formState.errors;
  const navSections = useMemo(
    () =>
      SECTIONS.map((section) => ({
        id: section.id,
        label: section.label,
        icon: section.icon,
        errorCount: section.fields.reduce((total, field) => {
          const entry = errors[field];
          if (!entry) return total;
          // Record fields hold one error per warehouse rather than one message.
          if (field === "opening_stock" || field === "rack_locations") {
            return total + Object.keys(entry).length;
          }
          return total + 1;
        }, 0),
      })),
    [errors],
  );
  const errorCount = navSections.reduce(
    (total, section) => total + section.errorCount,
    0,
  );
  const errorsFor = (sectionId: string) =>
    navSections.find((section) => section.id === sectionId)?.errorCount ?? 0;

  const onSubmit = handleSubmit(
    async (submitted) => {
      if (duplicates.skuTaken) {
        setError("sku", { type: "manual", message: "SKU already exists" });
        setFocus("sku");
        return;
      }
      if (duplicates.barcodeTaken) {
        setError("barcode", {
          type: "manual",
          message: "Product code already exists",
        });
        setFocus("barcode");
        return;
      }

      setSaving(true);
      try {
        const updated = toProduct(submitted, id);
        await updateProduct(
          id,
          Object.keys(pluginValues).length > 0
            ? { ...updated, plugin_data: pluginValues }
            : updated,
        );
        draft.discard();
        await queryClient.invalidateQueries({ queryKey: ["product-options"] });
        showToast(`${updated.name} saved`, "success");
        router.push(ROUTES.products);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to save product";
        if (message.includes("SKU")) setError("sku", { type: "manual", message });
        if (message.includes("Barcode")) {
          setError("barcode", { type: "manual", message });
        }
        showToast(message, "error");
        setSaving(false);
      }
    },
    () => showToast("Some fields need attention before saving", "error"),
  );

  useKeyboardShortcuts([
    { key: "s", ctrl: true, label: "Save product", handler: () => void onSubmit() },
  ]);

  const showDraftBanner =
    draftPromptOpen && draft.restored !== null && !formState.isDirty;

  if (product === null) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader
          title="Edit product"
          breadcrumbs={[
            { label: "Products", href: ROUTES.products },
            { label: "Edit product" },
          ]}
        />
        <EmptyState
          icon={<Package size={22} />}
          title="Product not found"
          description="It may have been deleted on this device or on another till."
          action={
            <Link
              href={ROUTES.products}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-secondary px-3 text-xs font-medium text-on-secondary dark:bg-white dark:text-zinc-900"
            >
              Back to products
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-28 lg:pb-8">
      <PageHeader
        eyebrow="Product management"
        title="Edit product"
        breadcrumbs={[
          { label: "Dashboard", href: ROUTES.dashboard },
          { label: "Products", href: ROUTES.products },
          { label: "Edit product" },
        ]}
      />

      {showDraftBanner && draft.restored && (
        <div className="flex flex-col gap-3 rounded-2xl border border-secondary/40 bg-secondary/5 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-blue-500/40 dark:bg-blue-500/10">
          <p className="flex items-center gap-2 text-sm text-on-surface dark:text-zinc-100">
            <History size={16} aria-hidden className="shrink-0" />
            Unsaved draft from{" "}
            {new Date(draft.restored.savedAt).toLocaleString()} found.
          </p>
          <span className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                reset(draft.restored?.values ?? DEFAULT_PRODUCT_FORM_VALUES, {
                  keepDirty: true,
                });
                setDraftPromptOpen(false);
                showToast("Draft restored", "info");
              }}
            >
              Restore draft
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                draft.discard();
                setDraftPromptOpen(false);
              }}
            >
              Discard
            </Button>
          </span>
        </div>
      )}

      {product === undefined || options.loading ? (
        <ProductFormSkeleton />
      ) : (
        <form
          onSubmit={onSubmit}
          noValidate
          className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
        >
          {/* One card per section, each collapsible on its own: a grocery
              product fills three of these and a pharmacy line fills nine, so
              folding the ones you are not using is what keeps the page
              workable on a tablet. */}
          <div className="flex min-w-0 flex-col gap-4">
            <BasicInformationSection
              form={form}
              options={options}
              duplicates={duplicates}
              errorCount={errorsFor("basic-information")}
            />
            <Suspense fallback={<SectionFallback />}>
              <MediaSection form={form} errorCount={errorsFor("images")} />
            </Suspense>
            <InventorySection
              form={form}
              errorCount={errorsFor("inventory")}
              productUnits={options.productUnits}
            />
            <PricingSection form={form} errorCount={errorsFor("pricing")} />
            <Suspense fallback={<SectionFallback />}>
              <WarrantySection form={form} errorCount={errorsFor("warranty")} />
            </Suspense>
            <Suspense fallback={<SectionFallback />}>
              <OpeningStockSection
                form={form}
                warehouses={options.warehouses}
                errorCount={errorsFor("opening-stock")}
              />
            </Suspense>
            <Suspense fallback={<SectionFallback />}>
              <LocationSection
                form={form}
                warehouses={options.warehouses}
                locations={options.locations}
                errorCount={errorsFor("location")}
              />
            </Suspense>
            <Suspense fallback={<SectionFallback />}>
              <OptionsSection
                form={form}
                pluginValues={pluginValues}
                onPluginChange={(key, value) =>
                  setPluginValues((current) => ({ ...current, [key]: value }))
                }
              />
            </Suspense>
            <Suspense fallback={<SectionFallback />}>
              <PharmacySection form={form} errorCount={errorsFor("pharmacy")} />
            </Suspense>

            {/* Sticky rather than fixed so it rides the bottom of the viewport
                while the long form scrolls behind it, at every width, and
                still comes to rest inside the content column. */}
            <div className="sticky bottom-0 z-40 -mx-1 flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-elevated backdrop-blur-md sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900/95">
              <p className="flex items-center gap-2 text-xs text-on-surface-variant dark:text-zinc-400">
                {errorCount > 0 ? (
                  <>
                    <Info size={14} aria-hidden className="text-error" />
                    <output className="text-error">
                      {errorCount} field{errorCount === 1 ? "" : "s"} need
                      attention
                    </output>
                  </>
                ) : (
                  <>
                    <CloudUpload size={14} aria-hidden />
                    {draft.savedAt
                      ? `Draft saved ${new Date(draft.savedAt).toLocaleTimeString()}`
                      : "Review the form, then save your changes."}
                  </>
                )}
              </p>
              <span className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => guard.requestNavigation(ROUTES.products)}
                  disabled={saving}
                  className="flex-1 sm:flex-none"
                >
                  <X size={17} />
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  disabled={saving}
                  className="flex-[2] sm:flex-none"
                >
                  <Save size={17} />
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </span>
            </div>
          </div>

          <aside className="hidden lg:sticky lg:top-20 lg:flex lg:h-fit lg:flex-col lg:gap-4">
            <OnThisPageNav sections={navSections} />
            <ProductSummaryPanel values={values} />
          </aside>
        </form>
      )}

      <ConfirmDialog
        open={guard.pendingHref !== null}
        title="Leave without saving?"
        message="This product has unsaved changes. A draft is kept on this device, but nothing has been saved yet."
        confirmLabel="Leave page"
        cancelLabel="Keep editing"
        destructive
        onConfirm={guard.confirmNavigation}
        onCancel={guard.cancelNavigation}
      />
    </div>
  );
}
