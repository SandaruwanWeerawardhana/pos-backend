import type { CSSProperties } from "react";

const STEP_MS = 35;

/*
 * Cap on how many items are allowed to stagger. Past this the delay flattens,
 * so a 500-row table still finishes drawing in a fraction of a second instead
 * of trickling in for twenty. Rows beyond the cap animate together.
 */
const MAX_STEPS = 10;

/**
 * Per-item entrance delay for a list or grid. Written as an inline style
 * rather than a utility class because the index is only known at runtime and
 * Tailwind cannot generate classes it never sees in the source.
 */
export function staggerDelay(index: number): CSSProperties {
  return { animationDelay: `${Math.min(index, MAX_STEPS) * STEP_MS}ms` };
}
