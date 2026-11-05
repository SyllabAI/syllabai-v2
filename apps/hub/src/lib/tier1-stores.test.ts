/**
 * T-TIER1 store law tests — the account-backed last-opened pointer and
 * self-marked mock tallies (frontend deep-audit Tier 1, operator order
 * 2026-11-03: "things that are localStorage-only, make them saved to
 * account").
 *
 * Pinned here (pure-module, per the answer-format.test.ts law): the
 * last-opened record validation + no-op law, the pathname→kind mapping,
 * the recency reconcile DECISION (the pointer's own time ordering — the
 * my-subjects set law's recency edition), the mock-results per-course
 * slice/cap/dedupe laws, and the UNION MERGE decision (never loses a
 * record from either side, capped 20, diverged = what re-mirrors up).
 *
 * The localStorage surface is stubbed per test (the
 * test-builder-access.test.ts pattern — the module reads
 * `window.localStorage`, so the stub is installed before the import and
 * reset per test).
 *
 * Run: bun test apps/hub/src/lib/tier1-stores.test.ts
 */
import { afterEach, describe, expect, test } from "bun:test";

// ── a minimal localStorage stub (per-test isolation) ────────────────────────
function makeStorageStub(): Storage {
  let map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => map.delete(k),
    setItem: (k: string, v: string) => map.set(k, String(v)),
  } as Storage;
}

const stub = makeStorageStub();
// the store's write path dispatches CustomEvents on window (same-tab
// reactivity) — the stub carries the minimal event surface the laws touch
(globalThis as { window?: unknown }).window = {
  localStorage: stub,
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as { CustomEvent?: unknown }).CustomEvent = class CustomEvent {
  constructor(public type: string) {}
};

const { recordLastOpened, resourceFromPathname, reconcileLastOpened } = await import(
  "./last-opened"
);
const {
  loadMockResults,
  saveMockResult,
  clearMockResults,
  mergeMockResults,
} = await import("./mock-results");

const LO_KEY = "syllabai.lastOpened.v1";
const MR_KEY = "syllabai.mockResults.v1";

afterEach(() => {
  stub.clear();
});

// ── last-opened: the record law ─────────────────────────────────────────────

describe("last-opened record law", () => {
  test("recordLastOpened writes the real navigation only (slug + kind + ts)", () => {
    recordLastOpened("igcse-chemistry-19", "exam-questions");
    const raw = stub.getItem(LO_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.slug).toBe("igcse-chemistry-19");
    expect(parsed.resource).toBe("exam-questions");
    expect(typeof parsed.ts).toBe("number");
  });

  test("re-recording the SAME surface is a no-op (ts survives)", () => {
    recordLastOpened("igcse-chemistry-19", "hub");
    const first = JSON.parse(stub.getItem(LO_KEY)!);
    recordLastOpened("igcse-chemistry-19", "hub");
    const second = JSON.parse(stub.getItem(LO_KEY)!);
    expect(second.ts).toBe(first.ts);
  });

  test("re-recording a DIFFERENT surface refreshes the pointer", () => {
    recordLastOpened("igcse-chemistry-19", "hub");
    recordLastOpened("igcse-physics-25", "flashcards");
    const parsed = JSON.parse(stub.getItem(LO_KEY)!);
    expect(parsed.slug).toBe("igcse-physics-25");
    expect(parsed.resource).toBe("flashcards");
  });

  test("a corrupted record reads as empty (never throws)", () => {
    stub.setItem(LO_KEY, "{not json");
    expect(reconcileLastOpened(null, null)).toEqual({ action: "none", entry: null });
    stub.setItem(LO_KEY, JSON.stringify({ slug: 4, resource: "hub" }));
    expect(reconcileLastOpened(null, null)).toEqual({ action: "none", entry: null });
  });

  test("resourceFromPathname maps course paths (unknown segments → hub)", () => {
    expect(resourceFromPathname("/courses/igcse-chemistry-19")).toEqual({
      slug: "igcse-chemistry-19",
      resource: "hub",
    });
    expect(resourceFromPathname("/courses/igcse-chemistry-19/exam-questions")).toEqual({
      slug: "igcse-chemistry-19",
      resource: "exam-questions",
    });
    expect(resourceFromPathname("/courses/igcse-chemistry-19/exam-questions/4CH1-S1-a")).toEqual({
      slug: "igcse-chemistry-19",
      resource: "exam-questions",
    });
    expect(resourceFromPathname("/courses/igcse-chemistry-19/not-a-kind")).toEqual({
      slug: "igcse-chemistry-19",
      resource: "hub",
    });
    expect(resourceFromPathname("/dashboard")).toBeNull();
  });
});

