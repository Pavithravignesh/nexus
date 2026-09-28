"use client";

import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";
export const THEME_KEY = "nexus-theme";
const EVENT = "nexus-theme-change";

/**
 * Runs before first paint: the saved choice, else dark (the control-room default). Inlined as a
 * string so the page never flashes the wrong theme on reload.
 */
export const themeBootScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark"){t="dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})();`;

const read = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");
const subscribe = (cb: () => void): (() => void) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};

export function ThemeToggle(): React.JSX.Element {
  const theme = useSyncExternalStore(subscribe, read, () => "dark" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const toggle = (): void => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // storage blocked (private mode): the choice lasts for this page only
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return (
    <button type="button" onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} className="num flex items-center gap-1.5 border border-border px-2.5 py-1.5 text-xs text-muted hover:text-text">
      <span aria-hidden>{theme === "dark" ? "☾" : "☀"}</span>
      {theme === "dark" ? "DARK" : "LIGHT"}
    </button>
  );
}
