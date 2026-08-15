import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, error, hint, className = "", id, rows = 4, ...props },
    ref,
  ) {
    const textareaId = id ?? props.name;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-sm font-medium text-on-surface-variant dark:text-zinc-300"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-invalid={error ? true : undefined}
          className={`w-full resize-y rounded-lg border bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface outline-none transition-[color,background-color,border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:border-outline focus:border-secondary focus:ring-2 focus:ring-primary/40 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:hover:border-zinc-600 ${
            error ? "border-error" : "border-outline-variant dark:border-zinc-700"
          } ${className}`}
          {...props}
        />
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
  },
);