// ── last-opened: the reconcile DECISION (recency law) ──────────────────────

describe("last-opened reconcile decision — recency decides", () => {
  const SERVER = { courseSlug: "igcse-chemistry-19", resource: "hub" as const, updatedAt: "2026-11-01T10:00:00.000Z" };

  test("server null + local present → put-up (the one-time seed)", () => {
    const local = { slug: "igcse-chemistry-19", resource: "hub" as const, ts: 1 };
    expect(reconcileLastOpened(null, local)).toEqual({ action: "put-up", entry: local });
  });

  test("server null + local absent → none", () => {
    expect(reconcileLastOpened(null, null)).toEqual({ action: "none", entry: null });
  });

  test("server newer than local → mirror-down with the server instant", () => {
    const local = { slug: "igcse-physics-25", resource: "flashcards" as const, ts: new Date("2026-10-01T00:00:00Z").getTime() };
    const verdict = reconcileLastOpened(SERVER, local);
    expect(verdict.action).toBe("mirror-down");
    expect(verdict.entry).toEqual({
      slug: "igcse-chemistry-19",
      resource: "hub",
      ts: new Date("2026-11-01T10:00:00.000Z").getTime(),
    });
  });

  test("exact tie → the server wins (deterministic)", () => {
    const local = { slug: "igcse-physics-25", resource: "flashcards" as const, ts: new Date(SERVER.updatedAt).getTime() };
    const verdict = reconcileLastOpened(SERVER, local);
    expect(verdict.action).toBe("mirror-down");
    expect(verdict.entry?.slug).toBe("igcse-chemistry-19");
  });

  test("local newer than the server (signed-out browsing after the last sync) → put-up", () => {
    const local = { slug: "igcse-physics-25", resource: "revision-notes" as const, ts: new Date("2026-11-02T00:00:00Z").getTime() };
    expect(reconcileLastOpened(SERVER, local)).toEqual({ action: "put-up", entry: local });
  });

  test("server present + local absent → mirror-down", () => {
    const verdict = reconcileLastOpened(SERVER, null);
    expect(verdict.action).toBe("mirror-down");
    expect(verdict.entry?.slug).toBe("igcse-chemistry-19");
  });
});

// ── mock results: the store law ─────────────────────────────────────────────

function mockResult(over: Partial<Parameters<typeof saveMockResult>[0]> & { id: string; course: string }) {
  return {
    ref: "4CH1/1C",
    title: "Chemistry Paper 1C",
    sessionId: "2024-summer",
    finishedAt: "2026-11-01T10:00:00.000Z",
    durationMin: 60,
    timeUsedSec: 3210,
    marks: 42,
    total: 80,
    ended: "time-up" as const,
    ...over,
  };
}

