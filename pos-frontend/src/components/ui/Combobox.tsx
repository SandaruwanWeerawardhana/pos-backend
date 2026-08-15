"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
}

interface ComboboxProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  error?: string;
  hint?: string;
  /** Lets the typed text stand in as the value — used for free-form taxonomies. */
  allowCustom?: boolean;
  /** Rendered under the list, e.g. a "quick add supplier" button. */
  footer?: ReactNode;
  emptyMessage?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  onBlur?: () => void;
}

const FILTER_DEBOUNCE_MS = 150;

function matches(option: ComboboxOption, needle: string): boolean {
  if (!needle) return true;
  const haystack = `${option.label} ${option.value} ${option.hint ?? ""}`;
  return haystack.toLowerCase().includes(needle);
}

// Typeahead picker over a local list. Filtering is debounced so a fast typist
// on a long catalogue re-renders the list once per pause rather than once per
// keystroke; selection itself stays immediate.
export function Combobox({
  label,
  value,
  onChange,
  options,
  placeholder = "Search…",
  error,
  hint,
  allowCustom = false,
  footer,
  emptyMessage = "No matches",
  disabled = false,
  required = false,
  id,
  name,
  onBlur,
}: Readonly<ComboboxProps>) {
  const generatedId = useId();
  const inputId = id ?? name ?? generatedId;
  const listId = `${inputId}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [needle, setNeedle] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setNeedle(query.trim().toLowerCase()),
      FILTER_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [query]);

  // Pointer-down outside closes the popup. Listening on the document rather
  // than relying on input blur keeps clicks on the footer button working.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const filtered = options.filter((option) => matches(option, needle));
  const trimmedQuery = query.trim();
  const canCreate =
    allowCustom &&
    trimmedQuery.length > 0 &&
    !options.some(
      (option) => option.label.toLowerCase() === trimmedQuery.toLowerCase(),
    );
  const rowCount = filtered.length + (canCreate ? 1 : 0);

  const selected = options.find((option) => option.value === value);
  const displayValue = selected?.label ?? value;

  function commit(next: string) {
    onChange(next);
    setQuery("");
    setOpen(false);
  }

  function selectIndex(index: number) {
    if (canCreate && index === filtered.length) {
      commit(trimmedQuery);
      return;
    }
    const option = filtered[index];
    if (option) commit(option.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (rowCount === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + delta + rowCount) % rowCount);
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      selectIndex(activeIndex);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setQuery("");
      setOpen(false);
      return;
    }
    // Tab leaves the field: a free-form value the user typed but never picked
    // would otherwise be silently discarded.
    if (event.key === "Tab" && open && allowCustom && trimmedQuery) {
      commit(trimmedQuery);
    }
  }

  function handleOpen() {
    if (disabled) return;
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }

  return (
    <div className="flex flex-col gap-1" ref={containerRef}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-on-surface-variant dark:text-zinc-300"
        >
          {label}
          {required && (
            <span className="ml-0.5 text-error" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      <div className="relative">
        <Search
          size={15}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant dark:text-zinc-500"
        />
        <input
          id={inputId}
          name={name}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            open && rowCount > 0 ? `${listId}-option-${activeIndex}` : undefined
          }
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={open ? query : displayValue}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            if (!open) setOpen(true);
          }}
          onFocus={handleOpen}
          onClick={handleOpen}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          className={`h-12 w-full rounded-lg border bg-surface-container-lowest pl-9 pr-9 text-sm text-on-surface outline-none transition-[color,background-color,border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:border-outline focus:border-secondary focus:ring-2 focus:ring-primary/40 disabled:opacity-50 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:hover:border-zinc-600 ${
            error ? "border-error" : "border-outline-variant dark:border-zinc-700"
          }`}
        />
        <ChevronDown
          size={16}
          aria-hidden
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)] dark:text-zinc-500 ${
            open ? "-rotate-180" : ""
          }`}
        />

        {open && (
          <div className="animate-scale-in absolute z-30 mt-1 w-full origin-top overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-popover dark:border-zinc-700 dark:bg-zinc-900">
            <ul
              id={listId}
              role="listbox"
              aria-label={label ?? "Options"}
              className="max-h-64 overflow-y-auto py-1"
            >
              {filtered.map((option, index) => (
                <li
                  key={option.value}
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commit(option.value);
                  }}
                  className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-on-surface transition-colors duration-[var(--duration-instant)] dark:text-zinc-100 ${
                    index === activeIndex
                      ? "bg-surface-container dark:bg-zinc-800"
                      : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.hint && (
                      <span className="block truncate text-xs text-on-surface-variant dark:text-zinc-500">
                        {option.hint}
                      </span>
                    )}
                  </span>
                  {option.value === value && (
                    <Check size={15} className="shrink-0 text-secondary dark:text-blue-400" />
                  )}
                </li>
              ))}

              {canCreate && (
                <li
                  id={`${listId}-option-${filtered.length}`}
                  role="option"
                  aria-selected={false}
                  onMouseEnter={() => setActiveIndex(filtered.length)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commit(trimmedQuery);
                  }}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium text-secondary transition-colors duration-[var(--duration-instant)] dark:text-blue-400 ${
                    activeIndex === filtered.length
                      ? "bg-surface-container dark:bg-zinc-800"
                      : ""
                  }`}
                >
                  <Plus size={15} />
                  Use “{trimmedQuery}”
                </li>
              )}

              {rowCount === 0 && (
                <li className="px-3 py-3 text-sm text-on-surface-variant dark:text-zinc-500">
                  {emptyMessage}
                </li>
              )}
            </ul>
            {footer && (
              <div className="border-t border-outline-variant p-1.5 dark:border-zinc-700">
                {footer}
              </div>
            )}
          </div>
        )}
      </div>
      {error && (
        <span className="animate-fade-in text-xs text-error">{error}</span>
      )}
      {!error && hint && (
        <span className="text-xs text-on-surface-variant dark:text-zinc-500">
          {hint}
        </span>
      )}
    </div>
  );
}
