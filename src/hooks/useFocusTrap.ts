"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keep keyboard focus inside a dialog while it is open: focus the first control on open,
 * wrap Tab / Shift+Tab at the edges, close on Escape, and hand focus back to whatever was
 * focused before the dialog opened.
 */
export function useFocusTrap<T extends HTMLElement>(onClose: () => void): React.RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = (): HTMLElement[] => (ref.current ? [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)] : []);
    items()[0]?.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const list = items();
      const first = list[0];
      const last = list.at(-1);
      if (!first || !last) return;
      const inside = ref.current?.contains(document.activeElement) ?? false;
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return ref;
}
