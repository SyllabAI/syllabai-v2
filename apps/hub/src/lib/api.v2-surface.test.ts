/**
 * Strangler surface-routing pins (T-MIG-037, r8-hub).
 *
 * These pins freeze the DUAL-RUN CONTRACT of apps/hub/src/lib/api.ts:
 * which hub-emitted paths resolve to the v2 api base while the Java core
 * keeps serving production, and — equally load-bearing — which paths must
 * stay on the core so the hub never routes a live page into a v2 404/501
 * (teacher write actions are honest CONTENT_WRITE_TASK stubs, glm-ocr is
 * W6-unported, learner /questions + /exam-papers await T-MIG-031
 * tranche-2, and 20+ sibling /api/v1/learners/me/* surfaces are not
 * ported). The rollback property (MIGRATION_PLAN §7) is pinned at the
 * decision layer too: with the one env var unset, EVERY path — including
 * the flipped ones — reverts to the core.
 *
 * The module under test is the hub's ACTUAL routing code (apiPath +
 * the v2SurfaceBase decision resolveBase delegates to), imported with the
 * v2 env var set so the module-level constants bind the dual-run posture.
 * Run: bun test apps/hub/src/lib/api.v2-surface.test.ts
 */
process.env.NEXT_PUBLIC_API_V2_BASE_URL = "https://v2.example";

const { apiPath, v2SurfaceBase, V2_SURFACE_PREFIXES, V2_SURFACE_MIDPATH_PREFIXES } = await import("./api");

import { describe, expect, test } from "bun:test";

const V2 = "https://v2.example";

/** Every hub-emitted path family under the flipped prefixes (grep-verified at c920eea). */
const DUAL_RUN_PATHS: readonly string[] = [
  // W1 identity (T-MIG-010)
  "/api/v1/auth/login",
  "/api/v1/auth/register",
  "/api/v1/auth/me",
  "/api/v1/auth/password",
  "/api/v1/auth/bootstrap-status",
  // W2 content reads (T-MIG-005/020/022 + F-1/F-2) — the hub emits the
  // citation detail form /documents/{row}?page=N (citation-map.ts); the
  // bare list + search + canonical forms are TEACHER-side paths
  "/api/v1/content/documents/doc-row-1",
  "/api/v1/content/documents/doc-row-1?page=2",
  "/api/v1/content/question-assets/asset-9.pdf",
  // W2 curriculum reads (T-MIG-021)
  "/api/v1/curriculum/subjects",
  "/api/v1/curriculum/subjects/sub-1",
  "/api/v1/curriculum/versions",
  // W3 attempts (T-MIG-030 + T-MIG-032)
  "/api/v1/attempts",
  "/api/v1/attempts/structured",
  "/api/v1/learners/me/attempts?limit=20",
  "/api/v1/learners/me/attempts/att-1/self-mark",
  "/api/v1/learners/me/attempts/att-1/smart-mark",
  "/api/v1/learners/me/attempts/att-1/parts/p-2/feedback-explanation",
  "/api/v1/learners/me/attempts/att-1/parts/p-2/improvement-plan",
  // Wave S3 (T-MIG-082, r3a) — learner revision-notes, the family's hub-emitted
  // forms (index / body / asset / progress / markViewed), golden-verified of record
  "/api/v1/learners/me/revision-notes",
  "/api/v1/learners/me/revision-notes/rn_TWGVV6RXN3Ktqb9h",
  "/api/v1/learners/me/revision-notes/assets/0093b0722e85-2-7-9-preparation-of-leadiisulfate-4.png",
  "/api/v1/learners/me/revision-notes/progress",
  "/api/v1/learners/me/revision-notes/progress/views",
  // T-MIG-084 (r4b rider) — the knowledge-tree family's request()-routed
  // emitter forms (lib/api.ts knowledgeTree + prerequisites DEFINITIONS).
  // Dormant today — zero page call-sites exist (grep-verified at the
  // widening commit; disclosed in the api.ts line comment) — but they ARE
  // literal emitters, unlike 090's nonexistent admin paths, so their forms
  // belong here: if ever called they resolve to the v2 base. The
  // core-topics.ts tree emitter is fetchCoreJson (core-pinned, un-routed
  // by the table) and citation-map's knowledge deepLink is a href mapper —
  // neither belongs in this list.
  "/api/v1/knowledge/nodes/kn-root/tree?includeMisconceptions=true",
  "/api/v1/knowledge/nodes/kn-x/prerequisites",
  // Wave S5 (T-MIG-086, r3a) — the class-KG emitters the hub REALLY emits
  // (lib/api.ts:934/:943/:955): flipped under the mechanism-A mid-path rows
  // after the ruling of record (run-002-golden-verify-r3a via PR #152;
  // ordering class ruled non-blocking; #155 comment 6053748307).
  "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/knowledge-graph?rootId=3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab",
  "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/knowledge-graph/nodes/0f0f1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/students?rootId=3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab",
  "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/learners/9e9e1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/knowledge-graph?rootId=3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab",
  // Wave S4 (T-MIG-085, r3a) — the teacher concept-graph page's emitter
  // forms: golden-verified of record (run-002-golden-verify-r3a via PR #152;
  // one filed message-format class, non-blocking per the 081-class precedent).
  "/api/v1/teacher/concept-graph/activate",
  "/api/v1/teacher/concept-graph/edges?rootId=3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab",
  // T-MIG-095 (r0 band) — the learner-me WRITE surfaces the hub emits
  // (lib/api.ts rating/vote emitters): flipped after the band closed + the
  // live re-verify passed (run-002 of record). The family is EXACTLY these
  // two POST endpoints (no subpaths on either side).
  "/api/v1/learners/me/flashcard-ratings",
  "/api/v1/learners/me/note-votes",
  // T-MIG-089 (r4b band rider) — the GLM-OCR bridge family's request()-routed
  // emitter form (lib/api.ts paperFindings — the family's ONLY hub emitter).
  // Dormant today — zero page call-sites exist (grep-verified at the widening
  // commit; disclosed in the api.ts line comment) — ROUTING AVAILABILITY, the
  // 090 posture. The pairs POST is not hub-emitted; the findings form pins it.
  "/api/v1/teacher/content/glm-ocr/papers/00000000-0000-4000-8000-000000000026/findings",
];

