"use client";

import { useCallback, useEffect, useState } from "react";
import { liveQuery } from "dexie";
import {
  DEFAULT_STORE_SETTINGS,
  getStoreSettings,
  saveStoreSettings,
} from "@/lib/db/settings";
import { formatMoney } from "@/lib/format";
import type { StoreSettings } from "@/lib/types";

export interface UseSettingsResult {
  settings: StoreSettings;
  save: (changes: Partial<StoreSettings>) => Promise<void>;
  /** Formats integer cents using the store's configured currency + locale. */
  money: (cents: number) => string;
}

// Settings live in the syncMeta table, so a liveQuery keeps every open screen
// (and every tab) in step the moment Settings is saved — no page reload and
// no prop drilling of the currency symbol.
export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<StoreSettings>(
    DEFAULT_STORE_SETTINGS,
  );

  useEffect(() => {
    const subscription = liveQuery(() => getStoreSettings()).subscribe({
      next: setSettings,
    });
    return () => subscription.unsubscribe();
  }, []);

  const save = useCallback(async (changes: Partial<StoreSettings>) => {
    await saveStoreSettings(changes);
  }, []);

  const money = useCallback(
    (cents: number) => formatMoney(cents, settings),
    [settings],
  );

  return { settings, save, money };
}

// Non-reactive read for one-off callers (exporters, print handlers) that need
// the current settings once rather than a subscription.
export async function readSettingsOnce(): Promise<StoreSettings> {
  return getStoreSettings();
}
