"use client";

import { useTheme } from "@/components/providers/theme-provider";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const isDark = resolvedTheme === "dark";

  return (
    <button
      id="theme-toggle"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-outline-variant text-on-surface-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:border-primary/40 hover:bg-surface-container hover:text-primary active:scale-90 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-blue-500/40 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
    >
      {/* Keyed so React remounts the icon and the entrance animation replays
          on every switch rather than only on first paint. */}
      <span key={isDark ? "sun" : "moon"} className="animate-scale-in">
        {isDark ? <Sun size={15} /> : <Moon size={15} />}
      </span>
    </button>
  );
}
