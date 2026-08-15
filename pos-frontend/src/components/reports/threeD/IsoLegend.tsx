"use client";

interface SeriesLegendItem {
  key: string;
  label: string;
  color: string;
  total: number;
}

interface IsoSeriesLegendProps {
  items: SeriesLegendItem[];
  hidden: ReadonlySet<string>;
  onToggle: (key: string) => void;
  formatter: (value: number) => string;
}

/**
 * Clickable series key. Toggling a series off removes it from the scene *and*
 * from the value scale, which is the fastest way to read a small series that a
 * dominant one would otherwise flatten into the floor.
 */
export function IsoSeriesLegend({
  items,
  hidden,
  onToggle,
  formatter,
}: Readonly<IsoSeriesLegendProps>) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {items.map((item) => {
        const isHidden = hidden.has(item.key);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onToggle(item.key)}
            aria-pressed={!isHidden}
            title={`${item.label} · ${formatter(item.total)}`}
            className={`flex min-h-8 items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              isHidden
                ? "border-outline-variant text-on-surface-variant opacity-55 dark:border-zinc-800 dark:text-zinc-500"
                : "border-outline-variant text-on-surface hover:bg-surface-container dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
            }`}
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: isHidden ? "transparent" : item.color, boxShadow: `inset 0 0 0 1.5px ${item.color}` }}
            />
            <span className="max-w-32 truncate font-medium">{item.label}</span>
            <span className="tabular-nums text-on-surface-variant dark:text-zinc-500">
              {formatter(item.total)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface IsoValueLegendProps {
  min: number;
  max: number;
  stops: string[];
  formatter: (value: number) => string;
  label?: string;
}

/** Continuous scale key for value-coloured scenes (the heatmap). */
export function IsoValueLegend({
  min,
  max,
  stops,
  formatter,
  label,
}: Readonly<IsoValueLegendProps>) {
  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-on-surface-variant dark:text-zinc-500">
      {label && <span className="shrink-0 font-medium">{label}</span>}
      <span className="tabular-nums">{formatter(min)}</span>
      <span
        aria-hidden
        className="h-2 flex-1 rounded-full"
        style={{ backgroundImage: `linear-gradient(to right, ${stops.join(", ")})` }}
      />
      <span className="tabular-nums">{formatter(max)}</span>
    </div>
  );
}
