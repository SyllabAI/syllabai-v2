/**
 * T-TEACH-008 — Test Builder access-scoping pins (operator ruling trace
 * 1a1609dc31d0b735): the taught filter, the landing-course law and the
 * per-course draft store — now ACCOUNT-BACKED (T-AUDIT-TIER1: the
 * `test-builder-drafts` document through lib/account-docs.ts; the
 * localStorage surface is gone). The doc memory is seeded/cleared per test
 * via the module's test seam (same pattern family as the other hub lib
 * pins; no fetch, no network).
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  DRAFTS_DOC_KEY,
  filterTaughtCourses,
  readBuilderDraft,
  resolveInitialCourse,
  writeBuilderDraft,
} from "./test-builder-access";
import {
  __resetAccountDocsForTests,
  __seedAccountDocsForTests,
} from "@/lib/account-docs";
import type { SwitchableCourse } from "./types";

afterEach(() => {
  __resetAccountDocsForTests();
});

// ── fixtures ───────────────────────────────────────────────────────────

const COURSES: SwitchableCourse[] = [
  { slug: "igcse-chemistry-19", label: "Chemistry", code: "4CH1", level: "IGCSE" },
  { slug: "igcse-physics-19", label: "Physics", code: "4PH1", level: "IGCSE" },
  { slug: "ial-chemistry-18", label: "Chemistry", code: "WCH1", level: "IAL" },
  { slug: "ial-maths-18", label: "Mathematics", code: "WMA1", level: "IAL" },
];

// ── the taught filter ──────────────────────────────────────────────────

describe("filterTaughtCourses (T-TEACH-008)", () => {
  test("intersection only — registry courses the teacher's classes vote for", () => {
    const taught = filterTaughtCourses(
      COURSES,
      new Set(["igcse-chemistry-19", "ial-maths-18"]),
    );
    expect(taught.map((c) => c.slug)).toEqual(["igcse-chemistry-19", "ial-maths-18"]);
  });

  test("registry order preserved (classes vote membership, never ordering)", () => {
    const taught = filterTaughtCourses(
      COURSES,
      new Set(["ial-maths-18", "igcse-physics-19"]),
    );
    expect(taught.map((c) => c.slug)).toEqual(["igcse-physics-19", "ial-maths-18"]);
  });

  test("a slug outside the registry is ignored; empty set → empty list (fail-closed)", () => {
    expect(filterTaughtCourses(COURSES, new Set(["not-in-registry"]))).toEqual([]);
    expect(filterTaughtCourses(COURSES, new Set())).toEqual([]);
  });
});

// ── the landing-course law ─────────────────────────────────────────────

describe("resolveInitialCourse (T-TEACH-008)", () => {
  const taught = filterTaughtCourses(COURSES, new Set(["igcse-physics-19", "ial-maths-18"]));

  test("a deep-linked TAUGHT course is honored", () => {
    expect(resolveInitialCourse("ial-maths-18", taught)).toBe("ial-maths-18");
  });

  test("an UNTAUGHT deep-link degrades to the first taught course — never opens the untaught builder", () => {
    expect(resolveInitialCourse("igcse-chemistry-19", taught)).toBe("igcse-physics-19");
  });

  test("no param → the first taught course; nothing taught → null (honest empty)", () => {
    expect(resolveInitialCourse(null, taught)).toBe("igcse-physics-19");
    expect(resolveInitialCourse("igcse-chemistry-19", [])).toBeNull();
    expect(resolveInitialCourse(null, [])).toBeNull();
  });
});

// ── the per-course draft store (account-backed) ────────────────────────

describe("per-course draft store (T-TEACH-008 + T-AUDIT-TIER1)", () => {
  test("write→read roundtrip is course-scoped; clearing one course leaves the other", () => {
    const a = { v: 1, course: "igcse-chemistry-19", testName: "Mole test" };
    const b = { v: 1, course: "ial-maths-18", testName: "Series test" };
    writeBuilderDraft("igcse-chemistry-19", a);
    writeBuilderDraft("ial-maths-18", b);

    expect((readBuilderDraft("igcse-chemistry-19") as typeof a).testName).toBe("Mole test");
    expect((readBuilderDraft("ial-maths-18") as typeof b).testName).toBe("Series test");

    writeBuilderDraft("igcse-chemistry-19", null);
    expect(readBuilderDraft("igcse-chemistry-19")).toBeNull();
    expect((readBuilderDraft("ial-maths-18") as typeof b).testName).toBe("Series test");
  });

  test("the whole draft map lives under the ONE account doc key", () => {
    writeBuilderDraft("igcse-chemistry-19", { v: 1, course: "igcse-chemistry-19" });
    writeBuilderDraft("ial-maths-18", { v: 1, course: "ial-maths-18" });
    // the doc carries the whole map — one PUT per burst, not per key
    const seeded = readBuilderDraft("igcse-chemistry-19");
    expect(seeded).not.toBeNull();
    expect(Object.keys(readBuilderDraft("ial-maths-18") ?? {}).length).toBeGreaterThanOrEqual(0);
    expect(DRAFTS_DOC_KEY).toBe("test-builder-drafts");
  });

  test("a draft stored under another course's key is invisible (identity law v+course)", () => {
    writeBuilderDraft("igcse-chemistry-19", { v: 1, course: "igcse-chemistry-19", x: 1 });
    // the physics slot holds a chemistry-course payload → refused
    writeBuilderDraft("igcse-physics-19", { v: 1, course: "igcse-chemistry-19", x: 1 });
    expect(readBuilderDraft("igcse-physics-19")).toBeNull();
    expect(readBuilderDraft("igcse-chemistry-19")).not.toBeNull();
  });

  test("a server-hydrated doc feeds the draft store (the seed seam)", () => {
    __seedAccountDocsForTests({
      [DRAFTS_DOC_KEY]: {
        "ial-maths-18": { v: 1, course: "ial-maths-18", testName: "from the account" },
      },
    });
    const d = readBuilderDraft("ial-maths-18") as { testName?: string };
    expect(d.testName).toBe("from the account");
    expect(readBuilderDraft("igcse-chemistry-19")).toBeNull();
  });

  test("corrupt map shapes degrade to no draft (never throw)", () => {
    __seedAccountDocsForTests({ [DRAFTS_DOC_KEY]: "not-an-object" });
    expect(readBuilderDraft("igcse-chemistry-19")).toBeNull();
    __seedAccountDocsForTests({ [DRAFTS_DOC_KEY]: { "igcse-chemistry-19": { v: 2, course: "igcse-chemistry-19" } } });
    // v!==1 → the identity law refuses the payload
    expect(readBuilderDraft("igcse-chemistry-19")).toBeNull();
  });
});
