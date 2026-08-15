"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type ModalSize = "sm" | "md" | "lg" | "xl";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  glass?: boolean;
  size?: ModalSize;
  /** Hides the corner close button for flows that must be resolved by a choice. */
  hideCloseButton?: boolean;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  glass = false,
  size = "md",
  hideCloseButton = false,
}: Readonly<ModalProps>) {
  const panelRef = useRef<HTMLDialogElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Cycles Tab within the dialog. Without this, tabbing walks out of the
  // modal into the page behind it, which screen-reader and keyboard users
  // experience as the dialog silently losing focus.
  const trapFocus = useCallback((event: KeyboardEvent) => {
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Move focus into the dialog so the next Tab starts inside it.
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      const firstField = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (firstField ?? panel)?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "Tab") trapFocus(event);
    }

    // Locking body scroll stops the page behind the overlay from moving
    // under the user's finger on touch devices.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose, trapFocus]);

  if (!open || typeof document === "undefined") return null;

  /**
   * Rendered into document.body rather than in place. A modal opened from
   * inside a <form> — the product form's scanner and quick-add dialogs — would
   * otherwise nest its own <form> inside that one, which is invalid HTML and
   * breaks hydration. The portal also keeps the overlay clear of any ancestor
   * `overflow` or stacking context.
   *
   * React still routes events through the component tree, so a dialog's own
   * submit must stop propagation to avoid also submitting the host form.
   */
  return createPortal(
    <div
      className={`animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 ${
        glass ? "backdrop-blur-sm" : ""
      }`}
    >
      {/* Click-away target. A button (not a click handler on the overlay div)
          so it is reachable and announced rather than being an invisible
          interactive region with no role. */}
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <dialog
        ref={panelRef}
        open
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`animate-slide-up-sheet relative m-0 max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl p-6 text-inherit shadow-popover outline-none sm:animate-scale-in sm:rounded-2xl ${
          SIZE_CLASSES[size]
        } ${
          glass
            ? "border border-white/10 bg-surface-container-lowest/80 backdrop-blur-md dark:bg-zinc-900/90"
            : "border border-outline-variant/30 bg-surface-container-lowest dark:border-zinc-800 dark:bg-zinc-900"
        }`}
      >
        {/* Drag affordance — signals the sheet-style presentation on mobile. */}
        <div
          aria-hidden
          className="mx-auto mb-4 h-1 w-10 rounded-full bg-outline-variant sm:hidden dark:bg-zinc-700"
        />
        {(title || !hideCloseButton) && (
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              {title && (
                <h2
                  id={titleId}
                  className="text-lg font-semibold text-on-surface dark:text-zinc-50"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id={descriptionId}
                  className="mt-1 text-sm text-on-surface-variant dark:text-zinc-400"
                >
                  {description}
                </p>
              )}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:rotate-90 hover:bg-surface-container hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}
        {children}
      </dialog>
    </div>,
    document.body,
  );
}
