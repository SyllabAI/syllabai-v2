/**
 * Account-docs bridge pins (T-AUDIT-TIER1 run-003) — the union mediator
 * between the account plane and the thread stores: merge laws, the owner
 * side-tag, the migration (mirror-up), the foreign re-base, the
 * pull-down, one-PUT-per-intent (the echo guard), and the device-local
 * pre-hydration posture. No network: api is stubbed at the boundary.
 */
import "./api-v2-test-env";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  __resetAccountDocsForTests,
  __seedAccountDocsForTests,
  isHydrated,
  readDoc,
} from "./account-docs";
import {
  bridgeThreadStore,
  isBridgedThread,
  mergeThreadLists,
  mirrorThreadState,
  poolAdoptable,
  stampPoolOwner,
  type BridgedThread,
} from "./account-docs-bridge";
import { api } from "./api";

const EMAIL = "student@example.com";
const OTHER = "other@example.com";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── a minimal window.localStorage stub (the bridge's owner-tag surface) ──
function installFakeStorage(): void {
  const m = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
      setItem: (k: string, v: string) => void m.set(k, String(v)),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
    },
  };
}

// ── the fake thread store (the tutor's shape; apply() carries the real
//    persist-tail call so the echo-guard law is exercised end-to-end) ────
interface T extends BridgedThread {
  id: string;
  updatedAt: number;
  messages: unknown[];
  title?: string;
}

function makeStore(initial: T[] = [], maxThreads = 40, maxMessages = 200) {
  let state = { threads: initial, activeId: (initial[0]?.id ?? null) as string | null };
  const seen: T[][] = [];
  const config = {
    docKey: "tutor-threads",
    localKey: "syllabai.tutor.threads.v1",
    snapOf: () => state,
    threadsOf: (s: typeof state) => s.threads,
    apply(threads: T[]) {
      const activeId =
        state.activeId && threads.some((t) => t.id === state.activeId)
          ? state.activeId
          : (threads[0]?.id ?? null);
      state = { threads, activeId };
      seen.push(threads);
      // the real store's persist() tail — absorbed while applying remote
      mirrorThreadState(config.docKey, { threads: state.threads, activeId: state.activeId });
    },
    docOf: () => ({ threads: state.threads, activeId: state.activeId }),
    maxThreads,
    maxMessages,
  };
  return {
    config,
    seen,
    get threads() {
      return state.threads;
    },
    get activeId() {
      return state.activeId;
    },
  };
}

type ApiStub = {
  workspaceDocs: () => Promise<{ docs: unknown[] }>;
  putWorkspaceDoc: (k: string, v: unknown) => Promise<unknown>;
  deleteWorkspaceDoc: (k: string) => Promise<void>;
};

beforeEach(() => {
  __resetAccountDocsForTests();
  installFakeStorage();
  const a = api as unknown as ApiStub;
  a.workspaceDocs = async () => ({ docs: [] });
  a.putWorkspaceDoc = async (k: string, v: unknown) => ({ key: k, value: v, updatedAt: "2026-11-03T00:00:00Z" });
  a.deleteWorkspaceDoc = async () => undefined;
});

afterEach(() => {
  __resetAccountDocsForTests();
  (globalThis as { window?: unknown }).window = undefined;
});

const t = (id: string, updatedAt: number, msgs = 1): T => ({
  id,
  updatedAt,
  messages: Array.from({ length: msgs }, (_, i) => ({ i })),
});

