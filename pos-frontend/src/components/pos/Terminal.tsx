"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { ProductSearch } from "./ProductSearch";
import { ProductGrid } from "./ProductGrid";
import { Cart } from "./Cart";
import { ALL_CATEGORIES, CategorySidebar } from "./CategorySidebar";
import { QuickActions } from "./QuickActions";
import { HoldModal } from "./HoldModal";
import { Receipt } from "./Receipt";
import { BarcodeScanner } from "@/components/hardware/BarcodeScanner";
import { ScaleDisplay } from "@/components/hardware/ScaleDisplay";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useCart } from "@/lib/hooks/use-cart";
import { useScale } from "@/lib/hooks/use-scale";
import { usePlugin } from "@/lib/hooks/use-plugin";
import { useSettings } from "@/lib/hooks/use-settings";
import { useKeyboardShortcuts } from "@/lib/hooks/use-keyboard-shortcuts";
import { useAuth } from "@/lib/hooks/use-auth";
import { useToast } from "@/components/ui/Toast";
import { computeDiscountCents } from "@/lib/cart-math";
import { createLocalOrder, searchProducts } from "@/lib/db";
import type {
  Discount,
  PaymentMethod,
  PaymentSplit,
  PendingOrder,
  Product,
} from "@/lib/types";

const emptySubscribe = () => () => {};

