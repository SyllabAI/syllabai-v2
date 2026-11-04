/**
 * account-docs-records fixtures — T-AUDIT-TIER1 run-004.
 *
 * The SAME harness law the run-003 suites established: the exported `api`
 * OBJECT is patched at runtime (NO mock.module — the module graph stays
 * real so a same-process `bun test` run cannot clobber the other fixtures'
 * module-level env bindings), the engine is REAL, and the fake store runs
 * the real apply→mirror chain. bun has no DOM: the fixture installs the
 * `window.localStorage` the owner-tag side-law reads.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// ── the DOM-less window stub (BEFORE any store code runs) ───────────────
const tagStore = new Map<string, string>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => tagStore.get(k) ?? null,
    setItem: (k: string, v: string) => void tagStore.set(k, String(v)),
    removeItem: (k: string) => void tagStore.delete(k),
    clear: () => tagStore.clear(),
  },
};

import type { WorkspaceDoc } from "@syllabai/contracts";

// The v2-surface fixture pins this exact env value before its own import;
// setting it here (ONLY when unset) keeps the ONE api.ts evaluation —
// whichever fixture runs first in the process — bound to the same dual-run
// posture, so `bun test src/lib` is order-independent.
process.env.NEXT_PUBLIC_API_V2_BASE_URL ??= "https://v2.example";

const { api } = await import("./api");

const putCalls: Array<{ key: string; value: unknown }> = [];
api.workspaceDocs = async () => ({ documents: [] });
api.putWorkspaceDoc = async (key: string, value: unknown): Promise<WorkspaceDoc> => {
  putCalls.push({ key, value });
  return { key, value, updatedAt: "2026-11-06T00:00:00.000Z" };
};

const {
  mirrorDocPoolState,
  bridgeDocPool,
  unionByStamp,
  stampOf,
  capByStamp,
  atOf,
} = await import("./account-docs-records");
const { readPoolOwner, stampPoolOwner, ownerTagKey } = await import("./account-docs-bridge");
const { __seedAccountDocsForTests, __flushAllForTests, resetAccountDocs, readDoc } =
  await import("./account-docs");

type E = Record<string, unknown>;

const DOC = "progress:igcse-chemistry-19";
const LOCAL_KEY = "syllabai-hub:progress:igcse-chemistry-19";
const ME = "me@example.edu";

let hydratedImpl: () => boolean = () => false;
let emailImpl: () => string | null = () => ME;
let liveUnregister: (() => void) | null = null;

function makeFakePool(initial: Record<string, E> = {}) {
  liveUnregister?.(); // never two live bridges for one docKey in a process
  let pool: Record<string, E> = initial;
  let applyCalls = 0;
  const unregister = bridgeDocPool<Record<string, E>, E>({
    localKey: LOCAL_KEY,
    docKey: DOC,
    cap: 40,
    readState: () => pool,
    readPool: (s) => s,
    apply: (next) => {
      applyCalls += 1;
      pool = next;
      mirrorDocPoolState(DOC, pool); // the real stores' commit→…→persist tail
    },
    merge: (local, server) => unionByStamp(local, server),
    stamp: (p) => stampOf(p),
    getAuthEmail: () => emailImpl(),
    isHydrated: () => hydratedImpl(),
  });
  liveUnregister = unregister;
  return {
    get pool() {
      return pool;
    },
    get applyCalls() {
      return applyCalls;
    },
    setLocal(next: Record<string, E>) {
      pool = next;
      mirrorDocPoolState(DOC, pool);
    },
    unregister,
  };
}

beforeEach(() => {
  resetAccountDocs();
  hydratedImpl = () => false;
  emailImpl = () => ME;
  putCalls.length = 0;
  tagStore.clear();
});

afterEach(() => {
  liveUnregister?.();
  liveUnregister = null;
});

describe("account-docs-records — the shared helpers", () => {
  test("atOf: number, ISO string, junk → 0", () => {
    expect(atOf(1730000000000)).toBe(1730000000000);
    expect(atOf("2026-11-06T00:00:00.000Z")).toBe(Date.parse("2026-11-06T00:00:00.000Z"));
    expect(atOf(undefined)).toBe(0);
    expect(atOf("not a date")).toBe(0);
    expect(atOf(Number.NaN)).toBe(0);
  });

  test("unionByStamp: newer wins, tie → server, junk dropped, both directions", () => {
    const server = { a: { at: 10, v: "sv" }, b: { at: 5 } };
    const local = { a: { at: 20, v: "lv" }, c: { at: 7 }, junk: null };
    const merged = unionByStamp(local, server);
    expect(merged.a).toEqual({ at: 20, v: "lv" }); // newer local wins
    expect(merged.b).toEqual({ at: 5 }); // server-only survives
    expect(merged.c).toEqual({ at: 7 }); // local-only survives
    expect(merged.junk).toBeUndefined(); // junk dropped
    const reverse = unionByStamp({ a: { at: 10, v: "lv" } }, { a: { at: 10, v: "sv" } });
    expect(reverse.a).toEqual({ at: 10, v: "sv" }); // tie → server
  });

  test("unionByStamp honours a custom stamp field (the savedAt stores)", () => {
    const merged = unionByStamp(
      { d: { savedAt: "2026-11-05T00:00:00.000Z", v: "old" } },
      { d: { savedAt: "2026-11-06T00:00:00.000Z", v: "new" } },
      "savedAt",
    );
    expect(merged.d).toEqual({ savedAt: "2026-11-06T00:00:00.000Z", v: "new" });
  });

  test("stampOf sees ONLY key:at multisets (the cap ping-pong guard)", () => {
    expect(stampOf({ a: { at: 1, x: "one" } })).toBe(stampOf({ a: { at: 1, x: "two" } }));
    expect(stampOf({ a: { at: 1 } })).not.toBe(stampOf({ a: { at: 2 } }));
    expect(stampOf({ a: { at: 1 }, b: { at: 2 } })).toBe(stampOf({ b: { at: 2 }, a: { at: 1 } }));
  });

  test("capByStamp evicts the OLDEST stamps, keeps the newest", () => {
    const pool = { a: { at: 1 }, b: { at: 3 }, c: { at: 2 } };
    const capped = capByStamp(pool, 2);
    expect(Object.keys(capped).sort()).toEqual(["b", "c"]);
    expect(capByStamp(pool, 5)).toBe(pool); // under cap → identity
  });
});

describe("account-docs-records — the shell", () => {
  test("owner-tag helpers ride the shared device namespace", () => {
    expect(ownerTagKey(LOCAL_KEY)).toBe(`${LOCAL_KEY}:owner`);
    stampPoolOwner(LOCAL_KEY, "a@x");
    expect(readPoolOwner(LOCAL_KEY)).toBe("a@x");
  });

  test("pre-hydration the mirror is a total no-op", () => {
    const store = makeFakePool({ a: { at: 1 } });
    store.setLocal({ a: { at: 2 } });
    expect(readDoc(DOC)).toBeUndefined();
    expect(store.pool.a).toEqual({ at: 2 }); // untouched
  });

  test("null doc + adoptable pool → mirrors UP, one PUT, tagged", async () => {
    hydratedImpl = () => true;
    __seedAccountDocsForTests({});
    const store = makeFakePool({ a: { at: 1 } }); // loads → REGISTRATION adopts
    await __flushAllForTests();
    expect(readPoolOwner(LOCAL_KEY)).toBe(ME);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].value).toEqual({ a: { at: 1 } });
    store.unregister();
  });

  test("null doc + FOREIGN pool → re-base to empty + re-tag + the durable empty PUT", async () => {
    hydratedImpl = () => true;
    __seedAccountDocsForTests({});
    stampPoolOwner(LOCAL_KEY, "other@x");
    const store = makeFakePool({ old: { at: 1 } }); // re-bases at REGISTRATION
    await __flushAllForTests();
    expect(store.pool).toEqual({});
    expect(readPoolOwner(LOCAL_KEY)).toBe(ME);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].value).toEqual({});
    store.unregister();
  });

  test("server doc + FOREIGN pool → re-base to the server's copy, NO PUT", () => {
    hydratedImpl = () => true;
    __seedAccountDocsForTests({ [DOC]: { b1: { at: 9 } } });
    stampPoolOwner(LOCAL_KEY, "other@x");
    const store = makeFakePool({ old: { at: 1 } });
    expect(store.pool).toEqual({ b1: { at: 9 } });
    expect(putCalls).toHaveLength(0);
    expect(readPoolOwner(LOCAL_KEY)).toBe(ME);
    store.unregister();
  });

  test("union: local has something new → commit up, ONE intent, pool untouched", async () => {
    hydratedImpl = () => true;
    __seedAccountDocsForTests({ [DOC]: { s1: { at: 10 } } });
    const store = makeFakePool({}); // empty load → the registration no-ops
    store.setLocal({ s1: { at: 10 }, t9: { at: 99 } });
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].value).toEqual({ s1: { at: 10 }, t9: { at: 99 } });
    expect(store.pool).toEqual({ s1: { at: 10 }, t9: { at: 99 } }); // NOT re-applied
    store.setLocal({ s1: { at: 10 }, t9: { at: 99 } }); // stamp-stable — no second PUT
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1);
    store.unregister();
  });

  test("union: server has a per-key refresh → pull down, no PUT, apply per intent", () => {
    hydratedImpl = () => true;
    __seedAccountDocsForTests({ [DOC]: { s1: { at: 20, v: "new" } } });
    const store = makeFakePool({ s1: { at: 10, v: "stale" } }); // pull-down at REGISTRATION
    expect(store.pool).toEqual({ s1: { at: 20, v: "new" } });
    expect(putCalls).toHaveLength(0);
    expect(store.applyCalls).toBe(1);
    store.unregister();
  });

  test("the pool cap bounds the durable copy (the honest eviction)", async () => {
    hydratedImpl = () => true;
    __seedAccountDocsForTests({});
    let pool: Record<string, E> = {};
    const tight = bridgeDocPool<Record<string, E>, E>({
      localKey: LOCAL_KEY,
      docKey: DOC,
      cap: 2,
      readState: () => pool,
      readPool: (s) => s,
      apply: (next) => {
        pool = next;
      },
      merge: (local, server) => unionByStamp(local, server),
      stamp: (p) => stampOf(p),
      getAuthEmail: () => emailImpl(),
      isHydrated: () => hydratedImpl(),
    });
    liveUnregister = tight;
    pool = { a: { at: 1 }, b: { at: 3 }, c: { at: 2 } };
    mirrorDocPoolState(DOC, pool);
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1);
    expect(Object.keys(putCalls[0].value as Record<string, E>).sort()).toEqual(["b", "c"]);
  });

  test("pre-hydration device-local pool adopts when hydration lands (the null broadcast)", async () => {
    const store = makeFakePool({ a: { at: 1 } }); // pre-hydration: the registration no-ops
    expect(readDoc(DOC)).toBeUndefined();
    hydratedImpl = () => true;
    __seedAccountDocsForTests({});
    mirrorDocPoolState(DOC, store.pool); // the hydrate('…') notify(null) path
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].value).toEqual({ a: { at: 1 } });
    expect(readPoolOwner(LOCAL_KEY)).toBe(ME);
    store.unregister();
  });
});
