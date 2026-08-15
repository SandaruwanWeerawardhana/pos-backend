"use client";

import { ClipboardList, Printer, Trash2 } from "lucide-react";

interface QuickActionsProps {
  onHold: () => void;
  onClear: () => void;
  onPrintLast: () => void;
  disabled: boolean;
}

/**
 * Till-side shortcuts, duplicating the F-key bindings in Terminal for cashiers
 * working from the touchscreen.
 */
export function QuickActions({
  onHold,
  onClear,
  onPrintLast,
  disabled,
}: Readonly<QuickActionsProps>) {
  return (
    <div className="flex flex-wrap justify-center gap-2 pb-16 lg:pb-0">
      <ActionButton
        icon={<ClipboardList size={18} />}
        label="Hold"
        onClick={onHold}
      />
      <ActionButton
        icon={<Printer size={18} />}
        label="Reprint receipt"
        onClick={onPrintLast}
      />
      <ActionButton
        icon={<Trash2 size={18} />}
        label="Clear cart"
        onClick={onClear}
        disabled={disabled}
        danger
      />
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: Readonly<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex min-h-16 min-w-24 flex-col items-center justify-center gap-1.5 rounded-xl border border-outline-variant px-3 py-2 text-xs font-medium transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:bg-surface-container hover:shadow-elevated active:translate-y-0 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-800 dark:hover:bg-zinc-800 ${
        danger
          ? "text-error dark:text-red-400"
          : "text-on-surface-variant dark:text-zinc-300"
      }`}
    >
      <span
        aria-hidden
        className="transition-transform duration-[var(--duration-base)] ease-[var(--ease-spring)] group-hover:scale-110"
      >
        {icon}
      </span>
      <span className="text-center leading-tight">{label}</span>
    </button>
  );
}
