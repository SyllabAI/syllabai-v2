/**
 * Account-docs engine pins (T-AUDIT-TIER1 run-003) — the client half of the
 * workspace-document plane: memory-first writes, dirty-wins hydration,
 * sign-out reset, the account-switch law. No network: the api module is
 * stubbed at the boundary (the engine's only external contact).
 */
import "./api-v2-test-env";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  __needsSwitchReset,
  __resetAccountDocsForTests,
  __seedAccountDocsForTests,
  hydrateAccountDocs,
  hydratedEmail,
  isHydrated,
  readDoc,
  resetAccountDocs,
  subscribeDocs,
  writeDoc,
} from "./account-docs";
import { api } from "./api";

const EMAIL = "student@example.com";

// flush debounce short-circuit: writes schedule a 400ms PUT; tests observe
// the PUT via a stubbed api. We don't await timers we don't own — the stub
// records calls synchronously when the timer fires; tests that care await
// a real sleep.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ApiStub = {
  workspaceDocs: () => Promise<{ docs: unknown[] }>;
  putWorkspaceDoc: (k: string, v: unknown) => Promise<unknown>;
  deleteWorkspaceDoc: (k: string) => Promise<void>;
};

function stubApi(over: Partial<ApiStub> = {}): void {
  const a = api as unknown as ApiStub;
  a.workspaceDocs = over.workspaceDocs ?? (async () => ({ docs: [] }));
  a.putWorkspaceDoc =
    over.putWorkspaceDoc ??
    (async (k: string, v: unknown) => ({ key: k, value: v, updatedAt: "2026-11-03T00:00:00Z" }));
  a.deleteWorkspaceDoc = over.deleteWorkspaceDoc ?? (async () => undefined);
}

beforeEach(() => {
  __resetAccountDocsForTests();
  // the engine guards on `window` for SSR safety — bun tests have none, so
  // install the minimal stub (the test-builder-access pattern)
  (globalThis as { window?: unknown }).window = {};
  stubApi();
});

afterEach(() => {
  __resetAccountDocsForTests();
  (globalThis as { window?: unknown }).window = undefined;
});

describe("memory-first writes", () => {
  test("writeDoc updates memory synchronously and notifies", () => {
    const seen: string[] = [];
    const unsub = subscribeDocs((key) => seen.push(key));
    writeDoc("tutor-threads", { threads: [], activeId: null });
    expect(readDoc<unknown>("tutor-threads")).toEqual({ threads: [], activeId: null });
    expect(seen).toEqual(["tutor-threads"]);
    unsub();
  });

  test("writeDoc(null) marks the doc cleared (readers see null, not undefined)", () => {
    writeDoc("deck-sessions", {});
    writeDoc("deck-sessions", null);
    expect(readDoc<unknown>("deck-sessions")).toBeNull();
  });
});

describe("hydration", () => {
  test("server values land in memory; absent keys stay absent; identity is pinned", async () => {
    stubApi({
      workspaceDocs: async () => ({
        docs: [
          { key: "tutor-threads", value: { threads: [{ id: "t_1" }], activeId: "t_1" }, updatedAt: "2026-11-03T00:00:00Z" },
        ],
      }),
    });
    await hydrateAccountDocs(EMAIL);
    expect(isHydrated()).toBe(true);
    expect(hydratedEmail()).toBe(EMAIL);
    expect(readDoc<unknown>("tutor-threads")).toEqual({ threads: [{ id: "t_1" }], activeId: "t_1" });
    expect(readDoc<unknown>("deck-sessions")).toBeUndefined();
  });

  test("DIRTY WINS: a pending local write survives hydration and flushes after", async () => {
    const puts: Array<{ key: string; value: unknown }> = [];
    stubApi({
      workspaceDocs: async () => ({
        docs: [
          { key: "tutor-threads", value: { threads: [{ id: "server" }], activeId: "server" }, updatedAt: "2026-11-03T00:00:00Z" },
        ],
      }),
      putWorkspaceDoc: async (k, v) => {
        puts.push({ key: k, value: v });
        return { key: k, value: v, updatedAt: "2026-11-03T00:01:00Z" };
      },
    });

    // the user writes BEFORE hydration lands (session work)
    writeDoc("tutor-threads", { threads: [{ id: "just-typed" }], activeId: "just-typed" });
    await hydrateAccountDocs(EMAIL);

    // the just-typed value won — the server value never clobbered it
    expect(readDoc<unknown>("tutor-threads")).toEqual({ threads: [{ id: "just-typed" }], activeId: "just-typed" });
    // …and it flushed to the account after hydration
    await sleep(500);
    expect(puts.map((p) => p.key)).toContain("tutor-threads");
  });

  test("server hydration of a doc deleted elsewhere clears clean memory", async () => {
    writeDoc("deck-sessions", { "c:s": { v: 1 } }); // dirty → survives
    __resetAccountDocsForTests();
    __seedAccountDocsForTests({ "deck-sessions": { "c:s": { v: 1, order: [], pos: 0, filter: null, at: 1 } } }, EMAIL);
    // hydration with the key absent server-side and memory clean → cleared
    stubApi({ workspaceDocs: async () => ({ docs: [] }) });
    await hydrateAccountDocs(EMAIL);
    expect(readDoc<unknown>("deck-sessions")).toBeNull();
  });
});

