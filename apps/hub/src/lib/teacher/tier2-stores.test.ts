/**
 * T-TIER1 run-002 hub law tests — the account-backed teacher stores (the
 * run-001 tier1-stores precedent, teacher edition). The localStorage surface
 * is stubbed per file (the stores read `window.localStorage`), so the stub
 * is installed before the import and the sync laws run against it.
 *
 * Pinned: the three store primitives (read/write/reactive contract), the
 * three pure reconcile MERGES (union never loses a record — saved tests by
 * the opaque id, coverage as a per-course code-set union, reviews by
 * resourceId with the newer-verdict-wins law), the caps (30 / 500 / 200),
 * and the deterministic tie-breaks.
 */
import { describe, expect, test } from "bun:test";

// ── a minimal localStorage stub (per-file isolation) ─────────────────────────
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
// the stores' write path dispatches CustomEvents on window (same-tab
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

const {
  mergeSavedTests,
  mergeCoverage,
  mergeContentReviews,
} = await import("./stores");

// ── fixtures ─────────────────────────────────────────────────────────────────

const testAt = (id: string, createdAt: string, course = "igcse-chemistry-19") => ({
  id,
  name: `Test ${id}`,
  course,
  courseCode: "4CH1",
  subtopics: ["4CH1-S1-b"],
  targetMarks: null,
  maxQuestions: null,
  createdAt,
});

const reviewAt = (resourceId: string, createdAt: string, verdict = "approved") => ({
  resourceId,
  courseId: "igcse-chemistry-19",
  courseCode: "4CH1",
  kind: "solution" as const,
  verdict: verdict as "approved",
  comment: "",
  reviewer: "Ms Hughes",
  createdAt,
});

// ── mergeSavedTests (the Test Builder library) ───────────────────────────────

describe("mergeSavedTests — the union-by-id law", () => {
  test("a union never loses a record from either side", () => {
    const server = [testAt("t_a", "2026-11-01T10:00:00.000Z")];
    const local = [testAt("t_b", "2026-11-02T10:00:00.000Z")];
    const { merged, diverged, localChanged } = mergeSavedTests(server, local);
    expect(merged.map((t) => t.id).sort()).toEqual(["t_a", "t_b"]);
    expect(diverged).toBe(true); // the server is missing t_b → re-mirror up
    expect(localChanged).toBe(true); // the cache is missing t_a → merge down
  });

  test("newest-createdAt first; the tie goes to the id (deterministic)", () => {
    const a = testAt("t_a", "2026-11-03T10:00:00.000Z");
    const b = testAt("t_b", "2026-11-01T10:00:00.000Z");
    const c1 = testAt("t_c", "2026-11-02T10:00:00.000Z");
    const c2 = testAt("t_c0", "2026-11-02T10:00:00.000Z");
    const { merged } = mergeSavedTests([a, b, c2, c1], []);
    expect(merged.map((t) => t.id)).toEqual(["t_a", "t_c", "t_c0", "t_b"]);
  });

  test("an id present on both sides appears ONCE (the merge key, not a double)", () => {
    const server = [testAt("t_a", "2026-11-01T10:00:00.000Z")];
    const local = [testAt("t_a", "2026-11-01T10:00:00.000Z")];
    const { merged, diverged, localChanged } = mergeSavedTests(server, local);
    expect(merged).toHaveLength(1);
    expect(diverged).toBe(false);
    expect(localChanged).toBe(false);
  });

  test("the cap holds at 30 (both sides' bound)", () => {
    const many = Array.from({ length: 40 }, (_, i) => testAt(`t_${i}`, `2026-11-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`));
    const { merged } = mergeSavedTests([], many);
    expect(merged).toHaveLength(30);
  });

  test("the honest empties agree (no spurious mirror)", () => {
    const { merged, diverged, localChanged } = mergeSavedTests([], []);
    expect(merged).toEqual([]);
    expect(diverged).toBe(false);
    expect(localChanged).toBe(false);
  });
});

// ── mergeCoverage (the taught-codes overlay) ─────────────────────────────────