/** Hub-emitted (or hub-adjacent) paths that MUST stay on the core in the dual-run posture. */
const CORE_ONLY_PATHS: readonly string[] = [
  // teacher content: v2 serves honest 501 write stubs; the glm-ocr FAMILY
  // flipped in T-MIG-089 (the former core-only glm-ocr/papers/p-1/findings
  // pin MOVED OUT — v2 golden-verified 6/6, receipts
  // T-MIG-089/run-002-golden-verify-r4b.json — and pinned in DUAL_RUN_PATHS);
  // every OTHER /api/v1/teacher/content sibling stays core
  "/api/v1/teacher/content/review-queue",
  "/api/v1/teacher/content/review-queue-v3",
  "/api/v1/teacher/content/exam-papers/ep-1/review",
  "/api/v1/teacher/content/exam-papers/ep-1/validate",
  "/api/v1/teacher/content/question-versions/qv-1/flag",
  "/api/v1/teacher/content/mark-schemes/ms-1/reject",
  // teacher curriculum + teacher W5 families (unported)
  "/api/v1/teacher/curriculum/versions",
  "/api/v1/teacher/classes",
  "/api/v1/teacher/marking/answers",
  "/api/v1/teacher/assignments",
  // learner /questions + /exam-papers: NOT mounted in the v2 api yet (T-MIG-031 tranche-2)
  "/api/v1/questions?q=photosynthesis",
  "/api/v1/questions/families",
  "/api/v1/exam-papers?subjectId=sub-1",
  "/api/v1/exam-papers/ep-1",
  // non-attempts learner surfaces (W4) — agenda + state FLIPPED in T-MIG-096
  // (run-001 golden-verify); flashcard-ratings + note-votes FLIPPED in
  // T-MIG-095 after the band closed (46536fd) and the live re-verify passed
  // (run-002 of record) — moved out of this CORE_ONLY list of record
  // T-MIG-096: recommendations stays core this band — 400/404 wires verified
  // (L03/L04) but the 200 NBA-engine wire is not live-proven yet (disclosed)
  "/api/v1/learners/me/recommendations",
  // T-MIG-097 (r7a): cla/ask MOVED OUT of this CORE_ONLY list — BOTH wires
  // live-proven (run-003 10/10 refusal dual-live + run-004 generation probe
  // 200 answer-envelope) and the exact-path row flipped under the chain
  // order 1a119df7d930b609; the emitter routes table-first with core as the
  // unset-base fallback.
  "/api/v1/learners/me/answer-input/transcribe",
  // T-MIG-082 (Wave S3, r3a): revision-notes FLIPPED after its golden gate —
  // run-002 frozen-core captures (d19289cc8) + run-003 verify 7/7 vs the
  // landed mounts; moved out of this CORE_ONLY list of record.
  "/api/v1/learners/me/knowledge-graph",
  // classic core-only surfaces (T-MIG-035 check-3 law; /subjects and the
  // LEGACY /api/v1/tree path are still true. NOTE: the former
  // "/api/v1/knowledge/nodes/kn-1/tree" pin MOVED OUT of this list — it is
  // captured by the flipped T-MIG-084 /api/v1/knowledge/nodes row and v2
  // answers the SAME UUID_RE 400 malformed law the core does (captured
  // leg-07 class; route-test x15), so the capture is wire-safe)
  "/api/v1/subjects",
  "/api/v1/tree?includeMisconceptions=true",
  "/api/v1/tutor/ask",
  // T-MIG-092 (r0 rider): the tutor SESSIONS tree flipped, so these siblings
  // stay core-pinned explicitly — the zero-key law (generation-reaching asks
  // 503 on the dormant v2 LLM seam) forbids their capture
  "/api/v1/tutor/ask/stream",
];

