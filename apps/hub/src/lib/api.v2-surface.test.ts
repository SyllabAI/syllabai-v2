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
  // T-MIG-106 (r4b, operator ruling (b) trace 1a11c4b762f6043d): the tutor
  // ask pair flipped declared-justified — the blocking-ask emitter (tutorAsk,
  // api.ts:1161) is LIVE-ROUTED to v2 (keyed generations, run-005 + the
  // TUTOR-VERIFY run-002/002b SSE law of record). The stream surface has NO
  // apiPath-plane emitter — T-MIG-118 UPDATE of record: the chat UI's
  // /api/ai/chat route is RE-POINTED to the v2 stream (table-governed,
  // v2SurfaceBase — the claAskFetch class); core survives only as the
  // one-env-var rollback fallback (the 118 line test pins the source).
  "/api/v1/tutor/ask",
  "/api/v1/tutor/ask/stream",
  // T-MIG-107 (r0, operator trace 1a11f7bc1d47fa31): the §7 review-workflow
  // write family the hub emits (lib/api.ts validate/place/reject/flag/unflag
  // x3 levels + validate-all + review/audit GETs + the topics GET/POST emitters)
  // — flipped per-SUBTREE after the widening's own golden-verify leg
  // (run-001 capture from the frozen core 6cad6ef local boot + run-002
  // 53/53 replay vs the booted v2; 3 legs declared-justified, the 106 ruling
  // (b) class; 6 corpus cases content-write-*). The review/audit GETs ride
  // the exam-papers subtree row (v2-real since #168, zero 501 stubs remain).
  "/api/v1/teacher/content/exam-papers/ep-1/validate",
  "/api/v1/teacher/content/exam-papers/ep-1/validate-all?force=true",
  "/api/v1/teacher/content/exam-papers/ep-1/place",
  "/api/v1/teacher/content/exam-papers/ep-1/reject",
  "/api/v1/teacher/content/exam-papers/ep-1/flag",
  "/api/v1/teacher/content/exam-papers/ep-1/unflag",
  "/api/v1/teacher/content/exam-papers/ep-1/review",
  "/api/v1/teacher/content/exam-papers/ep-1/audit",
  "/api/v1/teacher/content/question-versions/qv-1/validate",
  "/api/v1/teacher/content/question-versions/qv-1/reject",
  "/api/v1/teacher/content/question-versions/qv-1/flag",
  "/api/v1/teacher/content/question-versions/qv-1/unflag",
  "/api/v1/teacher/content/mark-schemes/ms-1/validate",
  "/api/v1/teacher/content/mark-schemes/ms-1/reject",
  "/api/v1/teacher/content/mark-schemes/ms-1/flag",
  "/api/v1/teacher/content/mark-schemes/ms-1/unflag",
  "/api/v1/teacher/content/questions/q-1/topics",
  // T-MIG-110 (r7a): the NBA recommendations emitter form ADDED — the flip row
  // landed at the table tail under the operator flip order
  // 1a120a8e85d04205 after the T-MIG-108 chain closed the 500 band and
  // re-verified the 200 nba-rules/v1.3 wire on BOTH planes (the line test
  // pins the flip); dashboard-core.ts:85 is the hub's only emitter.
  "/api/v1/learners/me/recommendations?rootId=kn-1",
  // T-MIG-111 (r7a): the corpus-verified widen band's emitter forms. The
  // knowledge-graph form is the band's ONE LIVE routing change (both
  // call-sites real: dashboard-core.ts:86 + kg-learner-state.ts:508); the
  // smart-lesson + topics emitters are DORMANT (zero page call-sites,
  // grep-verified at the widening commit) — pinned in the 084
  // dormant-emitter posture. The documents/question-bank rows have ZERO hub
  // emitters — nothing to pin here (the 090 posture); review-queue rides
  // THREE dormant request()-plane emitters (contentReviewQueue/-V2/-V3,
  // zero call-sites — the inventory the pre-deploy bundle census caught
  // after a zero-emitter misstatement was self-caught pre-deploy).
  "/api/v1/learners/me/knowledge-graph?rootId=kn-1",
  "/api/v1/learners/me/smart-lesson?rootId=kn-1&topicNodeId=kn-11",
  "/api/v1/questions/topics?rootId=kn-1",
  // T-MIG-120: the questions SUBTREE row — the five hub-emitted forms ride
  // v2 (the run-001 two-plane capture of record; the order-class disclosed)
  "/api/v1/questions?rootId=kn-1",
  "/api/v1/questions/families?rootId=kn-1",
  "/api/v1/questions/q-1",
  "/api/v1/questions/q-1/mark-scheme",
  "/api/v1/teacher/content/review-queue",
  "/api/v1/teacher/content/review-queue-v2",
  "/api/v1/teacher/content/review-queue-v3",
  // T-MIG-113 (r7a): the marking page's LIVE read emitters flip (the
  // marking-client call-sites: markingQueueV2Page :160, markingThroughput
  // :178, kappaLatest :196) + the dormant evaluateKappa form (:1547,
  // zero call-sites — the 084 posture). The bare markingQueue
  // (request-plane, /answers?state=) STAYS CORE — the three-row B1 grammar
  // keeps the bare row out (the T-MIG-116/122 detail/:uuid row below is the
  // tighter posture). T-MIG-116/122 UPDATE: markingAnswer (:234, the detail
  // read) LEFT the stay-core law — the mid-path :uuid row landed post-fix
  // (the paths pinned below). The leaf row strings end before '?' so
  // the query variants ride the same row.
  "/api/v1/teacher/marking/queue-v2?state=PENDING&page=0&size=5",
  "/api/v1/teacher/marking/queue-v2?state=PENDING",
  "/api/v1/teacher/marking/throughput",
  "/api/v1/teacher/marking/kappa/latest",
  "/api/v1/teacher/marking/kappa/latest?paperId=3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab",
  "/api/v1/teacher/marking/kappa/evaluate",
  // T-MIG-116/122 (r7a): the B1 subtree rows — the marking page's remaining
  // LIVE emitters flip: markingAnswer (:234, the detail GET — the rich view,
  // the 114-verified wire) + smartMarkBatch (:289, the batch POST — the
  // keyless laws byte-honest post-fix). The smart-mark SINGLE tail has ZERO
  // hub emitters (routing availability rides the :uuid row's deeper-tail
  // semantics); the bare /answers STAYS CORE (the three-row grammar law).
  "/api/v1/teacher/marking/answers/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab",
  "/api/v1/teacher/marking/answers/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/smart-mark",
  "/api/v1/teacher/marking/smart-mark-batch",
  // T-MIG-117 (r7a): the assignments family's FOUR hub-emitted wire forms —
  // the bare subtree row (table tail) captures all four; every form is
  // v2-REAL per the rig chain of record (the 88-leg capture + the 44/44
  // golden-verify; receipts T-MIG-117/run-001-capture + run-002-golden-verify).
  "/api/v1/teacher/assignments",
  "/api/v1/teacher/assignments?course=igcse-chemistry-19",
  "/api/v1/teacher/assignments/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab",
  "/api/v1/teacher/assignments/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/status",
  // T-MIG-121 (r0, the B6 band): the answer-input subtree row — the hub's
  // ONLY emitter form under the subtree (transcribeHandwriting, api.ts
  // :1953) with the two ink-pad call-sites (:194 image/jpeg, :246
  // image/png) — flipped under the operator ruling (b) of record 08557d3
  // ('Decision 1 - good enough, switch it over', trace 1a1313ce921d7169).
  // The deterministic law set is ALL-GREEN two-plane (the run-001 keyless
  // battery: unauth 401 + absent-image 400 + bad-mime 400 + non-base64 400,
  // byte-equal modulo timestamp); the positive 200 is LLM output
  // (GOLDEN_MASTER §3 excluded — behavioural gates only); the GLM seam
  // dependency disclosed of record and accepted by the ruling; the
  // chain-down path serves the frozen 503 transcription_unavailable law.
  "/api/v1/learners/me/answer-input/transcribe",
];

