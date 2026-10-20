import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearAllThreads,
  clearThreadsWhere,
  createThread,
  getActiveThread,
  getThreads,
  setActiveThread,
  threadInScope,
  type Thread,
} from "./threads";

/**
 * The per-course tutor isolation law (operator instruction 2026-10-21,
 * trace 1a15b45224c4e3f5): each course's tutor owns its history ALONE —
 * scoped rails see same-slug threads only, the legacy /tutor entry sees
 * course-less threads only, and the per-scope clear touches its own
 * scope's threads only. The label-collision discipline is pinned too:
 * ial-chemistry-17 and igcse-chemistry-19 are BOTH "Chemistry", so any
 * label-based comparison is wrong by construction (slug-to-slug only).
 *
 * threads.ts is a module-level store (one process-wide state) — these
 * tests run as one ordered sequence over it; beforeEach resets fully.
 */

const CHEM = "igcse-chemistry-19";
const IAL_CHEM = "ial-chemistry-17"; // same display label, different course
const PHYSICS = "igcse-physics-19";

function mkThread(
  id: string,
  courseSlug: string | null,
  courseLabel: string | null = courseSlug ? "Chemistry" : null,
): Thread {
  const now = Date.now();
  return {
    id,
    title: `t-${id}`,
    createdAt: now,
    updatedAt: now,
    messages: [],
    ...(courseSlug ? { courseSlug, courseLabel } : {}),
  };
}

beforeEach(() => {
  clearAllThreads();
});

describe("threadInScope (the slug-to-slug isolation law)", () => {
  test("a scoped instance sees only its own slug — never the label twin, never course-less", () => {
    const own = mkThread("own", CHEM);
    const labelTwin = mkThread("twin", IAL_CHEM); // also labeled "Chemistry"
    const legacy = mkThread("legacy", null);

    expect(threadInScope(own, CHEM)).toBe(true);
    // the load-bearing label-collision guard: slug differs, label does not
    expect(threadInScope(labelTwin, CHEM)).toBe(false);
    // strict separation: the legacy pilot history stays out of course rails
    expect(threadInScope(legacy, CHEM)).toBe(false);
  });

  test("the legacy entry (null scope) sees only course-less threads", () => {
    expect(threadInScope(mkThread("legacy", null), null)).toBe(true);
    expect(threadInScope(mkThread("own", CHEM), null)).toBe(false);
    expect(threadInScope(mkThread("twin", IAL_CHEM), null)).toBe(false);
  });

  test("absent courseSlug field (pre-V53 rows) reads as course-less", () => {
    const bare = mkThread("bare", null);
    delete (bare as Partial<Thread>).courseSlug;
    expect(threadInScope(bare, null)).toBe(true);
    expect(threadInScope(bare, CHEM)).toBe(false);
  });
});

describe("clearThreadsWhere (the per-scope clear)", () => {
  test("removes only the matching scope and re-pins the active id within survivors", () => {
    const chem = createThread("chem", { slug: CHEM, label: "Chemistry" });
    const physics = createThread("physics", { slug: PHYSICS, label: "Physics" });
    const legacy = createThread("legacy", null);
    setActiveThread(chem.id);

    clearThreadsWhere((t) => threadInScope(t, CHEM));

    const ids = getThreads().map((t) => t.id);
    expect(ids).not.toContain(chem.id);
    expect(ids).toContain(physics.id); // other course untouched
    expect(ids).toContain(legacy.id); // legacy untouched
    // active re-pins to the store's newest survivor (legacy was created last)
    expect(getActiveThread()?.id).toBe(legacy.id);
  });

  test("clearing the last thread of a scope leaves other scopes' active intact", () => {
    const chem = createThread("chem", { slug: CHEM, label: "Chemistry" });
    const physics = createThread("physics", { slug: PHYSICS, label: "Physics" });
    setActiveThread(physics.id);

    clearThreadsWhere((t) => threadInScope(t, PHYSICS));

    expect(getThreads().map((t) => t.id)).toEqual([chem.id]);
    // the global active id pointed at a removed thread — re-pinned to the
    // survivor, never left dangling on a deleted row
    expect(getActiveThread()?.id).toBe(chem.id);
  });

  test("createThread inside a course carries the course context (scoped creation)", () => {
    const t = createThread("new", { slug: CHEM, label: "Chemistry" });
    expect(t.courseSlug).toBe(CHEM);
    expect(t.courseLabel).toBe("Chemistry");
    const u = createThread("anon", null);
    expect(u.courseSlug).toBeUndefined();
  });
});
