"use client";

import { useEffect, useState } from "react";
import { isBarcodeTaken, isSkuTaken } from "@/lib/db";

export interface DuplicateState {
  skuTaken: boolean;
  barcodeTaken: boolean;
  checking: boolean;
}

const DEBOUNCE_MS = 350;

// Live uniqueness check against the local catalogue. Debounced so typing a
// 13-digit barcode is one lookup, not thirteen; `addProduct` still enforces
// the constraint inside its transaction, this is purely to warn earlier.
export function useProductDuplicates(
  sku: string,
  barcode: string,
  exceptId?: string,
): DuplicateState {
  const [state, setState] = useState<DuplicateState>({
    skuTaken: false,
    barcodeTaken: false,
    checking: false,
  });

  useEffect(() => {
    const trimmedSku = sku.trim();
    const trimmedBarcode = barcode.trim();

    if (!trimmedSku && !trimmedBarcode) {
      setState({ skuTaken: false, barcodeTaken: false, checking: false });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, checking: true }));

    const timeoutId = window.setTimeout(() => {
      Promise.all([
        isSkuTaken(trimmedSku, exceptId),
        isBarcodeTaken(trimmedBarcode, exceptId),
      ])
        .then(([skuTaken, barcodeTaken]) => {
          if (!cancelled) setState({ skuTaken, barcodeTaken, checking: false });
        })
        .catch(() => {
          if (!cancelled) {
            setState({ skuTaken: false, barcodeTaken: false, checking: false });
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [sku, barcode, exceptId]);

  return state;
}
