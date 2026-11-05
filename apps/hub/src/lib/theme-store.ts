"use client";

/**
 * Quad-theme store — SME (default), Quiet Green, Candy Shop and Chat App
 * Plum, each light/dark/system.
 *
 * T-ACCOUNT-ONLY run-001 (operator order 2026-11-05: "remove device-local
 * things completely — every single thing must be saved in account"): the
 * theme is an ACCOUNT doc — the "theme" key of the workspace-document
 * plane. localStorage["syllabai-theme"] is RETIRED: the pre-sweep device
 * record is adopted once (the engine's legacy adoption — it commits up
 * only when the account has no theme of its own) and the device key is
 * removed the moment the account copy is clean. The inline bootstrap in
 * src/app/layout.tsx applies only the system light/dark default pre-paint;
 * the account theme applies when hydration lands, so a non-default theme
 * may briefly flash the default — the honest cost of holding nothing
 * device-local.
 *
 * Deliberately dependency-free: the account-stores kit + useSyncExternalStore
 * in the toggle component. No zustand/next-themes so the app shell stays lean.
 */

import { createAccountStore, type AccountStore } from "./account-stores";

export type ThemeName = "sme" | "quiet-green" | "candy-shop" | "chat-app-plum";
export type ThemeMode = "light" | "dark" | "system";

/** Whitelist — unknown stored values fall back to the default theme. */
const THEME_NAMES: readonly ThemeName[] = [
  "sme",
  "quiet-green",
  "candy-shop",
  "chat-app-plum",
];

export interface ThemeState {
  theme: ThemeName;
  mode: ThemeMode;
}

/** The RETIRED device key — kept as a name only (the legacy adoption's
 *  target and the migration tests' pin; nothing reads it anymore). */
export const THEME_STORAGE_KEY = "syllabai-theme";

const INITIAL: ThemeState = { theme: "sme", mode: "system" };

function parse(raw: unknown): ThemeState {
  if (!raw || typeof raw !== "object") return INITIAL;
  const t = raw as { theme?: unknown; mode?: unknown };
  return {
    theme: THEME_NAMES.includes(t.theme as ThemeName) ? (t.theme as ThemeName) : "sme",
    mode:
      t.mode === "light" || t.mode === "dark" || t.mode === "system"
        ? t.mode
        : "system",
  };
}

const store: AccountStore<ThemeState> = createAccountStore<ThemeState>({
  docKey: "theme",
  initial: INITIAL,
  parse,
  legacyKeys: [THEME_STORAGE_KEY],
  readLegacy: () => {
    try {
      const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as unknown) : null;
    } catch {
      return null; // corrupt record retires without seeding
    }
  },
});

function resolveDark(mode: ThemeMode): boolean {
  if (typeof window === "undefined") return false;
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(next: ThemeState) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", next.theme);
  const dark = resolveDark(next.mode);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

// the DOM application rides EVERY value change — the user's set() and the
// remote adoption (hydration landed / account switch) alike
let mediaSubscribed = false;
store.subscribe(() => apply(store.get()));

/**
 * Applies the current account theme and subscribes the OS-preference
 * listener (live-follow while mode === "system"). Safe to call multiple
 * times. The theme VALUE itself arrives through the account-docs engine —
 * this only wires the DOM + the media listener.
 */
export function hydrateTheme(): void {
  if (typeof window === "undefined") return;
  apply(store.get());
  if (!mediaSubscribed) {
    mediaSubscribed = true;
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        if (store.get().mode === "system") {
          apply(store.get());
        }
      });
  }
}

/** React store contract (useSyncExternalStore). */
export function subscribeTheme(listener: () => void): () => void {
  return store.subscribe(listener);
}

export function getThemeState(): ThemeState {
  return store.get();
}

export function getServerThemeState(): ThemeState {
  // server render + first client render agree on the default; hydration
  // then re-renders if the account says otherwise (no mismatch error)
  return INITIAL;
}

export function setTheme(partial: Partial<ThemeState>): void {
  store.set({ ...store.get(), ...partial });
}

export const THEME_LABEL: Record<ThemeName, string> = {
  // "SME" is the internal design-variant codename (student-facing surfaces
  // must never render it) — the student label is the product name
  // (T-UX-STUDENT-COPY r0).
  sme: "SyllabAI",
  "quiet-green": "Quiet Green",
  "candy-shop": "Candy Shop",
  "chat-app-plum": "Chat App Plum",
};

export const MODE_LABEL: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};
