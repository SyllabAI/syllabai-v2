/**
 * Learner state-model routers — path parity with the frozen Java core
 * (T-MIG-041 tranche 2; frozen sources @ 6cad6ef):
 *   LearnerStateController  @RequestMapping("/api/v1/learners/me")
 *                           @GetMapping("/state")        (:85-177)
 *   CourseStatsController   @RequestMapping("/api/v1/learners/me")
 *                           @GetMapping("/course-stats") (:49-57)
 *
 * Route security (SecurityConfig parity): both paths fall under the frozen
 * anyRequest().authenticated() rule (SecurityConfig.java:87-91 has no
 * specific matchers for /api/v1/learners/me/** beyond the controllers'
 * own @RequestMapping) — the authz shell answers the Boot 401 body BEFORE
 * every handler (captured: golden w4-state-unauthed-401 /
 * w4-course-stats-unauthed-401, body {timestamp,status,error:"Unauthorized",
 * path} with tolerated timestamp).
 *
 * Principal parity (@CurrentUserId UUID learnerId): the frozen filter
 * resolves the JWT principal's user id and passes it as learnerId — the
 * port reads getAuth(c).userId (identity module's AuthContext). There is NO
 * learners indirection table: the capture pins learnerId == the registered
 * user's id (run-002 register → state body learnerId identity).
 *
 * Wire shapes: 1:1 with the frozen DTO records (LearnerStateView.java /
 * CourseStatsView.java) — the canonical @syllabai/contracts schemas
 * (learnerStateViewSchema / courseStatsViewSchema, T-MIG-038 #60) are the
 * zod pins in the route tests. Serialization law for java.time fields:
 *   - Instant  → Date.toISOString() (ms precision; the frozen core emits ns
 *     — the tranche-1 precision note carries over: sub-second relative
 *     exponent error ~1e-15, disclosed, tolerated on the wire captures)
 *   - LocalDate → plain string pass-through (windowStart/windowEnd/
 *     entryDeadline/resultsDate; java.time.LocalDate.toString form)
 *   - enum name() → wire casing (KNOW→"know", HELPFUL→"helpful" — already
 *     normalized by the tranche-1 view builders)
 *
 * Scope honesty: this router owns EXACTLY the two paths above. The frozen
 * LearnerStateController also carries /knowledge-graph, and the rest of the
 * learner-me band (agenda, smart-lesson, exam-series, flashcards, note-votes,
 * flashcard-ratings, assignments, flashcard-review-schedule) lives in other
 * frozen controllers — ALL of that is the T-MIG-043 band (claimed by w0a,
 * claim db87a9a). Unknown paths under /api/v1/learners/me fall through to
 * the app-level 404-after-auth fallback (anyRequest().authenticated()
 * parity: anonymous callers get the shell 401 first — pinned in tests).
 *
 * Determinism (ADR-031): the controller body derives `now = Instant.now()`
 * per request; the router threads an injected `now` factory (default
 * () => new Date()) through to the module builders — production keeps the
 * fresh-clock semantics, tests pin the clock (the W4 golden tranche
 * w4-state-* tolerates exactly the now-dependent wire fields).
 */
import { Hono } from "hono";
import {
  buildLearnerModule,
  type CourseStatsView,
  type LearnerStateView,
} from "../../services/learner";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../../services/identity/users";
import { getAuth, requireAuth } from "../../middleware/auth";

// ── wire serializers (frozen DTO record → JSON, key for key) ────────────────

const iso = (d: Date): string => d.toISOString();

function skillStateWire(s: LearnerStateView["skillStates"][number]) {
  return {
    nodeId: s.nodeId,
    mastery: s.mastery,
    effectiveMastery: s.effectiveMastery,
    band: s.band,
    attempts: s.attempts,
    correctCount: s.correctCount,
    lastPracticedAt: iso(s.lastPracticedAt),
    proceduralFluencyGap: s.proceduralFluencyGap,
    nodeName: s.nodeName,
  };
}

function misconceptionWire(m: LearnerStateView["misconceptionStates"][number]) {
  return {
    misconceptionNodeId: m.misconceptionNodeId,
    probability: m.probability,
    active: m.active,
    evidenceCount: m.evidenceCount,
    lastEvidenceAt: iso(m.lastEvidenceAt),
    misconceptionName: m.misconceptionName,
  };
}

function reviewWire(r: LearnerStateView["pendingReviews"][number]) {
  return {
    nodeId: r.nodeId,
    dueAt: iso(r.dueAt),
    reason: r.reason,
    nodeName: r.nodeName,
  };
}

function engagementWire(e: LearnerStateView["tutorEngagements"][number]) {
  return {
    nodeId: e.nodeId,
    nodeTitle: e.nodeTitle, // frozen key parity (LearnerStateView.java:78)
    asks: e.asks,
    lastAskedAt: iso(e.lastAskedAt),
    refusedAny: e.refusedAny,
    signalCounts: e.signalCounts,
  };
}

