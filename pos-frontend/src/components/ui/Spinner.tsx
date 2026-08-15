type SpinnerSize = "sm" | "md" | "lg";

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  /** Announced to assistive tech; pass null for spinners inside a labelled control. */
  label?: string | null;
}

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: "h-3.5 w-3.5 border-[1.5px]",
  md: "h-4 w-4 border-2",
  lg: "h-6 w-6 border-2",
};

/*
 * Border-based ring rather than an SVG so it inherits `currentColor` from
 * whatever control hosts it and costs no extra paint layer on till hardware.
 */
export function Spinner({
  size = "md",
  className = "",
  label = "Loading",
}: Readonly<SpinnerProps>) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-live={label ? "polite" : undefined}
      aria-hidden={label ? undefined : true}
      className={`inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent align-[-0.125em] ${SIZE_CLASSES[size]} ${className}`}
    >
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
