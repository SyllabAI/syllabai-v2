/**
 * account-docs-bridge fixtures — T-AUDIT-TIER1 run-003.
 *
 * A FAKE thread store (the apply→mirror chain a real store runs: commit →
 * emit → the persist tail) exercises the FULL decision tree: adoption,
 * the foreign re-base laws, the conservative union both ways, the
 * one-intent-one-PUT law, the caps, the malformed-input drop, the echo
 * guard and the pre-hydration posture. The engine is REAL (its ./api is
 * the same mock.module the engine fixtures install — re-declared here so
 * the suites stay isolated per-process). bun has no DOM: the fixture
 * installs the `window.localStorage` the owner-tag side-law reads.
 */
import { beforeEach, afterEach, describe, expect, mock, test } from "bun:test";

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

class FakeApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const putCalls: Array<{ key: string; value: unknown }> = [];
let listImpl: () => Promise<unknown> = async () => ({ documents: [] });

const apiMock = () => ({
  ApiError: FakeApiError,
  api: {
    workspaceDocs: () => listImpl(),
    putWorkspaceDoc: async (key: string, value: unknown) => {
      putCalls.push({ key, value });
      return { key, value, updatedAt: "2026-11-05T00:00:00.000Z" };
    },
    deleteWorkspaceDoc: async () => undefined,
  },
  clearSession: () => undefined,
  currentUser: async () => null,
  getToken: () => null,
});
mock.module("./api", apiMock);
mock.module("@/lib/api", apiMock);

const {
  mirrorThreadState,
  bridgeThreadStore,
  readPoolOwner,
  stampPoolOwner,
  ownerTagKey,
  poolAdoptable,
  mergeThreadLists,
  sameIdStamp,
  isBridgedThread,
  tsOf,
} = await import("./account-docs-bridge");
const { __seedAccountDocsForTests, __flushAllForTests, resetAccountDocs, readDoc } =
  await import("./account-docs");

type BT = { id: string; updatedAt?: number; messages?: unknown[] };

const DOC = "tutor-threads";
const LOCAL_KEY = "syllabai.tutor.threads.v1";
const ME = "me@example.edu";

let hydratedImpl: () => boolean = () => false;
let emailImpl: () => string | null = () => ME;
let liveUnregister: (() => void) | null = null;

/** A fake store: `initial` is the device-local pool the store LOADS with
 *  (the real stores' load()); the bridge REGISTERS with it — the
 *  registration-time evaluation is part of the law (a store whose doc
 *  already hydrated converges at registration, exactly like the real
 *  surfaces do on first visit). setLocal is the device-local write
 *  (mirrors like the real persist tail does, synchronously — the real
 *  one is 400ms-debounced but the ORDER of the echoes is what the guard
 *  law cares about); apply is the remote-driven mutation (also mirrors,
 *  like the real commit chain). */
function makeFakeStore(initial: BT[] = []) {
  liveUnregister?.(); // never two live bridges in one process
  let threads: BT[] = initial;
  let applyCalls = 0;
  const unregister = bridgeThreadStore<BT[], BT>({
    localKey: LOCAL_KEY,
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
  test("the owner-tag helpers ride the device localStorage under <localKey>:owner", () => {
    expect(ownerTagKey(LOCAL_KEY)).toBe(`${LOCAL_KEY}:owner`);
    expect(poolAdoptable(LOCAL_KEY)).toBe(true);
    stampPoolOwner(LOCAL_KEY, "a@x");
    expect(readPoolOwner(LOCAL_KEY)).toBe("a@x");
    expect(poolAdoptable(LOCAL_KEY)).toBe(false);
  });

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

  test("pre-hydration the mirror is a total no-op (device-local stays device-local)", () => {
    const store = makeFakeStore();
    store.setLocal([t("t1", 5)]);
    expect(readDoc(DOC)).toBeUndefined();
    expect(store.threads).toHaveLength(1); // untouched
    store.unregister();
  });

  test("null doc + adoptable local pool → the pool ADOPTS (mirror up, one PUT)", async () => {
    hydratedImpl = () => true;
    __seedAccountDocsForTests({}); // hydrated, memory empty
    const store = makeFakeStore([t("t1", 5, ["hello"])]); // loads → REGISTRATION adopts
    await __flushAllForTests();
    expect(readPoolOwner(LOCAL_KEY)).toBe(ME);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].value).toEqual({ threads: [t("t1", 5, ["hello"])] });
    store.unregister();
  });

  test("null doc + FOREIGN pool → re-base to empty + re-tag + the durable empty PUT", async () => {
    hydratedImpl = () => true;
    __seedAccountDocsForTests({});
    stampPoolOwner(LOCAL_KEY, "other@x"); // foreign
    const store = makeFakeStore([t("old-account-thread", 5)]); // re-bases at REGISTRATION
    await __flushAllForTests();
    expect(store.threads).toEqual([]); // re-based
    expect(readPoolOwner(LOCAL_KEY)).toBe(ME); // re-tagged
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].value).toEqual({ threads: [] });
    store.unregister();
  });

  test("server doc + FOREIGN pool → re-base to the server's copy, NO PUT", () => {
    hydratedImpl = () => true;
    __seedAccountDocsForTests({ [DOC]: { threads: [t("b1", 9)] } });
    stampPoolOwner(LOCAL_KEY, "other@x");
    const store = makeFakeStore([t("old-account-thread", 5)]); // re-bases at REGISTRATION
    expect(store.threads).toEqual([t("b1", 9)]); // the durable copy wins locally
    expect(putCalls).toHaveLength(0); // NO PUT — it's already B's truth
    expect(readPoolOwner(LOCAL_KEY)).toBe(ME);
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

  test("pre-hydration device-local threads adopt when hydration lands (the null broadcast)", async () => {
    const store = makeFakeStore([t("t1", 5)]); // pre-hydration: the registration no-ops
    expect(readDoc(DOC)).toBeUndefined();
    // hydration lands with an empty account → the completion broadcast fires
    hydratedImpl = () => true;
    __seedAccountDocsForTests({});
    mirrorThreadState(DOC, store.threads); // the hydrate('…') notify(null) path
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].value).toEqual({ threads: [t("t1", 5)] });
    expect(readPoolOwner(LOCAL_KEY)).toBe(ME);
    store.unregister();
  });
});
