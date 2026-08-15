"use client";

import { useConnectionStore } from "@/lib/store/connection";

export function ConnectionPill() {
  const online = useConnectionStore((state) => state.online);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)] ${
        online
          ? "bg-[#004b1e] text-[#bbf7d0] dark:bg-green-900/50 dark:text-green-300"
          : "bg-error text-on-error dark:bg-red-900/50 dark:text-red-300"
      }`}
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        {/* Offline is the state worth pulling an eye to; a healthy connection
            stays still so the pill is not permanently flashing. */}
        {!online && (
          <span
            aria-hidden
            className="animate-pulse-ring absolute inset-0 rounded-full bg-[#fca5a5]"
          />
        )}
        <span
          className={`relative h-1.5 w-1.5 rounded-full transition-colors duration-[var(--duration-base)] ${
            online ? "bg-[#4ade80]" : "bg-[#fca5a5]"
          }`}
        />
      </span>
      {online ? "Online" : "Offline"}
    </span>
  );
}
