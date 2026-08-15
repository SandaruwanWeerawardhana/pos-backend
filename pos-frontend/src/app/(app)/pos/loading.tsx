import { Skeleton } from "@/components/ui/Skeleton";

export default function PosLoading() {
  return (
    <output
      aria-label="Loading terminal"
      className="flex h-full w-full gap-4 bg-surface p-4 dark:bg-zinc-950"
    >
      <Skeleton className="hidden w-14 rounded-2xl xl:block" />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <Skeleton className="mx-auto h-11 w-full max-w-xl rounded-full" />
        <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-56 rounded-2xl" />
          ))}
        </div>
      </div>
      <Skeleton className="hidden w-[360px] rounded-2xl lg:block" />
    </output>
  );
}