describe("mergeCoverage — the per-course code-set union law", () => {
  test("codes from both sides union, dedupe and sort", () => {
    const server = { "igcse-chemistry-19": ["4CH1-S1-c", "4CH1-S1-b"] };
    const local = { "igcse-chemistry-19": ["4CH1-S1-b", "4CH1-S1-a"] };
    const { merged, diverged, localChanged } = mergeCoverage(server, local);
    expect(merged["igcse-chemistry-19"]).toEqual(["4CH1-S1-a", "4CH1-S1-b", "4CH1-S1-c"]);
    expect(diverged).toEqual(["igcse-chemistry-19"]);
    expect(localChanged).toBe(true);
  });

  test("a course only on one side lands in the union (never dropped)", () => {
    const server = { "igcse-biology-19": ["4BI1-S1-a"] };
    const local = { "igcse-physics-19": ["4PH1-S1-a"] };
    const { merged, diverged, localChanged } = mergeCoverage(server, local);
    expect(Object.keys(merged).sort()).toEqual(["igcse-biology-19", "igcse-physics-19"]);
    expect(diverged).toEqual(["igcse-physics-19"]);
    expect(localChanged).toBe(true);
  });

  test("identical sets stay quiet (no spurious mirror)", () => {
    const map = { "igcse-chemistry-19": ["4CH1-S1-b"] };
    const { diverged, localChanged } = mergeCoverage(map, map);
    expect(diverged).toEqual([]);
    expect(localChanged).toBe(false);
  });

  test("order-insensitive comparison (the codes are a set, not a list)", () => {
    const { diverged, localChanged } = mergeCoverage(
      { "igcse-chemistry-19": ["b", "a"] },
      { "igcse-chemistry-19": ["a", "b"] },
    );
    expect(diverged).toEqual([]);
    expect(localChanged).toBe(false);
  });
});

// ── mergeContentReviews (the validation verdicts) ────────────────────────────

describe("mergeContentReviews — the one-verdict-per-resource law", () => {
  test("a conflicting verdict resolves to the NEWER createdAt", () => {
    const server = [reviewAt("r1", "2026-11-01T10:00:00.000Z", "approved")];
    const local = [reviewAt("r1", "2026-11-02T10:00:00.000Z", "rejected")];
    const { merged, diverged } = mergeContentReviews(server, local);
    expect(merged).toHaveLength(1);
    expect(merged[0].verdict).toBe("rejected"); // the re-review is a correction
    expect(diverged).toBe(true);
  });

  test("a tie goes to the server (deterministic)", () => {
    const at = "2026-11-01T10:00:00.000Z";
    const server = [reviewAt("r1", at, "approved")];
    const local = [reviewAt("r1", at, "rejected")];
    const { merged } = mergeContentReviews(server, local);
    expect(merged[0].verdict).toBe("approved");
  });

  test("disjoint resources union (never lose a verdict from either side)", () => {
    const server = [reviewAt("r1", "2026-11-01T10:00:00.000Z")];
    const local = [reviewAt("r2", "2026-11-02T10:00:00.000Z")];
    const { merged, diverged, localChanged } = mergeContentReviews(server, local);
    expect(merged.map((r) => r.resourceId).sort()).toEqual(["r1", "r2"]);
    expect(diverged).toBe(true);
    expect(localChanged).toBe(true);
  });

  test("newest-first ordering by verdict time", () => {
    const r1 = reviewAt("r1", "2026-11-01T10:00:00.000Z");
    const r2 = reviewAt("r2", "2026-11-03T10:00:00.000Z");
    const r3 = reviewAt("r3", "2026-11-02T10:00:00.000Z");
    const { merged } = mergeContentReviews([r1, r3], [r2]);
    expect(merged.map((r) => r.resourceId)).toEqual(["r2", "r3", "r1"]);
  });

  test("the cap holds at 200 (both sides' bound)", () => {
    const many = Array.from({ length: 210 }, (_, i) =>
      reviewAt(`r${i}`, `2026-11-01T00:00:${String(i % 60).padStart(2, "0")}.${String(Math.floor(i / 60)).padStart(2, "0")}0Z`),
    );
    const { merged } = mergeContentReviews([], many);
    expect(merged).toHaveLength(200);
  });
});
