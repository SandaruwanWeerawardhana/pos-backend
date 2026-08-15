/*
 * Builds the printable HTML for a sheet of product labels. Kept separate from
 * the Print Labels page so the markup/paper-size logic can be tested without
 * a browser print dialog in the loop.
 */

import type { BarcodeSymbology } from "@/lib/types";
import { escapeHtml, printHtml } from "@/lib/export";
import { barRuns, encodeBarcode } from "./barcode-encode";

export interface LabelPaperSize {
  value: string;
  label: string;
  /** `@page` size/margin declaration; empty leaves the browser's default. */
  pageCss: string;
}

export const LABEL_PAPER_SIZES: LabelPaperSize[] = [
  { value: "a4", label: "A4 sheet", pageCss: "size: A4; margin: 10mm;" },
  { value: "letter", label: "Letter sheet", pageCss: "size: letter; margin: 10mm;" },
  {
    value: "label-50x25",
    label: "Label roll 50 x 25 mm",
    pageCss: "size: 50mm 25mm; margin: 2mm;",
  },
  {
    value: "label-40x30",
    label: "Label roll 40 x 30 mm",
    pageCss: "size: 40mm 30mm; margin: 2mm;",
  },
];

export interface LabelItem {
  name: string;
  barcode: string;
  symbology: BarcodeSymbology;
  priceCents?: number;
  quantity: number;
}

/** Same module math as `BarcodeImage`, stringified for a print window. */
function barcodeSvgMarkup(value: string, symbology: BarcodeSymbology): string {
  const modules = encodeBarcode(value, symbology);
  if (!modules) {
    return `<p class="label-code">${escapeHtml(value)}</p>`;
  }

  const quietZone = 10;
  const height = 42;
  const width = modules.length + quietZone * 2;
  const bars = barRuns(modules)
    .map(
      (run) =>
        `<rect x="${quietZone + run.start}" y="0" width="${run.width}" height="${height}" fill="#000"/>`,
    )
    .join("");

  return `<svg class="label-barcode" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet"><rect width="${width}" height="${height}" fill="#fff"/>${bars}</svg>`;
}

function labelMarkup(
  item: LabelItem,
  displayPrice: boolean,
  money: (cents: number) => string,
): string {
  const price =
    displayPrice && item.priceCents !== undefined
      ? `<p class="label-price">${escapeHtml(money(item.priceCents))}</p>`
      : "";
  return `<div class="label">
    <p class="label-name">${escapeHtml(item.name)}</p>
    ${barcodeSvgMarkup(item.barcode, item.symbology)}
    <p class="label-code-value">${escapeHtml(item.barcode)}</p>
    ${price}
  </div>`;
}

/** Repeats each item `quantity` times, one label per print, and opens the print dialog. */
export function printLabelSheet(
  items: LabelItem[],
  options: {
    displayPrice: boolean;
    money: (cents: number) => string;
    paperSize?: string;
  },
): void {
  const paper = LABEL_PAPER_SIZES.find((size) => size.value === options.paperSize);
  const labels = items
    .flatMap((item) => Array.from({ length: Math.max(1, item.quantity) }, () => item))
    .map((item) => labelMarkup(item, options.displayPrice, options.money))
    .join("");

  printHtml(
    "Print labels",
    `<div class="label-sheet">${labels}</div>`,
    `
      ${paper ? `@page{${paper.pageCss}}` : ""}
      body{background:#fff}
      .label-sheet{display:flex;flex-wrap:wrap;gap:4mm}
      .label{display:flex;flex-direction:column;align-items:center;gap:2px;border:1px dashed #ccc;padding:6px 8px;page-break-inside:avoid;width:fit-content}
      .label-name{margin:0;font-size:11px;font-weight:600;text-align:center;max-width:45mm}
      .label-barcode{width:45mm;height:16mm}
      .label-code{margin:2px 0;font-size:10px}
      .label-code-value{margin:0;font-size:9px;letter-spacing:0.1em}
      .label-price{margin:2px 0 0;font-size:12px;font-weight:700}
      @media print{.label{border-color:transparent}}
    `,
  );
}
