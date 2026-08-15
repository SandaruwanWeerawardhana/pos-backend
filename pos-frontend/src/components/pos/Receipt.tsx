"use client";

import { useRef } from "react";
import { Mail, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PluginReceiptExtras } from "@/components/plugin-slots/PluginReceiptExtras";
import { useSettings } from "@/lib/hooks/use-settings";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { printHtml } from "@/lib/export";
import type { PendingOrder, StoreSettings } from "@/lib/types";

type ReceiptProps = Readonly<{
  order: PendingOrder;
  /** Hides print/email controls when the receipt is embedded read-only. */
  showActions?: boolean;
}>;

// Plain-text body for the email fallback. mailto: can't carry HTML, so the
// receipt is re-rendered as text rather than sending broken markup.
function buildEmailBody(order: PendingOrder, settings: StoreSettings): string {
  const lines = order.items.map(
    (item) =>
      `${formatQuantity(item.quantity, item.unit)} x ${item.name}  ${formatMoney(
        item.unit_price_cents * item.quantity,
        settings,
      )}`,
  );

  return [
    settings.store_name,
    settings.address ?? "",
    `Receipt: ${order.receipt_no ?? order.client_generated_id}`,
    formatDateTime(order.created_at, settings.locale),
    "",
    ...lines,
    "",
    order.discount_cents
      ? `Discount: -${formatMoney(order.discount_cents, settings)}`
      : "",
    `Tax: ${formatMoney(order.tax_total_cents, settings)}`,
    `Total: ${formatMoney(order.total_cents, settings)}`,
    "",
    settings.receipt_footer ?? "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function Receipt({ order, showActions = true }: ReceiptProps) {
  const { settings } = useSettings();
  const printableRef = useRef<HTMLDivElement>(null);

  const subtotalCents =
    order.total_cents - order.tax_total_cents + (order.discount_cents ?? 0);

  function handlePrint() {
    const markup = printableRef.current?.innerHTML;
    if (!markup) return;
    // Width matches the configured roll so an 80mm thermal printer doesn't
    // wrap every line.
    printHtml(
      `Receipt ${order.receipt_no ?? ""}`,
      markup,
      `body{width:${settings.receipt_paper_width};font-size:12px}
       .receipt-row{display:flex;justify-content:space-between;gap:8px}
       .receipt-divider{border-top:1px dashed #999;margin:6px 0}
       .receipt-center{text-align:center}
       .receipt-total{font-weight:700;font-size:14px}`,
    );
  }

  function handleEmail() {
    const subject = encodeURIComponent(
      `${settings.store_name} receipt ${order.receipt_no ?? ""}`.trim(),
    );
    const body = encodeURIComponent(buildEmailBody(order, settings));
    // Hands off to the device's mail client — there is no mail service in the
    // stack, and this keeps the flow working offline.
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={printableRef}
        className="mx-auto w-full max-w-sm rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 font-mono text-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <p className="receipt-center text-center text-base font-semibold text-on-surface dark:text-zinc-50">
          {settings.store_name}
        </p>
        {settings.receipt_header && (
          <p className="receipt-center text-center text-xs text-on-surface-variant dark:text-zinc-400">
            {settings.receipt_header}
          </p>
        )}
        {settings.address && (
          <p className="receipt-center text-center text-xs text-on-surface-variant dark:text-zinc-400">
            {settings.address}
          </p>
        )}
        <p className="receipt-center mt-1 text-center text-xs text-on-surface-variant dark:text-zinc-400">
          {formatDateTime(order.created_at, settings.locale)}
        </p>
        {order.receipt_no && (
          <p className="receipt-center text-center text-xs font-semibold text-on-surface dark:text-zinc-200">
            {order.receipt_no}
          </p>
        )}

        <div className="receipt-divider my-4 flex flex-col gap-1">
          {order.items.map((item, index) => (
            <div key={item.id ?? index}>
              <div className="receipt-row flex justify-between text-on-surface dark:text-zinc-50">
                <span>
                  {formatQuantity(item.quantity, item.unit)} × {item.name}
                </span>
                <span>
                  {formatMoney(item.unit_price_cents * item.quantity, settings)}
                </span>
              </div>
              <PluginReceiptExtras item={item} />
            </div>
          ))}
        </div>

        <div className="receipt-divider border-t border-dashed border-outline-variant pt-2 dark:border-zinc-700">
          <div className="receipt-row flex justify-between text-on-surface-variant dark:text-zinc-400">
            <span>Subtotal</span>
            <span>{formatMoney(subtotalCents, settings)}</span>
          </div>
          {order.discount_cents ? (
            <div className="receipt-row flex justify-between text-on-surface-variant dark:text-zinc-400">
              <span>Discount</span>
              <span>-{formatMoney(order.discount_cents, settings)}</span>
            </div>
          ) : null}
          {settings.receipt_show_tax_breakdown && (
            <div className="receipt-row flex justify-between text-on-surface-variant dark:text-zinc-400">
              <span>Tax</span>
              <span>{formatMoney(order.tax_total_cents, settings)}</span>
            </div>
          )}
          <div className="receipt-row receipt-total flex justify-between text-base font-semibold text-on-surface dark:text-zinc-50">
            <span>Total</span>
            <span>{formatMoney(order.total_cents, settings)}</span>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-0.5 text-xs text-on-surface-variant dark:text-zinc-400">
          {(order.payments ?? []).map((split, index) => (
            <div
              key={`${split.method}-${index}`}
              className="receipt-row flex justify-between"
            >
              <span className="uppercase">{split.method}</span>
              <span>{formatMoney(split.amount_cents, settings)}</span>
            </div>
          ))}
          {(order.payments ?? []).map((split, index) =>
            split.change_cents ? (
              <div
                key={`change-${index}`}
                className="receipt-row flex justify-between font-semibold"
              >
                <span>Change</span>
                <span>{formatMoney(split.change_cents, settings)}</span>
              </div>
            ) : null,
          )}
          {!order.payments?.length && (
            <p className="receipt-center text-center uppercase">
              Paid by {order.payment_method}
            </p>
          )}
        </div>

        {settings.receipt_footer && (
          <p className="receipt-center mt-4 text-center text-xs text-on-surface-variant">
            {settings.receipt_footer}
          </p>
        )}
        {order.refunded && (
          <p className="receipt-center mt-2 text-center text-xs font-semibold text-error">
            REFUNDED
          </p>
        )}
      </div>

      {showActions && (
        <div className="mx-auto flex w-full max-w-sm gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={handlePrint}
          >
            <Printer size={16} />
            Print
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={handleEmail}
          >
            <Mail size={16} />
            Email
          </Button>
        </div>
      )}
    </div>
  );
}
