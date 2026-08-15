import Link from "next/link";
import { ROUTES } from "@/lib/types/routes";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-surface p-8 text-center dark:bg-zinc-950">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary dark:text-blue-400">
        Error 404
      </p>
      <h1 className="text-2xl font-semibold text-on-surface dark:text-zinc-50">
        We couldn&apos;t find that page
      </h1>
      <p className="max-w-md text-sm text-on-surface-variant dark:text-zinc-400">
        The link may be out of date, or the record was removed. The till keeps
        working either way — nothing was lost.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Link
          href={ROUTES.dashboard}
          className="inline-flex min-h-11 items-center rounded-lg bg-secondary px-5 text-sm font-medium text-on-secondary transition-colors hover:bg-secondary/90 dark:bg-white dark:text-zinc-900"
        >
          Go to dashboard
        </Link>
        <Link
          href={ROUTES.pos.root}
          className="inline-flex min-h-11 items-center rounded-lg border border-outline-variant px-5 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Open POS terminal
        </Link>
      </div>
    </main>
  );
}
