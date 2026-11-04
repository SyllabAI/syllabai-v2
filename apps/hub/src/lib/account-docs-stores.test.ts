/**
 * The store-law fixtures — T-AUDIT-TIER1 run-004.
 *
 * The REAL stores (my-classes, progress) over the REAL engine: identity
 * seeded through the session-storage law (syllabai.token / syllabai.user),
 * the api plane methods patched at runtime (NO mock.module — the run-003
 * order-independence law), convergence driven by the REAL hydrate chain
 * (the merge-loop notifications + the completion broadcast).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// ── the DOM-less window stub (BEFORE any store code runs) ───────────────
const winStore = new Map<string, string>();
const winListeners = new Map<string, Array<() => void>>();
(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => winStore.get(k) ?? null,
    setItem: (k: string, v: string) => void winStore.set(k, String(v)),
    removeItem: (k: string) => void winStore.delete(k),
    clear: () => winStore.clear(),
    // the scan-based pools (deck / guided-flow / drafts) iterate keys —
    // the stub carries the full Storage surface the real browsers have
    get length() {
      return winStore.size;
    },
    key: (i: number) => [...winStore.keys()][i] ?? null,
  },
  addEventListener: (t: string, cb: () => void) => void (winListeners.get(t)?.push(cb) ?? winListeners.set(t, [cb])),
  removeEventListener: (t: string, cb: () => void) => {
    const l = winListeners.get(t);
    if (l) winListeners.set(t, l.filter((x) => x !== cb));
  },
  dispatchEvent: () => true,
};

import type { WorkspaceDoc, WorkspaceDocList } from "@syllabai/contracts";

process.env.NEXT_PUBLIC_API_V2_BASE_URL ??= "https://v2.example";

const { api } = await import("./api");

const ME = "me@example.edu";
let listDocs: WorkspaceDocList["documents"] = [];

api.workspaceDocs = async () => ({ documents: listDocs });
api.putWorkspaceDoc = async (key: string, value: unknown): Promise<WorkspaceDoc> => {
  putCalls.push({ key, value });
  return { key, value, updatedAt: "2026-11-06T00:00:00.000Z" };
};
const putCalls: Array<{ key: string; value: unknown }> = [];

const { hydrateAccountDocs, resetAccountDocs, __flushAllForTests } = await import("./account-docs");
const { KEY: CLASSES_KEY } = await import("./teacher/my-classes");
const { getProgressSnapshot, emptyProgress } = await import("./progress");
const { deckSessionKey, saveDeckSession } = await import("./flashcard-session");
const { draftKeyFor, writeBuilderDraft } = await import("./teacher/test-builder-access");

// the guided-flow component module (the bridge lives at its tail)
const GUIDED_PREFIX = "syllabai.guided-flow.v1.";
await import("@/app/courses/[course]/guided-lessons/[noteId]/guided-flow");

const COURSE = "igcse-chemistry-19";

function seedIdentity() {
  winStore.set("syllabai.token", "test-token");
  winStore.set(
    "syllabai.user",
    JSON.stringify({ id: "u1", email: ME, displayName: "Me", roles: ["STUDENT"] }),
  );
}

beforeEach(() => {
  resetAccountDocs();
  putCalls.length = 0;
  listDocs = [];
  winStore.clear();
  seedIdentity();
});

afterEach(() => {
  // nothing to unregister — the store bridges live for the module's life
});

describe("store laws over the real engine — teacher-classes", () => {
  test("local roster + empty account → hydration ADOPTS (one PUT, pool of record)", async () => {
    winStore.set(
      CLASSES_KEY,
      JSON.stringify([
        { id: "c1", name: "10B Chemistry", subjectSlugs: ["igcse-chemistry-19"], createdAt: "2026-11-01T00:00:00.000Z" },
      ]),
    );
    listDocs = [{ key: "teacher-classes", value: null, updatedAt: "2026-11-06T00:00:00.000Z" }];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].key).toBe("teacher-classes");
    expect(putCalls[0].value).toEqual({
      c1: {
        id: "c1",
        name: "10B Chemistry",
        subjectSlugs: ["igcse-chemistry-19"],
        createdAt: "2026-11-01T00:00:00.000Z",
      },
    });
  });

  test("server doc wins locally for a foreign-tagged roster — re-base, NO PUT", async () => {
    winStore.set("syllabai-hub:teacher-classes.v1:owner", "other@x");
    winStore.set(
      CLASSES_KEY,
      JSON.stringify([{ id: "old", name: "Old account class", subjectSlugs: ["x"], createdAt: "2026-10-01T00:00:00.000Z" }]),
    );
    listDocs = [
      {
        key: "teacher-classes",
        value: {
          b1: { id: "b1", name: "Synced from my laptop", subjectSlugs: ["igcse-chemistry-19"], createdAt: "2026-11-02T00:00:00.000Z" },
        },
        updatedAt: "2026-11-06T00:00:00.000Z",
      },
    ];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();
    expect(putCalls).toHaveLength(0);
    const roster = JSON.parse(winStore.get(CLASSES_KEY)!) as Array<{ id: string }>;
    expect(roster.map((c) => c.id)).toEqual(["b1"]); // creation order preserved
    expect(winStore.get("syllabai-hub:teacher-classes.v1:owner")).toBe(ME); // re-tagged
  });

  test("the union keeps BOTH sides: local's new class + server's newer rename (pull-down via the completion broadcast)", async () => {
    winStore.set(
      CLASSES_KEY,
      JSON.stringify([
        { id: "a", name: "Local name", subjectSlugs: ["x"], createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-03T00:00:00.000Z" },
        { id: "c", name: "Local-only class", subjectSlugs: ["y"], createdAt: "2026-11-04T00:00:00.000Z", updatedAt: "2026-11-04T00:00:00.000Z" },
      ]),
    );
    listDocs = [
      {
        key: "teacher-classes",
        value: {
          a: { id: "a", name: "Renamed on my laptop", subjectSlugs: ["x"], createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-05T00:00:00.000Z" },
        },
        updatedAt: "2026-11-06T00:00:00.000Z",
      },
    ];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();
    // local has 'c' (unknown to the server) → commit-up, ONE intent
    expect(putCalls).toHaveLength(1);
    const pool = putCalls[0].value as Record<string, { name: string }>;
    expect(pool.a.name).toBe("Renamed on my laptop"); // server newer → server wins
    expect(pool.c.name).toBe("Local-only class"); // local-only survives
    // and the pull-down side: the local roster now carries the renamed class too
    const roster = JSON.parse(winStore.get(CLASSES_KEY)!) as Array<{ id: string; name: string }>;
    expect(roster.find((c) => c.id === "a")!.name).toBe("Renamed on my laptop");
  });
});

describe("store laws over the real engine — progress:<slug>", () => {
  // ONE course per test: the progress module caches per course for the
  // process lifetime, so each test exercises a FRESH course the way a
  // fresh device visit would.
  const C = (n: string) => `igcse-chemistry-${n}`;

  test("the empty overlay is the EMPTY pool — a fresh course never PUTs", async () => {
    getProgressSnapshot(C("41")); // registers the bridge (load path)
    listDocs = []; // the account has nothing
    await hydrateAccountDocs(ME);
    await __flushAllForTests();
    expect(putCalls).toHaveLength(0);
  });

  test("local progress + server families → the union commits up (one intent, both sides survive)", async () => {
    const course = C("42");
    winStore.set(
      `syllabai-hub:progress:${course}`,
      JSON.stringify({
        ...emptyProgress(),
        flashcards: { c1: { subtopic: null, rating: "still-learning", at: 10 } },
        notesRead: { n1: { subtopic: null, at: 5 } },
      }),
    );
    getProgressSnapshot(course); // registers the bridge with THIS cache
    listDocs = [
      {
        key: `progress:${course}`,
        value: { flashcards: { c1: { subtopic: null, rating: "know", at: 20 } } },
        updatedAt: "2026-11-06T00:00:00.000Z",
      },
    ];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();
    expect(putCalls).toHaveLength(1); // local has notesRead → commit-up
    const pool = putCalls[0].value as Record<string, Record<string, { at: number; rating?: string }>>;
    expect(putCalls[0].key).toBe(`progress:${course}`);
    expect(pool.flashcards.c1.rating).toBe("know"); // server newer per entity
    expect(pool.notesRead.n1.at).toBe(5); // local-only survives
    // the completion-broadcast mirror then converges the local STALE copy
    // (c1@10 → the union's c1@20) — the pull-down side of the same union
    expect(winStore.get(`syllabai-hub:progress:${course}`)).toContain('"know"');
  });

  test("server-only families pull down into the live store (cache + localStorage + listeners)", async () => {
    const course = C("43");
    getProgressSnapshot(course); // register + cache an empty overlay
    listDocs = [
      {
        key: `progress:${course}`,
        value: { flashcards: { c9: { subtopic: null, rating: "know", at: 30 } } },
        updatedAt: "2026-11-06T00:00:00.000Z",
      },
    ];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();
    // pull-down only FOR THIS COURSE (earlier tests' bridges re-adopt
    // their own docs after the fixture's tag wipe — fixture noise, scoped
    // out here; production tags persist so this class cannot fire there)
    expect(putCalls.filter((c) => c.key === `progress:${course}`)).toHaveLength(0);
    const after = getProgressSnapshot(course);
    expect(after.flashcards.c9.rating).toBe("know"); // the live store sees it
    expect(winStore.get(`syllabai-hub:progress:${course}`)).toContain("c9");
  });

  test("the local-only family rides the pull-down (union, not replacement)", async () => {
    const course = C("44");
    winStore.set(
      `syllabai-hub:progress:${course}`,
      JSON.stringify({
        ...emptyProgress(),
        notesRead: { localNote: { subtopic: null, at: 7 } },
      }),
    );
    getProgressSnapshot(course);
    listDocs = [
      {
        key: `progress:${course}`,
        value: { flashcards: { c9: { subtopic: null, rating: "know", at: 30 } } },
        updatedAt: "2026-11-06T00:00:00.000Z",
      },
    ];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();
    const after = getProgressSnapshot(course);
    expect(after.flashcards.c9.rating).toBe("know"); // pulled down
    expect(after.notesRead.localNote.at).toBe(7); // local-only survives
  });
});

describe("store laws over the real engine — deck-sessions", () => {
  const DECK_COURSE = "igcse-chemistry-19";
  const DECK_SUB = "4CH1-S1-b";

  test("local-only deck session + empty account → hydration ADOPTS", async () => {
    saveDeckSession(DECK_COURSE, DECK_SUB, { v: 1, order: ["q1", "q2"], pos: 1, filter: null, at: 10 });
    listDocs = [];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();
    expect(putCalls.filter((c) => c.key === "deck-sessions")).toHaveLength(1);
    const pool = putCalls.find((c) => c.key === "deck-sessions")!.value as Record<string, { at: number }>;
    expect(pool[`${DECK_COURSE}:${DECK_SUB}`].at).toBe(10);
  });

  test("server deck session newer → pull-down to the disk key; the honesty law rides the restore", async () => {
    const serverSession = { v: 1, order: ["q1", "q2", "q3"], pos: 2, filter: null, at: 30 };
    listDocs = [
      { key: "deck-sessions", value: { [`${DECK_COURSE}:${DECK_SUB}`]: serverSession }, updatedAt: "2026-11-06T00:00:00.000Z" },
    ];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();
    expect(putCalls.filter((c) => c.key === "deck-sessions")).toHaveLength(0);
    const raw = winStore.get(deckSessionKey(DECK_COURSE, DECK_SUB));
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).at).toBe(30);
  });

  test("the union: a second deck's local session rides the pull-down (both decks on the account)", async () => {
    saveDeckSession(DECK_COURSE, "OTHER-S2", { v: 1, order: ["x1"], pos: 0, filter: null, at: 40 });
    const serverSession = { v: 1, order: ["q1"], pos: 0, filter: null, at: 30 };
    listDocs = [
      { key: "deck-sessions", value: { [`${DECK_COURSE}:${DECK_SUB}`]: serverSession }, updatedAt: "2026-11-06T00:00:00.000Z" },
    ];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();
    expect(putCalls.filter((c) => c.key === "deck-sessions")).toHaveLength(1); // local-only deck → commit-up
    const pool = putCalls.find((c) => c.key === "deck-sessions")!.value as Record<string, { at: number }>;
    expect(Object.keys(pool).sort()).toEqual([`${DECK_COURSE}:${DECK_SUB}`, `${DECK_COURSE}:OTHER-S2`]);
    expect(winStore.get(deckSessionKey(DECK_COURSE, DECK_SUB))).toContain('"at":30'); // pulled down too
  });
});

describe("store laws over the real engine — guided-flow", () => {
  test("server lesson state newer → pull-down to the disk key", async () => {
    const lessonId = "lesson-pd-1";
    winStore.set(
      GUIDED_PREFIX + lessonId,
      JSON.stringify({ v: 1, moduleIndex: 0, stage: 0, ratings: {}, recalibrated: {}, answers: {}, finished: false, at: 5 }),
    );
    listDocs = [
      {
        key: "guided-flow",
        value: {
          [lessonId]: { v: 1, moduleIndex: 2, stage: 1, ratings: { m1: "high" }, recalibrated: {}, answers: {}, finished: false, at: 50 },
        },
        updatedAt: "2026-11-06T00:00:00.000Z",
      },
    ];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();
    expect(putCalls.filter((c) => c.key === "guided-flow")).toHaveLength(0);
    const after = JSON.parse(winStore.get(GUIDED_PREFIX + lessonId)!) as { moduleIndex: number; at: number };
    expect(after.moduleIndex).toBe(2); // the newer wizard state won
    expect(after.at).toBe(50);
  });

  test("local-only lesson state → commit-up carries it (one intent)", async () => {
    const lessonId = "lesson-cu-1";
    winStore.set(
      GUIDED_PREFIX + lessonId,
      JSON.stringify({ v: 1, moduleIndex: 1, stage: 3, ratings: { m0: "low" }, recalibrated: {}, answers: {}, finished: false, at: 60 }),
    );
    listDocs = [{ key: "guided-flow", value: {}, updatedAt: "2026-11-06T00:00:00.000Z" }];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();
    expect(putCalls.filter((c) => c.key === "guided-flow")).toHaveLength(1);
    const pool = putCalls.find((c) => c.key === "guided-flow")!.value as Record<string, { at: number }>;
    expect(pool[lessonId].at).toBe(60);
  });
});

describe("store laws over the real engine — test-builder-drafts", () => {
  test("server draft newer (savedAt) → pull-down; the builder's own shape rides verbatim", async () => {
    const slug = "igcse-chemistry-19";
    const serverDraft = {
      v: 1, course: slug, view: "builder", selected: ["q1"], mode: "marks",
      targetMarks: "40", maxQuestions: "10", difficulty: "mixed", testName: "From my laptop",
      stale: false, pdf: {}, manualIds: [], test: null, savedAt: "2026-11-05T12:00:00.000Z",
    };
    listDocs = [{ key: "test-builder-drafts", value: { [slug]: serverDraft }, updatedAt: "2026-11-06T00:00:00.000Z" }];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();
    expect(putCalls.filter((c) => c.key === "test-builder-drafts")).toHaveLength(0);
    const raw = winStore.get(draftKeyFor(slug));
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).testName).toBe("From my laptop");
  });

  test("local draft newer → commit-up (the drafts pool carries BOTH slugs)", async () => {
    const slugA = "course-a";
    const slugB = "course-b";
    writeBuilderDraft(slugA, {
      v: 1, course: slugA, view: "tests", selected: [], mode: "count",
      targetMarks: "", maxQuestions: "5", difficulty: "mixed", testName: "Fresh here",
      stale: false, pdf: {}, manualIds: [], test: null, savedAt: "2026-11-06T09:00:00.000Z",
    });
    listDocs = [
      {
        key: "test-builder-drafts",
        value: {
          [slugB]: {
            v: 1, course: slugB, view: "builder", selected: [], mode: "marks",
            targetMarks: "30", maxQuestions: "", difficulty: "mixed", testName: "Other course",
            stale: false, pdf: {}, manualIds: [], test: null, savedAt: "2026-11-05T00:00:00.000Z",
          },
        },
        updatedAt: "2026-11-06T00:00:00.000Z",
      },
    ];
    await hydrateAccountDocs(ME);
    await __flushAllForTests();
    expect(putCalls.filter((c) => c.key === "test-builder-drafts")).toHaveLength(1);
    const pool = putCalls.find((c) => c.key === "test-builder-drafts")!.value as Record<string, { testName: string }>;
    expect(pool[slugA].testName).toBe("Fresh here"); // local newer wins
    expect(pool[slugB].testName).toBe("Other course"); // server-only survives
    expect(winStore.get(draftKeyFor(slugB))).toContain("Other course"); // pulled down too
  });
});
