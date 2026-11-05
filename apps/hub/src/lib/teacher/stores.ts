"use client";

/**
 * Teacher-side client stores (TEACHER-2) — T-TIER1 run-002 → T-ACCOUNT-ONLY
 * run-001.
 *
 *   teaching coverage — per-course overlay { [courseSlug]: string[] }
 *     (taught subtopic codes). TEACHER_ARCHITECTURE §13.4: coverage is a
 *     TEACHER-side overlay, semantically separate from learner mastery —
 *     NOT_TAUGHT means "no coverage recorded", never "weak".
 *
 *   saved tests — Test Builder saves (SME reference: reuse/edit):
 *     { id, name, course, subtopics, targetMarks, maxQuestions, createdAt }
 *
 *   content reviews — content reviews (Phase 2 validation queue):
 *     the teacher's verdicts on AI-authored content, one per resource.
 *
 * T-ACCOUNT-ONLY run-001 (operator order 2026-11-05: "remove device-local
 * things completely — every single thing must be saved in account"): all
 * three live in MODULE MEMORY and the ACCOUNT
 * (teacher_saved_tests / teacher_teaching_coverage / teacher_content_reviews,
 * via /teachers/me) is their ONLY durable store. The retired localStorage
 * records (syllabai.teachingCoverage.v1 / syllabai.savedTests.v1 /
 * syllabai.contentReviews.v1) adopt ONCE per tab — they seed the memory
 * stores so the reconcile's conservative union migrates them — and the
 * device keys are removed after the first successful reconcile. The sync
 * layer at the bottom keeps the my-subjects.ts write-through law with the
 * mock-results conservative merge (a UNION never loses a record from either
 * side). Signed out the stores work in-memory only; the sync is a no-op.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { readIdentitySnapshot, useIdentity } from "@/lib/identity";

// ── teaching coverage ─────────────────────────────────────────────────────

const COVERAGE_KEY = "syllabai.teachingCoverage.v1"; // RETIRED (legacy adoption pin)
const COVERAGE_EVENT = "syllabai:teaching-coverage-changed";

type CoverageMap = Record<string, string[]>;

function parseCoverage(raw: unknown): CoverageMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: CoverageMap = {};
  for (const [k, v] of Object.entries(raw as CoverageMap)) {
    if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string");
  }
  return out;
}

// ── the in-memory stores of record (T-ACCOUNT-ONLY run-001) — the device
// records seed them in the adoption block below (before the sync surface) ──
let coverageStore: CoverageMap = {};
let legacyKeysPresent = false;

function retireLegacyTeacherKeys(): void {
  if (!legacyKeysPresent || typeof window === "undefined") return;
  for (const k of [COVERAGE_KEY, TESTS_KEY, REVIEWS_KEY]) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      // best-effort
    }
  }
  legacyKeysPresent = false;
}

let coverageSnapshot: CoverageMap = {};
const EMPTY_COVERAGE: string[] = [];

function coverageSnapshotGet(): CoverageMap {
  const next = coverageStore;
  const nextKeys = Object.keys(next);
  const curKeys = Object.keys(coverageSnapshot);
  const same =
    nextKeys.length === curKeys.length &&
    nextKeys.every((k) => {
      const a = next[k];
      const b = coverageSnapshot[k] ?? [];
      return a.length === b.length && a.every((x, i) => x === b[i]);
    });
  if (!same) coverageSnapshot = next;
  return coverageSnapshot;
}

/** Referentially stable per-course list (useSyncExternalStore requires caching). */
function coverageFor(course: string): string[] {
  return coverageSnapshotGet()[course] ?? EMPTY_COVERAGE;
}

function writeCoverage(map: CoverageMap) {
  coverageStore = map;
  window.dispatchEvent(new CustomEvent(COVERAGE_EVENT));
}

