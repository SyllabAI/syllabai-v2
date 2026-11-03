/**
 * Account-docs engine pins (T-AUDIT-TIER1) — the client half of the
 * workspace-document plane: memory-first writes, dirty-wins hydration,
 * sign-out reset. No network: the api module is stubbed at the boundary
 * (the engine's only external contact).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  __resetAccountDocsForTests,
  __seedAccountDocsForTests,
  hydrateAccountDocs,
  isHydrated,
  readDoc,
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

beforeEach(() => {
  __resetAccountDocsForTests();
  // the engine guards on `window` for SSR safety — bun tests have none, so
  // install the minimal stub (the test-builder-access pattern)
  (globalThis as { window?: unknown }).window = {};
  // stub the three document surfaces on the api object
  (api as unknown as { workspaceDocs: () => Promise<{ docs: unknown[] }> }).workspaceDocs =
    async () => ({ docs: [] });
  (api as unknown as { putWorkspaceDoc: (k: string, v: unknown) => Promise<unknown> }).putWorkspaceDoc =
    async () => ({ key: "x", value: null, updatedAt: "2026-11-03T00:00:00Z" });
  (api as unknown as { deleteWorkspaceDoc: (k: string) => Promise<void> }).deleteWorkspaceDoc =
    async () => undefined;
});

afterEach(() => {
  __resetAccountDocsForTests();
  (globalThis as { window?: unknown }).window = undefined;
});

describe("memory-first writes", () => {
  test("writeDoc updates memory synchronously and notifies", () => {
    const seen: string[] = [];
    const unsub = subscribeDocs((key) => seen.push(key));
    writeDoc("last-opened", { slug: "igcse-chemistry-19", resource: "hub", ts: 1 });
    expect(readDoc<unknown>("last-opened")).toEqual({ slug: "igcse-chemistry-19", resource: "hub", ts: 1 });
    expect(seen).toEqual(["last-opened"]);
    unsub();
  });

  test("writeDoc(null) marks the doc cleared (readers see null, not undefined)", () => {
    writeDoc("mock-results", []);
    writeDoc("mock-results", null);
    expect(readDoc<unknown>("mock-results")).toBeNull();
  });
});

describe("hydration", () => {
  test("server values land in memory; absent keys stay absent", async () => {
    (api as unknown as { workspaceDocs: () => Promise<{ docs: unknown[] }> }).workspaceDocs =
      async () => ({
        docs: [
          { key: "last-opened", value: { slug: "ial-maths-18", resource: "hub", ts: 2 }, updatedAt: "2026-11-03T00:00:00Z" },
        ],
      });
    await hydrateAccountDocs(EMAIL);
    expect(isHydrated()).toBe(true);
    expect(readDoc<unknown>("last-opened")).toEqual({ slug: "ial-maths-18", resource: "hub", ts: 2 });
    expect(readDoc<unknown>("mock-results")).toBeUndefined();
  });

  test("DIRTY WINS: a pending local write survives hydration and flushes after", async () => {
    const puts: Array<{ key: string; value: unknown }> = [];
    (api as unknown as { workspaceDocs: () => Promise<{ docs: unknown[] }> }).workspaceDocs =
      async () => ({
        docs: [
          { key: "last-opened", value: { slug: "server-wins-usually", resource: "hub", ts: 9 }, updatedAt: "2026-11-03T00:00:00Z" },
        ],
      });
    (api as unknown as { putWorkspaceDoc: (k: string, v: unknown) => Promise<unknown> }).putWorkspaceDoc =
      async (k, v) => {
        puts.push({ key: k, value: v });
        return { key: k, value: v, updatedAt: "2026-11-03T00:01:00Z" };
      };

    // the user writes BEFORE hydration lands (session work)
    writeDoc("last-opened", { slug: "just-typed", resource: "hub", ts: 3 });
    await hydrateAccountDocs(EMAIL);

    // the just-typed value won — the server value never clobbered it
    expect(readDoc<unknown>("last-opened")).toEqual({ slug: "just-typed", resource: "hub", ts: 3 });
    // …and it flushed to the account after hydration
    await sleep(500);
    expect(puts.map((p) => p.key)).toContain("last-opened");
  });

  test("server hydration of a doc deleted elsewhere clears clean memory", async () => {
    writeDoc("mock-results", []); // dirty → survives
    __resetAccountDocsForTests();
    __seedAccountDocsForTests({ "deck-sessions": { "c:s": { v: 1, order: [], pos: 0, filter: null, at: 1 } } });
    // hydration with the key absent server-side and memory clean → cleared
    (api as unknown as { workspaceDocs: () => Promise<{ docs: unknown[] }> }).workspaceDocs =
      async () => ({ docs: [] });
    await hydrateAccountDocs(EMAIL);
    expect(readDoc<unknown>("deck-sessions")).toBeNull();
  });
});

describe("flush", () => {
  test("a clean write PUTs the whole document (debounced)", async () => {
    const puts: Array<{ key: string; value: unknown }> = [];
    (api as unknown as { putWorkspaceDoc: (k: string, v: unknown) => Promise<unknown> }).putWorkspaceDoc =
      async (k, v) => {
        puts.push({ key: k, value: v });
        return { key: k, value: v, updatedAt: "2026-11-03T00:01:00Z" };
      };
    writeDoc("progress:igcse-chemistry-19", { notesRead: { rn_1: { subtopic: null, at: 1 } } });
    await sleep(500);
    expect(puts).toEqual([
      { key: "progress:igcse-chemistry-19", value: { notesRead: { rn_1: { subtopic: null, at: 1 } } } },
    ]);
  });

  test("a failed PUT keeps memory and stays armed (the re-arm law)", async () => {
    let failing = true;
    (api as unknown as { putWorkspaceDoc: (k: string, v: unknown) => Promise<unknown> }).putWorkspaceDoc =
      async () => {
        if (failing) throw new Error("network down");
        return { key: "x", value: null, updatedAt: "2026-11-03T00:01:00Z" };
      };
    writeDoc("saved-tests", []);
    await sleep(500);
    // memory kept the value
    expect(readDoc<unknown>("saved-tests")).toEqual([]);
    // a later write retries through the now-working api
    failing = false;
    writeDoc("saved-tests", [{ id: "t_1" } as never]);
    await sleep(500);
    expect(readDoc<unknown>("saved-tests")).toEqual([{ id: "t_1" }]);
  });

  test("a 401 drops the pending flag (no zombie retries signed-out)", async () => {
    const puts: unknown[] = [];
    (api as unknown as { putWorkspaceDoc: (k: string, v: unknown) => Promise<unknown> }).putWorkspaceDoc =
      async () => {
        puts.push(1);
        throw Object.assign(new Error("Session expired"), { status: 401 });
      };
    writeDoc("tutor-threads", { threads: [], activeId: null });
    await sleep(500);
    expect(puts.length).toBe(1); // exactly one attempt, then it stands down
    expect(readDoc<unknown>("tutor-threads")).toEqual({ threads: [], activeId: null }); // memory kept
  });
});

describe("sign-out reset", () => {
  test("reset wipes memory and notifies every bridged key", async () => {
    const { resetAccountDocs } = await import("./account-docs");
    writeDoc("teacher-classes", [{ id: "local-1", name: "A", subjectSlugs: ["c"], createdAt: "x" }]);
    const seen: string[] = [];
    subscribeDocs((key) => seen.push(key));
    resetAccountDocs();
    expect(readDoc<unknown>("teacher-classes")).toBeUndefined();
    expect(seen).toContain("teacher-classes");
  });
});
