/**
 * T-TEACH-008 — Test Builder access-scoping pins (operator ruling trace
 * 1a1609dc31d0b735): the taught filter, the landing-course law and the
 * per-course draft store with its legacy-v1 migration. The localStorage
 * surface is stubbed per test (the module reads `window.localStorage`
 * directly — same pattern family as the other hub lib pins).
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  LEGACY_DRAFT_KEY,
  draftKeyFor,
  filterTaughtCourses,
  readBuilderDraft,
  resolveInitialCourse,
  writeBuilderDraft,
} from "./test-builder-access";
import type { SwitchableCourse } from "./types";

// ── a minimal localStorage stub (per-test isolation) ───────────────────────

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

function installStorage(): MemStorage {
  const stub = new MemStorage();
  (globalThis as { window?: unknown }).window = { localStorage: stub };
  return stub;
}

afterEach(() => {
  (globalThis as { window?: unknown }).window = undefined;
});

// ── fixtures ───────────────────────────────────────────────────────────────

const COURSES: SwitchableCourse[] = [
  { slug: "igcse-chemistry-19", label: "Chemistry", code: "4CH1", level: "IGCSE" },
  { slug: "igcse-physics-19", label: "Physics", code: "4PH1", level: "IGCSE" },
  { slug: "ial-chemistry-18", label: "Chemistry", code: "WCH1", level: "IAL" },
  { slug: "ial-maths-18", label: "Mathematics", code: "WMA1", level: "IAL" },
];

// ── the taught filter ──────────────────────────────────────────────────────

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

// ── the landing-course law ─────────────────────────────────────────────────

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

// ── the per-course draft store ─────────────────────────────────────────────

describe("per-course draft store (T-TEACH-008 → T-ACCOUNT-ONLY run-001)", () => {
  test("keys are per-course (the RETIRED device family, kept as the migration pin)", () => {
    expect(draftKeyFor("igcse-chemistry-19")).toBe(
      "syllabai.testBuilderDraft.v2.igcse-chemistry-19",
    );
  });

  test("write→read roundtrip is course-scoped; clearing one course leaves the other", () => {
    installStorage(); // the adoption block tolerates a device with no records
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

  test("a draft stored under another course's key is invisible (identity law v+course)", () => {
    installStorage();
    writeBuilderDraft("igcse-chemistry-19", { v: 1, course: "igcse-chemistry-19", x: 1 });
    // the physics pool slot holds a chemistry-course payload → refused
    writeBuilderDraft("igcse-physics-19", { v: 1, course: "igcse-chemistry-19", x: 1 });
    expect(readBuilderDraft("igcse-physics-19")).toBeNull();
    expect(readBuilderDraft("igcse-chemistry-19")).not.toBeNull();
  });

  test("the legacy-v1 migration is the ENGINE's one-time adoption law — the store reads the pool it seeded", () => {
    // T-ACCOUNT-ONLY run-001: the device records (the v2 per-course keys AND
    // the pre-separation v1 single slot) are adopted ONCE per tab at module
    // init (the engine's adoptLegacyStorage — commit up only when the
    // account has no doc of its own, then the device keys retire). The
    // adoption law is pinned in the account-docs fixtures; the store's own
    // law is the pool round-trip above (the v1 draft landed on its recorded
    // course's pool entry at init).
    expect(LEGACY_DRAFT_KEY).toBe("syllabai.testBuilderDraft.v1");
  });
});
