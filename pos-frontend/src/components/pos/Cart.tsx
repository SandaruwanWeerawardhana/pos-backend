"use client";

import { ShoppingCart } from "lucide-react";
import { CartItem } from "./CartItem";
import { Spinner } from "@/components/ui/Spinner";
import { useSettings } from "@/lib/hooks/use-settings";
import { formatQuantity } from "@/lib/format";
import type {
  CartItem as CartItemType,
  CartTotal,
  PaymentMethod,
} from "@/lib/types";

interface CartProps {
  items: CartItemType[];
  total: CartTotal;
  discountCents: number;
  onUpdateQuantity: (id: number, quantity: number) => void;
  onRemove: (id: number) => void;
  onHold: () => void;
  onPay: (method: PaymentMethod) => void;
  busy?: boolean;
}

const DEFAULT_PAYMENT_METHOD: PaymentMethod = "cash";

export function Cart({
  items,
  total,
  discountCents,
  onUpdateQuantity,
  onRemove,
  onHold,
  onPay,
  busy = false,
}: Readonly<CartProps>) {
  const { money } = useSettings();
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const empty = items.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-on-surface dark:text-zinc-50">
          <ShoppingCart size={15} aria-hidden />
          Cart
          <span className="font-normal text-on-surface-variant">
            ({formatQuantity(itemCount)} items)
          </span>
        </h2>
        <button
          type="button"
          onClick={onHold}
          disabled={empty}
          className="rounded px-1 text-xs font-medium text-secondary transition-colors duration-[var(--duration-fast)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:text-zinc-300 dark:disabled:text-zinc-600"
        >
          Hold
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {empty ? (
          <p className="animate-fade-in py-10 text-center text-sm text-on-surface-variant">
            Cart is empty. Scan a barcode or tap a product to start.
          </p>
        ) : (
          items.map((item) => (
            <CartItem
              key={item.id}
              item={item}
              onUpdateQuantity={onUpdateQuantity}
              onRemove={onRemove}
            />
          ))
        )}
      </div>

      {/* Totals */}
      <div className="mt-3 space-y-2 border-t border-outline-variant pt-3 dark:border-zinc-800">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <Row label="Items" value={formatQuantity(itemCount)} />
          <Row label="Subtotal" value={money(total.subtotal_cents)} />
          <Row
            label="Discount"
            value={discountCents > 0 ? `-${money(discountCents)}` : money(0)}
            valueClass={discountCents > 0 ? "text-error" : undefined}
          />
          <Row label="Tax" value={money(total.tax_total_cents)} />
        </div>
        <div className="flex items-center justify-between border-t border-outline-variant pt-2 dark:border-zinc-800">
          <span className="text-base font-semibold text-on-surface dark:text-zinc-50">
            Grand Total
          </span>
          {/* Keyed on the amount so the figure re-animates whenever the cart
              changes — the cashier sees that the total moved. */}
          <span
            key={total.total_cents}
            className="animate-scale-in text-2xl font-bold tabular-nums text-on-surface dark:text-zinc-50"
          >
            {money(total.total_cents)}
          </span>
        </div>
      </div>

      <button
        type="button"
        disabled={empty || busy}
        onClick={() => onPay(DEFAULT_PAYMENT_METHOD)}
        aria-busy={busy || undefined}
        className="mt-3 inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-secondary px-2 text-base font-semibold text-on-secondary transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-secondary/90 hover:shadow-elevated active:scale-[0.98] active:duration-[var(--duration-instant)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none"
      >
        {busy && <Spinner size="md" label={null} />}
        {busy ? "Completing sale…" : `Pay ${money(total.total_cents)}`}
      </button>
    </div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: Readonly<{ label: string; value: string; valueClass?: string }>) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-on-surface-variant dark:text-zinc-400">{label}</span>
      <span
        className={`font-medium tabular-nums text-on-surface dark:text-zinc-50 ${valueClass ?? ""}`}
      >
        {value}
      </span>
    </div>
  );
}
