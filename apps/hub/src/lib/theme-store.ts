"use client";

/**
 * Quad-theme store — SyllabAI (default), Quiet Green, Candy Shop and Chat
 * App Plum, each light/dark/system.
 *
 * T-THEME-LOCAL-1 run-001 (operator order 2026-11-07: "Theme must be
 * browser saved only"): the theme is a BROWSER record again —
 * localStorage["syllabai-theme"] is the primary store of record, read
 * pre-paint by the inline bootstrap in src/app/layout.tsx (same key, same
 * parsing — keep both in sync). A theme picked on this browser survives
 * sign-out and account switches: it is the browser's, not the account's.
 *
 * The workspace-document "theme" key is the RETIRED carrier of the
 * T-ACCOUNT-ONLY sweep. The one-time migration bridge: on the first
 * account-docs hydration after a login, if THIS browser holds no theme
 * record of its own, the account copy seeds the device record (no user's
 * theme resets to default because of the revert — the sweep's own
 * no-data-loss clause, mirrored); either way the account copy retires with
 * one null PUT (the plane's honest-null row — {value:null} is a legal
 * PUT body, "present, may be null"), and after that the store never reads
 * or writes the account plane again. Deliberately NOT wired to
 * onAccountDocsReset: the account-switch reset broadcast must not clear a
 * browser-owned preference.
 *
 * Deliberately dependency-free: a module store + useSyncExternalStore in
 * the toggle component. No zustand/next-themes so the app shell stays lean.
 */

import {
  isAccountDocsHydrated,
  readDoc,
  subscribeAccountDocs,
  writeDoc,
} from "./account-docs";

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

/** The device key of record — LIVE again under T-THEME-LOCAL-1 (it was
 *  the retired key for the account-only sweep; the account doc "theme" is
 *  the retired carrier now). */
export const THEME_STORAGE_KEY = "syllabai-theme";

/** The RETIRED account doc — read once for the migration bridge, then
 *  nulled. The key stays in the workspace-document vocabulary so existing
 *  rows stay readable (and the GET plane never 400s on legacy rows). */
const RETIRED_ACCOUNT_DOC_KEY = "theme";

const INITIAL: ThemeState = { theme: "sme", mode: "system" };

let state: ThemeState = INITIAL;
const listeners = new Set<() => void>();
let mediaSubscribed = false;
/** Tab-lifetime guard — the account copy is consulted exactly once. */
let accountAdoptionDone = false;

function emit() {
  listeners.forEach((l) => l());
}

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

function persist(next: ThemeState) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked — the theme just won't outlive the tab */
  }
}

/** Validate/normalize any stored record; junk → the default (never throws). */
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

function readDevice(): ThemeState {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return INITIAL;
    return parse(JSON.parse(raw) as unknown);
  } catch {
    return INITIAL; // corrupt record → the honest default
  }
}

// ── the one-time migration bridge (T-THEME-LOCAL-1) ─────────────────────
// The account-only sweep moved every theme record into the account doc
// "theme". This store is the reversal. On the first hydration broadcast
// after a login: a browser with no record of its own adopts the account
// copy; either way the account copy retires (one null PUT — the debounced
// engine flush; a 401 harmlessly drops it, signed-out tabs never get here).
// Once per tab, never again — and a browser that already holds a record
// wins outright ("browser saved only": the device record is never
// overwritten by the account).
function adoptAccountCopyOnce(): void {
  if (accountAdoptionDone) return;
  if (typeof window === "undefined") return;
  if (!isAccountDocsHydrated()) return; // the broadcast re-fires when hydration lands
  accountAdoptionDone = true;
  try {
    const device = window.localStorage.getItem(THEME_STORAGE_KEY);
    const account = readDoc(RETIRED_ACCOUNT_DOC_KEY);
    if (device === null && account !== null && account !== undefined) {
      state = parse(account);
      persist(state);
      apply(state);
      emit();
    }
    if (account !== null && account !== undefined) {
      writeDoc(RETIRED_ACCOUNT_DOC_KEY, null); // retire the account copy
    }
  } catch {
    // adoption never throws — the browser record stands alone regardless
  }
}

// the engine notifies each merged key, then the null-key "hydration
// landed" broadcast — either entry point reaches the same one-time bridge
subscribeAccountDocs((key) => {
  if (key === null || key === RETIRED_ACCOUNT_DOC_KEY) adoptAccountCopyOnce();
});

/**
 * Re-reads the device record and re-applies. The inline bootstrap in
 * layout.tsx has already applied the right visuals pre-paint; this makes
 * the React-side store agree with it (cross-tab edits included). Also
 * runs the migration bridge in case the engine hydrated before this
 * module's first mount. Safe to call multiple times.
 */
export function hydrateTheme(): void {
  if (typeof window === "undefined") return;
  state = readDevice();
  apply(state);
  adoptAccountCopyOnce();
  if (!mediaSubscribed) {
    mediaSubscribed = true;
    // live-follow the OS while mode === "system"
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        if (state.mode === "system") {
          apply(state);
          emit();
        }
      });
  }
  emit();
}

/** React store contract (useSyncExternalStore). */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getThemeState(): ThemeState {
  return state;
}

export function getServerThemeState(): ThemeState {
  // server render + first client render agree on the default; hydration
  // then re-renders if the device record says otherwise (no mismatch error)
  return INITIAL;
}

export function setTheme(partial: Partial<ThemeState>): void {
  state = { ...state, ...partial };
  persist(state);
  apply(state);
  emit();
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

/** Test seam: forget the tab-lifetime adoption guard, so a fixture can
 *  re-run the migration bridge for a fresh "tab" (the production law is
 *  once per tab, forever — same shape as the engine's own
 *  __resetLegacyAdoptionForTests). */
export function __resetAccountAdoptionForTests(): void {
  accountAdoptionDone = false;
}
