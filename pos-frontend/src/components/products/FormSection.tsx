"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

interface FormSectionProps {
  id: string;
  title: string;
  description?: string;
  icon: ReactNode;
  children: ReactNode;
  /** Number of validation errors inside this section, shown on the header. */
  errorCount?: number;
  defaultOpen?: boolean;
  /** Renders as a plain in-page heading with no card, border, or collapse —
   * used when several sections are combined under one outer card. */
  plain?: boolean;
}

/**
 * Card + disclosure. Sections stay collapsible at every width because a
 * grocery product has seven groups of fields — being able to fold the ones
 * you are not filling in is what makes the page usable on a tablet.
 */
export function FormSection({
  id,
  title,
  description,
  icon,
  children,
  errorCount = 0,
  defaultOpen = true,
  plain = false,
}: Readonly<FormSectionProps>) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `${id}-panel`;

  if (plain) {
    return (
      <section id={id} className="scroll-mt-20">
        {children}
      </section>
    );
  }

  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="animate-fade-in-up scroll-mt-20 overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest/80 shadow-sm backdrop-blur-sm transition-[box-shadow,border-color] duration-[var(--duration-base)] ease-[var(--ease-standard)] hover:border-outline hover:shadow-elevated dark:border-zinc-800 dark:bg-zinc-900/80 dark:hover:border-zinc-700"
    >
      <h2 id={`${id}-heading`}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className="group flex min-h-14 w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-container-low focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-5 dark:hover:bg-zinc-800/60"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-[var(--duration-base)] ease-[var(--ease-spring)] group-hover:scale-110 dark:bg-blue-500/15 dark:text-blue-400">
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-on-surface dark:text-zinc-50">
              {title}
            </span>
            {description && (
              <span className="mt-0.5 block truncate text-xs text-on-surface-variant dark:text-zinc-500">
                {description}
              </span>
            )}
          </span>
          {errorCount > 0 && (
            <Badge variant="danger">
              {errorCount} {errorCount === 1 ? "issue" : "issues"}
            </Badge>
          )}
          <ChevronDown
            size={18}
            aria-hidden
            className={`shrink-0 text-on-surface-variant transition-transform duration-[var(--duration-fast)] dark:text-zinc-500 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </h2>
      <div id={panelId} hidden={!open} className="border-t border-outline-variant px-4 py-5 sm:px-5 dark:border-zinc-800">
        {children}
      </div>
    </section>
  );
}

/**
 * Marks a field as mandatory in a way that is announced, not just coloured.
 */
export function RequiredMark() {
  return (
    <>
      <span aria-hidden className="text-error">
        {" *"}
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}
