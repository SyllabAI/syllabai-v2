/**
 * account-docs-bridge fixtures — T-AUDIT-TIER1 run-003 → T-ACCOUNT-ONLY
 * run-001.
 *
 * A FAKE thread store (the apply→mirror chain a real store runs: commit →
 * emit → the persist tail) exercises the FULL decision tree of the
 * account-only world: the null-doc mirror-up, the conservative union both
 * ways, the one-intent-one-PUT law, the caps, the malformed-input drop, the
 * echo guard and the pre-hydration posture. The owner-tag side-law is
 * RETIRED (no device pool exists to tag, adopt or re-base — the account
 * switch resets the engine AND the stores' memory caches), so the foreign
 * re-base fixtures are gone with it. The engine is REAL (its ./api is
 * the same mock.module the engine fixtures install — re-declared here so
 * the suites stay isolated per-process). bun has no DOM: the fixture
 * installs the `window.localStorage` the engine's legacy-retirement paths
 * tolerate.
 */
import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import type { WorkspaceDoc } from "@syllabai/contracts";

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

// The ./api module is NOT replaced (see the engine fixtures' note): the
// exported `api` OBJECT's plane methods are patched at runtime.
// The v2-surface fixture pins this exact env value before its own import;
// setting it here (ONLY when unset) keeps the ONE api.ts module evaluation —
// whichever fixture runs first in the process — bound to the same dual-run
// posture, so `bun test src/lib` is order-independent.
process.env.NEXT_PUBLIC_API_V2_BASE_URL ??= "https://v2.example";
const { api } = await import("./api");

const putCalls: Array<{ key: string; value: unknown }> = [];

api.workspaceDocs = async () => ({ documents: [] });
api.putWorkspaceDoc = async (key: string, value: unknown): Promise<WorkspaceDoc> => {
  putCalls.push({ key, value });
  return { key, value, updatedAt: "2026-11-05T00:00:00.000Z" };
};

const {
  mirrorThreadState,
  bridgeThreadStore,
  mergeThreadLists,
  sameIdStamp,
  isBridgedThread,
  tsOf,
  capThreadsByBytes,
  THREAD_DOC_BYTE_BUDGET,
} = await import("./account-docs-bridge");
const { __seedAccountDocsForTests, __flushAllForTests, resetAccountDocs, readDoc } =
  await import("./account-docs");

type BT = { id: string; updatedAt?: number; messages?: unknown[] };

const DOC = "tutor-threads";
const ME = "me@example.edu";

let hydratedImpl: () => boolean = () => false;
let emailImpl: () => string | null = () => ME;
let liveUnregister: (() => void) | null = null;

/** A fake store: `initial` is the in-memory pool the store holds (the
 *  account-only world's module memory); the bridge REGISTERS with it — the
 *  registration-time evaluation is part of the law (a store whose doc
 *  already hydrated converges at registration, exactly like the real
 *  surfaces do on first visit). setLocal is the in-memory write (mirrors
 *  like the real persist tail does, synchronously — the real one is
 *  400ms-debounced but the ORDER of the echoes is what the guard law cares
 *  about); apply is the remote-driven mutation (also mirrors, like the real
 *  commit chain). */
function makeFakeStore(initial: BT[] = []) {
  liveUnregister?.(); // never two live bridges in one process
  let threads: BT[] = initial;
  let applyCalls = 0;
  const unregister = bridgeThreadStore<BT[], BT>({
    docKey: DOC,
    maxThreads: 40,
    maxMessages: 200,
    readState: () => threads,
    readThreads: (s) => s,
    apply: (next) => {
      applyCalls += 1;
      threads = next;
      mirrorThreadState(DOC, threads); // the real stores' commit→…→persist tail
    },
    getAuthEmail: () => emailImpl(),
    isHydrated: () => hydratedImpl(),
  });
  liveUnregister = unregister;
  return {
    get threads() {
      return threads;
    },
    get applyCalls() {
      return applyCalls;
    },
    setLocal(next: BT[]) {
      threads = next;
      mirrorThreadState(DOC, threads);
    },
    unregister,
  };
}

