import type { ReactNode } from "react";
import { staggerDelay } from "@/lib/motion";

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
  selectedKey?: string | null;
  onRowClick?: (row: T) => void;
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No data",
  selectedKey,
  onRowClick,
}: TableProps<T>) {
  if (rows.length === 0) {
    return (
      <p className="animate-fade-in py-8 text-center text-sm text-on-surface-variant dark:text-zinc-400">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-outline-variant dark:border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-container-low text-on-surface-variant dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-2 font-medium">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/50 dark:divide-zinc-800">
          {rows.map((row, index) => {
            const key = rowKey(row);
            const isSelected = selectedKey === key;
            return (
              <tr
                key={key}
                style={staggerDelay(index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`animate-fade-in transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] ${
                  isSelected
                    ? "bg-primary/10 font-semibold text-primary dark:bg-blue-900/30 dark:text-blue-300"
                    : "text-on-surface hover:bg-surface-container-low dark:text-zinc-50 dark:hover:bg-zinc-800/60"
                } ${onRowClick ? "cursor-pointer" : ""}`}
              >
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-2">
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
