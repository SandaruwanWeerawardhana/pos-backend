"use client";

import { Badge } from "@/components/ui/Badge";
import { List } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export interface PageNavSection {
  id: string;
  label: string;
  icon: ReactNode;
  errorCount: number;
}

interface OnThisPageNavProps {
  sections: PageNavSection[];
}

/**
 * Jump list for the form's sections, with the section currently in view
 * highlighted.
 *
 * The spy uses one IntersectionObserver over a band across the upper half of
 * the viewport rather than scroll offsets: a long section and a short one then
 * both light up at the moment their heading reaches reading position, and no
 * work happens on scroll frames.
 */
export function OnThisPageNav({ sections }: Readonly<OnThisPageNavProps>) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const nodes = sections
      .map((section) => document.getElementById(section.id))
      .filter((node): node is HTMLElement => node !== null);
    if (nodes.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // Sections are observed in document order, so the first still-visible
        // one is the one the reader is working through.
        const current = sections.find((section) => visible.has(section.id));
        if (current) setActiveId(current.id);
      },
      { rootMargin: "-88px 0px -55% 0px", threshold: 0 },
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="On this page"
      className="rounded-2xl border border-outline-variant bg-surface-container-lowest/80 p-3 shadow-sm backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80"
    >
      <p className="flex items-center gap-2 px-1.5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant dark:text-zinc-500">
        <List size={13} aria-hidden />
        On this page
      </p>
      <ul className="flex flex-col gap-0.5 border-t border-outline-variant pt-2 dark:border-zinc-800">
        {sections.map((section) => {
          const active = section.id === activeId;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={active ? "true" : undefined}
                className={`flex min-h-9 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-container-low dark:hover:bg-zinc-800/60 ${
                  active
                    ? "bg-primary/10 font-semibold text-primary dark:bg-blue-500/15 dark:text-blue-400"
                    : "text-on-surface-variant dark:text-zinc-400"
                }`}
              >
                <span className="shrink-0" aria-hidden>
                  {section.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{section.label}</span>
                {section.errorCount > 0 && (
                  <Badge variant="danger">{section.errorCount}</Badge>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
