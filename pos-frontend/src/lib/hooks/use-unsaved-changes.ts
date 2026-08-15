"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface UnsavedChangesGuard {
  /** Href the user tried to reach; non-null while the prompt is showing. */
  pendingHref: string | null;
  /** Leaves for `pendingHref`, abandoning the edits. */
  confirmNavigation: () => void;
  /** Dismisses the prompt and stays on the page. */
  cancelNavigation: () => void;
  /** Route away deliberately (e.g. the Cancel button) through the same prompt. */
  requestNavigation: (href: string) => void;
}

// Guards a dirty form against losing work. The browser handles tab close /
// reload via `beforeunload`; in-app navigation has no such hook in the App
// Router, so same-origin link clicks are intercepted in the capture phase and
// routed through a confirmation instead.
export function useUnsavedChanges(dirty: boolean): UnsavedChangesGuard {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Chrome ignores custom text but still requires returnValue to be set.
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;

    function interceptLinkClick(event: MouseEvent) {
      // Let modified clicks (new tab/window) and non-primary buttons through.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingHref(`${url.pathname}${url.search}`);
    }

    document.addEventListener("click", interceptLinkClick, true);
    return () => document.removeEventListener("click", interceptLinkClick, true);
  }, [dirty]);

  const confirmNavigation = useCallback(() => {
    const href = pendingHref;
    setPendingHref(null);
    if (href) router.push(href);
  }, [pendingHref, router]);

  const cancelNavigation = useCallback(() => setPendingHref(null), []);

  const requestNavigation = useCallback(
    (href: string) => {
      if (!dirty) {
        router.push(href);
        return;
      }
      setPendingHref(href);
    },
    [dirty, router],
  );

  return { pendingHref, confirmNavigation, cancelNavigation, requestNavigation };
}