describe("mock-results store law", () => {
  test("save + load round-trips, per-course slice keeps other courses intact", () => {
    saveMockResult(mockResult({ id: "c1:s:1:1000", course: "igcse-chemistry-19" }));
    saveMockResult(mockResult({ id: "c2:s:1:2000", course: "igcse-physics-25" }));
    expect(loadMockResults("igcse-chemistry-19").map((r) => r.id)).toEqual(["c1:s:1:1000"]);
    expect(loadMockResults("igcse-physics-25").map((r) => r.id)).toEqual(["c2:s:1:2000"]);
    expect(loadMockResults()).toHaveLength(2);
  });

  test("re-saving the same id dedupes (newest first), never doubles", () => {
    saveMockResult(mockResult({ id: "c1:s:1:1000", course: "c1" }));
    saveMockResult(mockResult({ id: "c1:s:1:1000", course: "c1", marks: 55 }));
    const course = loadMockResults("c1");
    expect(course).toHaveLength(1);
    expect(course[0].marks).toBe(55);
  });

  test("the per-course cap of 50 holds (oldest beyond the cap drops)", () => {
    for (let i = 0; i < 55; i++) {
      saveMockResult(
        mockResult({
          id: `c1:s:1:${1000 + i}`,
          course: "c1",
          finishedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
        }),
      );
    }
    const course = loadMockResults("c1");
    expect(course).toHaveLength(50);
    // newest-first: the last-saved (highest timestamp) survives, the earliest drops
    expect(course[0].id).toBe("c1:s:1:1054");
  });

  test("clearMockResults clears ONLY that course", () => {
    saveMockResult(mockResult({ id: "c1:s:1:1000", course: "c1" }));
    saveMockResult(mockResult({ id: "c2:s:1:2000", course: "c2" }));
    clearMockResults("c1");
    expect(loadMockResults("c1")).toHaveLength(0);
    expect(loadMockResults("c2").map((r) => r.id)).toEqual(["c2:s:1:2000"]);
  });
});

// ── mock results: the UNION MERGE decision ──────────────────────────────────

describe("mock-results union merge decision", () => {
  test("union of both sides by id — nothing is lost from either side", () => {
    const serverOnly = mockResult({ id: "c1:s:1:1000", course: "c1", finishedAt: "2026-11-01T10:00:00.000Z" });
    const localOnly = mockResult({ id: "c1:s:2:2000", course: "c1", finishedAt: "2026-11-02T10:00:00.000Z" });
    const { mergedAll, diverged, localChanged } = mergeMockResults(
      [serverOnly],
      [localOnly],
    );
    expect(mergedAll.map((r) => r.id)).toEqual(["c1:s:2:2000", "c1:s:1:1000"]); // newest finished first
    expect(diverged).toEqual(["c1"]);
    expect(localChanged).toBe(true);
  });

  test("identical sides → no divergence, no local change (no echo PUT)", () => {
    const row = mockResult({ id: "c1:s:1:1000", course: "c1" });
    const { diverged, localChanged, mergedAll } = mergeMockResults([row], [row]);
    expect(diverged).toEqual([]);
    expect(localChanged).toBe(false);
    expect(mergedAll).toHaveLength(1);
  });

  test("server-only course mirrors down (no PUT up — merged == server); local-only course seeds up", () => {
    const serverRow = mockResult({ id: "c2:s:1:1000", course: "c2" });
    const localRow = mockResult({ id: "c1:s:1:2000", course: "c1" });
    const { mergedAll, diverged, localChanged } = mergeMockResults([serverRow], [localRow]);
    expect(mergedAll.map((r) => r.id)).toEqual(["c2:s:1:1000", "c1:s:1:2000"]);
    // only c1 diverges (the seed PUT); c2 arrives whole from the server and
    // just mirrors down — never a wasted idempotent PUT
    expect(diverged).toEqual(["c1"]);
    expect(localChanged).toBe(true);
  });

  test("the cap of 50 holds after the merge (newest survive)", () => {
    const serverRows = Array.from({ length: 30 }, (_, i) =>
      mockResult({
        id: `c1:s:1:${i}`,
        course: "c1",
        finishedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      }),
    );
    const localRows = Array.from({ length: 30 }, (_, i) =>
      mockResult({
        id: `c1:s:2:${i}`,
        course: "c1",
        finishedAt: new Date(Date.UTC(2026, 1, 1, 0, 0, i)).toISOString(),
      }),
    );
    const { mergedAll } = mergeMockResults(serverRows, localRows);
    expect(mergedAll).toHaveLength(50);
    // all 30 February (local) rows are newer than any January row
    expect(mergedAll.filter((r) => r.id.startsWith("c1:s:2:"))).toHaveLength(30);
  });
});