describe("mergeThreadLists — the conservative union", () => {
  test("unions both directions by id", () => {
    const local = [t("L1", 200)];
    const server = [t("S1", 100)];
    const merged = mergeThreadLists(local, server, 40, 200);
    expect(merged.map((x) => x.id).sort()).toEqual(["L1", "S1"]);
  });

  test("newer updatedAt wins; the clock tie keeps the server copy", () => {
    const localNewer = [{ ...t("X", 300), title: "local-newer" }];
    const serverOlder = [{ ...t("X", 100), title: "server-older" }];
    expect(mergeThreadLists(localNewer, serverOlder, 40, 200)[0].title).toBe("local-newer");

    const localTie = [{ ...t("Y", 150), title: "local-tie" }];
    const serverTie = [{ ...t("Y", 150), title: "server-tie" }];
    expect(mergeThreadLists(localTie, serverTie, 40, 200)[0].title).toBe("server-tie");
  });

  test("respects the family caps: thread slice + messages TAIL cap, newest first", () => {
    const local = [t("L1", 500), t("L2", 400)];
    const server = [t("S1", 300), t("S2", 200), t("S3", 100)];
    const merged = mergeThreadLists(local, server, 3, 2);
    expect(merged.map((x) => x.id)).toEqual(["L1", "L2", "S1"]); // newest-first, sliced to 3
    expect(merged[0].messages.length).toBeLessThanOrEqual(2);
    const five = [t("A", 5, 5)];
    const capped = mergeThreadLists(five, [], 40, 2);
    expect(capped[0].messages).toEqual([{ i: 3 }, { i: 4 }]); // the TAIL survives
  });

  test("malformed entries are dropped, never thrown (the family law)", () => {
    expect(isBridgedThread(null)).toBe(false);
    expect(isBridgedThread({})).toBe(false);
    expect(isBridgedThread({ id: "", messages: [] })).toBe(false); // empty id
    expect(isBridgedThread({ id: "x", messages: "nope" })).toBe(false);
    expect(isBridgedThread({ id: "x" })).toBe(false); // no messages array
    expect(isBridgedThread({ id: "x", messages: [] })).toBe(true);
    const junk = [{ id: "", messages: [] }, null, { id: "ok", messages: [] }] as unknown as T[];
    const merged = mergeThreadLists(junk, [], 40, 200);
    expect(merged.map((x) => x.id)).toEqual(["ok"]);
  });
});

describe("the owner side-tag", () => {
  test("untagged pools are adoptable; same-account tags are; foreign tags are not", () => {
    const KEY = "syllabai.tutor.threads.v1";
    expect(poolAdoptable(KEY, EMAIL)).toBe(true); // untagged legacy pool
    stampPoolOwner(KEY, EMAIL);
    expect(poolAdoptable(KEY, EMAIL)).toBe(true); // own pool
    expect(poolAdoptable(KEY, OTHER)).toBe(false); // foreign pool
    expect(poolAdoptable(KEY, null)).toBe(false); // signed out + tagged
  });
});