export function useTeachingCoverage(course: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      window.addEventListener(COVERAGE_EVENT, onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(COVERAGE_EVENT, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    [],
  );
  const getSnapshot = useCallback(() => coverageFor(course), [course]);
  const getServerSnapshot = useCallback(() => EMPTY_COVERAGE, []);

  const taught = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(
    (code: string) => {
      const map = readCoverage();
      const cur = new Set(map[course] ?? []);
      if (cur.has(code)) cur.delete(code);
      else cur.add(code);
      map[course] = [...cur].sort();
      writeCoverage(map);
    },
    [course],
  );

  return { taught: new Set(taught), toggle };
}

// ── saved tests ───────────────────────────────────────────────────────────

export interface SavedTest {
  id: string;
  name: string;
  course: string;
  courseCode: string;
  subtopics: string[];
  targetMarks: number | null;
  maxQuestions: number | null;
  /** Explicit question list (builder-era saves). Legacy saves omit it —
   *  they only kept the auto-build controls and must be re-generated. */
  questionIds?: string[];
  createdAt: string;
}

const TESTS_KEY = "syllabai.savedTests.v1"; // RETIRED (legacy adoption pin)
const TESTS_EVENT = "syllabai:saved-tests-changed";
const TESTS_EMPTY: SavedTest[] = [];

let testsStore: SavedTest[] = TESTS_EMPTY;

let testsSnapshot: SavedTest[] = TESTS_EMPTY;

function testsSnapshotGet(): SavedTest[] {
  const next = testsStore;
  if (next.length !== testsSnapshot.length || next.some((t, i) => t.id !== testsSnapshot[i]?.id)) {
    testsSnapshot = next;
  }
  return testsSnapshot;
}

function writeTests(tests: SavedTest[]) {
  testsStore = tests;
  window.dispatchEvent(new CustomEvent(TESTS_EVENT));
}

export function useSavedTests() {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener(TESTS_EVENT, onChange);
    return () => {
      window.removeEventListener(TESTS_EVENT, onChange);
    };
  }, []);
  const tests = useSyncExternalStore(subscribe, testsSnapshotGet, () => TESTS_EMPTY);

  const save = useCallback(
    (t: Omit<SavedTest, "id" | "createdAt">): SavedTest => {
      const saved: SavedTest = {
        ...t,
        id: `t_${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
      };
      writeTests([saved, ...testsSnapshotGet()].slice(0, 30));
      return saved;
    },
    [],
  );

  const remove = useCallback((id: string) => {
    writeTests(testsSnapshotGet().filter((t) => t.id !== id));
  }, []);

  return { tests, save, remove };
}

// ── content reviews (Phase 2 validation queue) ────────────────────────────
//
// syllabai.contentReviews.v1 (RETIRED) — teacher verdicts on AI-authored
// content (TEACHER_MODE_PLAN §4 ContentReview: resourceId, reviewer, verdict,
// comment, createdAt). The pilot pipeline marks AI-authored model solutions
// for teacher validation before they count; the queue works on REAL corpus
// items. T-TIER1 run-002 → T-ACCOUNT-ONLY run-001: the verdicts live in the
// teacher's ACCOUNT (teacher_content_reviews, one per (account, resource))
// and in module memory — no device record exists anymore.

export type ReviewVerdict = "approved" | "edited" | "rejected";

export interface ContentReview {
  resourceId: string;
  courseId: string;
  courseCode: string;
  kind: "solution" | "note" | "flashcard";
  verdict: ReviewVerdict;
  comment: string;
  reviewer: string;
  createdAt: string;
}

const REVIEWS_KEY = "syllabai.contentReviews.v1"; // RETIRED (legacy adoption pin)
const REVIEWS_EVENT = "syllabai:content-reviews-changed";
const REVIEWS_EMPTY: ContentReview[] = [];

let reviewsStore: ContentReview[] = REVIEWS_EMPTY;

let reviewsSnapshot: ContentReview[] = REVIEWS_EMPTY;

function reviewsSnapshotGet(): ContentReview[] {
  const next = reviewsStore;
  if (
    next.length !== reviewsSnapshot.length ||
    next.some((r, i) => r.resourceId !== reviewsSnapshot[i]?.resourceId)
  ) {
    reviewsSnapshot = next;
  }
  return reviewsSnapshot;
}

function writeReviews(list: ContentReview[]) {
  reviewsStore = list;
  window.dispatchEvent(new CustomEvent(REVIEWS_EVENT));
}

export function useContentReviews() {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener(REVIEWS_EVENT, onChange);
    return () => {
      window.removeEventListener(REVIEWS_EVENT, onChange);
    };
  }, []);
  const reviews = useSyncExternalStore(subscribe, reviewsSnapshotGet, () => REVIEWS_EMPTY);

  const add = useCallback(
    (input: Omit<ContentReview, "createdAt">): ContentReview => {
      // one verdict per resource — a re-review supersedes the previous one
      const review: ContentReview = { ...input, createdAt: new Date().toISOString() };
      writeReviews([
        review,
        ...reviewsSnapshotGet().filter((r) => r.resourceId !== review.resourceId),
      ].slice(0, 200));
      return review;
    },
    [],
  );

  const remove = useCallback((resourceId: string) => {
    writeReviews(reviewsSnapshotGet().filter((r) => r.resourceId !== resourceId));
  }, []);

  return { reviews, add, remove };
}

// ── server sync (T-TIER1 run-002 → T-ACCOUNT-ONLY run-001) — the account
// IS the store ──────────────────────────────────────────────────────────
// Operator order 2026-11-05 ("remove device-local things completely"); the
// my-subjects.ts write-through law with the mock-results conservative merge:
//
// Law of record:
//  - The in-memory stores are the UI truth (reactive, instant); the ACCOUNT
//    is their only durable store (no device record exists anymore).
//  - The sync is gated on the TEACHER identity — a student (or signed-out)
//    session never contacts /teachers/me (the surface is teacher-owned;
//    the shell 403s students by law).
//  - Signed in as a teacher, every LOCAL write mirrors to the account as a
//    full-set PUT (debounced per tick; per-course for coverage); a failed
//    PUT leaves the in-memory record untouched (cache law) and re-arms.
//  - On identity acquisition (mount / login) the sync reconciles ONCE with
//    a CONSERVATIVE UNION per store — a union never loses a record from
//    either side (the mock-results merge law; these are sets/ledgers with
//    no single "newest wins" answer):
//      · saved tests — union by the opaque `id`, newest-createdAt first,
//        capped 30 (both sides' bound);
//      · coverage — per-course union of the taught-code SETS (sorted,
//        deduped), capped 500 per course;
//      · content reviews — union by resourceId, the NEWER createdAt wins a
//        conflict (a verdict is a correction; tie → server), capped 200.
//    Merged sets that differ from the server's re-mirror up; the in-memory
//    store takes the merge down.
//  - Remote-driven writes set applyingRemote so the mirror does not echo
//    the set back to the account (one PUT per intent, never two).

type SavedTestWire = Awaited<ReturnType<typeof api.savedTests>>["tests"][number];
type ContentReviewWire = Awaited<ReturnType<typeof api.contentReviews>>["reviews"][number];

/** Local SavedTest → the wire shape (the `id` round-trips verbatim). */
function savedTestToWire(t: SavedTest) {
  return {
    id: t.id,
    name: t.name,
    courseSlug: t.course,
    courseCode: t.courseCode,
    subtopics: t.subtopics,
    targetMarks: t.targetMarks,
    maxQuestions: t.maxQuestions,
    ...(t.questionIds ? { questionIds: t.questionIds } : {}),
    createdAt: t.createdAt,
  };
}

/** Wire row → the local store shape (absent nullable fields default null). */
function savedTestFromWire(w: SavedTestWire): SavedTest {
  return {
    id: w.id,
    name: w.name,
    course: w.courseSlug,
    courseCode: w.courseCode,
    subtopics: w.subtopics,
    targetMarks: w.targetMarks ?? null,
    maxQuestions: w.maxQuestions ?? null,
    ...(w.questionIds ? { questionIds: w.questionIds } : {}),
    createdAt: w.createdAt,
  };
}

/** Local ContentReview → the wire shape (courseId is the slug on the wire). */
function reviewToWire(r: ContentReview) {
  return {
    resourceId: r.resourceId,
    courseSlug: r.courseId,
    courseCode: r.courseCode,
    kind: r.kind,
    verdict: r.verdict,
    comment: r.comment,
    reviewer: r.reviewer,
    createdAt: r.createdAt,
  };
}

/** Wire row → the local store shape. */
function reviewFromWire(w: ContentReviewWire): ContentReview {
  return {
    resourceId: w.resourceId,
    courseId: w.courseSlug,
    courseCode: w.courseCode,
    kind: w.kind,
    verdict: w.verdict,
    comment: w.comment,
    reviewer: w.reviewer,
    createdAt: w.createdAt,
  };
}

const SAVED_TESTS_CAP = 30; // the hub's own bound; the server enforces the same
const CONTENT_REVIEWS_CAP = 200;

/** The saved-tests reconcile MERGE (pure; exported for the law tests): the
 * UNION by the opaque `id`, newest-createdAt first (tie → id asc, the
 * server's own deterministic order), capped 30. `diverged` says the merged
 * set differs from the server's (re-mirror up); `localChanged` says the
 * local cache must take the merge down. */
export function mergeSavedTests(
  server: SavedTest[],
  local: SavedTest[],
): { merged: SavedTest[]; diverged: boolean; localChanged: boolean } {
  const byId = new Map<string, SavedTest>();
  for (const t of server) byId.set(t.id, t);
  for (const t of local) byId.set(t.id, t);
  const merged = [...byId.values()]
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, SAVED_TESTS_CAP);
  const sameSet = (list: SavedTest[]) =>
    list.length === merged.length && list.every((t, i) => t.id === merged[i]?.id);
  return { merged, diverged: !sameSet(server), localChanged: !sameSet(local) };
}

/** The coverage reconcile MERGE (pure; exported for the law tests): the
 * per-course UNION of the taught-code sets (deduped, sorted — the store's
 * own write order), capped 500 per course. `diverged` names the courses
 * whose union differs from the server's; `localChanged` says the local map
 * must take the merge down. */
export function mergeCoverage(
  server: Record<string, string[]>,
  local: Record<string, string[]>,
): { merged: Record<string, string[]>; diverged: string[]; localChanged: boolean } {
  const norm = (codes: string[]) => [...new Set(codes)].sort();
  const courses = new Set<string>([...Object.keys(server), ...Object.keys(local)]);
  const merged: Record<string, string[]> = {};
  const diverged: string[] = [];
  let localChanged = false;
  for (const course of courses) {
    const serverCodes = norm(server[course] ?? []);
    const localCodes = norm(local[course] ?? []);
    const union = norm([...serverCodes, ...localCodes]).slice(0, 500);
    merged[course] = union;
    if (serverCodes.join("\u0000") !== union.join("\u0000")) diverged.push(course);
    if (localCodes.join("\u0000") !== union.join("\u0000")) localChanged = true;
  }
  return { merged, diverged, localChanged };
}

/** The content-reviews reconcile MERGE (pure; exported for the law tests):
 * the UNION by resourceId; a conflicting verdict resolves to the NEWER
 * createdAt (a re-review is a correction — the hub's own "a re-review
 * supersedes the previous one" law); a tie goes to the server
 * (deterministic). Newest-first, capped 200. */
export function mergeContentReviews(
  server: ContentReview[],
  local: ContentReview[],
): { merged: ContentReview[]; diverged: boolean; localChanged: boolean } {
  const byResource = new Map<string, ContentReview>();
  for (const r of server) byResource.set(r.resourceId, r);
  for (const r of local) {
    const cur = byResource.get(r.resourceId);
    if (!cur) {
      byResource.set(r.resourceId, r);
      continue;
    }
    // conflict: the newer verdict wins; a tie goes to the server
    const serverAt = new Date(cur.createdAt).getTime();
    const localAt = new Date(r.createdAt).getTime();
    if (localAt > serverAt) byResource.set(r.resourceId, r);
  }
  const merged = [...byResource.values()]
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return a.resourceId < b.resourceId ? -1 : a.resourceId > b.resourceId ? 1 : 0;
    })
    .slice(0, CONTENT_REVIEWS_CAP);
  // the verdict CONTENT can differ at the same resourceId (a re-review
  // supersedes) — the tuple, not the bare id, is the divergence unit
  const fingerprint = (r: ContentReview) => `${r.resourceId}\u0000${r.verdict}\u0000${r.createdAt}`;
  const sameSet = (list: ContentReview[]) =>
    list.length === merged.length && list.every((r, i) => fingerprint(r) === fingerprint(merged[i]!));
  return { merged, diverged: !sameSet(server), localChanged: !sameSet(local) };
}

// ── the one-call sync surface ────────────────────────────────────────────────

// T-ACCOUNT-ONLY run-001 — the one-time legacy adoption: the three retired
// device records seed the memory stores (so the reconcile's conservative
// union migrates them) and retire after the first successful reconcile.
if (typeof window !== "undefined") {
  try {
    const rawCov = window.localStorage.getItem(COVERAGE_KEY);
    if (rawCov) coverageStore = parseCoverage(JSON.parse(rawCov) as unknown);
    const rawTests = window.localStorage.getItem(TESTS_KEY);
    if (rawTests) {
      const parsed = JSON.parse(rawTests) as unknown;
      if (Array.isArray(parsed)) {
        testsStore = parsed.filter(
          (t): t is SavedTest => !!t && typeof t === "object" && typeof (t as SavedTest).id === "string" && Array.isArray((t as SavedTest).subtopics),
        );
      }
    }
    const rawReviews = window.localStorage.getItem(REVIEWS_KEY);
    if (rawReviews) {
      const parsed = JSON.parse(rawReviews) as unknown;
      if (Array.isArray(parsed)) {
        reviewsStore = parsed.filter(
          (r): r is ContentReview =>
            !!r && typeof r === "object" && typeof (r as ContentReview).resourceId === "string",
        );
      }
    }
    legacyKeysPresent = rawCov !== null || rawTests !== null || rawReviews !== null;
  } catch {
    // corrupt records → the account reconcile decides alone
  }
  // account switch / sign-out: the in-memory stores clear with the sync's
  // own fresh-acquisition guard; the engine's reset broadcast keeps any
  // future doc-backed store consistent — nothing doc-backed lives here.
}

const applyingRemote = { tests: false, coverage: false, reviews: false };
const putScheduled = { tests: false, coverage: false, reviews: false };
/** The account the in-tab stores currently mirror (the cross-account
 *  guard: a stale store from account A never unions into account B). */
let syncedForEmail: string | null = null;

function putSavedTestsLocal(): void {
  if (putScheduled.tests || applyingRemote.tests) return;
  putScheduled.tests = true;
  setTimeout(() => {
    putScheduled.tests = false;
    if (typeof window === "undefined") return;
    if (!readIdentitySnapshot()) return; // signed out mid-flight — memory-only mode
    void api
      .setSavedTests({ tests: testsStore.slice(0, SAVED_TESTS_CAP).map(savedTestToWire) })
      .catch(() => {
        // silent cache law: memory stays; the next write/reconcile re-mirrors
      });
  }, 0);
}

function putCoverageLocal(): void {
  if (putScheduled.coverage || applyingRemote.coverage) return;
  putScheduled.coverage = true;
  setTimeout(() => {
    putScheduled.coverage = false;
    if (typeof window === "undefined") return;
    if (!readIdentitySnapshot()) return;
    const map = coverageStore;
    // a change event names no course — arm every course present in memory
    // (bounded: the overlay's own per-course entries)
    for (const [course, codes] of Object.entries(map)) {
      void api.setTeachingCoverage(course, { codes: codes.slice(0, 500) }).catch(() => {
        // silent cache law: memory stays; re-armed on the next write/reconcile
      });
    }
  }, 0);
}

function putContentReviewsLocal(): void {
  if (putScheduled.reviews || applyingRemote.reviews) return;
  putScheduled.reviews = true;
  setTimeout(() => {
    putScheduled.reviews = false;
    if (typeof window === "undefined") return;
    if (!readIdentitySnapshot()) return;
    void api
      .setContentReviews({
        reviews: reviewsStore.slice(0, CONTENT_REVIEWS_CAP).map(reviewToWire),
      })
      .catch(() => {
        // silent cache law: memory stays; the next write/reconcile re-mirrors
      });
  }, 0);
}

function writeCoverageRemote(map: Record<string, string[]>): void {
  applyingRemote.coverage = true;
  try {
    coverageStore = map;
  } finally {
    window.dispatchEvent(new CustomEvent(COVERAGE_EVENT));
  }
  applyingRemote.coverage = false;
}

/**
 * The one-call sync surface: mount ONCE (the app shell mounts it — the Test
 * Builder, the coverage panel and the validation queue are spread across
 * teacher routes), pass no arguments. While signed in AS A TEACHER it keeps
 * the account stores and the in-memory stores in step; signed out or signed
 * in as a student it is a no-op (the stores stay memory-only).
 */
export function useTeacherStoresSync(): void {
  const identity = useIdentity();

  useEffect(() => {
    if (!identity || identity.role !== "teacher") return; // teacher-owned surface

    let cancelled = false;

    const reconcile = async () => {
      // the three reads are independent — one failure must not block the
      // other stores' reconcile (each try is its own cache-law bubble)
      try {
        const view = await api.savedTests();
        if (cancelled) return;
        if (syncedForEmail !== identity.email) {
          // fresh acquisition: a stale in-tab store from ANOTHER account is
          // cleared (the legacy seeds are exempt — their one-time migration
          // IS the point of this reconcile)
          if (!legacyKeysPresent) {
            testsStore = TESTS_EMPTY;
            coverageStore = {};
            reviewsStore = REVIEWS_EMPTY;
          }
          syncedForEmail = identity.email;
        }
        const serverTests = view.tests.map(savedTestFromWire);
        const { merged, diverged, localChanged } = mergeSavedTests(serverTests, testsStore);
        if (localChanged) {
          applyingRemote.tests = true;
          writeTests(merged);
          applyingRemote.tests = false;
        }
        if (diverged) putSavedTestsLocal();
      } catch {
        // core unreachable — cache law: the in-memory library stays as-is
      }

      try {
        const view = await api.teachingCoverage();
        if (cancelled) return;
        const serverMap: Record<string, string[]> = {};
        for (const e of view.coverage) serverMap[e.courseSlug] = e.codes;
        const { merged, diverged, localChanged } = mergeCoverage(serverMap, coverageStore);
        if (localChanged) writeCoverageRemote(merged);
        if (diverged.length > 0) putCoverageLocal();
      } catch {
        // cache law: the in-memory overlay stays as-is
      }

      try {
        const view = await api.contentReviews();
        if (cancelled) return;
        const serverReviews = view.reviews.map(reviewFromWire);
        const { merged, diverged, localChanged } = mergeContentReviews(serverReviews, reviewsStore);
        if (localChanged) {
          applyingRemote.reviews = true;
          writeReviews(merged);
          applyingRemote.reviews = false;
        }
        if (diverged) putContentReviewsLocal();
      } catch {
        // cache law: the in-memory verdicts stay as-is
      }
      retireLegacyTeacherKeys(); // a successful reconcile ends the device records
    };
    void reconcile();

    const onTestsWrite = () => {
      if (!applyingRemote.tests) putSavedTestsLocal();
    };
    const onCoverageWrite = () => {
      if (!applyingRemote.coverage) putCoverageLocal();
    };
    const onReviewsWrite = () => {
      if (!applyingRemote.reviews) putContentReviewsLocal();
    };
    window.addEventListener(TESTS_EVENT, onTestsWrite);
    window.addEventListener(COVERAGE_EVENT, onCoverageWrite);
    window.addEventListener(REVIEWS_EVENT, onReviewsWrite);
    return () => {
      cancelled = true;
      window.removeEventListener(TESTS_EVENT, onTestsWrite);
      window.removeEventListener(COVERAGE_EVENT, onCoverageWrite);
      window.removeEventListener(REVIEWS_EVENT, onReviewsWrite);
    };
  }, [identity?.email]); // eslint-disable-line react-hooks/exhaustive-deps -- the identity OBJECT is referentially unstable per read; email is the stable key
}
