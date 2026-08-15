import { db } from "./index";
import type { StoreSettings } from "@/lib/types";

const SETTINGS_KEY = "store_settings";

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  store_name: "Velocity Grocery",
  currency_code: "LKR",
  currency_symbol: "Rs ",
  currency_position: "before",
  locale: "en-LK",
  prices_include_tax: false,
  tax_rates: [
    { id: "standard", name: "Standard", rate: 0.08, is_default: true },
    { id: "reduced", name: "Reduced (food)", rate: 0.05 },
    { id: "zero", name: "Zero rated", rate: 0 },
  ],
  receipt_footer: "Thank you for shopping with us!",
  receipt_show_logo: true,
  receipt_show_tax_breakdown: true,
  receipt_paper_width: "80mm",
  low_stock_threshold: 5,
  expiry_warning_days: 14,
};

function isPartialSettings(value: unknown): value is Partial<StoreSettings> {
  return typeof value === "object" && value !== null;
}

// Reads the persisted settings merged over the defaults, so a settings blob
// written by an older build is still usable after new fields are added.
export async function getStoreSettings(): Promise<StoreSettings> {
  const record = await db.syncMeta.get(SETTINGS_KEY);
  if (!isPartialSettings(record?.value)) return DEFAULT_STORE_SETTINGS;
  return {
    ...DEFAULT_STORE_SETTINGS,
    ...record.value,
    tax_rates: record.value.tax_rates?.length
      ? record.value.tax_rates
      : DEFAULT_STORE_SETTINGS.tax_rates,
  };
}

export async function saveStoreSettings(
  changes: Partial<StoreSettings>,
): Promise<StoreSettings> {
  const current = await getStoreSettings();
  const next: StoreSettings = { ...current, ...changes };
  await db.syncMeta.put({ key: SETTINGS_KEY, value: next });
  return next;
}

export function getDefaultTaxRate(settings: StoreSettings): number {
  return (
    settings.tax_rates.find((rate) => rate.is_default)?.rate ??
    settings.tax_rates[0]?.rate ??
    0
  );
}
