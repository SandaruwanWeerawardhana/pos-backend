import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg" | "xl";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows an inline spinner and blocks input without collapsing the button width. */
  loading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-secondary text-on-secondary hover:bg-secondary/90 hover:shadow-elevated dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200",
  secondary:
    "bg-surface-container text-on-surface hover:bg-surface-container-high dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700",
  ghost:
    "bg-transparent text-on-surface-variant hover:bg-surface-container dark:text-zinc-300 dark:hover:bg-zinc-800",
  outline:
    "border border-outline-variant bg-transparent text-on-surface hover:bg-surface-container dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800",
  danger: "bg-error text-on-error hover:bg-error/90",
};

// Minimum heights keep every control at or above the ~44px touch target
// recommended for till and tablet use, even at the smallest size.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 py-1.5 text-xs",
  md: "min-h-11 px-5 py-2.5 text-sm",
  lg: "min-h-12 px-8 py-3 text-base",
  xl: "min-h-16 px-8 py-4 text-lg",
};

const SPINNER_SIZES = {
  sm: "sm",
  md: "sm",
  lg: "md",
  xl: "md",
} as const;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    fullWidth = false,
    loading = false,
    className = "",
    children,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={`inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97] active:duration-[var(--duration-instant)] disabled:pointer-events-none disabled:opacity-50 disabled:hover:scale-100 ${
        VARIANT_CLASSES[variant]
      } ${SIZE_CLASSES[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading && <Spinner size={SPINNER_SIZES[size]} label={null} />}
      {children}
    </button>
  );
});