describe("flush", () => {
  test("a clean write PUTs the whole document (debounced)", async () => {
    const puts: Array<{ key: string; value: unknown }> = [];
    stubApi({
      putWorkspaceDoc: async (k, v) => {
        puts.push({ key: k, value: v });
        return { key: k, value: v, updatedAt: "2026-11-03T00:01:00Z" };
      },
    });
    writeDoc("progress:igcse-chemistry-19", { notesRead: { rn_1: { subtopic: null, at: 1 } } });
    await sleep(500);
    expect(puts).toEqual([
      { key: "progress:igcse-chemistry-19", value: { notesRead: { rn_1: { subtopic: null, at: 1 } } } },
    ]);
  });

  test("a failed PUT keeps memory and stays armed (the re-arm law)", async () => {
    let failing = true;
    stubApi({
      putWorkspaceDoc: async () => {
        if (failing) throw new Error("network down");
        return { key: "x", value: null, updatedAt: "2026-11-03T00:01:00Z" };
      },
    });
    writeDoc("teacher-classes", [{ id: "local-1" }]);
    await sleep(500);
    // memory kept the value
    expect(readDoc<unknown>("teacher-classes")).toEqual([{ id: "local-1" }]);
    // a later write retries through the now-working api
    failing = false;
    writeDoc("teacher-classes", [{ id: "local-2" }]);
    await sleep(500);
    expect(readDoc<unknown>("teacher-classes")).toEqual([{ id: "local-2" }]);
  });

  test("a 401 drops the pending flag (no zombie retries signed-out)", async () => {
    const puts: unknown[] = [];
    stubApi({
      putWorkspaceDoc: async () => {
        puts.push(1);
        throw Object.assign(new Error("Session expired"), { status: 401 });
      },
    });
    writeDoc("tutor-threads", { threads: [], activeId: null });
    await sleep(500);
    expect(puts.length).toBe(1); // exactly one attempt, then it stands down
    expect(readDoc<unknown>("tutor-threads")).toEqual({ threads: [], activeId: null }); // memory kept
  });
});

describe("sign-out reset", () => {
  test("reset wipes memory and notifies every bridged key", () => {
    writeDoc("teacher-classes", [{ id: "local-1", name: "A", subjectSlugs: ["c"], createdAt: "x" }]);
    const seen: string[] = [];
    subscribeDocs((key) => seen.push(key));
    resetAccountDocs();
    expect(readDoc<unknown>("teacher-classes")).toBeUndefined();
    expect(seen).toContain("teacher-classes");
    expect(isHydrated()).toBe(false);
    expect(hydratedEmail()).toBeNull();
  });
});

describe("account-switch law (__needsSwitchReset)", () => {
  test("the truth table: only signed-in → signed-in-DIFFERENT resets", () => {
    expect(__needsSwitchReset("a@x.com", "b@x.com")).toBe(true);
    expect(__needsSwitchReset("a@x.com", null)).toBe(false); // sign-out: the signed-out branch resets
    expect(__needsSwitchReset(null, "b@x.com")).toBe(false); // fresh sign-in: hydrate with adoption
    expect(__needsSwitchReset("a@x.com", "a@x.com")).toBe(false); // same identity: no-op
    expect(__needsSwitchReset(null, null)).toBe(false);
  });

  test("an account switch drops A's dirty state so it can never flush into B", async () => {
    const puts: Array<{ key: string; value: unknown }> = [];
    stubApi({
      putWorkspaceDoc: async (k, v) => {
        puts.push({ key: k, value: v });
        return { key: k, value: v, updatedAt: "2026-11-03T00:01:00Z" };
      },
    });
    // A is hydrated and has a pending (dirty) write
    await hydrateAccountDocs("a@example.com");
    writeDoc("tutor-threads", { threads: [{ id: "a-thread" }], activeId: "a-thread" });
    expect(readDoc<unknown>("tutor-threads")).toEqual({ threads: [{ id: "a-thread" }], activeId: "a-thread" });

    // the hook's switch law fires BEFORE B's hydration
    if (__needsSwitchReset("a@example.com", "b@example.com")) resetAccountDocs();
    expect(readDoc<unknown>("tutor-threads")).toBeUndefined();
    expect(isHydrated()).toBe(false);

    // B's hydration carries only B's server doc set — A's thread never rides
    stubApi({ workspaceDocs: async () => ({ docs: [] }) });
    await hydrateAccountDocs("b@example.com");
    expect(readDoc<unknown>("tutor-threads")).toBeUndefined();
    await sleep(500);
    expect(puts.map((p) => p.key)).not.toContain("tutor-threads"); // A's dirty value never PUT into B's account
  });
});
