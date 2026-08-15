"use client";

import { useRef, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { PluginCartRow } from "@/components/plugin-slots/PluginCartRow";
import { useSettings } from "@/lib/hooks/use-settings";
import { formatQuantity } from "@/lib/format";
import type { CartItem as CartItemType } from "@/lib/types";

interface CartItemProps {
  item: CartItemType;
  onUpdateQuantity: (id: number, quantity: number) => void;
  onRemove: (id: number) => void;
}

// Distance (px) a horizontal drag must travel before it counts as a
// swipe-to-remove rather than an accidental scroll.
const SWIPE_THRESHOLD_PX = 96;

export function CartItem({
  item,
  onUpdateQuantity,
  onRemove,
}: Readonly<CartItemProps>) {
  const { money } = useSettings();
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef<number | null>(null);

  // Weighted lines come off the scale, so ±1 stepping is meaningless; they
  // step by 0.1 of the unit instead.
  const step = item.is_weighted ? 0.1 : 1;

  function changeQuantity(delta: number) {
    if (item.id === undefined) return;
    const next = Math.round((item.quantity + delta) * 1000) / 1000;
    onUpdateQuantity(item.id, next);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Only track touch/pen drags — a mouse press shouldn't arm a swipe.
    if (event.pointerType === "mouse") return;
    startXRef.current = event.clientX;
    setDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (startXRef.current === null) return;
    // Left-only: swiping right would fight the panel's own scrolling.
    setOffsetX(Math.min(0, event.clientX - startXRef.current));
  }

  function handlePointerEnd() {
    if (startXRef.current === null) return;
    if (offsetX <= -SWIPE_THRESHOLD_PX && item.id !== undefined) {
      onRemove(item.id);
    }
    startXRef.current = null;
    setDragging(false);
    setOffsetX(0);
  }

  return (
    <div className="animate-slide-in-right relative overflow-hidden rounded-xl">
      {offsetX < 0 && (
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 flex w-24 items-center justify-center rounded-xl bg-error text-on-error"
        >
          <Trash2
            size={18}
            /* Grows as the drag nears the threshold, so the cashier can feel
               how far is far enough before letting go. */
            className={`transition-transform duration-[var(--duration-fast)] ease-[var(--ease-spring)] ${
              offsetX <= -SWIPE_THRESHOLD_PX ? "scale-125" : "scale-100"
            }`}
          />
        </div>
      )}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={{ transform: `translateX(${offsetX}px)` }}
        /* No transition while the finger is down — the row has to track the
           drag exactly; the easing is only for the snap back on release. */
        className={`relative flex touch-pan-y items-center gap-2 rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-2 transition-transform ease-[var(--ease-decelerate)] dark:border-zinc-800 dark:bg-zinc-900 ${
          dragging ? "duration-0" : "duration-[var(--duration-base)]"
        }`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container text-xs font-semibold text-on-surface-variant dark:bg-zinc-800">
          {item.name.charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-on-surface dark:text-zinc-50">
            {item.name}
          </p>
          <PluginCartRow item={item} />
        </div>

        <div className="flex items-center rounded-lg border border-outline-variant dark:border-zinc-700">
          <button
            type="button"
            aria-label={`Decrease quantity of ${item.name}`}
            onClick={() => changeQuantity(-step)}
            className="flex h-8 w-8 items-center justify-center text-on-surface-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:scale-110 hover:text-on-surface active:scale-90 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary dark:hover:text-zinc-50"
          >
            <Minus size={12} />
          </button>
          <span className="min-w-9 text-center text-xs font-medium tabular-nums text-on-surface dark:text-zinc-50">
            {formatQuantity(item.quantity)}
          </span>
          <button
            type="button"
            aria-label={`Increase quantity of ${item.name}`}
            onClick={() => changeQuantity(step)}
            className="flex h-8 w-8 items-center justify-center text-on-surface-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:scale-110 hover:text-on-surface active:scale-90 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary dark:hover:text-zinc-50"
          >
            <Plus size={12} />
          </button>
        </div>

        <span className="w-14 text-right text-sm font-semibold tabular-nums text-on-surface dark:text-zinc-50">
          {money(Math.round(item.unit_price_cents * item.quantity))}
        </span>

        <button
          type="button"
          aria-label={`Remove ${item.name}`}
          onClick={() => item.id !== undefined && onRemove(item.id)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-outline-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:scale-110 hover:text-error active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-zinc-600"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
