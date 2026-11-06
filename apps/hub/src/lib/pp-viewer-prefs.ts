"use client";

/**
 * Past-paper viewer preferences (s143) + the ink hint flag — ONE account
 * doc ("pdf-viewer-prefs", T-ACCOUNT-ONLY run-001), shared by every pane
 * and every paper — "the viewer's setup", not per-document state. Fields
 * are validated against TODAY's constants on read, so a record written by
 * an older build (shorter ladder, no spread) degrades safely.
 *
 * The retired device records ("pp-viewer-prefs-v1" and the ink hint
 * "syllabai.ink-hint-done") are adopted once per tab (the engine's legacy
 * adoption) and removed the moment the account copy is clean.
 */
import { createAccountStore, type AccountStore } from "./account-stores";

export type PpFitMode = "width" | "page";
export type PpRot = 0 | 90 | 180 | 270;

export interface PpPrefs {
  fit: PpFitMode;
  /** ladder MULTIPLIER — portable across papers, it is relative to the fit base */
  zoom: number;
  rot: PpRot;
  spread: boolean;
  /** the one-time ink hint ("your ink saves to your account") — shown once */
  inkHintSeen?: boolean;
}

/** The zoom ladder of record (pdf-pane re-exports; a stored step outside
 *  the ladder falls back to the default on read). */
export const PP_ZOOM_LADDER = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export const PP_DEFAULT_PREFS: PpPrefs = { fit: "width", zoom: 1, rot: 0, spread: false };

function parse(raw: unknown): PpPrefs {
  if (!raw || typeof raw !== "object") return PP_DEFAULT_PREFS;
  const p = raw as Partial<PpPrefs>;
  return {
    fit: p.fit === "page" || p.fit === "width" ? p.fit : PP_DEFAULT_PREFS.fit,
    zoom:
      typeof p.zoom === "number" && PP_ZOOM_LADDER.includes(p.zoom)
        ? p.zoom
        : PP_DEFAULT_PREFS.zoom,
    rot: p.rot === 90 || p.rot === 180 || p.rot === 270 ? p.rot : PP_DEFAULT_PREFS.rot,
    spread: typeof p.spread === "boolean" ? p.spread : PP_DEFAULT_PREFS.spread,
    inkHintSeen: p.inkHintSeen === true ? true : undefined,
  };
}

/** The RETIRED device keys (the legacy adoption's targets). */
export const RETIRED_PP_PREFS_KEYS = ["pp-viewer-prefs-v1", "syllabai.ink-hint-done"] as const;

const store: AccountStore<PpPrefs> = createAccountStore<PpPrefs>({
  docKey: "pdf-viewer-prefs",
  initial: PP_DEFAULT_PREFS,
  parse,
  legacyKeys: RETIRED_PP_PREFS_KEYS,
  readLegacy: () => {
    // compose both retired records into ONE doc shape
    try {
      const raw = window.localStorage.getItem("pp-viewer-prefs-v1");
      const prefs = raw ? (JSON.parse(raw) as Partial<PpPrefs>) : {};
      let hint: unknown;
      try {
        hint = window.localStorage.getItem("syllabai.ink-hint-done");
      } catch {
        hint = null;
      }
      if (hint === "1") return { ...prefs, inkHintSeen: true };
      return prefs;
    } catch {
      return PP_DEFAULT_PREFS;
    }
  },
});

export function getPpPrefs(): PpPrefs {
  return store.get();
}

/** Merge one patch into the account doc (the write of record). */
export function updatePpPrefs(patch: Partial<PpPrefs>): void {
  store.set({ ...store.get(), ...patch });
}

export function subscribePpPrefs(cb: () => void): () => void {
  return store.subscribe(cb);
}

export function ppPrefsHydrated(): boolean {
  return store.hydrated();
}