/**
 * True only after client hydration; false during SSR and the first client
 * render. Lets us gate localStorage-backed (persisted) UI without a mismatch.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function Terminal() {
  const [results, setResults] = useState<Product[]>([]);
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [selectedDiscount, setSelectedDiscount] = useState<Discount | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
 
  const [lastOrder, setLastOrder] = useState<PendingOrder | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const mounted = useHydrated();
  const router = useRouter();
  const cart = useCart();
  const { reading } = useScale();
  const { active: activePlugin } = usePlugin();
  const { money } = useSettings();
  const { user } = useAuth();
  const { showToast } = useToast();

  const previewSubtotal = cart.computeTotal(0).subtotal_cents;
  const discountCents = computeDiscountCents(
    selectedDiscount,
    cart.items,
    previewSubtotal,
  );
  const total = cart.computeTotal(discountCents);

  /**
   * Search results are the source list; the category rail narrows them rather
   * than issuing a second query, so filtering stays instant offline.
   */
  const visibleProducts = useMemo(
    () =>
      category === ALL_CATEGORIES
        ? results
        : results.filter(
            (product) => (product.category ?? "Uncategorised") === category,
          ),
    [results, category],
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const product of results) {
      const key = product.category ?? "Uncategorised";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [results]);

  async function handleAdd(product: Product) {
    const quantity = activePlugin?.computeAddQuantity
      ? activePlugin.computeAddQuantity({ product, scaleReading: reading })
      : 1;
    await cart.add(product, quantity);
  }

  async function handleBarcodeScan(code: string) {
    const matches = await searchProducts(code);
    const match = matches.find((product) => product.barcode === code) ?? matches[0];
    if (match) {
      await handleAdd(match);
      showToast(`Added ${match.name}`, "success");
    } else {
      showToast(`No product found for barcode ${code}`, "error");
    }
  }

  function handlePay(method: PaymentMethod) {
    if (submitting) return;
    if (cart.items.length === 0) {
      showToast("Cart is empty", "warning");
      return;
    }
    setCartSheetOpen(false);
    void handleConfirmPayment(method, [
      { method, amount_cents: total.total_cents },
    ]);
  }

  async function handleClearCart() {
    await cart.clear();
    setSelectedDiscount(null);
    showToast("Cart cleared", "success");
  }

  async function handleConfirmPayment(
    method: PaymentMethod,
    splits: PaymentSplit[],
  ) {
    setSubmitting(true);
    try {
      const order = await createLocalOrder(method, {
        discountCents: discountCents || undefined,
        payments: splits,
        cashierId: user?.id,
      });
      setLastOrder(order);
      setReceiptOpen(true);
      setSelectedDiscount(null);
      showToast("Sale completed", "success");
    } catch {
      showToast("Failed to complete sale", "error");
    } finally {
      setSubmitting(false);
    }
  }

  useKeyboardShortcuts([
    { key: "F2", label: "Pay", handler: () => handlePay("cash") },
    { key: "F4", label: "Hold / recall", handler: () => setHoldOpen(true) },
    { key: "F8", label: "Clear cart", handler: () => void handleClearCart() },
  ]);

  const cartPanel = (
    <Cart
      items={cart.items}
      total={total}
      discountCents={discountCents}
      onUpdateQuantity={cart.updateQuantity}
      onRemove={cart.remove}
      onHold={() => setHoldOpen(true)}
      onPay={handlePay}
      busy={submitting}
    />
  );

  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex h-full min-h-0 w-full gap-4 overflow-hidden bg-surface p-3 sm:p-4 dark:bg-zinc-950">
      <CategorySidebar
        totalCount={results.length}
        counts={categoryCounts}
        active={category}
        onSelect={setCategory}
      />

      {/* Product area */}
      <div className="relative flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-3 sm:gap-4">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="absolute left-0 top-0 z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:-translate-x-0.5 hover:text-on-surface active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-800 dark:bg-zinc-900 dark:hover:text-zinc-50"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="mx-auto flex w-full max-w-xl flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex-1">
            <ProductSearch onResults={setResults} />
          </div>
          <BarcodeScanner onScan={handleBarcodeScan} />
        </div>

        {/* Category chips — the rail is desktop-only, so narrow screens get the
            same filter as a horizontally scrolling strip. */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 xl:hidden">
          <CategoryChip
            label="All"
            count={results.length}
            active={category === ALL_CATEGORIES}
            onClick={() => setCategory(ALL_CATEGORIES)}
          />
          {Object.entries(categoryCounts).map(([name, count]) => (
            <CategoryChip
              key={name}
              label={name}
              count={count}
              active={category === name}
              onClick={() => setCategory(name)}
            />
          ))}
        </div>

        {mounted && activePlugin?.computeAddQuantity && <ScaleDisplay />}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ProductGrid products={visibleProducts} onAdd={handleAdd} />
        </div>

        <QuickActions
          onHold={() => setHoldOpen(true)}
          onClear={handleClearCart}
          onPrintLast={() => {
            if (lastOrder) {
              setReceiptOpen(true);
            } else {
              showToast("No completed sale to reprint yet", "warning");
            }
          }}
          disabled={cart.items.length === 0}
        />
      </div>

      {/* Checkout panel — desktop */}
      <div
        suppressHydrationWarning
        className="hidden h-full min-h-0 w-[360px] shrink-0 flex-col rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 lg:flex dark:border-zinc-800 dark:bg-zinc-900"
      >
        {cartPanel}
      </div>

      {/* Sticky checkout bar — phone and tablet-portrait, where the panel is
          hidden. Without this the cart is unreachable below `lg`. */}
      {itemCount > 0 && (
        <button
          type="button"
          onClick={() => setCartSheetOpen(true)}
          className="animate-fade-in-up fixed inset-x-3 bottom-3 z-40 flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-secondary px-5 text-on-secondary shadow-popover transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)] active:scale-[0.98] lg:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart size={18} aria-hidden />
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </span>
          <span
            key={total.total_cents}
            className="animate-scale-in text-lg font-bold tabular-nums"
          >
            {money(total.total_cents)}
          </span>
        </button>
      )}

      <Modal
        open={cartSheetOpen}
        onClose={() => setCartSheetOpen(false)}
        title="Cart"
        size="md"
      >
        <div className="flex max-h-[70dvh] min-h-0 flex-col">{cartPanel}</div>
      </Modal>

      <HoldModal
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        hasItemsInCart={cart.items.length > 0}
        onResumed={() => showToast("Cart resumed", "success")}
      />

      <Modal
        open={receiptOpen && lastOrder !== null}
        onClose={() => setReceiptOpen(false)}
        title="Sale complete"
        size="md"
      >
        {lastOrder && (
          <div className="flex flex-col gap-4">
            <Receipt order={lastOrder} />
            <Button
              type="button"
              fullWidth
              size="lg"
              onClick={() => setReceiptOpen(false)}
            >
              New sale
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: Readonly<{
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        active
          ? "bg-primary text-on-primary"
          : "bg-surface-container text-on-surface-variant dark:bg-zinc-800 dark:text-zinc-300"
      }`}
    >
      {label}
      <span className={active ? "text-on-primary/70" : "opacity-60"}>{count}</span>
    </button>
  );
}