describe("V2_SURFACE_PREFIXES table (T-MIG-037 flip law)", () => {
  test("is exactly the verified set — widening requires a new golden-verified surface", () => {
    expect([...V2_SURFACE_PREFIXES]).toEqual([
      "/api/v1/auth",
      "/api/v1/content/documents",
      "/api/v1/content/question-assets",
      "/api/v1/curriculum",
      "/api/v1/attempts",
      "/api/v1/learners/me/attempts",
      "/api/v1/learners/me/revision-notes", // Wave S3: T-MIG-082 golden-verified (run-002/003, r3a)
      "/api/v1/admin/llm/chain-health", // T-MIG-090: golden-verified (run-005, r0 rider) — NARROWEST: the prefix IS the single endpoint
      "/api/v1/tutor/sessions", // T-MIG-092: golden-verified (run-003 14/14, r0 rider) — NARROW: the sessions tree ONLY, ask/stream stay core
      "/api/v1/learners/me/agenda", // T-MIG-096: golden-verified (run-001 16/18, r0 rider) — per-exact-subpath rows, NEVER the bare /learners/me
      "/api/v1/learners/me/flashcard-rating-trail", // T-MIG-096 run-001 L05/L06
      "/api/v1/learners/me/flashcard-review-schedule", // T-MIG-096 run-001 L07
      "/api/v1/learners/me/exam-series", // T-MIG-096 run-001 L11
      "/api/v1/learners/me/assignments", // T-MIG-096 run-001 L14/L15 (incl. the submissions subpath wire)
      "/api/v1/learners/me/state", // T-MIG-096 run-001 L16
      "/api/v1/learners/me/course-stats", // T-MIG-096 run-001 L17
      "/api/v1/learners/me/courses", // T-MIG-096 run-001 L12/L13 — zero emitters, routing availability
      "/api/v1/learners/me/flashcard-ratings", // T-MIG-095: band CLOSED (46536fd) + live re-verify PASS (run-002) — the 096 linkage writes flip
      "/api/v1/learners/me/note-votes", // T-MIG-095: same band + run-002 — per-exact-subpath, never the bare /learners/me
      "/api/v1/admin/revision-notes", // T-MIG-083: golden-verified (run-001 8/8, r9-hubx rider) — NARROW: ingest+status ONLY, rest of /api/v1/admin/** stays core
      "/api/v1/knowledge/nodes", // T-MIG-084: golden-verified (run-002 8/8, r4b rider) — NARROWEST: the /nodes segment family ONLY, siblings outside /nodes stay core
      "/api/v1/learners/me/cla/ask", // T-MIG-097: BOTH wires live-proven (run-003 10/10 refusal dual-live + run-004 generation probe 200, r7a) — NARROWEST: the exact ask path
      "/api/v1/teacher/concept-graph", // T-MIG-085: golden-verified (run-002, r3a) — family-exact: activate+edges own the base exclusively
      "/api/v1/teacher/content/glm-ocr", // T-MIG-089: golden-verified (run-002 6/6, r4b band rider) — NARROWEST: the /glm-ocr segment family ONLY, the /teacher/content parent stays core (T-MIG-020/023 + T-MIG-100)
      "/api/v1/teacher/content/fetch", // T-MIG-100: repaired + golden-verified (22-leg replay, r0 repair band) — per-exact-endpoint rows, the parent STAYS core
      "/api/v1/teacher/content/enumerate", // T-MIG-100: same band — also captures /enumerate/structured (leg-04, same verified family tree)
      "/api/v1/teacher/curriculum/exam-series", // T-MIG-100: 091 family 7/7 incl. the CLASS C repeat law — the FULL path row (the 052 mount law)
    ]);
  });
  test("the mid-path table is exactly the ruled set — the mechanism-A amendment needs its own golden gate too", () => {
    expect([...V2_SURFACE_MIDPATH_PREFIXES]).toEqual([
      "/api/v1/teacher/classes/:uuid/knowledge-graph", // T-MIG-086: heatmap + node-students
      "/api/v1/teacher/classes/:uuid/learners/:uuid/knowledge-graph", // T-MIG-086: learner-kg
      "/api/v1/teacher/classes/:uuid/coverage", // T-MIG-087: list + mark + history
    ]);
  });
});

