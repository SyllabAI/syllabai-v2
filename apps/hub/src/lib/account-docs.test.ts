/**
 * account-docs engine fixtures — T-AUDIT-TIER1 run-003.
 *
 * The ./api module is REPLACED (bun mock.module) so the engine runs over
 * captured calls: the PUT receipts, the hydration list, the 401 and 500
 * failure classes. The visibility stub arms the re-arm law without a real
 * DOM (bun has no `document` — the fixture installs one).
 */
import { describe, expect, mock, test } from "bun:test";

export class FakeApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const putCalls: Array<{ key: string; value: unknown }> = [];
let putImpl: (key: string, value: unknown) => Promise<unknown> = async (key, value) => ({
  key,
  value,
  updatedAt: "2026-11-05T00:00:00.000Z",
});
let listImpl: () => Promise<unknown> = async () => ({ documents: [] });

mock.module("./api", () => ({
  ApiError: FakeApiError,
  api: {
    workspaceDocs: () => listImpl(),
    putWorkspaceDoc: (key: string, value: unknown) => {
      putCalls.push({ key, value });
      return putImpl(key, value);
    },
    deleteWorkspaceDoc: async () => undefined,
  },
}));
mock.module("@/lib/api", () => ({
  ApiError: FakeApiError,
  api: {
    workspaceDocs: () => listImpl(),
    putWorkspaceDoc: (key: string, value: unknown) => {
      putCalls.push({ key, value });
      return putImpl(key, value);
    },
    deleteWorkspaceDoc: async () => undefined,
  },
  clearSession: () => undefined,
  currentUser: async () => null,
  getToken: () => null,
}));

const {
  readDoc,
  writeDoc,
  flushDoc,
  hydrateAccountDocs,
  isAccountDocsHydrated,
  resetAccountDocs,
  __needsSwitchReset,
  __seedAccountDocsForTests,
  __flushAllForTests,
} = await import("./account-docs");

const DOC = "tutor-threads";

function freshEngine() {
  resetAccountDocs();
  putCalls.length = 0;
  putImpl = async (key, value) => ({ key, value, updatedAt: "2026-11-05T00:00:00.000Z" });
  listImpl = async () => ({ documents: [] });
}

