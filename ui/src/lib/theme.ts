import type { Theme } from "../domain/types";

const themeStorageKey = "taskboards-theme";

export function storedTheme(): Theme {
  return localStorage.getItem(themeStorageKey) === "light" ? "light" : "dark";
}

export function persistTheme(theme: Theme) {
  localStorage.setItem(themeStorageKey, theme);
}
