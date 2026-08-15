// Client-side report exporters. Everything runs in the browser with no
// dependency and no server round-trip, so exports work offline like the rest
// of the app.

export interface ExportColumn<T> {
  key: string;
  header: string;
  value: (row: T) => string | number;
}

function escapeCsvCell(value: string | number): string {
  const text = String(value ?? "");
  // Quote when the cell contains a delimiter, quote, or newline; double any
  // embedded quotes per RFC 4180.
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const header = columns.map((column) => escapeCsvCell(column.header)).join(",");
  const body = rows
    .map((row) =>
      columns.map((column) => escapeCsvCell(column.value(row))).join(","),
    )
    .join("\r\n");
  return `${header}\r\n${body}`;
}

function downloadBlob(content: BlobPart, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportCsv<T>(
  filename: string,
  rows: T[],
  columns: ExportColumn<T>[],
): void {
  // The BOM makes Excel open UTF-8 CSVs without mangling non-ASCII names.
  downloadBlob(
    `﻿${toCsv(rows, columns)}`,
    `${filename}.csv`,
    "text/csv;charset=utf-8;",
  );
}

export function escapeHtml(value: string | number): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildHtmlTable<T>(
  title: string,
  rows: T[],
  columns: ExportColumn<T>[],
): string {
  const head = columns
    .map((column) => `<th>${escapeHtml(column.header)}</th>`)
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((column) => `<td>${escapeHtml(column.value(row))}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<table><caption>${escapeHtml(title)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// Excel opens an HTML table saved with an .xls extension and the Excel MIME
// type as a real worksheet — full .xlsx would need a zip/OOXML writer, and
// this keeps the bundle dependency-free while still producing a file that
// opens natively in Excel, Numbers, and LibreOffice.
export function exportExcel<T>(
  filename: string,
  title: string,
  rows: T[],
  columns: ExportColumn<T>[],
): void {
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" /><style>table{border-collapse:collapse}th,td{border:1px solid #999;padding:4px 8px;font-family:sans-serif;font-size:12px}th{background:#eee;text-align:left}</style></head><body>${buildHtmlTable(
    title,
    rows,
    columns,
  )}</body></html>`;
  downloadBlob(html, `${filename}.xls`, "application/vnd.ms-excel");
}

// PDF export goes through the browser's own print-to-PDF pipeline. That
// avoids shipping a PDF engine, and gives the user the standard system
// dialog (page size, margins, "Save as PDF") they already know.
export function exportPdf<T>(
  title: string,
  rows: T[],
  columns: ExportColumn<T>[],
): void {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;

  printWindow.document.write(
    `<html><head><title>${escapeHtml(title)}</title><style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;padding:24px;color:#111}
      caption{text-align:left;font-size:18px;font-weight:600;margin-bottom:12px}
      table{border-collapse:collapse;width:100%}
      th,td{border-bottom:1px solid #ddd;padding:8px;font-size:12px;text-align:left}
      th{background:#f4f4f5;font-weight:600}
      @media print{@page{margin:14mm}}
    </style></head><body>${buildHtmlTable(title, rows, columns)}</body></html>`,
  );
  printWindow.document.close();
  printWindow.focus();
  // Give the new document a tick to lay out before the print dialog opens,
  // otherwise Safari prints a blank page.
  printWindow.setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}

// Prints arbitrary markup (used for receipts, which are not tabular).
export function printHtml(title: string, bodyHtml: string, css = ""): void {
  const printWindow = window.open("", "_blank", "width=420,height=700");
  if (!printWindow) return;
  printWindow.document.write(
    `<html><head><title>${escapeHtml(
      title,
    )}</title><style>body{font-family:ui-monospace,monospace;margin:0;padding:8px}${css}</style></head><body>${bodyHtml}</body></html>`,
  );
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}
