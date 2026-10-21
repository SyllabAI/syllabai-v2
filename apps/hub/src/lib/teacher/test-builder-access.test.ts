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

describe("per-course draft store (T-TEACH-008)", () => {
  test("keys are per-course", () => {
    expect(draftKeyFor("igcse-chemistry-19")).toBe(
      "syllabai.testBuilderDraft.v2.igcse-chemistry-19",
    );
  });

  test("write→read roundtrip is course-scoped; clearing one course leaves the other", () => {
    const store = installStorage();
    const a = { v: 1, course: "igcse-chemistry-19", testName: "Mole test" };
    const b = { v: 1, course: "ial-maths-18", testName: "Series test" };
    writeBuilderDraft("igcse-chemistry-19", a);
    writeBuilderDraft("ial-maths-18", b);

    expect((readBuilderDraft("igcse-chemistry-19") as typeof a).testName).toBe("Mole test");
    expect((readBuilderDraft("ial-maths-18") as typeof b).testName).toBe("Series test");

    writeBuilderDraft("igcse-chemistry-19", null);
    expect(readBuilderDraft("igcse-chemistry-19")).toBeNull();
    expect((readBuilderDraft("ial-maths-18") as typeof b).testName).toBe("Series test");
    expect(store.getItem(draftKeyFor("igcse-chemistry-19"))).toBeNull();
  });

  test("a draft stored under another course's key is invisible (identity law v+course)", () => {
    installStorage();
    writeBuilderDraft("igcse-chemistry-19", { v: 1, course: "igcse-chemistry-19", x: 1 });
    // the v2 key for physics holds a chemistry-course payload → refused
    writeBuilderDraft("igcse-physics-19", { v: 1, course: "igcse-chemistry-19", x: 1 });
    expect(readBuilderDraft("igcse-physics-19")).toBeNull();
    expect(readBuilderDraft("igcse-chemistry-19")).not.toBeNull();
  });

  test("legacy-v1 migration: adopting draft is copied to v2 and the single slot vacated", () => {
    const store = installStorage();
    const legacy = { v: 1, course: "igcse-chemistry-19", testName: "pre-separation work" };
    store.setItem(LEGACY_DRAFT_KEY, JSON.stringify(legacy));

    const d = readBuilderDraft("igcse-chemistry-19") as typeof legacy;
    expect(d.testName).toBe("pre-separation work");
    // adopted into the per-course key…
    expect(JSON.parse(store.getItem(draftKeyFor("igcse-chemistry-19"))!)).toEqual(legacy);
    // …and the single slot is vacated (one-time migration)
    expect(store.getItem(LEGACY_DRAFT_KEY)).toBeNull();
  });

  test("legacy-v1 draft of ANOTHER course is left untouched for its own visit", () => {
    const store = installStorage();
    const legacy = { v: 1, course: "ial-maths-18", testName: "maths work" };
    store.setItem(LEGACY_DRAFT_KEY, JSON.stringify(legacy));

    expect(readBuilderDraft("igcse-chemistry-19")).toBeNull();
    // untouched: chemistry's visit must not consume maths's draft
    expect(store.getItem(LEGACY_DRAFT_KEY)).toEqual(JSON.stringify(legacy));
    expect(store.getItem(draftKeyFor("ial-maths-18"))).toBeNull();

    // maths's own visit adopts it
    const d = readBuilderDraft("ial-maths-18") as typeof legacy;
    expect(d.testName).toBe("maths work");
    expect(store.getItem(LEGACY_DRAFT_KEY)).toBeNull();
  });

  test("corrupt payloads degrade to no draft (never throw)", () => {
    const store = installStorage();
    store.setItem(draftKeyFor("igcse-chemistry-19"), "{not json");
    expect(readBuilderDraft("igcse-chemistry-19")).toBeNull();
    store.setItem(LEGACY_DRAFT_KEY, "{also not json");
    expect(readBuilderDraft("igcse-chemistry-19")).toBeNull();
  });
});