/** Hub-emitted (or hub-adjacent) paths that MUST stay on the core in the dual-run posture. */
const CORE_ONLY_PATHS: readonly string[] = [
  // teacher content: the write SUBTREES flipped in T-MIG-107 (the former
  // exam-papers/validate + question-versions/flag + mark-schemes/reject pins
  // MOVED OUT — PR #168 made them real + the 53-leg golden-verify of record);
  // the glm-ocr FAMILY flipped in T-MIG-089 (the former core-only
  // glm-ocr/papers/p-1/findings pin MOVED OUT — v2 golden-verified 6/6,
  // receipts T-MIG-089/run-002-golden-verify-r4b.json — and pinned in
  // DUAL_RUN_PATHS); the bare parent stays core
  // T-MIG-111 (r7a): review-queue + review-queue-v3 MOVED OUT of this list —
  // the ONE row /api/v1/teacher/content/review-queue captures the verified
  // TRIO (queue/-v2/-v3, 8 corpus legs GREEN incl. 200s on all three; zero
  // hub emitters — routing availability, the 090 posture). The documents row
  // (16 legs incl. the captured 500 laws) flipped the same band — it was
  // never pinned here (zero emitters, never hub-routed).
  // teacher curriculum + teacher W5 families (unported). T-MIG-111 EXCLUSION
  // LAW of record: teacher/curriculum/versions STAYS CORE — its subtree
  // contains the honest-501 write stubs POST /versions/:id/archive +
  // /validate (curriculum/index.ts :170) — the stub law forbids a row whose
  // capture includes a stub, even with zero hub emitters; the family flip
  // awaits its own port band.
  "/api/v1/teacher/curriculum/versions",
  // teacher/classes FLIPPED in T-MIG-112 (the former STAYS-CORE pin MOVED
  // OUT of this list of record): the class-KG/coverage families ride the
  // MID-PATH rows (T-MIG-086/087, untouched) and the FOUNDATION family
  // (list/detail/status/members/announcements + learners/me/classroom +
  // teacher/learners) is now golden-verified of record — the 092-recipe
  // two-plane verify ALL-GREEN (receipts T-MIG-112/run-001..003) + 17 id-free
  // corpus cases; the T-MIG-111 zero-corpus exclusion law DISCHARGED.
  // teacher/marking (T-MIG-113 UPDATE of record): the READ leaf rows
  // (queue-v2, throughput, kappa/latest, kappa/evaluate) FLIPPED at the
  // table tail (the local-rig 107-law capture 42/44 + the two findings
  // filed T-MIG-114). T-MIG-116/122 UPDATE of record: the answers/:uuid
  // mid-path row (detail GET + smart-mark SINGLE tail) + the
  // smart-mark-batch LEAF row LEFT this STAYS-CORE law — the B1-DEFECT-1
  // withholding is FIXED (the envelope) and the 12/12 re-verify is
  // ALL-GREEN of record. STAYS CORE here: the BARE /answers path (zero hub
  // emitters; the planned B1 three-row grammar keeps it OUT) — the
  // T-MIG-116 line test pins the flip and the stay-core laws.
  "/api/v1/teacher/marking/answers",
  // teacher/assignments LEFT this list in T-MIG-117 (r7a, the B2
  // decommission band, operator order trace 1a12e148cc3b93ad "Do it
  // yourself"): the family was PORT-FIRST (apps/api had ZERO
  // teacher-assignments implementation at claim) — the port landed
  // line-against-line the frozen TeacherAssignmentController @ 6cad6ef and
  // the 107 subtree-row law is satisfied by the rig chain of record (the
  // 88-leg capture from the LOCAL frozen-core boot rebuilt docker-free +
  // the 44/44 golden-verify of the port vs the captures). The bare
  // subtree row is at the table tail; the line test pins the four-wire
  // flip.
  // learner /questions + /exam-papers: T-MIG-120 UPDATE of record — the
  // questions SUBTREE row LANDED (the bare /api/v1/questions prefix row at
  // the table tail): the list/detail/mark-scheme positive wires are
  // CAPTURED (the run-001 two-plane battery, shared-Neon direct parity —
  // subjects/tree/detail/mark-scheme/topics PASS-BYTE; families/list
  // SET-EQUAL with the order-class disclosure, zero order-sensitive
  // consumers) and the 111 leaf-row-only law is DISCHARGED. The 111
  // comment's 'families is coreFetchAuthorized CORE-PINNED' is retired —
  // the bridge's familiesForRoot re-pointed in-band (the claAskFetch
  // class). STAYS CORE here: the exam-papers learner reads
  // (unverified-positive, the B7 ruling class).
  "/api/v1/exam-papers?subjectId=sub-1",
  "/api/v1/exam-papers/ep-1",
  // non-attempts learner surfaces (W4) — agenda + state FLIPPED in T-MIG-096
  // (run-001 golden-verify); flashcard-ratings + note-votes FLIPPED in
  // T-MIG-095 after the band closed (46536fd) and the live re-verify passed
  // (run-002 of record) — moved out of this CORE_ONLY list of record
  // T-MIG-096→110: recommendations LEFT this list of record — the 200
  // NBA-engine wire was live-proven by the T-MIG-108 chain (the 500 band
  // closed: PR #169 fix d4ad173, redeploy dpl_FprVRBHzqB7xy8K1sBGnZVGAE97Y,
  // double-plane 200 census R1/R3 parity) and the row flipped under the
  // operator flip order 1a120a8e85d04205 (the 110 line test pins the flip).
  // T-MIG-097 (r7a): cla/ask MOVED OUT of this CORE_ONLY list — BOTH wires
  // live-proven (run-003 10/10 refusal dual-live + run-004 generation probe
  // 200 answer-envelope) and the exact-path row flipped under the chain
  // order 1a119df7d930b609; the emitter routes table-first with core as the
  // unset-base fallback.
  // T-MIG-121 UPDATE of record: the answer-input/transcribe pin LEFT this
  // CORE_ONLY list — the B6 subtree row flipped under the operator ruling
  // (b) 08557d3 (the 121 line test pins the flip; the GLM seam dependency
  // disclosed-accepted of record).
  // T-MIG-082 (Wave S3, r3a): revision-notes FLIPPED after its golden gate —
  // run-002 frozen-core captures (d19289cc8) + run-003 verify 7/7 vs the
  // landed mounts; moved out of this CORE_ONLY list of record.
  // T-MIG-111 (r7a): knowledge-graph MOVED OUT of this list — the row
  // /api/v1/learners/me/knowledge-graph flipped (3 w4 corpus legs GREEN incl.
  // both 200 shapes; the band's ONE LIVE routing change — dashboard-core.ts
  // :86 + kg-learner-state.ts:508). The smart-lesson sibling flipped the same
  // band (4 legs, the FULL law matrix) — never pinned here. transcribe
  // STAYS CORE (401-only + the GLM seam); intervention-runs STAYS CORE (no
  // positive wire).
  // classic core-only surfaces (T-MIG-035 check-3 law; /subjects and the
  // LEGACY /api/v1/tree path are still true. NOTE: the former
  // "/api/v1/knowledge/nodes/kn-1/tree" pin MOVED OUT of this list — it is
  // captured by the flipped T-MIG-084 /api/v1/knowledge/nodes row and v2
  // answers the SAME UUID_RE 400 malformed law the core does (captured
  // leg-07 class; route-test x15), so the capture is wire-safe)
  "/api/v1/subjects",
  "/api/v1/tree?includeMisconceptions=true",
  // T-MIG-092 (r0 rider) + T-MIG-106 (r4b): the tutor ask/ask/stream pins
  // MOVED OUT of this CORE_ONLY list of record — the 092 zero-key blocker
  // RETIRED (the keyed v2 serves real generations, run-005) and the pair
  // flipped declared-justified under the operator ruling (b) trace
  // 1a11c4b762f6043d (GOLDEN_MASTER §4 declared class; corpus cases
  // tutor-askstream-*; the 106 line test pins the flip). The BARE
  // /api/v1/tutor root stays core (no route, never captured).
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
      "/api/v1/tutor/ask", // T-MIG-106: declared-justified flip (operator ruling (b) trace 1a11c4b762f6043d) — the ask row IS the pair (captures /ask/stream under startsWith, the routing-inseparability finding); the 092 zero-key blocker RETIRED (keyed v2, run-005)
      "/api/v1/teacher/content/exam-papers/", // T-MIG-107: golden-verified (run-002 53/53, r0 widening rider) — per-SUBTREE row for the parametrized write verbs; review/audit GETs v2-real since #168
      "/api/v1/teacher/content/question-versions/", // T-MIG-107: same band — subtree = exactly the 4 verified state verbs
      "/api/v1/teacher/content/mark-schemes/", // T-MIG-107: same band — subtree = exactly the 4 verified state verbs (3 legs declared-justified, the 106 ruling (b) class)
      "/api/v1/teacher/content/questions/", // T-MIG-107: same band — the topics family (088 leg-08/09 laws + the 50/51/52 capture laws)
      "/api/v1/learners/me/recommendations", // T-MIG-110: LIVE-PROVEN by the T-MIG-108 chain (PR #169 fix d4ad173 + redeploy dpl_FprVRBHzqB7xy8K1sBGnZVGAE97Y + double-plane 200 census R1/R3 parity, r7a) — the operator flip order 1a120a8e85d04205; NARROW: the leaf endpoint's exact path, never the bare /learners/me
      "/api/v1/learners/me/knowledge-graph", // T-MIG-111: corpus-verified (3 w4 legs GREEN at tip; the band's ONE LIVE routing change — dashboard-core.ts:86 + kg-learner-state.ts:508) — the operator verified-families order 1a120e747bb195dd
      "/api/v1/learners/me/smart-lesson", // T-MIG-111: corpus-verified FULL law matrix (4 w4 legs: 200/400/401/404; the deterministic 8-rung ladder, no LLM) — dormant emitter (zero call-sites), routing availability
      "/api/v1/questions/topics", // T-MIG-111: leaf row ONLY (2 legs GREEN: student-200 + unauthed-401) — list/detail/mark-scheme positive wires uncaptured, families core-pinned; the rest of /questions stays core
      "/api/v1/teacher/content/documents", // T-MIG-111: the TEACHER-side family (16 legs GREEN incl. the captured 500 laws; zero hub emitters — routing availability, the 090 posture; zero 501s remain post-107)
      "/api/v1/teacher/content/review-queue", // T-MIG-111: ONE row captures the verified TRIO (queue/-v2/-v3, 8 legs GREEN incl. 200s on all three; THREE dormant emitters ride it, zero call-sites — startsWith multi-family capture DOCUMENTED in the row comment)
      "/api/v1/admin/question-bank", // T-MIG-111: the SME family (7 legs GREEN incl. both ingest 200 write laws + the role-law matrix; zero hub emitters — routing availability)
      "/api/v1/teacher/classes", // T-MIG-112: the classroom FOUNDATION (the operator-ordered capture+verify band trace 1a1213760243901d) — 092-recipe two-plane golden-verify of record (49-leg capture + 40-leg verify ALL-GREEN incl. the artifact triage + the run-003 ordering-law addendum); the KG/coverage MID-PATH rows untouched
      "/api/v1/learners/me/classroom", // T-MIG-112: the learner overlay (overview/feed/markRead; the membership-gate 403 byte-exact 3x-stable; segment-safe from the cla family)
      "/api/v1/teacher/learners", // T-MIG-112: the V49 ruling roster (identity projection only; bare-only path, no deeper tail either plane)
      "/api/v1/teacher/marking/queue-v2", // T-MIG-113: the dual-shape G-5 queue read (LOCAL-rig 107-law capture + 42/44 verify; the marking page's live paged read flips)
      "/api/v1/teacher/marking/throughput", // T-MIG-113: the deterministic counts read (the marking page's live read flips)
      "/api/v1/teacher/marking/kappa/latest", // T-MIG-113: the 404-empty/200-by-scope law (the marking page's live kappa read flips)
      "/api/v1/teacher/marking/kappa/evaluate", // T-MIG-113: the ZERO-KEY 409 no-pairs law (dormant emitter — routing availability, the 084 posture); the human-mark row WITHHELD (the 114 findings)
      "/api/v1/teacher/marking/smart-mark-batch", // T-MIG-116/122: the B1 band's batch LEAF row (the keyless batch laws byte-honest vs the re-derived frozen-core captures; the 12/12 re-verify post-fix; the marking page's batch emitter :289 flips)
      "/api/v1/teacher/assignments", // T-MIG-117: the B2 port band (the 107 subtree-row law satisfied by the rig chain of record — the 88-leg capture + the 44/44 golden-verify)
      "/api/v1/questions", // T-MIG-120: the B5 band's questions SUBTREE row (the 107 narrowest-legal form — all five hub-emitted forms v2-REAL + captured; the 111 leaf-row-only law DISCHARGED; the order-class disclosure of record)
      "/api/v1/learners/me/answer-input", // T-MIG-121: the B6 band's answer-input SUBTREE row (the GLM seam — the run-001 keyless law battery byte-parity GREEN both planes; the operator ruling (b) GRANTED of record 08557d3 'good enough, switch it over'; the keyed live-prove waived ZERO-KEY; the GLM seam dependency disclosed-accepted; the ink-pad emitters :194/:246 flip)
    ]);
  });
  test("the mid-path table is exactly the ruled set — the mechanism-A amendment needs its own golden gate too", () => {
    expect([...V2_SURFACE_MIDPATH_PREFIXES]).toEqual([
      "/api/v1/teacher/classes/:uuid/knowledge-graph", // T-MIG-086: heatmap + node-students
      "/api/v1/teacher/classes/:uuid/learners/:uuid/knowledge-graph", // T-MIG-086: learner-kg
      "/api/v1/teacher/classes/:uuid/coverage", // T-MIG-087: list + mark + history
      // T-MIG-114: the human-mark WRITE row — the 113 WITHHELD row landing
      // per FAIL-NO-FLIP (the two findings fixed + the 44/44 re-verify of
      // record; the withheld ppd corpus case joined the union)
      "/api/v1/teacher/marking/answers/:uuid/human-mark",
      // T-MIG-116/122: the answers/:uuid row — the detail GET + the smart-mark
      // SINGLE tail (deeper tails ride the row); the B1-DEFECT-1 withholding
      // is FIXED (the envelope law) and the 12/12 re-verify is ALL-GREEN of
      // record; bare /answers (5 segs) + malformed uuids stay core
      "/api/v1/teacher/marking/answers/:uuid",
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
    // the LLM-bearing + not-yet-verified surfaces stay core — the zero-key
    // law in string form (the T-MIG-095-blocked write surfaces LEFT this
    // list: band closed + run-002 live re-verify — see the 095 test; the
    // NBA recommendations wire LEFT this list at the T-MIG-110 flip — the
    // T-MIG-108 chain live-proved it, see the 110 test)
    // cla/ask LEFT this list at the T-MIG-097 flip (both wires live-proven:
    // run-003 10/10 refusal dual-live + run-004 generation probe 200)
    // T-MIG-112: classroom LEFT this list — its row flipped (the 112 line
    // test pins the flip; the capture+verify band of record)
    for (const p of [
      "/api/v1/learners/me/intervention-runs",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
  });

  test("the T-MIG-110 line: the NBA recommendations leaf flips after the T-MIG-108 chain live-proved both planes (r7a, operator flip order 1a120a8e85d04205)", () => {
    // the verified surface resolves to v2 — the hub's ONLY emitter form
    // (dashboard-core.ts:85 api.recommendations(pilot.rootId) →
    // /api/v1/learners/me/recommendations?rootId=…). Golden evidence of
    // record: the T-MIG-108 chain (run-001 dual-live probes → PR #169 the
    // one-token at.learner_id fix → redeploy dpl_FprVRBHzqB7xy8K1sBGnZVGAE97Y
    // → the POST-DEPLOY DOUBLE-PLANE 200 CENSUS 18/18: R1 v2 200
    // nba-rules/v1.3 actions=2 + R3 core control 200 parity + R2/R4 the
    // 400 required-rootId law parity both planes).
    expect(v2SurfaceBase("/api/v1/learners/me/recommendations", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/learners/me/recommendations?rootId=kn-1", V2)).toBe(V2);
    expect(apiPath("/api/v1/learners/me/recommendations?rootId=kn-1")).toBe(
      `${V2}/api/v1/learners/me/recommendations?rootId=kn-1`,
    );
    // TRUE siblings stay core — the row is the LEAF endpoint's exact path and
    // must never capture them (intervention-runs is the 096
    // LLM-bearing pin; it STILL stays core after T-MIG-111 — no positive
    // wire). T-MIG-111 UPDATE of record: smart-lesson +
    // knowledge-graph MOVED OUT of this stay-core list — the corpus-verified
    // widen band flipped both (the w4 legs GREEN at tip; the 111 line test
    // pins their rows) — the 110 comment's 'no golden gate of record' posture
    // is DISCHARGED by the corpus of record (union 186/186 incl. the w4 legs).
    // T-MIG-112 UPDATE of record: classroom MOVED OUT of this stay-core list
    // — its own capture+verify band flipped it (the 112 line test pins the
    // flip; the 092-recipe verify of record ALL-GREEN).
    for (const p of [
      "/api/v1/learners/me/intervention-runs",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
    // startsWith matching is prefix-string semantics (the same property every
    // row of the table has): a non-existent partial-segment sibling IS
    // captured by the string match — DOCUMENTED INERT (no route or hub
    // emitter named recommendations* beyond the leaf path exists on either
    // side; the emitter appends only ?rootId=)
    expect(v2SurfaceBase("/api/v1/learners/me/recommendationsx", V2)).toBe(V2);
    expect(
      "/api/v1/learners/me/recommendationsx".startsWith("/api/v1/learners/me/recommendations"),
    ).toBe(true);
  });

  test("the T-MIG-111 line: the corpus-verified families widen band (r7a, operator order 1a120e747bb195dd)", () => {
    // The ONE live routing change: the learner-me KG read goes v2-native
    // (both call-sites real); smart-lesson + topics ride dormant emitters;
    // documents/question-bank are zero-emitter availability rows;
    // review-queue rides three dormant emitters (zero call-sites). The
    // exclusions are LAWS pinned in CORE_ONLY: marking (write-
    // verify bar), curriculum/versions (501 stubs), teacher/classes (zero
    // corpus legs), transcribe (GLM seam), intervention (no positive wire).
    for (const p of [
      "/api/v1/learners/me/knowledge-graph?rootId=kn-1",
      "/api/v1/learners/me/smart-lesson?rootId=kn-1&topicNodeId=kn-11",
      "/api/v1/questions/topics?rootId=kn-1",
      "/api/v1/teacher/content/documents/doc-1/canonical",
      "/api/v1/teacher/content/review-queue",
      "/api/v1/teacher/content/review-queue-v2",
      "/api/v1/teacher/content/review-queue-v3",
      "/api/v1/admin/question-bank/ingest",
      "/api/v1/admin/question-bank/status",
    ]) expect(v2SurfaceBase(p, V2)).toBe(V2);
    // startsWith matching is prefix-string semantics (the same property every
    // row of the table has): a non-existent partial-segment sibling IS
    // captured by the string match — DOCUMENTED INERT (no route or hub
    // emitter named review-queue* beyond the three verified versions exists
    // on either side — grep-verified at the widening commit)
    expect(v2SurfaceBase("/api/v1/teacher/content/review-queuex", V2)).toBe(V2);
    expect(
      "/api/v1/teacher/content/review-queuex".startsWith("/api/v1/teacher/content/review-queue"),
    ).toBe(true);
    // the EXCLUDED siblings stay core (the 111 exclusion laws):
    // T-MIG-112 UPDATE of record: teacher/classes + learners/me/classroom
    // MOVED OUT of this excluded list — their own capture+verify band
    // flipped them (the 112 line test pins the flip; the 111 exclusion law
    // is DISCHARGED of record).
    for (const p of [
      "/api/v1/teacher/marking/answers", // T-MIG-113/116 UPDATE: the bare path STAYS (zero emitters; the three-row grammar) — queue-v2 + the detail/:uuid row + the batch leaf MOVED OUT (their rows flipped)
      "/api/v1/teacher/marking/answers/a-1/human-mark", // T-MIG-114 UPDATE: the row LANDED but `a-1` fails the :uuid law — malformed uuids stay core (the captured 400-first law governs at the origin; the 112 class)
      "/api/v1/teacher/marking/answers/a-1/smart-mark", // T-MIG-116/122: same malformed-uuid law on the new :uuid row
      "/api/v1/teacher/curriculum/versions",
      "/api/v1/teacher/curriculum/versions/v-1/nodes",
      "/api/v1/teacher/tests/preview",
      "/api/v1/teacher/tests/weakness-options",
      // T-MIG-121 UPDATE: the answer-input/transcribe needle LEFT this
      // excluded list — the B6 subtree row flipped (the 121 line test pins
      // it)
      "/api/v1/learners/me/intervention-runs",
      // T-MIG-120 UPDATE: the questions forms LEFT this excluded list — the
      // subtree row flipped (the 120 line test pins it); exam-papers stays
      "/api/v1/teacher/content/past-papers",
    ]) expect(v2SurfaceBase(p, V2)).toBeNull();
  });

  test("the T-MIG-112 line: the classroom foundation flips via its own capture+verify band (r7a, operator order 1a1213760243901d)", () => {
    // The 092-recipe two-plane golden-verify of record (receipts
    // T-MIG-112/run-001..003): 49-leg capture vs the live frozen core (probe
    // accounts v2-registered, the R2 same-bearer continuity LIVE-proven for
    // BOTH roles) + 40-leg verify vs the live v2 ALL-GREEN (38/40 in-run
    // byte-laws + 2 comparator-artifact legs re-proven first-hand 3x-stable:
    // the membership-gate 403 law BYTE-EXACT, the close-archive 200 law)
    // + the run-003 ordering-law addendum byte-equal both planes. 17 id-free
    // corpus cases joined the union. The T-MIG-111 zero-corpus exclusion law
    // is DISCHARGED.
    // the teacher foundation inventory (the 8 CRUD endpoints + roster):
    for (const p of [
      "/api/v1/teacher/classes", // list (newest-first) + create
      "/api/v1/teacher/classes/00000000-0000-4000-8000-000000000001", // detail (roster)
      "/api/v1/teacher/classes/00000000-0000-4000-8000-000000000001/status", // tolerant parse + archive/reopen
      "/api/v1/teacher/classes/00000000-0000-4000-8000-000000000001/members", // enroll + remove member
      "/api/v1/teacher/classes/00000000-0000-4000-8000-000000000001/members/00000000-0000-4000-8000-000000000005",
      "/api/v1/teacher/classes/00000000-0000-4000-8000-000000000001/announcements", // publish + list
      "/api/v1/teacher/learners", // the V49 ruling roster (bare-only path)
    ]) expect(v2SurfaceBase(p, V2)).toBe(V2);
    // the learner overlay inventory (the 3 endpoints):
    for (const p of [
      "/api/v1/learners/me/classroom", // overview (the honest zero + archived-dropout laws)
      "/api/v1/learners/me/classroom/announcements", // the feed
      "/api/v1/learners/me/classroom/announcements/00000000-0000-4000-8000-000000000003/read", // markRead (append-only)
    ]) expect(v2SurfaceBase(p, V2)).toBe(V2);
    // malformed-uuid class paths are captured by the PREFIX row (startsWith —
    // no UUID_RE guard, unlike the mid-path rows): wire-safe of record — v2
    // serves the captured 400-first malformed law (run-001 L08 byte-equal,
    // the 035 tree-pin precedent)
    expect(v2SurfaceBase("/api/v1/teacher/classes/not-a-uuid", V2)).toBe(V2);
    // SEGMENT-SAFETY: the classroom row never captures the shorter cla
    // sibling family (cla/ask keeps its OWN exact-path row) nor any other
    // learners/me sibling
    expect(v2SurfaceBase("/api/v1/learners/me/class", V2)).toBeNull();
    // the already-verified mid-path rows still resolve v2 (no regression):
    expect(
      v2SurfaceBase(
        "/api/v1/teacher/classes/00000000-0000-4000-8000-000000000001/knowledge-graph?rootId=kn-1",
        V2,
      ),
    ).toBe(V2);
    expect(
      v2SurfaceBase(
        "/api/v1/teacher/classes/00000000-0000-4000-8000-000000000001/coverage",
        V2,
      ),
    ).toBe(V2);
    // the 111-excluded siblings KEEP their stay-core laws (unchanged):
    expect(v2SurfaceBase("/api/v1/teacher/curriculum/versions", V2)).toBeNull();
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers", V2)).toBeNull();
    // T-MIG-116/122 UPDATE: the batch leaf LEFT the stay-core law (its own
    // row landed post-fix) — the assertion moved to the 116 line test.
  });

  test("the T-MIG-114 line: the human-mark write row FLIPS after the 44/44 re-verify (r7a, operator order 1a124e79487d6cb9 'take it')", () => {
    // the T-MIG-113 line's WITHHELD law is DISCHARGED: the two findings are
    // fixed (the classifier branch serves the jakarta @Size(max=50) message
    // byte-equal to the capture leg-31; the detail read hydrates the jsonb
    // to the core's map wire byte-equal to the capture leg-35) and the
    // 44-leg re-verify is ALL-GREEN of record (deepEqualTolerant zero
    // drift). The row is the mid-path form (the 086/087 grammar): the
    // :uuid segment matches exactly ONE well-formed uuid — the well-formed
    // human-mark tail flips, a malformed uuid stays core (the 112
    // malformed-uuid class; the same captured 400-first law governs at the
    // origin), the bare /answers path and the smart-mark tails stay core
    // (the over-capture + LLM-adjacency laws stand).
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers/00000000-0000-4000-8000-0000000000ff/human-mark", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/human-mark", V2)).toBe(V2);
    // the query string is stripped before segmentation (the matcher law):
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers/00000000-0000-4000-8000-0000000000ff/human-mark?x=1", V2)).toBe(V2);
    // malformed uuid: the :uuid law rejects -> stays core
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers/a-1/human-mark", V2)).toBeNull();
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers/not-even-uuid-ish/human-mark", V2)).toBeNull();
    // the over-capture laws (T-MIG-116/122 UPDATE: the detail GET + the
    // smart-mark SINGLE tail + the batch LEAF now have their OWN verified
    // rows — the assertions moved to the 116 line test; the bare /answers
    // and the bare /teacher/marking STAY core):
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers", V2)).toBeNull();
    expect(v2SurfaceBase("/api/v1/teacher/marking", V2)).toBeNull();
    // the prefix read rows keep flipping (no regression):
    expect(v2SurfaceBase("/api/v1/teacher/marking/queue-v2?state=PENDING&page=0&size=5", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/teacher/marking/throughput", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/teacher/marking/kappa/latest?paperId=p-1", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/teacher/marking/kappa/evaluate", V2)).toBe(V2);
    // partial-segment capture (queue-v2x) is a startsWith MECHANISM fact —
    // DOCUMENTED INERT: no such route or emitter exists on either side
    // (the 111 review-queuex pin convention):
    expect("/api/v1/teacher/marking/queue-v2x".startsWith("/api/v1/teacher/marking/queue-v2")).toBe(true);
  });

  test("the T-MIG-117 line: the assignments SUBTREE row flips after the rig capture + the 44/44 golden-verify (r7a, operator order 1a12e148cc3b93ad 'Do it yourself')", () => {
    // the B2 band was PORT-FIRST (the claim finding: apps/api had ZERO
    // teacher-assignments implementation) — the port landed
    // line-against-line the frozen TeacherAssignmentController @ 6cad6ef
    // and the 107 subtree-row law is satisfied: the 88-leg capture from
    // the LOCAL frozen-core boot (the 107/113/114 rig recipe rebuilt
    // docker-free) + the 44/44 golden-verify of the port vs the captures
    // (deepEqualTolerant zero drift). The bare row captures EXACTLY the
    // four verified wires (list GET :134, create POST :318, status POST
    // :347, roster GET :202) — all four hub-emitted paths are v2-REAL.
    // the four wire forms flip (the bare row's startsWith law):
    expect(v2SurfaceBase("/api/v1/teacher/assignments", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/teacher/assignments/00000000-0000-4000-8000-0000000000ff", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/teacher/assignments/00000000-0000-4000-8000-0000000000ff/status", V2)).toBe(V2);
    // the query string rides the same row (the matcher strips it):
    expect(v2SurfaceBase("/api/v1/teacher/assignments?course=igcse-chemistry-19", V2)).toBe(V2);
    // the family boundary law: the BARE /teacher base has no row (never
    // captured — the sibling families have their own rows, unchanged).
    expect(v2SurfaceBase("/api/v1/teacher", V2)).toBeNull();
    // partial-segment capture (assignmentsx) is a startsWith MECHANISM
    // fact — DOCUMENTED INERT: no such route or emitter exists on either
    // side (the 111 review-queuex pin convention; asserted mechanically):
    expect("/api/v1/teacher/assignmentsx".startsWith("/api/v1/teacher/assignments")).toBe(true);
    // no-regression needles: the marking laws stand (the 113/114 rows), the
    // classroom rows stand (the 112), the content-write subtree rows stand
    // (the 107):
    expect(v2SurfaceBase("/api/v1/teacher/marking/queue-v2?state=PENDING&page=0&size=5", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers/00000000-0000-4000-8000-0000000000ff/human-mark", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers", V2)).toBeNull();
    expect(v2SurfaceBase("/api/v1/teacher/classes", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/teacher/curriculum/versions", V2)).toBeNull();
  });

  test("the T-MIG-116/122 line: the B1 subtree rows flip after the defect fix + the 12/12 re-verify (r7a, operator order 1a12ff5ac598546d 'B1-DEFECT-1 fix band')", () => {
    // the B1 band's gate caught B1-DEFECT-1 (the smart-mark tail served the
    // RAW SmartMarkResult row, snake_case, where the core serves the
    // TeacherViews.SmartMarkView camelCase envelope — routes/teachermarking
    // :287); the operator ordered the defect band T-MIG-122, the fix landed
    // (the smartMarkResultView projection) and the t116 driver re-verified
    // 12/12 ALL-GREEN vs the re-derived frozen-core captures (the wiped
    // fixtures re-captured from the rebuilt 6cad6ef rig — the re-derivation
    // disclosed). FAIL-NO-FLIP discharged: the staged rows land.
    // the mid-path :uuid row: the detail GET (6 segments) + the smart-mark
    // SINGLE tail (7 segments, deeper tails ride the row):
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers/00000000-0000-4000-8000-0000000000ff", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers/00000000-0000-4000-8000-0000000000ff/smart-mark", V2)).toBe(V2);
    // the query string is stripped before segmentation (the matcher law):
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers/00000000-0000-4000-8000-0000000000ff?state=PENDING", V2)).toBe(V2);
    // the batch LEAF row (a different literal tail — the prefix table):
    expect(v2SurfaceBase("/api/v1/teacher/marking/smart-mark-batch", V2)).toBe(V2);
    // the human-mark tail keeps flipping (its own row; also captured by the
    // :uuid row's deeper-tail semantics — same plane, harmless):
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers/00000000-0000-4000-8000-0000000000ff/human-mark", V2)).toBe(V2);
    // the row-grammar laws: bare /answers (5 segments < 6, zero emitters)
    // and malformed uuids STAY core (the 112 malformed-uuid class; the
    // captured 400-first laws govern at the origin):
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers", V2)).toBeNull();
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers/a-1", V2)).toBeNull();
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers/a-1/smart-mark", V2)).toBeNull();
    expect(v2SurfaceBase("/api/v1/teacher/marking/answers/not-even-uuid-ish", V2)).toBeNull();
    // the bare marking base stays core; the segment-safety law: the batch
    // tail never rides the :uuid row (different literal at segment 5):
    expect(v2SurfaceBase("/api/v1/teacher/marking", V2)).toBeNull();
    // no-regression needles: the 113 read rows + the 114 write row stand:
    expect(v2SurfaceBase("/api/v1/teacher/marking/queue-v2?state=PENDING&page=0&size=5", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/teacher/marking/throughput", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/teacher/marking/kappa/evaluate", V2)).toBe(V2);
    // partial-segment capture (smart-mark-batchx) is a startsWith MECHANISM
    // fact — DOCUMENTED INERT: no such route or emitter exists on either
    // side (the 111 review-queuex pin convention; asserted mechanically):
    expect("/api/v1/teacher/marking/smart-mark-batchx".startsWith("/api/v1/teacher/marking/smart-mark-batch")).toBe(true);
  });

  test("the T-MIG-097 line: the CLA ask flips after BOTH wires were proven live (r7a, chain order 1a119df7d930b609)", () => {
    // the ask path resolves to v2 (run-003 10/10 refusal dual-live + run-004
    // generation probe 200 answer-envelope of record)
    expect(v2SurfaceBase("/api/v1/learners/me/cla/ask", V2)).toBe(V2);
    // the rest of the /learners/me/cla subtree stays table-governed (none of
    // it is captured by this exact-path row). T-MIG-112 UPDATE of record:
    // classroom MOVED OUT of this list — its own row flipped (the 112 line
    // test); the shorter-segment sibling "/class" exemplifies the same
    // protection law (the classroom row cannot capture the cla family —
    // cla is SHORTER than classroom).
    for (const p of [
      "/api/v1/learners/me/cla",
      "/api/v1/learners/me/cla/other",
      "/api/v1/learners/me/class",
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

  test("the T-MIG-092 line: the tutor sessions tree flips (r0 rider; the ask pair's posture moved to the T-MIG-106 line)", () => {
    // every verified leg path of the run-003 matrix resolves to v2
    for (const p of [
      "/api/v1/tutor/sessions", // L01/L06/L13 list
      "/api/v1/tutor/sessions/latest", // L02/L07/L14
      "/api/v1/tutor/sessions/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab", // L03/L08/L11/L12 transcript/delete paths
    ]) {
      expect(v2SurfaceBase(p, V2)).toBe(V2);
    }
    // the LLM-bearing siblings: the 092 band's zero-key law RETIRED of record
    // (the keyed v2 serves real generations, run-005) — the pair flipped
    // declared-justified under the T-MIG-106 ruling (b); see the 106 line
    // below. The BARE /api/v1/tutor root stays core (no route, never captured).
    expect(v2SurfaceBase("/api/v1/tutor", V2)).toBeNull();
    // startsWith matching is prefix-string semantics (the same property every
    // row of the table has): a non-existent partial-segment sibling IS
    // captured by the string match — DOCUMENTED INERT (no route or hub
    // emitter named sessions* beyond the verified tree exists on either side)
    expect(v2SurfaceBase("/api/v1/tutor/sessionsxyz", V2)).toBe(V2);
    expect("/api/v1/tutor/sessionsxyz".startsWith("/api/v1/tutor/sessions")).toBe(true);
  });

  test("the T-MIG-106 line: the tutor ask pair flips declared-justified (r4b, operator ruling (b) trace 1a11c4b762f6043d)", () => {
    // BOTH pair surfaces resolve to v2 — ONE prefix row (the routing-
    // inseparability finding of record: /api/v1/tutor/ask captures /ask/stream
    // under startsWith AND under the mid-path deeper-tails-free law; no
    // exclusion form exists in either table — the flip unit is the PAIR).
    // Declared-justified class (GOLDEN_MASTER §4, the T-MIG-071 declared-case
    // convention): the stream pre-flight error classes serve v2's DESIGNED
    // 400/404 where the frozen core RUNTIME serves defect-shaped 500
    // internal_error (run-004 dual-live of record) — the corpus pins the
    // declared law (tutor-askstream-unauthed-401 / -blank-question-400 /
    // -unknown-session-404; zero justified-ledger entries — green on merits).
    for (const p of ["/api/v1/tutor/ask", "/api/v1/tutor/ask/stream"]) {
      expect(v2SurfaceBase(p, V2)).toBe(V2);
    }
    // the hub's blocking-ask emitter (tutorAsk, api.ts:1161) is live-routed;
    // the chat SSE path is core-hardwired by design (/api/ai/chat ->
    // coreStreamAuthorized — NOT table-routed; the hub-proxy seam)
    expect(apiPath("/api/v1/tutor/ask").startsWith(`${V2}/api/v1/`)).toBe(true);
    // the bare tutor root stays core
    expect(v2SurfaceBase("/api/v1/tutor", V2)).toBeNull();
    // startsWith matching is prefix-string semantics (the same property every
    // row of the table has): a non-existent partial-segment sibling IS
    // captured by the string match — DOCUMENTED INERT (no route or hub
    // emitter named ask* beyond the pair exists on either side)
    expect(v2SurfaceBase("/api/v1/tutor/askx", V2)).toBe(V2);
    expect("/api/v1/tutor/askx".startsWith("/api/v1/tutor/ask")).toBe(true);
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
    // (the T-MIG-100 line test below); the topics-write gap pin MOVED OUT at
    // the T-MIG-107 flip (the write subtrees; see the 107 line test) — the
    // bare parent stays core-pinned here
    for (const p of [
      "/api/v1/teacher/content", // the bare parent
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
    // the T-MIG-020/023 siblings: the bare parent stays core-pinned; the
    // topics-write family MOVED OUT (the T-MIG-107 flip closed CLASS B) and
    // the review-queue read sibling MOVED OUT in T-MIG-111 (the verified-trio
    // row; 8 corpus legs GREEN — the 111 line test pins the flip)
    for (const p of [
      "/api/v1/teacher/content",
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

  test("the T-MIG-107 line: the §7 review-workflow write subtrees flip after the widening's own golden-verify leg (r0, port owner)", () => {
    // GOLDEN-VERIFIED of record: run-001-capture-r0 (53 legs from a LOCAL
    // boot of the frozen core 6cad6ef per GOLDEN_MASTER §2 — the write-surface
    // procedure, never prod Neon) + run-002-golden-verify-r0 (53/53 replay vs
    // the booted v2 on a fresh local substrate — 50 byte-honest deep-equals +
    // 3 DECLARED-JUSTIFIED legs: the frozen core's Hibernate
    // LazyInitializationException 500s on scheme reject/flag(/unflag chain)
    // vs v2's DESIGNED law, the T-MIG-106 ruling (b) class) + 6 declared
    // corpus cases (golden/cases/content-write-*, tranche empty). PR #168
    // (merged d2308eb) had already made the 17 honest-501 shells REAL.
    for (const p of [
      // the exam-papers subtree: the 6 write verbs (legs 11-26 capture laws)
      "/api/v1/teacher/content/exam-papers/00000000-0000-4000-8000-0000000000c1/validate",
      "/api/v1/teacher/content/exam-papers/00000000-0000-4000-8000-0000000000c1/validate-all",
      "/api/v1/teacher/content/exam-papers/00000000-0000-4000-8000-0000000000c1/place",
      "/api/v1/teacher/content/exam-papers/00000000-0000-4000-8000-0000000000c1/reject",
      "/api/v1/teacher/content/exam-papers/00000000-0000-4000-8000-0000000000c1/flag",
      "/api/v1/teacher/content/exam-papers/00000000-0000-4000-8000-0000000000c1/unflag",
      // review/audit ride the subtree row (v2-real since #168, zero 501 stubs)
      "/api/v1/teacher/content/exam-papers/00000000-0000-4000-8000-0000000000c1/review",
      "/api/v1/teacher/content/exam-papers/00000000-0000-4000-8000-0000000000c1/audit",
      // the question-versions + mark-schemes subtrees (legs 27-44 capture laws)
      "/api/v1/teacher/content/question-versions/00000000-0000-4000-8000-0000000000c2/validate",
      "/api/v1/teacher/content/question-versions/00000000-0000-4000-8000-0000000000c2/unflag",
      "/api/v1/teacher/content/mark-schemes/00000000-0000-4000-8000-0000000000c3/validate",
      "/api/v1/teacher/content/mark-schemes/00000000-0000-4000-8000-0000000000c3/reject",
      // the topics family (legs 45-53: the 088 leg-08/09 laws + the
      // anchor-409 / rewrite / anchor-secondary-409 capture laws)
      "/api/v1/teacher/content/questions/40000000-0000-0000-0000-000000000001/topics",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBe(V2);
    }
    // the topics-write gap is CLOSED: the former core-null pin (the 088
    // leg-08/09 acceptance path) now routes to v2 — the 404-first/400 laws
    // verified on v2 by the same 53-leg leg
    expect(v2SurfaceBase("/api/v1/teacher/content/questions/00000000-0000-4000-8000-000000000025/topics", V2)).toBe(V2);
    // the bare parent + past-papers stay core (not this band's verified set;
    // the narrowest-legal-form discharge — the 107 comment in the api.ts
    // table). T-MIG-111 UPDATE of record: review-queue/-v2/-v3 + documents
    // MOVED OUT of this stay-core list — the corpus-verified widen band
    // flipped them (the trio row + the documents row; 24 corpus legs GREEN
    // incl. the captured 500 laws; zero hub emitters — the 090 availability
    // posture; the 111 line test pins both rows)
    for (const p of [
      "/api/v1/teacher/content",
      "/api/v1/teacher/content/past-papers",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBeNull();
    }
    // the trailing-slash row law: the bare segment WITHOUT a slash stays core
    // (no such route or hub emitter exists on either side — DOCUMENTED INERT)
    expect(v2SurfaceBase("/api/v1/teacher/content/exam-papers", V2)).toBeNull();
    // startsWith partial-segment capture (exam-papersx) is DOCUMENTED INERT
    expect(v2SurfaceBase("/api/v1/teacher/content/exam-papersx", V2)).toBeNull();
    expect(v2SurfaceBase("/api/v1/teacher/content/exam-papers/ep-1/validateAll", V2)).toBe(V2); // tail-insensitive prefix capture (startsWith), the same property every row has
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
    // THE GUARD (the flip law in string form) — T-MIG-112 UPDATE of record:
    // the guard INVERTED for the foundation tails — the classroom FOUNDATION
    // row (T-MIG-112, golden-verified of record via its own capture+verify
    // band) now captures EVERY /api/v1/teacher/classes** path (startsWith),
    // so the former stay-core pins all resolve V2 — every captured path is a
    // real v2 handler with a captured law (run-001/002/003). The mid-path
    // rows remain for grammar-governed routing; there is no observable
    // difference (both tables resolve v2 for the whole subtree).
    for (const p of [
      "/api/v1/teacher/classes", // the list + create (the foundation row)
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab", // bare detail (roster)
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/members",
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/members/st-1",
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/announcements",
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/status",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBe(V2);
    }
    // The :uuid wildcard law still binds the MID-PATH rows: malformed and
    // non-UUID class ids do NOT match a mid-path row — but they ARE captured
    // by the foundation PREFIX row (no UUID_RE guard on prefix rows), and
    // that is wire-safe of record: v2 serves the SAME captured 400-first
    // malformed law at the origin (run-001 L08 byte-equal; the 035 tree-pin
    // precedent). Non-row mid-path tails (partial-segment siblings) ride the
    // prefix row the same way — DOCUMENTED INERT where no route exists,
    // LAW-COVERED where one does (the subtree is fully captured).
    for (const p of [
      "/api/v1/teacher/classes/not-a-uuid/knowledge-graph",
      "/api/v1/teacher/classes/kn-1/knowledge-graph",
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/knowledge-graphx", // segment-exact mid-path: no match — the prefix row serves it
      "/api/v1/teacher/classes/3f2a1c6e-9b4d-4e8a-a7c1-52d9f0b3e7ab/coverageq",
    ]) {
      expect(v2SurfaceBase(p, V2)).toBe(V2);
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

  test("the /learners/me boundary: ans vs att stay disjoint rows (T-MIG-121 UPDATE: answer-input flipped by its OWN subtree row, never under attempts)", () => {
    expect("/api/v1/learners/me/answer-input/transcribe".startsWith("/api/v1/learners/me/attempts")).toBe(false);
    expect(v2SurfaceBase("/api/v1/learners/me/attempts?limit=5", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/learners/me/answer-input/transcribe", V2)).toBe(V2); // the B6 subtree row (the ruling (b) 08557d3)
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

describe("the T-MIG-120 line: the questions subtree flip (r0, operator order trace 1a1301057de38aa5)", () => {
  test("the five hub-emitted questions forms resolve v2; the exam-papers stay-core law stands (transcribe LEFT at the B6 flip — the 121 line test pins it)", () => {
    for (const p of [
      "/api/v1/questions?rootId=kn-1",
      "/api/v1/questions/families?rootId=kn-1",
      "/api/v1/questions/topics?rootId=kn-1",
      "/api/v1/questions/00000000-0000-4000-8000-0000000000q1",
      "/api/v1/questions/00000000-0000-4000-8000-0000000000q1/mark-scheme",
    ]) expect(v2SurfaceBase(p, V2)).toBe(V2);
    // the partial-segment property (shared string-matching semantics):
    // DOCUMENTED INERT — no route or hub emitter named /api/v1/questionsx
    // exists on either side (grep-verified at the band commit)
    expect(v2SurfaceBase("/api/v1/questionsx", V2)).toBe(V2);
    expect("/api/v1/questionsx".startsWith("/api/v1/questions")).toBe(true);
    // the no-regression needles: the B7-class stays-core laws stand
    // (T-MIG-121 UPDATE: the transcribe needle LEFT — the B6 row flipped)
    for (const p of [
      "/api/v1/exam-papers?subjectId=sub-1",
      "/api/v1/exam-papers/ep-1",
      "/api/v1/teacher/marking/answers", // the bare path stays core (zero emitters)
    ]) expect(v2SurfaceBase(p, V2)).toBeNull();
  });
});

describe("the T-MIG-121 line: the answer-input subtree flip — B6, the GLM seam (r0; the operator ruling (b) of record 08557d3 + the staging order trace 1a13159abe2bfcc1)", () => {
  test("the ink-pad transcribe form rides the B6 subtree row; the sibling + stay-core laws stand", () => {
    // the ONLY hub-emitted form under the subtree (transcribeHandwriting,
    // api.ts :1953; the call-sites answer-ink-pad.tsx :194 image/jpeg +
    // :246 image/png) resolves v2 under the bare subtree row (the 107
    // narrowest-legal form; the subtree is EXACTLY one tail deep on both
    // planes — the frozen TranscriptionController :27/:51 and the v2 mount
    // index.ts :340)
    expect(v2SurfaceBase("/api/v1/learners/me/answer-input/transcribe", V2)).toBe(V2);
    // the partial-segment property (shared string-matching semantics):
    // DOCUMENTED INERT — no route or hub emitter named answer-inputx or
    // answer-input-* exists on either side (grep-verified at the band commit)
    expect(v2SurfaceBase("/api/v1/learners/me/answer-inputx", V2)).toBe(V2);
    expect("/api/v1/learners/me/answer-inputx".startsWith("/api/v1/learners/me/answer-input")).toBe(true);
    // the ans-vs-att boundary property is retained: the B6 row captures no
    // attempts path; the bare /learners/me prefix stays FORBIDDEN (the 111
    // zero-key law)
    expect("/api/v1/learners/me/answer-input/transcribe".startsWith("/api/v1/learners/me/attempts")).toBe(false);
    // the stay-core needles: the B7 ruling class stands (7a6868a)
    for (const p of [
      "/api/v1/learners/me/intervention-runs", // the 096/110 law + the B7 ruling: stay-core stands
      "/api/v1/exam-papers?subjectId=sub-1", // the B7 ruling: dormant-core strand-in-place
    ]) expect(v2SurfaceBase(p, V2)).toBeNull();
  });
});

describe("the T-MIG-118 line: the tutor SSE hardwire re-point (r0, operator order trace 1a1301057de38aa5)", () => {
  test("the stream path resolves v2 under the 106 pair row; the route consults the table for BOTH arms", async () => {
    // the decision law: the 106 prefix row captures /ask AND /ask/stream,
    // so v2SurfaceBase resolves the stream path the chat route forwards to
    expect(v2SurfaceBase("/api/v1/tutor/ask/stream", V2)).toBe(V2);
    expect(v2SurfaceBase("/api/v1/tutor/ask", V2)).toBe(V2);
    // the retirement proof: the route's ALWAYS-ON upstream is the v2 arm
    // (v2StreamAuthorized — the line-against-line port's SSE contract) and
    // the core helpers appear ONLY as the pinned one-env-var rollback
    // fallback (the claAskFetch class) — a source pin, because the table
    // cannot see a route's hardwire
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(import.meta.dir, "../app/api/ai/chat/route.ts"),
      "utf8",
    );
    expect(src).toContain('const streamPath = "/api/v1/tutor/ask/stream";');
    expect(src).toContain("v2SurfaceBase(streamPath");
    expect(src).toContain('const askPath = "/api/v1/tutor/ask";');
    expect(src).toContain("v2SurfaceBase(askPath");
    expect(src).toContain("v2StreamAuthorized(");
    expect(src).toContain("coreStreamAuthorized("); // the rollback arm stays
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
