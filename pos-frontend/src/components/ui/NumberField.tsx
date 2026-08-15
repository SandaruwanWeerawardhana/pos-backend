"use client";

import { useId } from "react";
import { Minus, Plus } from "lucide-react";

interface NumberFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  step?: number;
  min?: number;
  max?: number;
  /** Decimals kept when stepping — 0 for counted goods, 3 for weighed ones. */
  precision?: number;
  suffix?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
}

function clamp(value: number, min?: number, max?: number): number {
  let next = value;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
}

// Numeric input with explicit +/- controls. Fat fingers on a till can't
// reliably hit the native spinner arrows, and `inputMode="decimal"` brings up
// the number pad rather than the full keyboard on phones.
export function NumberField({
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  step = 1,
  min = 0,
  max,
  precision = 0,
  suffix,
  placeholder,
  id,
  name,
  disabled = false,
}: Readonly<NumberFieldProps>) {
  const generatedId = useId();
  const inputId = id ?? name ?? generatedId;

  function nudge(direction: 1 | -1) {
    const current = Number(value.trim());
    const base = Number.isFinite(current) ? current : (min ?? 0);
    const next = clamp(base + direction * step, min, max);
    onChange(next.toFixed(precision));
  }

  const buttonClass =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-container hover:scale-105 active:scale-90 active:duration-[var(--duration-instant)] disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-on-surface-variant dark:text-zinc-300"
      >
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => nudge(-1)}
          disabled={disabled}
          aria-label={`Decrease ${label}`}
          tabIndex={-1}
        >
          <Minus size={14} />
        </button>
        <div className="relative flex-1">
          <input
            id={inputId}
            name={name}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            disabled={disabled}
            placeholder={placeholder}
            inputMode="decimal"
            aria-invalid={error ? true : undefined}
            className={`h-9 w-full rounded-lg border bg-surface-container-lowest px-3 text-center text-sm font-medium tabular-nums text-on-surface outline-none transition-[color,background-color,border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:border-outline focus:border-secondary focus:ring-2 focus:ring-primary/40 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-zinc-600 ${
              suffix ? "pr-10" : ""
            } ${
              error ? "border-error" : "border-outline-variant dark:border-zinc-700"
            }`}
          />
          {suffix && (
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-on-surface-variant dark:text-zinc-500"
            >
              {suffix}
            </span>
          )}
        </div>
        <button
          type="button"
          className={buttonClass}
          onClick={() => nudge(1)}
          disabled={disabled}
          aria-label={`Increase ${label}`}
          tabIndex={-1}
        >
          <Plus size={14} />
        </button>
      </div>
      {error && (
        <span className="animate-fade-in text-xs text-error">{error}</span>
      )}
      {!error && hint && (
        <span className="text-xs text-on-surface-variant dark:text-zinc-500">
          {hint}
        </span>
      )}
    </div>
  );
}
