export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-md bg-surface-container-high text-on-surface dark:bg-zinc-800 dark:text-zinc-100 ${className}`}
    >
      <span aria-hidden className="animate-shimmer absolute inset-0 block" />
    </div>
  );
}