function flashcardWire(f: LearnerStateView["flashcardRatings"][number]) {
  return {
    cardId: f.cardId,
    rating: f.rating,
    subtopicCode: f.subtopicCode,
    nodeId: f.nodeId,
    occurredAt: iso(f.occurredAt),
  };
}

function noteVoteWire(v: LearnerStateView["noteVotes"][number]) {
  return {
    noteId: v.noteId,
    vote: v.vote,
    subtopicCode: v.subtopicCode,
    nodeId: v.nodeId,
    occurredAt: iso(v.occurredAt),
  };
}

/** CourseExamTargetView — LocalDate fields are plain strings; pass through. */
function examTargetWire(t: LearnerStateView["examTargets"][number]) {
  return {
    courseSlug: t.courseSlug,
    seriesId: t.seriesId,
    seriesCode: t.seriesCode,
    label: t.label,
    windowStart: t.windowStart,
    windowEnd: t.windowEnd,
    entryDeadline: t.entryDeadline,
    resultsDate: t.resultsDate,
    estimated: t.estimated,
    daysToWindowStart: t.daysToWindowStart,
    daysToWindowEnd: t.daysToWindowEnd,
    entryDeadlinePassed: t.entryDeadlinePassed,
  };
}

/** LearnerStateView (:11-21) — all seven arrays serialize (never absent). */
function learnerStateWire(v: LearnerStateView) {
  return {
    learnerId: v.learnerId,
    skillStates: v.skillStates.map(skillStateWire),
    misconceptionStates: v.misconceptionStates.map(misconceptionWire),
    pendingReviews: v.pendingReviews.map(reviewWire),
    tutorEngagements: v.tutorEngagements.map(engagementWire),
    flashcardRatings: v.flashcardRatings.map(flashcardWire),
    noteVotes: v.noteVotes.map(noteVoteWire),
    examTargets: v.examTargets.map(examTargetWire),
  };
}

/** CourseStatsView (:51-57) — four ints + learnerId; no time fields. */
function courseStatsWire(v: CourseStatsView) {
  return {
    learnerId: v.learnerId,
    attempts: v.attempts,
    distinctQuestions: v.distinctQuestions,
    notesViewed: v.notesViewed,
    flashcardsRated: v.flashcardsRated,
  };
}

// ── router ──────────────────────────────────────────────────────────────────

/**
 * The route layer consumes the tranche-1 module surface (learnerState +
 * courseStats). Structural type so tests can hand-build the module over
 * fakeSql without the db driver.
 */
export interface LearnerRouterModule {
  learnerState(learnerId: string, now: Date): Promise<LearnerStateView>;
  courseStats(learnerId: string): Promise<CourseStatsView>;
}

/**
 * Learner state-model router — mounted at "/api/v1/learners/me". Authenticated
 * (shell parity): the gate answers the Boot 401 body before every handler.
 */
export function createLearnerStateRouter(
  module: LearnerRouterModule,
  now: () => Date = () => new Date(),
): Hono {
  const r = new Hono();

  // authz shell FIRST (SecurityConfig anyRequest().authenticated() parity):
  // the gate answers before every handler below — and before the fall-through
  // of paths this router does not own (anonymous callers get 401, never 404).
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /api/v1/learners/me/state (LearnerStateController.state :85-177) —
  // the 9-leg composite: skills (read-time Ebbinghaus decay + band),
  // misconceptions (staleness-relaxed, re-sorted), pending reviews (PENDING,
  // dueAt ASC), tutor engagement summary (30d window, grouped, limit 10),
  // flashcard rating window (latest 50), note-vote window (latest 50), exam
  // targets (countdowns derived on this read). `now` = the injected clock —
  // computed per request, NEVER persisted (ADR-031).
  r.get("/state", async (c) => {
    const auth = getAuth(c)!; // shell invariant: authenticated
    const view = await module.learnerState(auth.userId, now());
    return c.json(learnerStateWire(view));
  });

  // GET /api/v1/learners/me/course-stats (CourseStatsController :49-57) —
  // 4 counts (attempts, distinct questions, notes viewed, distinct cards
  // rated); no clock dependence (pure trail tallies).
  r.get("/course-stats", async (c) => {
    const auth = getAuth(c)!; // shell invariant: authenticated
    const view = await module.courseStats(auth.userId);
    return c.json(courseStatsWire(view));
  });

  return r;
}

/**
 * Module + router composition for the app root — the buildCurriculumRouters
 * shape (env → requireDatabaseUrl → createSql adapter; the structural SqlFn
 * keeps the learner services driver-agnostic through the T-MIG-014 dispatch).
 * `opts.now` injects the clock (determinism law); production default is the
 * fresh per-request clock.
 */
export function buildLearnerRouters(
  env: Record<string, string | undefined> = process.env,
  opts: { now?: () => Date } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const module = buildLearnerModule(sql);
  return {
    module,
    learnerRoute: createLearnerStateRouter(module, opts.now ?? (() => new Date())),
  };
}
