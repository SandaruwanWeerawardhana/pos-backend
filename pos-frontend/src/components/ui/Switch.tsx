"use client";

import { useId, type ReactNode } from "react";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
  id?: string;
}

// A native checkbox styled as a track/thumb rather than a div with
// role="switch": it keeps form semantics, label association, and the space
// key working for free. The whole row is the hit target so it clears the
// 48px touch minimum on a till screen.
export function Switch({
  checked,
  onChange,
  label,
  description,
  icon,
  disabled = false,
  id,
}: Readonly<SwitchProps>) {
  const generatedId = useId();
  const switchId = id ?? generatedId;

  return (
    <label
      htmlFor={switchId}
      className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest px-3.5 py-2.5 transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:border-outline hover:bg-surface-container-low has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60 ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <span className="shrink-0 text-on-surface-variant dark:text-zinc-400">
            {icon}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-sm font-medium text-on-surface dark:text-zinc-100">
            {label}
          </span>
          {description && (
            <span className="mt-0.5 block text-xs text-on-surface-variant dark:text-zinc-500">
              {description}
            </span>
          )}
        </span>
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          id={switchId}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer h-7 w-12 cursor-pointer appearance-none rounded-full bg-surface-container-highest outline-none transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)] checked:bg-secondary disabled:cursor-not-allowed dark:bg-zinc-700 dark:checked:bg-blue-500"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-[var(--duration-base)] ease-[var(--ease-spring)] peer-checked:translate-x-5"
        />
      </span>
    </label>
  );
}