describe("dual-run posture (NEXT_PUBLIC_API_V2_BASE_URL set)", () => {
  test("every flipped hub-emitted path resolves to the v2 base", () => {
    for (const p of DUAL_RUN_PATHS) {
      expect(v2SurfaceBase(p, V2)).toBe(V2);
      expect(apiPath(p).startsWith(`${V2}/api/v1/`)).toBe(true);
    }
  });

  test("the T-MIG-096 lines: the learner-me heart flips per-exact-subpath with the write surfaces core-pinned (r0 rider)", () => {
    // every verified read path of the run-001 matrix resolves to v2
    for (const p of [
      "/api/v1/learners/me/agenda",
      "/api/v1/learners/me/agenda?rootId=3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab",
      "/api/v1/learners/me/flashcard-rating-trail?limit=20",
      "/api/v1/learners/me/flashcard-review-schedule",
      "/api/v1/learners/me/exam-series",
      "/api/v1/learners/me/assignments",
      "/api/v1/learners/me/assignments/a1/submissions", // the submission wire rides the assignments prefix (L15 law)
      "/api/v1/learners/me/state",
      "/api/v1/learners/me/course-stats",
      "/api/v1/learners/me/courses/igcse-chemistry-19/target-series",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBe(V2);
    }
    // the not-yet-verified 200 NBA wire + LLM-bearing surfaces stay core —
    // the zero-key law in string form (the T-MIG-095-blocked write surfaces
    // LEFT this list: band closed + run-002 live re-verify — see the 095 test)
    // the T-MIG-095-blocked write surfaces + the not-yet-verified 200 NBA
    // wire stay core — the zero-key/defect-band law in string form.
    // cla/ask LEFT this list at the T-MIG-097 flip (both wires live-proven:
    // run-003 10/10 refusal dual-live + run-004 generation probe 200)
    for (const p of [
      "/api/v1/learners/me/recommendations?rootId=kn-1",
      "/api/v1/learners/me/classroom",
      "/api/v1/learners/me/intervention-runs",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
  });

  test("the T-MIG-097 line: the CLA ask flips after BOTH wires were proven live (r7a, chain order 1a119df7d930b609)", () => {
    // the ask path resolves to v2 (run-003 10/10 refusal dual-live + run-004
    // generation probe 200 answer-envelope of record)
    expect(v2SurfaceBase("/api/v1/learners/me/cla/ask", V2)).toBe(V2);
    // the rest of the /learners/me/cla subtree stays table-governed (none of
    // it is captured by this exact-path row)
    for (const p of [
      "/api/v1/learners/me/cla",
      "/api/v1/learners/me/cla/other",
      "/api/v1/learners/me/classroom",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
    // startsWith matching is prefix-string semantics (the same property every
    // row of the table has): a non-existent partial-segment sibling IS
    // captured by the string match — DOCUMENTED INERT (no route or hub
    // emitter named cla/ask* beyond the exact path exists on either side)
    expect(v2SurfaceBase("/api/v1/learners/me/cla/askx", V2)).toBe(V2);
    expect("/api/v1/learners/me/cla/askx".startsWith("/api/v1/learners/me/cla/ask")).toBe(true);
  });

  test("the T-MIG-092 line: the tutor sessions tree flips with ask/stream core-pinned (r0 rider)", () => {
    // every verified leg path of the run-003 matrix resolves to v2
    for (const p of [
      "/api/v1/tutor/sessions", // L01/L06/L13 list
      "/api/v1/tutor/sessions/latest", // L02/L07/L14
      "/api/v1/tutor/sessions/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab", // L03/L08/L11/L12 transcript/delete paths
    ]) {
      expect(v2SurfaceBase(p, V2)).toBe(V2);
    }
    // the LLM-bearing siblings stay core — different segments, never captured
    for (const p of ["/api/v1/tutor/ask", "/api/v1/tutor/ask/stream", "/api/v1/tutor"]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
    // startsWith matching is prefix-string semantics (the same property every
    // row of the table has): a non-existent partial-segment sibling IS
    // captured by the string match — DOCUMENTED INERT (no route or hub
    // emitter named sessions* beyond the verified tree exists on either side)
    expect(v2SurfaceBase("/api/v1/tutor/sessionsxyz", V2)).toBe(V2);
    expect("/api/v1/tutor/sessionsxyz".startsWith("/api/v1/tutor/sessions")).toBe(true);
  });

  test("the T-MIG-083 line: admin revision-notes (ingest + status) flips after its golden gate (r9-hubx rider)", () => {
    // the verified surfaces resolve to v2 (golden-verified of record:
    // run-001, 8/8 legs vs the r4b frozen-core capture band — including the
    // repaired leg-04 @RequestPart bind law: part-less multipart → the core's
    // unhandled-bind 500 internal_error, reproduced verbatim + pinned in the
    // api route tests)
    expect(v2SurfaceBase("/api/v1/admin/revision-notes/ingest", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/admin/revision-notes/status", V2)).toBe(V2);
    // TRUE siblings (v2 serves none of them) stay core — the prefix must never
    // capture them. (/api/v1/admin/llm/chain-health is NOT here: it is already
    // flipped by ITS OWN T-MIG-090 row — a sibling flipped row, not a core-only
    // sibling. Pinned separately below so both rows' reach cannot drift.)
    for (const p of [
      "/api/v1/admin/users",
      "/api/v1/admin/stats",
      "/api/v1/admin/llm",
      "/api/v1/admin/other",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
    // the already-flipped 090 row keeps resolving (both rows coexist):
    expect(v2SurfaceBase("/api/v1/admin/llm/chain-health", V2)).toBe(V2);
    // the partial-segment property (shared string-matching semantics):
    // non-existent partial-segment siblings WOULD be captured (DOCUMENTED
    // INERT — no such routes or hub emitters exist on either side)
    expect(v2SurfaceBase("/api/v1/admin/revision-notesx", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/admin/revision-notes-other", V2)).toBe(V2);
  });

  test("the T-MIG-084 line: the knowledge /nodes segment family flips after its golden gate (r4b rider)", () => {
    // every golden-verified shape of record resolves to v2 (run-002: 8/8
    // legs status+body deep-equal vs the r4b frozen-core capture band —
    // receipts T-MIG-084/run-002-golden-verify-r4b.json; substrate = local
    // scratch PG seeded FROM the fixtures, fake-UUID law, zero remap)
    for (const p of [
      "/api/v1/knowledge/nodes/00000000-0000-4000-8000-000000000001", // leg-02 flat node 200 / leg-06 unknown 404 law class
      "/api/v1/knowledge/nodes/00000000-0000-4000-8000-000000000001/tree", // legs 03/08 (admin+learner) 200
      "/api/v1/knowledge/nodes/00000000-0000-4000-8000-000000000001/tree?includeMisconceptions=true", // the hub's api.ts emitter form — same verified endpoint, pinned conversion law
      "/api/v1/knowledge/nodes/00000000-0000-4000-8000-000000000001/prerequisites", // leg-04 200
      "/api/v1/knowledge/nodes/00000000-0000-4000-8000-000000000001/misconceptions", // leg-05 200
      "/api/v1/knowledge/nodes/kn-1/tree", // the FORMER core-only pin: v2 answers the SAME UUID_RE 400 malformed law (leg-07 class, BEFORE any sql; route-pinned x15) — capture is wire-safe
    ]) {
      expect(v2SurfaceBase(p, V2)).toBe(V2);
    }
    // TRUE siblings outside the /nodes segment (v2 mounts none, hub emits
    // none) stay core — the prefix must never capture them. The legacy
    // /api/v1/tree path is a DIFFERENT route (no /knowledge segment).
    for (const p of [
      "/api/v1/knowledge",
      "/api/v1/knowledge/other",
      "/api/v1/tree?includeMisconceptions=true",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
    // startsWith matching is prefix-string semantics (the same property
    // every row of the table has): a non-existent partial-segment sibling
    // IS captured by the string match — DOCUMENTED INERT (no route or hub
    // emitter named nodes* beyond the verified /nodes family exists on
    // either side — the hub-source grep law in the api.ts table comment)
    expect(v2SurfaceBase("/api/v1/knowledge/nodesx", V2)).toBe(V2);
    expect("/api/v1/knowledge/nodesx".startsWith("/api/v1/knowledge/nodes")).toBe(true);
  });

  test("the T-MIG-089 line: the glm-ocr bridge family flips after its golden gate (r4b band rider)", () => {
    // the golden-verified findings shape of record resolves to v2 (run-002:
    // 6/6 legs status+body deep-equal vs the r4b frozen-core capture band —
    // receipts T-MIG-089/run-002-golden-verify-r4b.json; the 500 catch-all
    // law on {} / all-null canonical and the 404-first law both reproduced;
    // substrate = the surviving Task-33 scratch PG, empty-content law)
    for (const p of [
      "/api/v1/teacher/content/glm-ocr/papers/00000000-0000-4000-8000-000000000026/findings", // legs 05/06 404-first law (the hub emitter form, dormant)
      "/api/v1/teacher/content/glm-ocr/papers/00000000-0000-4000-8000-000000000026/findings?flag=true", // query-tolerant form, same endpoint
    ]) {
      expect(v2SurfaceBase(p, V2)).toBe(V2);
    }
    // TRUE siblings under the /api/v1/teacher/content parent stay core — the
    // prefix must never capture them (T-MIG-020/023 surfaces). The former
    // fetch/enumerate core-null pins MOVED OUT of this list — the T-MIG-100
    // repair band closed CLASS A/C and the per-exact-endpoint rows flipped
    // (the T-MIG-100 line test below); the parent + the topics-write gap stay
    // core-pinned here
    for (const p of [
      "/api/v1/teacher/content", // the bare parent (the 501-shell root)
      "/api/v1/teacher/content/questions/00000000-0000-4000-8000-000000000025/topics", // the T-MIG-023-owned write gap (501 vs frozen 404-first)
    ]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
    // the pairs POST IS served by v2 (golden-verified legs 03/04) but is not
    // hub-emitted — routing availability rides the same family prefix
    expect(v2SurfaceBase("/api/v1/teacher/content/glm-ocr/pairs", V2)).toBe(V2);
    // startsWith matching is prefix-string semantics (the same property every
    // row of the table has): a non-existent partial-segment sibling IS
    // captured by the string match — DOCUMENTED INERT (no route or hub
    // emitter named glm-ocr* beyond the verified /glm-ocr family exists on
    // either side — the hub-source grep law in the api.ts table comment)
    expect(v2SurfaceBase("/api/v1/teacher/content/glm-ocrx", V2)).toBe(V2);
    expect("/api/v1/teacher/content/glm-ocrx".startsWith("/api/v1/teacher/content/glm-ocr")).toBe(true);
  });

  test("the T-MIG-100 line: the RoutingController read endpoints + the exam-series import flip after the repair band (r0, port owner)", () => {
    // GOLDEN-VERIFIED of record: the 22-leg replay (run-004, the repaired
    // tree) — 088 legs 01-07 PASS incl. the CLASS A parse-defect legs 05/06
    // (the empty-parse VIEW + parseDefect:true wire law) and 091 ALL 7 PASS
    // incl. the CLASS C repeat legs 06/07 (the driver-coercion-safe date
    // law); the two remaining non-PASS legs are the topics-write 501 shells
    // (CLASS B, T-MIG-023 — core-pinned by construction below)
    for (const p of [
      "/api/v1/teacher/content/fetch?query=physics", // legs 05/06: the repaired parse-defect wire
      "/api/v1/teacher/content/fetch?query=4CH1%2F1C%20june%202020%20question%207",
      "/api/v1/teacher/content/enumerate?query=physics", // legs 01-04: the shells + the resolved-scope reads
      "/api/v1/teacher/content/enumerate/structured?nodeCode=cap-node&axis=topic", // rides the /enumerate row (leg-04 law)
      "/api/v1/teacher/curriculum/exam-series", // legs 01-07: the import family incl. the repeat law
    ]) {
      expect(v2SurfaceBase(p, V2)).toBe(V2);
    }
    // the T-MIG-020/023 siblings stay core-pinned: the bare parent + the
    // topics-write family (501 shells vs the frozen 404-first / 400 wires)
    for (const p of [
      "/api/v1/teacher/content",
      "/api/v1/teacher/content/questions/00000000-0000-4000-8000-000000000025/topics",
      "/api/v1/teacher/content/review-queue",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
    // startsWith partial-segment capture (fetchx/enumeratex) is DOCUMENTED
    // INERT — no such route or hub emitter exists on either side (the
    // hub-source grep law in the api.ts table comment)
    expect(v2SurfaceBase("/api/v1/teacher/content/fetchx", V2)).toBe(V2);
    expect("/api/v1/teacher/content/fetchx".startsWith("/api/v1/teacher/content/fetch")).toBe(true);
    // teacher curriculum siblings stay core (the 052 full-path mount law):
    // the row is the exam-series family tree ONLY
    expect(v2SurfaceBase("/api/v1/teacher/curriculum/versions", V2)).toBeNull();
  });

  test("the T-MIG-085 line: the teacher concept-graph flips after its golden gate (r3a wave-s4)", () => {
    // family-exact: activate + edges are the ENTIRE teacherConceptGraphRoute
    // (run-002-golden-verify-r3a: PASS with one filed message-format class,
    // non-blocking per the 081-class precedent — receipts via PR #152, vs the
    // r4b frozen-core capture band golden-captures/t-mig-085)
    for (const p of [
      "/api/v1/teacher/concept-graph/activate",
      "/api/v1/teacher/concept-graph/edges?rootId=3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBe(V2);
    }
    // startsWith partial-segment capture (concept-graphx) is DOCUMENTED INERT
    // (no such route or emitter exists on either side) — the same prefix-
    // string property every row of the table has
    expect(v2SurfaceBase("/api/v1/teacher/concept-graphx", V2)).toBe(V2);
  });

  test("the T-MIG-086/087 lines: class-scoped KG + coverage flip under the mid-path rows after the mechanism ruling (r3a wave-s5)", () => {
    // Mechanism A of record (r3a delegated ruling, operator trace
    // 1a119eda53f9af4d, #155 comment 6053748307): the families are golden-
    // verified (run-002-golden-verify-r3a, PR #152) and mounted real on v2
    // (routes/teacher-kg.ts); the wave-s4 structural pins flip here. The
    // tail literal isolates the unverified class-management siblings.
    for (const p of [
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/knowledge-graph?rootId=r-1", // leg-03/07 heatmap
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/knowledge-graph/nodes/0f0f1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/students?rootId=r-1", // leg-04 node students (deeper tail rides the row)
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/learners/9e9e1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/knowledge-graph?rootId=r-1", // leg-05 learner-kg
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/coverage", // leg-01..03 list — zero hub emitters, routing availability (090 posture)
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/coverage/mark", // leg-04..06 mark (POST subpath rides the row)
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/coverage/0c0c1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/history", // leg-07 history (deeper tail)
    ]) {
      expect(v2SurfaceBase(p, V2)).toBe(V2);
    }
    // THE GUARD (the flip law preserved in string form): the unverified
    // class-management siblings NEVER match a mid-path row — the tail
    // literal isolates them and shorter paths fail the segment-count floor.
    for (const p of [
      "/api/v1/teacher/classes", // the list (4 segs < row floor)
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab", // bare detail (tail empty)
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/members",
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/members/st-1",
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/announcements",
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/status",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
    // The :uuid wildcard is bound to the pinned UUID_RE law: malformed and
    // non-UUID class ids do NOT match (stay core, where the SAME captured
    // 400-first malformed law governs at the origin — teacher-kg.ts:156-158
    // reproduces it v2-side; the 084 leg-07 precedent class). Non-row tails
    // never match either (segment-exact).
    for (const p of [
      "/api/v1/teacher/classes/not-a-uuid/knowledge-graph",
      "/api/v1/teacher/classes/kn-1/knowledge-graph",
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/knowledge-graphx", // segment-exact: partial-segment capture structurally dead
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/coverageq",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
  });

  test("apiPath emits exact v2 URLs for representative surfaces", () => {
    expect(apiPath("/api/v1/auth/login")).toBe(`${V2}/api/v1/auth/login`);
    expect(apiPath("/api/v1/curriculum/subjects")).toBe(`${V2}/api/v1/curriculum/subjects`);
    expect(apiPath("/api/v1/learners/me/attempts?limit=20")).toBe(
      `${V2}/api/v1/learners/me/attempts?limit=20`,
    );
  });

  test("every core-only path stays core (relative + XTransformPort convention, never v2)", () => {
    for (const p of CORE_ONLY_PATHS) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
      expect(apiPath(p).startsWith(V2)).toBe(false);
      expect(apiPath(p).includes("XTransformPort=8080")).toBe(true);
    }
  });

  test("the /learners/me boundary: attempts flips, answer-input does not (ans vs att)", () => {
    expect("/api/v1/learners/me/answer-input/transcribe".startsWith("/api/v1/learners/me/attempts")).toBe(false);
    expect(v2SurfaceBase("/api/v1/learners/me/attempts?limit=5", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/learners/me/answer-input/transcribe", V2)).toBeNull();
  });

  test("the T-MIG-090 line: the exact chain-health surface flips with zero live-page routing change (r0 rider)", () => {
    // the verified surface itself resolves to v2 (golden-verified of record:
    // run-005, 4/4 legs at merged main bd4eaeb — the routing-availability pin)
    expect(v2SurfaceBase("/api/v1/admin/llm/chain-health", V2)).toBe(V2);
    // TRUE siblings (v2 serves none of them) stay core — the prefix must never
    // capture them
    for (const p of [
      "/api/v1/admin/llm/other",
      "/api/v1/admin/llm/chain",
      "/api/v1/admin/users",
      "/api/v1/admin/stats",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
    // startsWith matching is prefix-string semantics (the same property every
    // row of the table has — e.g. /api/v1/auth would capture /auth/loginx):
    // a non-existent partial-segment sibling IS captured by the string match.
    // This is pinned as DOCUMENTED INERT capture: no hub emitter and no route
    // named chain-healthx exists on either side (the hub-source grep law in
    // the api.ts table comment), so the capture can never route a live page.
    expect(v2SurfaceBase("/api/v1/admin/llm/chain-healthx", V2)).toBe(V2);
    expect("/api/v1/admin/llm/chain-healthx".startsWith("/api/v1/admin/llm/chain-health")).toBe(true);
    // and the hub emits NOTHING under /api/v1/admin/** today (the line is
    // routing availability, zero live-page behavior change)
  });

  test("the T-MIG-083 line: admin revision-notes (ingest + status) flips after its golden gate (r9-hubx rider)", () => {
    // the verified surfaces resolve to v2 (golden-verified of record:
    // run-001, 8/8 legs vs the r4b frozen-core capture band — including the
    // repaired leg-04 @RequestPart bind law: part-less multipart → the core's
    // unhandled-bind 500 internal_error, reproduced verbatim + pinned in the
    // api route tests)
    expect(v2SurfaceBase("/api/v1/admin/revision-notes/ingest", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/admin/revision-notes/status", V2)).toBe(V2);
    // TRUE siblings (v2 serves none of them) stay core — the prefix must never
    // capture them. (/api/v1/admin/llm/chain-health is NOT here: it is already
    // flipped by ITS OWN T-MIG-090 row — a sibling flipped row, not a core-only
    // sibling. Pinned separately below so both rows' reach cannot drift.)
    for (const p of [
      "/api/v1/admin/users",
      "/api/v1/admin/stats",
      "/api/v1/admin/llm",
      "/api/v1/admin/other",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
    // the already-flipped 090 row keeps resolving (both rows coexist):
    expect(v2SurfaceBase("/api/v1/admin/llm/chain-health", V2)).toBe(V2);
    // the partial-segment property (shared string-matching semantics):
    // non-existent partial-segment siblings WOULD be captured (DOCUMENTED
    // INERT — no such routes or hub emitters exist on either side)
    expect(v2SurfaceBase("/api/v1/admin/revision-notesx", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/admin/revision-notes-other", V2)).toBe(V2);
  });
});

describe("rollback posture (MIGRATION_PLAN §7 — unset the one env var)", () => {
  test("EVERY path — flipped or not — reverts to the core at the decision layer", () => {
    for (const p of [...DUAL_RUN_PATHS, ...CORE_ONLY_PATHS]) {
      expect(v2SurfaceBase(p, undefined)).toBeNull();
      expect(v2SurfaceBase(p, "")).toBeNull();
    }
  });
});

describe("base normalization (operator-convention tolerance, unchanged from T-MIG-011)", () => {
  test("trailing slash is stripped", () => {
    expect(v2SurfaceBase("/api/v1/auth/login", `${V2}/`)).toBe(V2);
  });
  test("a trailing /api/v1 on the base is normalized away (no doubled prefix)", () => {
    expect(v2SurfaceBase("/api/v1/auth/login", `${V2}/api/v1`)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/auth/login", `${V2}/api/v1/`)).toBe(V2);
  });
});
