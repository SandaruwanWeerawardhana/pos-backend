"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface DraftEnvelope<T> {
  savedAt: number;
  values: T;
}

export interface FormDraft<T> {
  /** Draft found in storage when the page mounted, or null. */
  restored: DraftEnvelope<T> | null;
  /** When the current values were last written. */
  savedAt: number | null;
  discard: () => void;
}

const DEFAULT_DELAY_MS = 1200;

function readDraft<T>(key: string): DraftEnvelope<T> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope<T>;
    return typeof parsed?.savedAt === "number" ? parsed : null;
  } catch {
    // A malformed or unreadable draft is not worth failing the page over.
    return null;
  }
}

// Debounced autosave of an in-progress form to localStorage — not IndexedDB,
// because a draft is throwaway per-device UI state, not catalogue data that
// should ever reach the sync queue.
export function useFormDraft<T>(
  key: string,
  values: T,
  options: { enabled: boolean; delayMs?: number },
): FormDraft<T> {
  const { enabled, delayMs = DEFAULT_DELAY_MS } = options;
  const [restored, setRestored] = useState<DraftEnvelope<T> | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    setRestored(readDraft<T>(key));
  }, [key]);

  useEffect(() => {
    if (!enabled) return;

    const timeoutId = window.setTimeout(() => {
      try {
        const envelope: DraftEnvelope<T> = { savedAt: Date.now(), values };
        window.localStorage.setItem(key, JSON.stringify(envelope));
        setSavedAt(envelope.savedAt);
      } catch {
        // Quota exceeded (large image data URLs) — drafting is best-effort.
      }
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [key, values, enabled, delayMs]);

  const discard = useCallback(() => {
    window.localStorage.removeItem(key);
    setRestored(null);
    setSavedAt(null);
  }, [key]);

  return { restored, savedAt, discard };
}