describe("account-docs engine", () => {
  test("writeDoc schedules a debounced PUT; the flush carries the whole value", async () => {
    freshEngine();
    writeDoc(DOC, { threads: [{ id: "t1" }] });
    expect(readDoc(DOC)).toEqual({ threads: [{ id: "t1" }] });
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].key).toBe(DOC);
    expect(putCalls[0].value).toEqual({ threads: [{ id: "t1" }] });
  });

  test("rapid writes coalesce to ONE PUT carrying the LAST value", async () => {
    freshEngine();
    writeDoc(DOC, { v: 1 });
    writeDoc(DOC, { v: 2 });
    writeDoc(DOC, { v: 3 });
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].value).toEqual({ v: 3 });
  });

  test("hydration adopts the server docs (clean), single-flight", async () => {
    freshEngine();
    let listCalls = 0;
    listImpl = async () => {
      listCalls += 1;
      return { documents: [{ key: DOC, value: { threads: [{ id: "s1" }] }, updatedAt: "2026-11-05T00:00:00.000Z" }] };
    };
    await Promise.all([
      hydrateAccountDocs("me@example.edu"),
      hydrateAccountDocs("me@example.edu"),
    ]);
    expect(listCalls).toBe(1); // single-flight
    expect(isAccountDocsHydrated()).toBe(true);
    expect(readDoc(DOC)).toEqual({ threads: [{ id: "s1" }] });
  });

  test("a DIRTY key wins over hydration; the server value is ignored and flushed after", async () => {
    freshEngine();
    writeDoc(DOC, { threads: [{ id: "local1" }] }); // dirty, pending
    listImpl = async () => ({
      documents: [{ key: DOC, value: { threads: [{ id: "server1" }] }, updatedAt: "2026-11-05T00:00:00.000Z" }],
    });
    await hydrateAccountDocs("me@example.edu");
    expect(readDoc(DOC)).toEqual({ threads: [{ id: "local1" }] }); // dirty wins
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].value).toEqual({ threads: [{ id: "local1" }] }); // the LOCAL value flew
  });

  test("a known key ABSENT on the server becomes the explicit null; never-seen keys stay undefined", async () => {
    freshEngine();
    __seedAccountDocsForTests({ [DOC]: { old: true } });
    listImpl = async () => ({ documents: [] }); // the key is ABSENT on the server
    await hydrateAccountDocs("me@example.edu"); // hydrate does NOT reset memory — the seeded key is "known"
    expect(readDoc(DOC)).toBeNull(); // absent clean → the explicit null
    expect(readDoc("cla-question-threads")).toBeUndefined(); // never seen
    expect(isAccountDocsHydrated()).toBe(true);
  });

  test("401 flush drops the dirty flag, keeps the value, never re-PUTs", async () => {
    freshEngine();
    putImpl = async () => {
      throw new FakeApiError(401, "Session expired — please sign in again.");
    };
    writeDoc(DOC, { v: "keep-me" });
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1);
    expect(readDoc(DOC)).toEqual({ v: "keep-me" }); // memory keeps the cache
    await flushDoc(DOC); // the dropped flag means this is a no-op
    expect(putCalls).toHaveLength(1);
  });

  test("a 500 flush keeps the dirty flag and re-arms on visibilitychange", async () => {
    freshEngine();
    let fail = true;
    putImpl = async () => {
      if (fail) throw new FakeApiError(500, "the server hit an error");
      return { key: DOC, value: null, updatedAt: "2026-11-05T00:00:00.000Z" };
    };
    writeDoc(DOC, { v: "retry-me" });
    await __flushAllForTests(); // fails — no document yet, no re-arm
    expect(putCalls).toHaveLength(1);
    expect(readDoc(DOC)).toEqual({ v: "retry-me" });

    // install the visibility channel, re-arm through the real path, retry
    const listeners: Array<() => void> = [];
    const doc = {
      _state: "hidden",
      get visibilityState() {
        return this._state;
      },
      addEventListener: (_t: string, cb: () => void) => listeners.push(cb),
      removeEventListener: (_t: string, cb: () => void) => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      },
    };
    (globalThis as { document?: unknown }).document = doc;
    try {
      await flushDoc(DOC); // fails again — and NOW the re-arm handler installs
      expect(listeners).toHaveLength(1);
      fail = false;
      doc._state = "visible";
      for (const cb of [...listeners]) cb(); // the visibility fires the retry
      await new Promise((r) => setTimeout(r, 0));
      expect(putCalls.length).toBe(3); // 2 failed legs + the retried one
      expect(readDoc(DOC)).toEqual({ v: "retry-me" }); // and it went clean
    } finally {
      delete (globalThis as { document?: unknown }).document;
    }
  });

  test("the switch-reset truth table (pure)", () => {
    expect(__needsSwitchReset(null, null)).toBe(false);
    expect(__needsSwitchReset("a@x", null)).toBe(false);
    expect(__needsSwitchReset(null, "b@x")).toBe(false);
    expect(__needsSwitchReset("a@x", "a@x")).toBe(false);
    expect(__needsSwitchReset("a@x", "b@x")).toBe(true);
  });

  test("a dirty value composed under A never crosses into B (switch reset)", async () => {
    freshEngine();
    writeDoc(DOC, { v: "a-secret" });
    expect(readDoc(DOC)).toEqual({ v: "a-secret" });
    resetAccountDocs(); // the account switch
    expect(readDoc(DOC)).toBeUndefined();
    await __flushAllForTests();
    expect(putCalls).toHaveLength(0); // the timer died with the memory
  });

  test("seed flips hydrated FIRST and installs clean values (the run-003 order law)", () => {
    freshEngine();
    expect(isAccountDocsHydrated()).toBe(false);
    __seedAccountDocsForTests({ [DOC]: { seeded: true } });
    expect(isAccountDocsHydrated()).toBe(true); // BEFORE any bridge could look
    expect(readDoc(DOC)).toEqual({ seeded: true });
  });

  test("a hydration failure keeps hydrated false (device-local state untouched, retry converges)", async () => {
    freshEngine();
    listImpl = async () => {
      throw new FakeApiError(500, "the server hit an error");
    };
    await hydrateAccountDocs("me@example.edu");
    expect(isAccountDocsHydrated()).toBe(false);
    listImpl = async () => ({ documents: [] });
    await hydrateAccountDocs("me@example.edu");
    expect(isAccountDocsHydrated()).toBe(true);
  });
});
