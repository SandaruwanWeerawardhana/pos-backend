import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

// Native <select> rather than a custom listbox: on touch tills and phones the
// OS picker is larger, faster, and already accessible.
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, options, placeholder, className = "", id, ...props },
  ref,
) {
  const selectId = id ?? props.name;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-on-surface-variant dark:text-zinc-300"
        >
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        className={`w-full cursor-pointer rounded-lg border bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface outline-none transition-[color,background-color,border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:border-outline focus:border-secondary focus:ring-2 focus:ring-primary/40 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-zinc-600 ${
          error ? "border-error" : "border-outline-variant dark:border-zinc-700"
        } ${className}`}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <span className="animate-fade-in text-xs text-error">{error}</span>
      )}
    </div>
  );
});
