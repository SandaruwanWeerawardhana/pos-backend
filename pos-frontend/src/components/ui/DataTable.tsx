"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { staggerDelay } from "@/lib/motion";

export interface DataColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Supplying this makes the column sortable. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right";
  /** Hidden below `sm` so narrow screens keep only the essential columns. */
  hideOnMobile?: boolean;
  /** CSS min-width (e.g. "140px") to keep the column from squeezing narrow content. */
  minWidth?: string;
}

interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
  /** Overrides the table's default `text-sm` cell size, e.g. "text-xs". */
  textSizeClassName?: string;
  pageSize?: number;
  /** Supplying this adds a "Rows per page" select; the first value is the initial page size. */
  pageSizeOptions?: number[];
  onRowClick?: (row: T) => void;
  caption?: string;
  /**
   * Supplying this renders a leading checkbox column. The header checkbox
   * covers the rows on the current page only — ticking it must not silently
   * select rows the user cannot see before acting on them in bulk.
   */
  selection?: {
    selectedIds: string[];
    onChange: (ids: string[]) => void;
  };
}

type SortState = { key: string; direction: "asc" | "desc" } | null;

const CHECKBOX_CLASSES =
  "h-4 w-4 cursor-pointer rounded border-outline-variant accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-700";

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

// Sorting and pagination live in the component because every list screen in
// the app needs the same behaviour over a fully-loaded local Dexie array —
// there is no server pagination to defer to.
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No data",
  textSizeClassName = "text-sm",
  pageSize = 25,
  pageSizeOptions,
  onRowClick,
  caption,
  selection,
}: Readonly<DataTableProps<T>>) {
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(pageSizeOptions?.[0] ?? pageSize);
  const captionId = useId();

  const sortColumn = sort
    ? columns.find((column) => column.key === sort.key)
    : undefined;

  const sorted =
    sortColumn?.sortValue && sort
      ? [...rows].sort((a, b) => {
          const result = compareValues(
            sortColumn.sortValue!(a),
            sortColumn.sortValue!(b),
          );
          return sort.direction === "asc" ? result : -result;
        })
      : rows;

  const pageCount = Math.max(1, Math.ceil(sorted.length / rowsPerPage));
  // Filtering can shrink the list under the current page; clamp rather than
  // rendering an empty page the user has to click their way out of.
  const currentPage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(
    currentPage * rowsPerPage,
    currentPage * rowsPerPage + rowsPerPage,
  );

  const selectedIds = new Set(selection?.selectedIds ?? []);
  const visibleIds = visible.map(rowKey);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected =
    !allVisibleSelected && visibleIds.some((id) => selectedIds.has(id));

  function toggleRow(id: string) {
    if (!selection) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange([...next]);
  }

  function toggleVisibleRows() {
    if (!selection) return;
    const next = new Set(selectedIds);
    if (allVisibleSelected) {
      visibleIds.forEach((id) => next.delete(id));
    } else {
      visibleIds.forEach((id) => next.add(id));
    }
    selection.onChange([...next]);
  }

  function toggleSort(column: DataColumn<T>) {
    if (!column.sortValue) return;
    setPage(0);
    setSort((current) => {
      if (current?.key !== column.key) return { key: column.key, direction: "asc" };
      if (current.direction === "asc") return { key: column.key, direction: "desc" };
      return null;
    });
  }

  const columnCount = columns.length + (selection ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-outline-variant dark:border-zinc-800">
        <table
          className={`w-full text-left ${textSizeClassName}`}
          aria-describedby={caption ? captionId : undefined}
        >
          {caption && (
            <caption id={captionId} className="sr-only">
              {caption}
            </caption>
          )}
          <thead className="bg-surface-container-low text-on-surface dark:bg-zinc-900 dark:text-zinc-100">
            <tr>
              {selection && (
                <th scope="col" className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    /* Mixed state is only reachable through the DOM property. */
                    ref={(node) => {
                      if (node) node.indeterminate = someVisibleSelected;
                    }}
                    onChange={toggleVisibleRows}
                    aria-label="Select all rows on this page"
                    className={CHECKBOX_CLASSES}
                  />
                </th>
              )}
              {columns.map((column) => {
                const active = sort?.key === column.key;
                let ariaSort: "ascending" | "descending" | "none" = "none";
                if (active) {
                  ariaSort =
                    sort?.direction === "asc" ? "ascending" : "descending";
                }
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={column.sortValue ? ariaSort : undefined}
                    style={column.minWidth ? { minWidth: column.minWidth } : undefined}
                    className={`px-4 py-3 font-semibold ${
                      column.align === "right" ? "text-right" : ""
                    } ${column.hideOnMobile ? "hidden sm:table-cell" : ""}`}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className={`group inline-flex items-center gap-1 rounded transition-colors duration-[var(--duration-fast)] hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:hover:text-zinc-100 ${
                          column.align === "right" ? "flex-row-reverse" : ""
                        }`}
                      >
                        {column.header}
                        {active ? (
                          sort?.direction === "asc" ? (
                            <ChevronUp
                              size={13}
                              className="animate-fade-in"
                              aria-hidden
                            />
                          ) : (
                            <ChevronDown
                              size={13}
                              className="animate-fade-in"
                              aria-hidden
                            />
                          )
                        ) : (
                          <ChevronDown
                            size={13}
                            className="opacity-30 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-70"
                            aria-hidden
                          />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/50 dark:divide-zinc-800">
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={columnCount}
                  className="animate-fade-in px-4 py-10 text-center text-sm text-on-surface-variant dark:text-zinc-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
            {visible.map((row, index) => (
              <tr
                key={rowKey(row)}
                style={staggerDelay(index)}
                // Rows are activated with Enter/Space as well as click so the
                // whole table is usable without a pointer.
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                className={`animate-fade-in text-on-surface transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary dark:text-zinc-50 ${
                  onRowClick
                    ? "cursor-pointer hover:bg-surface-container-low dark:hover:bg-zinc-800/60"
                    : ""
                }`}
              >
                {selection && (
                  <td className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(rowKey(row))}
                      onChange={() => toggleRow(rowKey(row))}
                      onClick={(event) => event.stopPropagation()}
                      aria-label="Select row"
                      className={CHECKBOX_CLASSES}
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    style={column.minWidth ? { minWidth: column.minWidth } : undefined}
                    className={`px-4 py-3.5 ${
                      column.align === "right" ? "text-right tabular-nums" : ""
                    } ${column.hideOnMobile ? "hidden sm:table-cell" : ""}`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav
        aria-label="Pagination"
        className="flex flex-wrap items-center justify-between gap-3 text-sm"
      >
        <div className="flex items-center gap-4">
          {pageSizeOptions && (
            <label className="flex items-center gap-2 text-on-surface-variant dark:text-zinc-400">
              Rows per page:
              <select
                value={rowsPerPage}
                onChange={(event) => {
                  setRowsPerPage(Number(event.target.value));
                  setPage(0);
                }}
                className="rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1 text-on-surface outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-on-surface-variant dark:text-zinc-400">
            {sorted.length === 0 ? 0 : currentPage * rowsPerPage + 1}–
            {Math.min((currentPage + 1) * rowsPerPage, sorted.length)} of{" "}
            {sorted.length}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            aria-label="Previous page"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-container hover:-translate-x-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="px-2 text-on-surface-variant dark:text-zinc-400">
            {currentPage + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={currentPage >= pageCount - 1}
            aria-label="Next page"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-container hover:translate-x-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </nav>
    </div>
  );
}
