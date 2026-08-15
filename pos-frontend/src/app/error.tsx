"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function AppError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <main
      role="alert"
      className="flex flex-1 flex-col items-center justify-center gap-4 bg-surface p-8 text-center dark:bg-zinc-950"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-error text-on-error">
        <AlertTriangle size={22} />
      </span>
      <h1 className="text-2xl font-semibold text-on-surface dark:text-zinc-50">
        Something went wrong
      </h1>
      <p className="max-w-md text-sm text-on-surface-variant dark:text-zinc-400">
        This screen failed to render. Your local sales data is stored in the
        browser and is unaffected — retrying is safe.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-on-surface-variant/70 dark:text-zinc-500">
          Reference: {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-secondary px-5 text-sm font-medium text-on-secondary transition-colors hover:bg-secondary/90 dark:bg-white dark:text-zinc-900"
      >
        Try again
      </button>
    </main>
  );
}