const t = (id: string, updatedAt: number, messages: unknown[] = []): BT => ({
  id,
  updatedAt,
  messages,
});

beforeEach(() => {
  resetAccountDocs();
  hydratedImpl = () => false;
  emailImpl = () => ME;
  putCalls.length = 0;
  tagStore.clear();
});

afterEach(() => {
  liveUnregister?.(); // a failed test must not leak its subscription
  liveUnregister = null;
});

describe("account-docs-bridge", () => {
  test("mergeThreadLists: newer wins, tie → server, newest-first, malformed dropped", () => {
    const server = [t("s1", 10, ["sv"]), t("s2", 5)];
    const local = [t("s1", 20, ["lv"]), t("s3", 7), null as unknown as BT];
    const merged = mergeThreadLists(local, server, 40, 200);
    expect(merged.map((x) => x.id)).toEqual(["s1", "s3", "s2"]); // newest first, junk dropped
    expect(merged[0].messages).toEqual(["lv"]); // newer local wins
    const tie = mergeThreadLists([t("s1", 10, ["lv"])], [t("s1", 10, ["sv"])], 40, 200);
    expect(tie[0].messages).toEqual(["sv"]); // tie → server
  });

  test("mergeThreadLists: pool cap + per-thread messages tail-cap", () => {
    const local = [t("a", 30), t("b", 20), t("c", 10)];
    const merged = mergeThreadLists(local, [], 2, 2);
    expect(merged.map((x) => x.id)).toEqual(["a", "b"]); // pool cap
    const fat = t("f", 9, [1, 2, 3, 4, 5]);
    expect(mergeThreadLists([fat], [], 40, 2)[0].messages).toEqual([4, 5]); // tail-cap
  });

  test("sameIdStamp sees ONLY id:updatedAt sets (the cap ping-pong guard)", () => {
    expect(sameIdStamp([t("a", 1, [1])], [t("a", 1, [2, 3])])).toBe(true);
    expect(sameIdStamp([t("a", 1)], [t("a", 2)])).toBe(false);
    expect(sameIdStamp([t("a", 1), t("b", 2)], [t("b", 2), t("a", 1)])).toBe(true);
  });

  test("isBridgedThread/tsOf: malformed shapes drop, malformed stamps sort last", () => {
    expect(isBridgedThread({ id: "a", messages: [] })).toBe(true);
    expect(isBridgedThread({ id: "" })).toBe(false);
    expect(isBridgedThread({ id: "a", messages: "nope" })).toBe(false);
    expect(tsOf({ id: "a" })).toBe(0);
    expect(tsOf({ id: "a", updatedAt: "2026-11-05T00:00:00.000Z" })).toBe(
      Date.parse("2026-11-05T00:00:00.000Z"),
    );
  });

  test("pre-hydration the mirror is a total no-op (the in-memory pool stays put)", () => {
    const store = makeFakeStore();
    store.setLocal([t("t1", 5)]);
    expect(readDoc(DOC)).toBeUndefined();
    expect(store.threads).toHaveLength(1); // untouched
    store.unregister();
  });

  test("null doc + a non-empty in-memory pool → mirror up, ONE PUT", async () => {
    hydratedImpl = () => true;
    __seedAccountDocsForTests({}); // hydrated, memory empty
    const store = makeFakeStore([t("t1", 5, ["hello"])]); // REGISTRATION mirrors up
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].value).toEqual({ threads: [t("t1", 5, ["hello"])] });
    store.unregister();
  });

  test("null doc + an empty in-memory pool → no PUT (nothing on either side)", async () => {
    hydratedImpl = () => true;
    __seedAccountDocsForTests({});
    const store = makeFakeStore([]); // empty at registration
    await __flushAllForTests();
    expect(putCalls).toHaveLength(0);
    store.unregister();
  });

  test("union: local has something new → commit up, ONE intent, store untouched", async () => {
    hydratedImpl = () => true;
    __seedAccountDocsForTests({ [DOC]: { threads: [t("s1", 10)] } });
    const store = makeFakeStore([]); // empty load → the registration no-ops
    store.setLocal([t("t9", 99), t("s1", 10)]); // a NEW local thread + the server's
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1); // one intent, one PUT
    expect(putCalls[0].value).toEqual({ threads: [t("t9", 99), t("s1", 10)] });
    expect(store.threads).toEqual([t("t9", 99), t("s1", 10)]); // NOT re-applied (the echo guard)
    // and the flushed mirror is now stamp-stable — no further PUTs
    store.setLocal([t("t9", 99), t("s1", 10)]);
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1);
    store.unregister();
  });

  test("union: server has a per-id refresh → pull down, no PUT, apply called once (echo guard)", () => {
    hydratedImpl = () => true;
    __seedAccountDocsForTests({ [DOC]: { threads: [t("s1", 20, ["new"])] } });
    const store = makeFakeStore([t("s1", 10, ["stale"])]); // same id, OLDER stamp → pull-down at REGISTRATION
    expect(store.threads).toEqual([t("s1", 20, ["new"])]); // pulled down
    expect(putCalls).toHaveLength(0);
    expect(store.applyCalls).toBe(1); // the re-entrant mirror no-opped
    // the same stale pool written again converges once more — still no PUT,
    // exactly one apply per intent, no echo churn
    store.setLocal([t("s1", 10, ["stale"])]);
    expect(store.threads).toEqual([t("s1", 20, ["new"])]);
    expect(putCalls).toHaveLength(0);
    expect(store.applyCalls).toBe(2);
    store.unregister();
  });

  test("pre-hydration in-memory threads adopt when hydration lands (the null broadcast)", async () => {
    const store = makeFakeStore([t("t1", 5)]); // pre-hydration: the registration no-ops
    expect(readDoc(DOC)).toBeUndefined();
    // hydration lands with an empty account → the completion broadcast fires
    hydratedImpl = () => true;
    __seedAccountDocsForTests({});
    mirrorThreadState(DOC, store.threads); // the hydrate('…') notify(null) path
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].value).toEqual({ threads: [t("t1", 5)] });
    store.unregister();
  });
});

