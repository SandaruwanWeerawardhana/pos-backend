"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
} from "react";

type ThemeName = "light" | "dark" | "system";
type ThemeAttribute = "class" | `data-${string}`;

interface ThemeProviderProps extends PropsWithChildren {
  attribute?: ThemeAttribute;
  defaultTheme?: ThemeName;
  disableTransitionOnChange?: boolean;
  enableColorScheme?: boolean;
  enableSystem?: boolean;
  storageKey?: string;
  themes?: ThemeName[];
}

interface ThemeContextValue {
  resolvedTheme: "light" | "dark";
  setTheme: Dispatch<SetStateAction<ThemeName>>;
  systemTheme: "light" | "dark";
  theme: ThemeName;
  themes: ThemeName[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getStoredTheme(storageKey: string, fallback: ThemeName): ThemeName {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(storageKey);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : fallback;
}

function disableTransitions() {
  const style = document.createElement("style");
  style.appendChild(document.createTextNode("*{transition:none!important}"));
  document.head.appendChild(style);
  window.getComputedStyle(document.body);
  setTimeout(() => document.head.removeChild(style), 1);
}

export function ThemeProvider({
  attribute = "class",
  children,
  defaultTheme = "light",
  disableTransitionOnChange = false,
  enableColorScheme = true,
  enableSystem = true,
  storageKey = "theme",
  themes = ["light", "dark"],
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeName>(defaultTheme);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const syncStoredTheme = () =>
      setThemeState(getStoredTheme(storageKey, defaultTheme));
    syncStoredTheme();
  }, [defaultTheme, storageKey]);

  const resolvedTheme = theme === "system" && enableSystem ? systemTheme : theme;
  const htmlTheme: "light" | "dark" =
    resolvedTheme === "dark" ? "dark" : "light";

  const setTheme = useCallback<Dispatch<SetStateAction<ThemeName>>>(
    (value) => {
      setThemeState((current) => {
        const next = typeof value === "function" ? value(current) : value;
        window.localStorage.setItem(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => setSystemTheme(getSystemTheme());
    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    const syncStoredTheme = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      setThemeState(getStoredTheme(storageKey, defaultTheme));
    };
    window.addEventListener("storage", syncStoredTheme);
    return () => window.removeEventListener("storage", syncStoredTheme);
  }, [defaultTheme, storageKey]);

  useEffect(() => {
    if (disableTransitionOnChange) disableTransitions();

    const root = document.documentElement;
    if (attribute === "class") {
      root.classList.remove(...themes);
      root.classList.add(htmlTheme);
    } else {
      root.setAttribute(attribute, htmlTheme);
    }
    if (enableColorScheme) root.style.colorScheme = htmlTheme;
  }, [
    attribute,
    disableTransitionOnChange,
    enableColorScheme,
    htmlTheme,
    themes,
  ]);

  const value = useMemo(
    () => ({
      resolvedTheme: htmlTheme,
      setTheme,
      systemTheme,
      theme,
      themes: enableSystem ? [...themes, "system" as ThemeName] : themes,
    }),
    [enableSystem, htmlTheme, setTheme, systemTheme, theme, themes],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
