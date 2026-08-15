"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getTodaysOrderSummary,
  recordCashReconciliation,
  type TodaysOrderSummary,
} from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useSettings } from "@/lib/hooks/use-settings";
import { ROUTES } from "@/lib/types/routes";
import type { CashReconciliation } from "@/lib/types";

export default function PosClosePage() {
  const [summary, setSummary] = useState<TodaysOrderSummary | null>(null);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<CashReconciliation | null>(null);
  const { showToast } = useToast();

  const { money: formatCents } = useSettings();

  useEffect(() => {
    getTodaysOrderSummary().then(setSummary);
  }, []);

  let reconciliationDifferenceText = "";

  if (result) {
    if (result.difference_cents === 0) {
      reconciliationDifferenceText = "matches exactly.";
    } else {
      const differenceDirection = result.difference_cents > 0 ? "over" : "short";
      reconciliationDifferenceText = `${differenceDirection} by ${formatCents(
        Math.abs(result.difference_cents),
      )}.`;
    }
  }

  async function handleReconcile() {
    const countedCents = Math.round(Number(counted) * 100);
    if (!Number.isFinite(countedCents)) {
      showToast("Enter a valid cash amount", "error");
      return;
    }
    const record = await recordCashReconciliation(countedCents, notes || undefined);
    setResult(record);
    showToast("Cash reconciliation recorded", "success");
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          End of day
        </h1>
        <Link
          href={ROUTES.pos.root}
          className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
        >
          Back to terminal
        </Link>
      </div>

      {summary && (
        <div className="rounded-2xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <div className="flex justify-between py-1">
            <span className="text-zinc-500 dark:text-zinc-400">Orders today</span>
            <span>{summary.orderCount}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-zinc-500 dark:text-zinc-400">Cash sales</span>
            <span>{formatCents(summary.byPaymentMethod.cash)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-zinc-500 dark:text-zinc-400">Card sales</span>
            <span>{formatCents(summary.byPaymentMethod.card)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-zinc-500 dark:text-zinc-400">Other sales</span>
            <span>{formatCents(summary.byPaymentMethod.other)}</span>
          </div>
          <div className="flex justify-between border-t border-zinc-200 py-1 pt-2 font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">
            <span>Total</span>
            <span>{formatCents(summary.totalCents)}</span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Input
          label="Counted cash in drawer"
          type="number"
          step="0.01"
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          placeholder="0.00"
        />
        <Input
          label="Notes (optional)"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <Button type="button" onClick={handleReconcile} disabled={!counted}>
          Record reconciliation
        </Button>
      </div>

      {result && (
        <div
          className={`rounded-lg p-4 text-sm ${
            result.difference_cents === 0
              ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
          }`}
        >
          Expected {formatCents(result.expected_cents)}, counted{" "}
          {formatCents(result.counted_cents)} —{" "}
          {reconciliationDifferenceText}
        </div>
      )}
    </div>
  );
}