describe("bridgeThreadStore — the decision tree", () => {
  test("server-only threads pull DOWN (apply runs, no PUT)", async () => {
    const puts: unknown[] = [];
    (api as unknown as ApiStub).putWorkspaceDoc = async (k, v) => {
      puts.push({ k, v });
      return { key: k, value: v, updatedAt: "2026-11-03T00:00:00Z" };
    };
    const store = makeStore([]);
    bridgeThreadStore(store.config);
    // the server doc lands (a clean hydration merge)
    __seedAccountDocsForTests({ "tutor-threads": { threads: [t("S1", 100)], activeId: "S1" } }, EMAIL);
    expect(store.threads.map((x) => x.id)).toEqual(["S1"]);
    await sleep(500);
    expect(puts).toEqual([]); // pull-down, nothing to PUT — the tail mirror was absorbed by the echo guard
  });

  test("local-only threads PUSH UP: commit + exactly ONE PUT with the store's doc shape", async () => {
    const puts: Array<{ k: string; v: unknown }> = [];
    (api as unknown as ApiStub).putWorkspaceDoc = async (k, v) => {
      puts.push({ k, v });
      return { key: k, value: v, updatedAt: "2026-11-03T00:00:00Z" };
    };
    const store = makeStore([t("L1", 500)]);
    bridgeThreadStore(store.config);
    __seedAccountDocsForTests({ "tutor-threads": { threads: [t("S1", 100)], activeId: "S1" } }, EMAIL);
    // the union landed in the store (newest first)
    expect(store.threads.map((x) => x.id)).toEqual(["L1", "S1"]);
    await sleep(500);
    expect(puts.length).toBe(1); // ONE intent, ONE PUT (the tail mirror was absorbed)
    expect(puts[0].k).toBe("tutor-threads");
    expect(puts[0].v).toEqual({ threads: store.threads, activeId: store.activeId });
  });

  test("FOREIGN pool + server doc: re-base, never union, no PUT", async () => {
    const puts: unknown[] = [];
    (api as unknown as ApiStub).putWorkspaceDoc = async (k, v) => {
      puts.push({ k, v });
      return { key: k, value: v, updatedAt: "2026-11-03T00:00:00Z" };
    };
    const KEY = "syllabai.tutor.threads.v1";
    stampPoolOwner(KEY, OTHER); // the device pool belongs to another account
    const store = makeStore([t("LOCAL-A", 999)]);
    bridgeThreadStore(store.config);
    __seedAccountDocsForTests({ "tutor-threads": { threads: [t("S1", 100)], activeId: "S1" } }, EMAIL);
    // the store re-based onto the account doc — the foreign local thread is gone
    expect(store.threads.map((x) => x.id)).toEqual(["S1"]);
    await sleep(500);
    expect(puts).toEqual([]); // re-base carries no PUT
    expect(poolAdoptable(KEY, EMAIL)).toBe(true); // re-tagged for the current account
  });

  test("server null + adoptable pool: the migration mirrors UP (one PUT)", async () => {
    const puts: Array<{ k: string; v: unknown }> = [];
    (api as unknown as ApiStub).putWorkspaceDoc = async (k, v) => {
      puts.push({ k, v });
      return { key: k, value: v, updatedAt: "2026-11-03T00:00:00Z" };
    };
    const KEY = "syllabai.tutor.threads.v1";
    const store = makeStore([t("LEGACY", 42)]);
    bridgeThreadStore(store.config);
    // a clean null = the exact post-hydrate cleared state (the key is not
    // on the account); the untagged legacy pool adopts
    __seedAccountDocsForTests({ "tutor-threads": null }, EMAIL);
    await sleep(500);
    expect(puts.length).toBe(1);
    expect(puts[0].k).toBe("tutor-threads");
    expect(puts[0].v).toEqual({ threads: [store.threads[0]], activeId: "LEGACY" });
    expect(poolAdoptable(KEY, EMAIL)).toBe(true); // stamped for this account
  });

  test("server null + FOREIGN pool: re-base to the honest empty shape, no PUT", async () => {
    const puts: unknown[] = [];
    (api as unknown as ApiStub).putWorkspaceDoc = async (k, v) => {
      puts.push({ k, v });
      return { key: k, value: v, updatedAt: "2026-11-03T00:00:00Z" };
    };
    const KEY = "syllabai.tutor.threads.v1";
    stampPoolOwner(KEY, OTHER);
    const store = makeStore([t("A-THREAD", 42)]);
    bridgeThreadStore(store.config);
    __seedAccountDocsForTests({ "tutor-threads": null }, EMAIL);
    // B never sees A's transcript; the pool is re-tagged so B's own new
    // work can mirror up on the next cycle
    expect(store.threads).toEqual([]);
    await sleep(500);
    expect(puts).toEqual([]);
    expect(poolAdoptable(KEY, EMAIL)).toBe(true);
  });

  test("pre-hydration the whole plane is device-local: no apply, no mirror, no PUT", async () => {
    const puts: unknown[] = [];
    (api as unknown as ApiStub).putWorkspaceDoc = async (k, v) => {
      puts.push({ k, v });
      return { key: k, value: v, updatedAt: "2026-11-03T00:00:00Z" };
    };
    const store = makeStore([t("L1", 10)]);
    bridgeThreadStore(store.config);
    expect(isHydrated()).toBe(false);
    // a doc notification arrives pre-hydration (a signed-out write) — absorbed
    mirrorThreadState("tutor-threads", { threads: store.threads, activeId: store.activeId });
    expect(readDoc<unknown>("tutor-threads")).toBeUndefined(); // nothing mirrored
    await sleep(500);
    expect(puts).toEqual([]);
    expect(store.threads.map((x) => x.id)).toEqual(["L1"]); // the store never touched
  });

  test("one intent, one PUT: a user write after a pull-down pushes the union exactly once", async () => {
    const puts: Array<{ k: string; v: unknown }> = [];
    (api as unknown as ApiStub).putWorkspaceDoc = async (k, v) => {
      puts.push({ k, v });
      return { key: k, value: v, updatedAt: "2026-11-03T00:00:00Z" };
    };
    const store = makeStore([]);
    bridgeThreadStore(store.config);
    __seedAccountDocsForTests({ "tutor-threads": { threads: [t("S1", 100)], activeId: "S1" } }, EMAIL);
    expect(store.threads.map((x) => x.id)).toEqual(["S1"]); // pulled down
    await sleep(500);
    expect(puts.length).toBe(0);

    // the user now writes (the store's persist tail mirrors out)
    store.config.apply([t("NEW", 900), t("S1", 100)]);
    await sleep(500);
    expect(puts.length).toBe(1); // exactly the user's intent — no phantom PUTs
    expect((puts[0].v as { threads: T[] }).threads.map((x) => x.id)).toEqual(["NEW", "S1"]);
  });
});
