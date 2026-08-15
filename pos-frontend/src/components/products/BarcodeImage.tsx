import type { BarcodeSymbology } from "@/lib/types";
import { barRuns, encodeBarcode } from "@/lib/products/barcode-encode";

interface BarcodeImageProps {
  value: string;
  symbology?: BarcodeSymbology;
  /** Bar height in SVG units; one module is one unit wide. */
  height?: number;
  showValue?: boolean;
}

/*
 * Scanners read contrast, not theme: the symbol keeps black bars on white in
 * dark mode too, and is drawn with crisp edges so no module is blurred away by
 * anti-aliasing at small sizes.
 */
export function BarcodeImage({
  value,
  symbology = "CODE128",
  height = 60,
  showValue = true,
}: Readonly<BarcodeImageProps>) {
  const modules = encodeBarcode(value, symbology);

  if (!modules) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-xl bg-white px-4 py-6">
        <p className="font-mono text-sm text-zinc-900">{value}</p>
        <p className="text-xs text-zinc-500">
          Not printable as {symbology} — check the code.
        </p>
      </div>
    );
  }

  const quietZone = 10;
  const width = modules.length + quietZone * 2;

  return (
    <figure className="flex flex-col items-center gap-2 rounded-xl bg-white px-4 py-5">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${symbology} barcode ${value}`}
        shapeRendering="crispEdges"
        preserveAspectRatio="xMidYMid meet"
        className="h-16 w-full max-w-sm"
      >
        <rect width={width} height={height} fill="#ffffff" />
        {barRuns(modules).map((run) => (
          <rect
            key={run.start}
            x={quietZone + run.start}
            y={0}
            width={run.width}
            height={height}
            fill="#000000"
          />
        ))}
      </svg>
      {showValue && (
        <figcaption className="font-mono text-sm tracking-[0.2em] text-zinc-900">
          {value}
        </figcaption>
      )}
    </figure>
  );
}
