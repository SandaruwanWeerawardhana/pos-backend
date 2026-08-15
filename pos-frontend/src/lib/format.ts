import type { StoreSettings } from "@/lib/types";
import { DEFAULT_STORE_SETTINGS } from "@/lib/db/settings";

// Money is stored as integer cents everywhere; formatting is the only place
// it becomes a decimal string. Every screen goes through here so a currency
// or locale change in Settings takes effect app-wide.
export function formatMoney(
  cents: number,
  settings: Pick<
    StoreSettings,
    "currency_symbol" | "currency_position" | "locale"
  > = DEFAULT_STORE_SETTINGS,
): string {
  const negative = cents < 0;
  const amount = Math.abs(cents) / 100;
  const body = amount.toLocaleString(settings.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const withSymbol =
    settings.currency_position === "after"
      ? `${body}${settings.currency_symbol}`
      : `${settings.currency_symbol}${body}`;
  return negative ? `-${withSymbol}` : withSymbol;
}

// Parses user-typed money ("12.34", "$12.34", "1,234.50") into integer cents.
// Returns null rather than NaN so callers must handle bad input explicitly.
export function parseMoneyToCents(value: string): number | null {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

export function formatQuantity(quantity: number, unit?: string): string {
  // Weighted lines carry fractional quantities; counted lines never do, so
  // only show decimals when they carry information.
  const body = Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return unit && unit !== "unit" ? `${body} ${unit}` : body;
}

export function formatDate(
  timestamp: number,
  locale = DEFAULT_STORE_SETTINGS.locale,
): string {
  return new Date(timestamp).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(
  timestamp: number,
  locale = DEFAULT_STORE_SETTINGS.locale,
): string {
  return new Date(timestamp).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