// ── T-CAPS-POLICY-1 — the byte budget of record ───────────────────────────

describe("capThreadsByBytes — the durable-copy byte budget", () => {
  test("a pool far under the budget passes through untouched (same array contents)", () => {
    const pool = [t("a", 3, ["x".repeat(100)]), t("b", 2, ["y".repeat(100)]), t("c", 1)];
    const capped = capThreadsByBytes(pool);
    expect(capped).toHaveLength(3);
    expect(capped.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(JSON.stringify({ threads: capped }).length).toBeLessThanOrEqual(THREAD_DOC_BYTE_BUDGET);
  });

  test("a saturated pool trims OLDEST-first until the doc fits the budget", () => {
    // 60 threads × ~10KB bodies ≈ 600K chars — far over the 260K budget
    const pool = Array.from({ length: 60 }, (_, i) =>
      t(`fat-${i}`, 1000 - i, ["z".repeat(10_000)]),
    );
    const capped = capThreadsByBytes(pool);
    expect(capped.length).toBeLessThan(60);
    expect(capped.length).toBeGreaterThan(0);
    // newest-first survivors: the ids are a PREFIX of the input order
    expect(capped.map((x) => x.id)).toEqual(pool.slice(0, capped.length).map((x) => x.id));
    expect(JSON.stringify({ threads: capped }).length).toBeLessThanOrEqual(THREAD_DOC_BYTE_BUDGET);
  });

  test("an irreducible singleton passes through UNCHANGED (the PUT 413s, surfaced — never a silent trim)", () => {
    const monster = [t("monster", 1, ["w".repeat(THREAD_DOC_BYTE_BUDGET + 5_000)])];
    const capped = capThreadsByBytes(monster);
    expect(capped).toBe(monster); // the SAME array — no silent loss
    expect(JSON.stringify({ threads: capped }).length).toBeGreaterThan(THREAD_DOC_BYTE_BUDGET);
  });

  test("an over-budget pool with a small newest thread still keeps everything that fits (prefix law)", () => {
    const small = t("small-new", 10, ["s".repeat(50)]);
    const fat = t("fat-old", 5, ["f".repeat(THREAD_DOC_BYTE_BUDGET)]); // older AND over budget
    const capped = capThreadsByBytes([small, fat], THREAD_DOC_BYTE_BUDGET);
    // prefix law: once `fat` cannot fit, everything after it is gone — but
    // `small` (newest) survives, and the doc fits
    expect(capped).toHaveLength(1);
    expect(capped[0].id).toBe("small-new");
    expect(JSON.stringify({ threads: capped }).length).toBeLessThanOrEqual(THREAD_DOC_BYTE_BUDGET);
  });

  test("the mirror commits the BOUNDED doc and CONVERGES (no PUT ping-pong)", async () => {
    // 30 × 10KB local threads (UNDER the fixture's 40 count cap, OVER the
    // 260K byte budget — the byte law is the binding one) over an EMPTY
    // account: the adoption PUT must carry the trimmed pool, and the NEXT
    // mirror pass must be a no-op — the count-only law re-PUT the same
    // trimmed content forever.
    const store = makeFakeStore(
      Array.from({ length: 30 }, (_, i) => t(`fat-${i}`, 1000 - i, ["z".repeat(10_000)])),
    );
    hydratedImpl = () => true;
    __seedAccountDocsForTests({}); // empty account → adopt
    mirrorThreadState(DOC, store.threads);
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1);
    const first = putCalls[0].value as { threads: BT[] };
    expect(first.threads.length).toBeLessThan(30);
    expect(JSON.stringify(first).length).toBeLessThanOrEqual(THREAD_DOC_BYTE_BUDGET);
    // the device cache keeps EVERY thread — the budget bounds the doc, not
    // the store (30 < the count cap, so no count-cap pull-down can fire)
    expect(store.threads).toHaveLength(30);
    // the converged re-evaluation: seed the engine memory to EXACTLY what
    // the server now holds (a fresh hydration), mirror again — zero PUTs
    __seedAccountDocsForTests({ [DOC]: first });
    putCalls.length = 0;
    mirrorThreadState(DOC, store.threads);
    await __flushAllForTests();
    expect(putCalls).toHaveLength(0);
    store.unregister();
  });

  test("a throwing apply cannot leak the echo guard (the guarded-span law)", async () => {
    // the pre-T-CAPS-POLICY-1 defect: an apply that threw mid-span left the
    // key echo-guarded FOREVER (the outer catch swallowed the throw) — every
    // later mirror for that key no-oped for the rest of the process. The
    // guarded span releases in finally, so the plane self-heals.
    let applyCalls = 0;
    let threads: BT[] = [];
    const unregister = bridgeThreadStore<BT[], BT>({
      docKey: DOC,
      maxThreads: 40,
      maxMessages: 200,
      readState: () => threads,
      readThreads: (s) => s,
      apply: (next) => {
        applyCalls += 1;
        if (applyCalls === 1) throw new Error("the store's apply exploded");
        threads = next;
      },
      getAuthEmail: () => emailImpl(),
      isHydrated: () => hydratedImpl(),
    });
    hydratedImpl = () => true;
    __seedAccountDocsForTests({ [DOC]: { threads: [t("srv", 9)] } }); // server has what local lacks
    mirrorThreadState(DOC, threads); // pull-down → apply throws → the guard MUST release
    expect(applyCalls).toBe(1);
    // a later local write still syncs — a leaked guard would have no-oped here
    threads = [t("local-new", 10)];
    mirrorThreadState(DOC, threads);
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1);
    expect((putCalls[0].value as { threads: BT[] }).threads.map((x) => x.id)).toEqual([
      "local-new",
      "srv",
    ]);
    unregister();
  });
});
