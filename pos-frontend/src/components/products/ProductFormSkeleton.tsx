import { Skeleton } from "@/components/ui/Skeleton";

function SectionSkeleton({ rows }: Readonly<{ rows: number }>) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/80">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="flex-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-56" />
        </div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: rows }, (_, index) => (
          <div key={`row-${index}`} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Shown while the catalogue option lists load. Mirrors the real layout so the
 * page does not jump when the fields arrive.
 */
export function ProductFormSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading product form</span>
      <SectionSkeleton rows={6} />
      <SectionSkeleton rows={4} />
      <SectionSkeleton rows={4} />
    </div>
  );
}
