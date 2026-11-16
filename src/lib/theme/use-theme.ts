"use client";

import { useCallback, useSyncExternalStore } from "react";

import { THEME_KEY, type Theme } from "./theme";

const CHANGED = "themechange";

function read(): Theme {
  const value = document.documentElement.dataset.theme;
  return value === "light" || value === "dark" ? value : "system";
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  // Another tab changed it.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The chosen theme and a way to change it. The server renders "system". */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);

  const setTheme = useCallback((next: Theme) => {
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage is blocked: the choice still holds for this page.
    }
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  return { theme, setTheme };
}
