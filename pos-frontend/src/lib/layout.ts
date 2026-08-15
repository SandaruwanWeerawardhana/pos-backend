/**
 * Sidebar width, in one place. The office layout, the auth skeleton that
 * stands in for it during hydration, and the header offset must agree — when
 * they drifted apart the server rendered one width and the client another,
 * which React reports as a hydration attribute mismatch.
 *
 * These are whole class names on purpose: Tailwind scans source text, so an
 * interpolated `w-${size}` would never be generated.
 */
export const SIDEBAR_WIDTH_CLASS = "w-64";
export const SIDEBAR_CONTENT_OFFSET_CLASS = "md:pl-64";
export const SIDEBAR_HEADER_OFFSET_CLASS = "md:left-64";
