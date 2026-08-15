"use client";

import { useEffect, useRef } from "react";

export interface ShortcutBinding {
  /** `event.key` to match, compared case-insensitively. */
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  label: string;
  handler: () => void;
}

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return EDITABLE_TAGS.has(target.tagName) || target.isContentEditable;
}

/**
 * Till shortcuts (F2 pay, F4 hold, …). Bare function keys still fire while a
 * field has focus — a cashier types into search constantly and expects F2 to
 * work regardless — but printable-character bindings are suppressed there so
 * they don't swallow ordinary typing.
 */
export function useKeyboardShortcuts(
  bindings: ShortcutBinding[],
  enabled = true,
): void {
  /**
   * Handlers are captured in a ref so the window listener is attached once
   * rather than being torn down and re-added on every render (callers pass a
   * freshly-built array each time). The ref is written in an effect, never
   * during render.
   */
  const bindingsRef = useRef(bindings);

  useEffect(() => {
    bindingsRef.current = bindings;
  }, [bindings]);

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      /*
       * Auto-repeat from a held key is not a second press. F2 is bound to Pay,
       * so honouring the repeat stream rang up a burst of sales from one
       * leaning-on-the-keyboard moment.
       */
      if (event.repeat) return;

      const match = bindingsRef.current.find(
        (binding) =>
          binding.key.toLowerCase() === event.key.toLowerCase() &&
          Boolean(binding.ctrl) === (event.ctrlKey || event.metaKey) &&
          Boolean(binding.shift) === event.shiftKey &&
          Boolean(binding.alt) === event.altKey,
      );
      if (!match) return;

      const isFunctionKey = /^F\d{1,2}$/i.test(match.key);
      if (!isFunctionKey && !match.ctrl && !match.alt && isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      match.handler();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
