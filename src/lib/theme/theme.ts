// Theme — docs/SPEC.md → "Design system → Dark theme".
// "system" follows the device and stores nothing; "light" and "dark" are the
// person's choice, kept in this browser.

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_KEY = "theme";

/**
 * Runs in <head> before the first paint, so a chosen theme never flashes the
 * other one. Kept as a string: it is inlined into the page.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
