/**
 * ADR-044 Phase 1 — the hub identity capability bootstrap tests (the
 * pure-module law, the my-subjects-sync-status style: NO mock.module —
 * the settlement law is a pure function; the probe's runtime path runs
 * against a minimal window/localStorage shim and a patched global fetch).
 *
 * Pinned here: 200 grants the capability, 401/403/5xx/network settle to
 * null (fail-closed), a drifted 200 body settles to null, the probe never
 * clears a session, one probe per email per session, and the settled value
 * is referentially stable (no snapshot churn on repeat probes).
 *
 * Run: bun test apps/hub/src/lib/identity-editor-capability.test.ts
 */
import { describe, expect, test, beforeEach } from "bun:test";

const {
  probeEditorCapability,
  readEditorCapability,
  resetEditorCapability,
  settleEditorCapability,
} = await import("./identity");

// ── the window/localStorage shim (api.ts reads the session through it) ──────

const store = new Map<string, string>();
let fetchCalls = 0;
let fetchHandler: (url: string, init?: RequestInit) => Response = () =>
  new Response("{}", { status: 403 });
const realFetch = globalThis.fetch;

function installWindow(): void {
  const w = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as Record<string, unknown>).window = w;
}

beforeEach(() => {
  resetEditorCapability();
  store.clear();
  fetchCalls = 0;
  store.set("syllabai.token", "token-1");
  store.set(
    "syllabai.user",
    JSON.stringify({ id: "u1", email: "editor@example.com", displayName: "", roles: ["STUDENT"] }),
  );
  installWindow();
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    fetchCalls += 1;
    return fetchHandler(String(url), init);
  }) as unknown as typeof fetch;
});

// api.ts's TOKEN_KEY / USER_KEY of record — the shim above seeds exactly these
const TOKEN_KEY = "syllabai.token";
const USER_KEY = "syllabai.user";
void TOKEN_KEY;
void USER_KEY;

describe("settleEditorCapability — the pure settlement law (fail-closed)", () => {
  test("200 + the EditorMeView body → the capability", () => {
    expect(settleEditorCapability(200, { editor: true, scopes: ["workbench"] })).toEqual({
      scopes: ["workbench"],
    });
  });

  test("every non-200 verdict → null (401 never becomes a capability)", () => {
    for (const status of [401, 403, 404, 429, 500, 503]) {
      expect(settleEditorCapability(status, { editor: true, scopes: ["workbench"] })).toBeNull();
    }
  });

  test("a drifted 200 body → null (editor:false / garbage scopes / non-object)", () => {
    for (const body of [
      { editor: false, scopes: ["workbench"] },
      { editor: true, scopes: "workbench" },
      { editor: true, scopes: [42] },
      { editor: true },
      "not-an-object",
      null,
    ]) {
      expect(settleEditorCapability(200, body)).toBeNull();
    }
  });
});

describe("probeEditorCapability — the runtime probe law", () => {
  test("200 → the capability settles and the session is untouched", async () => {
    fetchHandler = () =>
      new Response(JSON.stringify({ editor: true, scopes: ["workbench"] }), { status: 200 });
    await probeEditorCapability();
    expect(readEditorCapability()).toEqual({ scopes: ["workbench"] });
    // the session keys survive (the probe is NOT a session authority)
    expect(store.get(TOKEN_KEY)).toBe("token-1");
    expect(JSON.parse(store.get(USER_KEY)!).email).toBe("editor@example.com");
  });

  test("403 (grant-less) / 401 (stale) / 5xx / network → null, fail-closed", async () => {
    for (const status of [401, 403, 500]) {
      resetEditorCapability();
      fetchHandler = () => new Response("{}", { status });
      await probeEditorCapability();
      expect(readEditorCapability()).toBeNull();
    }
    resetEditorCapability();
    fetchHandler = () => {
      throw new TypeError("failed to fetch");
    };
    await probeEditorCapability();
    expect(readEditorCapability()).toBeNull();
    // every settled probe left the session keys in place
    expect(store.get(TOKEN_KEY)).toBe("token-1");
  });

  test("signed-out session → no fetch at all (the editor plane is never contacted)", async () => {
    store.delete(TOKEN_KEY);
    store.delete(USER_KEY);
    await probeEditorCapability();
    expect(fetchCalls).toBe(0);
    expect(readEditorCapability()).toBeNull();
  });

  test("one probe per email per session (a settled probe short-circuits)", async () => {
    fetchHandler = () =>
      new Response(JSON.stringify({ editor: true, scopes: ["workbench"] }), { status: 200 });
    await probeEditorCapability();
    const first = readEditorCapability();
    expect(fetchCalls).toBe(1);
    // repeat probe: the settled guard fires — no second fetch, same reference
    await probeEditorCapability();
    expect(fetchCalls).toBe(1);
    expect(readEditorCapability()).toBe(first); // referential stability — no churn
  });

  test("the probe hits /api/v1/editor/me with the session Bearer token", async () => {
    let seenUrl = "";
    let seenAuth = "";
    let seenInit: RequestInit | undefined;
    globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
      fetchCalls += 1;
      seenInit = init;
      seenUrl = String(url);
      seenAuth = (init?.headers as Record<string, string>)?.Authorization ?? "";
      return new Response(JSON.stringify({ editor: true, scopes: ["workbench"] }), { status: 200 });
    }) as unknown as typeof fetch;
    void seenInit;
    await probeEditorCapability();
    // the editor-me surface of record, resolved through apiPath (the origin
    // and any api-client query decorations vary by deployment; the PATH law
    // and the Bearer law do not)
    expect(seenUrl.includes("/api/v1/editor/me")).toBe(true);
    expect(seenAuth).toBe("Bearer token-1");
    expect(readEditorCapability()).toEqual({ scopes: ["workbench"] });
  });

  test("an account switch re-probes (the settled guard is per-email)", async () => {
    fetchHandler = () =>
      new Response(JSON.stringify({ editor: true, scopes: ["workbench"] }), { status: 200 });
    await probeEditorCapability();
    expect(readEditorCapability()).toEqual({ scopes: ["workbench"] });
    // a different account signs in (fresh user row, cache reset upstream by
    // clearIdentity → resetEditorCapability; the probe settles to ITS view)
    resetEditorCapability();
    fetchHandler = () =>
      new Response(JSON.stringify({ editor: true, scopes: ["workbench", "extra"] }), { status: 200 });
    await probeEditorCapability();
    expect(readEditorCapability()).toEqual({ scopes: ["workbench", "extra"] });
  });
});

// restore the real fetch for the rest of the suite's process lifetime
globalThis.fetch = realFetch;
