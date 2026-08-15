import Link from "next/link";
import { ROUTES } from "@/lib/types/routes";

export function LandingHeader() {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <span className="text-lg font-semibold">POS</span>
      <Link
        href={ROUTES.auth.login}
        className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:scale-105 hover:bg-zinc-700 active:scale-95 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Login
      </Link>
    </header>
  );
}
