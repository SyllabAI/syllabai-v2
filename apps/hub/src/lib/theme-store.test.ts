/**
 * theme-store fixtures — T-THEME-LOCAL-1 run-001.
 *
 * The REAL store over the REAL engine: the api plane methods patched at
 * runtime (NO mock.module — the run-003 order-independence law), hydration
 * driven by the REAL hydrate chain (the merge-loop notifications + the
 * null-key completion broadcast). The laws under test:
 *
 *   - the browser record is PRIMARY: set() writes
 *     localStorage["syllabai-theme"] and hydrateTheme() reads it back
 *     (cross-tab edits included)
 *   - the theme SURVIVES SIGN-OUT: the engine's reset broadcast leaves
 *     both the store's value and the device record untouched (the store is
 *     deliberately not wired to onAccountDocsReset)
 *   - the RETIRED account doc "theme" is adopted ONCE per tab, and only
 *     when the device holds no record of its own (device wins — "browser
 *     saved only" means the account never overwrites the browser)
 *   - the account copy RETIRES: adoption is followed by exactly one null
 *     PUT for "theme"; a second hydration never re-PUTs
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// ── the DOM-less window stub (BEFORE any store code runs) ───────────────
// Same shape as the account-docs-stores fixtures: a Map-backed localStorage
// with the full Storage surface, plus the matchMedia stub hydrateTheme's
// media listener needs (no real DOM in bun).
const winStore = new Map<string, string>();
const winListeners = new Map<string, Array<() => void>>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => winStore.get(k) ?? null,
    setItem: (k: string, v: string) => void winStore.set(k, String(v)),
    removeItem: (k: string) => void winStore.delete(k),
    clear: () => winStore.clear(),
    get length() {
      return winStore.size;
    },
    key: (i: number) => [...winStore.keys()][i] ?? null,
  },
  matchMedia: () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
  addEventListener: (t: string, cb: () => void) =>
    void (winListeners.get(t)?.push(cb) ?? winListeners.set(t, [cb])),
  removeEventListener: (t: string, cb: () => void) => {
    const l = winListeners.get(t);
    if (l) winListeners.set(t, l.filter((x) => x !== cb));
  },
  dispatchEvent: () => true,
};

import type { WorkspaceDoc, WorkspaceDocList } from "@syllabai/contracts";

process.env.NEXT_PUBLIC_API_V2_BASE_URL ??= "https://v2.example";

const { api } = await import("./api");

const ME = "me@example.edu";
let listDocs: WorkspaceDocList["documents"] = [];
const putCalls: Array<{ key: string; value: unknown }> = [];

api.workspaceDocs = async (): Promise<WorkspaceDocList> => ({ documents: listDocs });
api.putWorkspaceDoc = async (key: string, value: unknown): Promise<WorkspaceDoc> => {
  putCalls.push({ key, value });
  return { key, value, updatedAt: "2026-11-07T00:00:00.000Z" };
};

const { hydrateAccountDocs, resetAccountDocs, __flushAllForTests } = await import(
  "./account-docs"
);
const {
  THEME_STORAGE_KEY,
  getThemeState,
  setTheme,
  hydrateTheme,
  subscribeTheme,
  __resetAccountAdoptionForTests,
} = await import("./theme-store");

function themeDoc(value: unknown): WorkspaceDoc {
  return { key: "theme", value, updatedAt: "2026-11-06T00:00:00.000Z" } as WorkspaceDoc;
}

function themePuts(): Array<{ key: string; value: unknown }> {
  return putCalls.filter((p) => p.key === "theme");
}

beforeEach(() => {
  resetAccountDocs();
  winStore.clear();
  putCalls.length = 0;
  listDocs = [];
  __resetAccountAdoptionForTests();
});

afterEach(() => {
  resetAccountDocs();
});

describe("theme-store — the browser record is primary", () => {
  test("set() persists localStorage['syllabai-theme']; hydrateTheme() reads it back", () => {
    hydrateTheme();
    expect(getThemeState()).toEqual({ theme: "sme", mode: "system" });

    setTheme({ theme: "candy-shop", mode: "dark" });
    expect(getThemeState()).toEqual({ theme: "candy-shop", mode: "dark" });
    expect(winStore.get(THEME_STORAGE_KEY)).toBe(
      JSON.stringify({ theme: "candy-shop", mode: "dark" }),
    );

    // a cross-tab edit (another tab wrote the record directly)
    winStore.set(
      THEME_STORAGE_KEY,
      JSON.stringify({ theme: "quiet-green", mode: "light" }),
    );
    hydrateTheme();
    expect(getThemeState()).toEqual({ theme: "quiet-green", mode: "light" });
  });

  test("junk in the device record parses to the honest default", () => {
    winStore.set(THEME_STORAGE_KEY, "{not json");
    hydrateTheme();
    expect(getThemeState()).toEqual({ theme: "sme", mode: "system" });

    winStore.set(THEME_STORAGE_KEY, JSON.stringify({ theme: "nope", mode: 42 }));
    hydrateTheme();
    expect(getThemeState()).toEqual({ theme: "sme", mode: "system" });
  });

  test("subscribers see every set()", () => {
    let seen = 0;
    const unsub = subscribeTheme(() => {
      seen += 1;
    });
    setTheme({ mode: "dark" });
    setTheme({ theme: "chat-app-plum" });
    unsub();
    setTheme({ mode: "light" });
    expect(seen).toBe(2);
    expect(getThemeState()).toEqual({ theme: "chat-app-plum", mode: "light" });
  });
});

describe("theme-store — the theme survives sign-out", () => {
  test("the engine's reset broadcast leaves the value AND the device record untouched", async () => {
    hydrateTheme();
    setTheme({ theme: "quiet-green", mode: "dark" });

    // sign-out / account switch: the engine clears its own memory and
    // fires every registered reset listener — the theme store registers
    // none, so the browser-owned preference must survive verbatim
    resetAccountDocs();

    expect(getThemeState()).toEqual({ theme: "quiet-green", mode: "dark" });
    expect(winStore.get(THEME_STORAGE_KEY)).toBe(
      JSON.stringify({ theme: "quiet-green", mode: "dark" }),
    );
  });
});

describe("theme-store — the retired account doc 'theme'", () => {
  test("adoption: an account doc seeds the device record ONLY when the device holds none", async () => {
    hydrateTheme();
    listDocs = [themeDoc({ theme: "quiet-green", mode: "dark" })];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();

    // the account copy landed in the browser record
    expect(getThemeState()).toEqual({ theme: "quiet-green", mode: "dark" });
    expect(winStore.get(THEME_STORAGE_KEY)).toBe(
      JSON.stringify({ theme: "quiet-green", mode: "dark" }),
    );
    // …and the account copy retired with exactly one null PUT
    expect(themePuts()).toEqual([{ key: "theme", value: null }]);
  });

  test("device wins: the account doc NEVER overwrites a browser record", async () => {
    hydrateTheme();
    setTheme({ theme: "candy-shop", mode: "light" }); // the browser's own choice
    putCalls.length = 0;

    listDocs = [themeDoc({ theme: "chat-app-plum", mode: "dark" })];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();

    // the browser record stands; the stale account copy still retires
    expect(getThemeState()).toEqual({ theme: "candy-shop", mode: "light" });
    expect(winStore.get(THEME_STORAGE_KEY)).toBe(
      JSON.stringify({ theme: "candy-shop", mode: "light" }),
    );
    expect(themePuts()).toEqual([{ key: "theme", value: null }]);
  });

  test("the retirement PUT fires once — a second hydration never re-PUTs", async () => {
    hydrateTheme();
    listDocs = [themeDoc({ theme: "quiet-green", mode: "dark" })];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();
    expect(themePuts()).toHaveLength(1);

    // a fresh engine cycle (relogin in the same tab): the server row is
    // now the honest null — nothing left to adopt, nothing left to retire
    resetAccountDocs();
    __resetAccountAdoptionForTests();
    putCalls.length = 0;
    winStore.delete(THEME_STORAGE_KEY); // even a wiped browser adopts nothing now
    hydrateTheme(); // the fresh mount reads the (absent) device record
    listDocs = [];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();

    expect(themePuts()).toEqual([]);
    expect(getThemeState()).toEqual({ theme: "sme", mode: "system" });
  });

  test("no account plane traffic when the account never had a theme", async () => {
    hydrateTheme();
    await hydrateAccountDocs(ME);
    await __flushAllForTests();

    expect(themePuts()).toEqual([]);
    expect(getThemeState()).toEqual({ theme: "sme", mode: "system" });
  });
});
