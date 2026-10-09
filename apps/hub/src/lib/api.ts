/**
 * SyllabAI API client.
 *
 * Routing:
 * - Production (Vercel): `NEXT_PUBLIC_API_BASE_URL` points at the Spring Boot
 *   service on Render (e.g. https://syllabai-core.onrender.com) — absolute URLs.
 * - Sandbox preview: relative URLs with `XTransformPort` query, which the Caddy
 *   gateway forwards to the Java backend on port 8080.
 *
 * The bearer token is kept in localStorage for the v0 pilot (httpOnly-cookie
 * hardening is tracked for Wave 4).
 *
 * Free-tier resilience (Render spins the core down after 15 min idle; a wake
 * is a full JVM + Spring boot):
 * - identical in-flight GETs are de-duplicated (one network round-trip);
 * - a GET that dies with a network error (the wake occasionally drops the
 *   first connection) is retried once before surfacing an error;
 * - requests slower than 3 s (and not preceded by a recent success) emit
 *   `syllabai:backend-waking` so the UI can say what is happening instead of
 *   spinning silently; every success emits `syllabai:backend-ok`;
 * - content GETs (subjects, tree, questions, papers) read through the
 *   localStorage cache in ./api-cache — repeat visits never wake the
 *   backend at all;
 * - `wakeBackend()` fires ONE unauthenticated health request per browser
 *   session when a human lands on the login screen, so the boot happens
 *   while they type credentials. It is a single request tied to a real page
 *   view — deliberately NOT a keep-alive pinger: pinging a free Render
 *   service on a timer to defeat spin-down violates their Terms of Service
 *   and risks account suspension.
 */
import { cachedGet, invalidateContentCache, singleFlight } from "./api-cache";
import type {
  AgendaView,
  CourseExamTargetView,
  ExamSeriesView,
  AttemptHistoryView,
  ClaAnswerView,
  CitationDocumentView,
  ClaMode,
  FlashcardRatingView,
  FlashcardRatingTrailView,
  FlashcardReviewScheduleView,
  TeacherAuditRowView,
  AuthResponse,
  AnswerMarkingView,
  AttemptResultView,
  ConceptGraphEdgesView,
  ConceptGraphSeedSummary,
  CourseStatsView,
  NoteVoteView,
  AssignmentRosterView,
  AssignmentSummaryView,
  AssignmentSubmissionView,
  AssignmentView,
  ExamPaperBrowseView,
  ExamPaperDetailView,
  HumanMarkView,
  KappaEvaluationView,
  LearnerAssignmentView,
  LearnerKnowledgeGraphView,
  LearnerStateView,
  NextBestActionsView,
  NodeView,
  PrerequisiteView,
  QuestionTopicTaxonomyView,
  SmartLessonView,
  SmartMarkView,
  SelfMarkView,
  SmartMarkAttemptView,
  SmartMarkFeedbackExplanation,
  SmartMarkImprovementPlan,
  StudentQuestionView,
  StructuredAttemptResultView,
  SubjectView,
  TeacherEnrichedReviewQueueView,
  TeacherEnrichedReviewQueueViewV3,
  TeacherFindingView,
  TeacherLearnerView,
  MarkingQueuePageView,
  MarkingQueueView,
  MarkingThroughputView,
  SmartMarkBatchView,
  TeacherPaperReviewView,
  TeacherPaperSummary,
  TeacherReviewQueueView,
  TeacherSchemeActionResult,
  TeacherTopicMappingResult,
  TeacherTopicRowView,
  TeacherValidateAllResult,
  TeacherVersionActionResult,
  ClassLearnerRow,
  ClassOverviewView,
  ClassTopicDrillDown,
  TestPreviewView,
  WeaknessOptionsView,
  TutorAnswerView,
  TutorHistoryTurn,
  TutorSessionCreated,
  TutorSessionSummary,
  TutorSessionView,
  RevisionNoteBodyView,
  RevisionNotesIndexView,
  MarkSchemeRevealView,
  LearnerAnnouncementView,
  LearnerClassroomView,
  TeacherAnnouncementView,
  TeacherClassDetailView,
  TeacherClassView,
  ClassKnowledgeGraphView,
  ClassNodeStudentsView,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";
/**
 * Strangler-fig surface routing (T-MIG-011, MIGRATION_PLAN §4.4).
 *
 * NEXT_PUBLIC_API_V2_BASE_URL is the bare origin of the syllabai-v2 api.
 * While the Java core keeps serving production, only the surface prefixes
 * listed in V2_SURFACE_PREFIXES route there — everything else keeps using
 * the legacy core base. Flipping a surface to v2 is therefore an env change
 * plus one prefix line, never a code rewrite; removing the env reverts the
 * whole app to the core in one redeploy (the rollback plan, §7).
 * Wave 1 enabled the identity surface once T-MIG-010's /api/v1/auth/** port
 * passed its golden gate on a branch deployment. T-MIG-037 (r8-hub) extends
 * the table with the now-verified W2 content/curriculum reads and the W3
 * attempts surfaces. The flip law is startsWith-safety: every prefix below
 * must capture ONLY hub-emitted paths the v2 api serves with REAL
 * implementations — anything stubbed (teacher write actions are honest 501s),
 * unmounted (learner /questions + /exam-papers await T-MIG-031 tranche-2)
 * or unported (every other /api/v1/learners/me/* surface, knowledge, tutor,
 * teacher classes/marking, W6 glm-ocr) stays on the legacy core so the hub
 * cannot route a live page into a 404/501. /api/v1/learners/me/attempts is
 * deliberately narrow: the v2 api mounts attempt history and self/smart-mark
 * under exactly that base, while 20+ sibling /api/v1/learners/me/* surfaces
 * are not ported yet. Each further surface flips as its own verified line.
 */
const API_V2_BASE = process.env.NEXT_PUBLIC_API_V2_BASE_URL?.replace(/\/$/, "") ?? "";
export const V2_SURFACE_PREFIXES: readonly string[] = [
  // Wave 1 (T-MIG-010/011) — identity
  "/api/v1/auth",
  // T-MIG-037 (r8-hub) — now-verified W2 reads + W3 attempts
  "/api/v1/content/documents", // T-MIG-005/020/022 reader (incl. F-1/F-2 repairs)
  "/api/v1/content/question-assets", // T-MIG-020 QuestionAssetController port
  "/api/v1/curriculum", // T-MIG-021 CurriculumController (learner) port
  "/api/v1/attempts", // T-MIG-030 AttemptController submit (+/structured)
  "/api/v1/learners/me/attempts", // T-MIG-030 history + T-MIG-032 self/smart-mark (NARROW — see above)
  // Wave S3 (T-MIG-082, r3a) — learner revision-notes: golden-verified of record
  // (run-002 captures d19289cc8 from the live frozen core 6cad6ef + run-003
  // local verify 7/7 vs the landed #132 mounts; operator trace 1a115288011d2475).
  // NARROW like attempts: only this family flips — sibling /learners/me/*
  // surfaces stay core until their own capture+verify legs land.
  "/api/v1/learners/me/revision-notes",
  // T-MIG-090 (r0 rider) — LLM chain-observability report: golden-verified of
  // record (run-005: the post-merge golden-verify leg 4/4 PASS at merged main
  // bd4eaeb vs the r4b wire truth golden-captures/t-mig-090/ legs 01-04 —
  // 401/403/403/200 status+body deep-equal, leg-04 raw wire byte-parity in the
  // pinned emission order; ruling4 §5 acceptance discharged). NARROWEST form:
  // the prefix is the single endpoint's exact path — true siblings stay core;
  // startsWith subpath/partial-segment capture is DOCUMENTED INERT (no such
  // routes or hub emitters exist on either side — pinned in the surface test).
  // startsWith-safety: NO hub page emits /api/v1/admin/** today (grep-verified
  // at the widening commit) — this line is ROUTING AVAILABILITY of record for
  // the verified surface, with zero live-page routing change; sibling
  // /api/v1/admin/** paths stay core until their own golden gates. The v2
  // answer is the ZERO-KEY fail-closed report of record (ruling4 §3):
  // chainAvailable honestly false with the report of what is missing — never a
  // 404/501, which is the failure mode the flip law exists to prevent.
  "/api/v1/admin/llm/chain-health",
  // T-MIG-092 (r0 rider, operator trace 1a11790a99a3cb19) — tutor SESSIONS
  // family: golden-verified of record (run-003: the post-fix 14-leg LLM-free
  // matrix ALL PASS on the live v2 deploy dpl_5VuNMyfq5vknZSEsMkyFrUCgmcbL
  // carrying the T-MIG-093 scalar-param IN fix a356a7d, vs the frozen core
  // 6cad6ef94 fixtures of run-001; receipts T-MIG-092/run-003 + T-MIG-093/
  // deploy-run-001). NARROW form: the prefix covers EXACTLY the verified
  // sessions surface tree (list/create/latest/transcript/delete — every leg
  // of the matrix) and does NOT capture /api/v1/tutor/ask or /ask/stream —
  // different path segments — which STAY CORE this band (v2 zero-key law:
  // generation-reaching asks would 503 tutor_unavailable on the dormant LLM
  // seam; the hub's ask/ask-stream emitters ride coreFetchAuthorized /
  // coreStreamAuthorized and keep their core routing). LLM-free law: the
  // sessions CRUD never reaches the LLM seam, so the flip is wire-safe.
  //
  // T-MIG-106 UPDATE of record: the STAY-CORE posture below for ask/ask-stream
  // was the 092 band's zero-key law — RETIRED of record (the keyed v2 serves
  // real generations, run-005); the pair flipped DECLARED-JUSTIFIED under the
  // operator ruling (b) trace 1a11c4b762f6043d (the 106 row at the table
  // tail). The chat SSE hub route stays core-hardwired (not table-routed).
  "/api/v1/tutor/sessions",
  // T-MIG-096 (r0 rider, operator trace 1a117ee8fb5b520d; RENUMBERED from
  // T-MIG-094 - ID yielded to r4b's kg-retriever card per house law) — the
  // learner-me HEART family, NARROW per-exact-subpath form. GOLDEN-VERIFIED of record
  // (run-001: 16/18 legs dual-replayed live core 6cad6ef94 vs the live v2
  // deploy dpl_5VuNMyfq5vknZSEsMkyFrUCgmcbL — receipt
  // .syllabai/receipts/T-MIG-094/run-001-golden-verify-r0.json). The two
  // FAIL legs are REAL first-field-error law deviations on the WRITE
  // surfaces (flashcard-ratings serves cardId-first vs the frozen
  // subtopicCode-first; note-votes noteId-first vs frozen vote-first) —
  // defect band T-MIG-095 owns them; those two paths STAY CORE until the
  // band closes and the legs re-verify live. A bare /api/v1/learners/me
  // prefix is FORBIDDEN by the zero-key law (it would capture cla/ask =
  // LLM 503) and would capture classroom/intervention/knowledge-graph —
  // hence one exact-subpath row per verified surface:
  //   /agenda (L01 200 / L02 404 root-law), /flashcard-rating-trail (L05
  //   200 keyset law), /flashcard-review-schedule (L07 200), /exam-series
  //   (L11 200), /assignments (L14 200 + L15 submission 400 wire),
  //   /state (L16 200 uuid/Instant-normalized deep-equal), /course-stats
  //   (L17 200), /courses (L12 404 slug law + L13 204 idempotent delete;
  //   zero hub emitters — routing availability per the 090 precedent).
  // recommendations stays CORE this band (400/404 wires verified; the 200
  // NBA-engine wire is not live-proven yet — disclosed, own follow-up).
  "/api/v1/learners/me/agenda",
  "/api/v1/learners/me/flashcard-rating-trail",
  "/api/v1/learners/me/flashcard-review-schedule",
  "/api/v1/learners/me/exam-series",
  "/api/v1/learners/me/assignments",
  "/api/v1/learners/me/state",
  "/api/v1/learners/me/course-stats",
  "/api/v1/learners/me/courses",
  // T-MIG-095 (r0 defect band, operator trace 1a119b4f3c6fc7d9 'start 095' +
  // 1a119de303c9e599 'desk merge -> deploy (093 recipe) -> live re-verify ->
  // expand flashcard ratings + note-votes') — the learner-me HEART WRITE
  // surfaces, the 096 linkage the band unblocked. Band CLOSED of record
  // (095 DONE 46536fd: rating/vote @NotBlank refine + classifier custom
  // branch + captured-law pins; the run-001 combo-law capture PROVED the
  // core's constraint-selection is request-level NONDETERMINISTIC whenever
  // >=2 constraints are violated, so the 096 L09/L10 'first-field' samples
  // were distribution draws — the deterministic REAL divergence was the
  // bare min(1) message + whitespace passing through to the service).
  // LIVE RE-VERIFY of record (run-002, post-deploy): the 31-leg dual-plane
  // matrix = 20/31 byte-agree, the 11 multi-violation legs ALL within the
  // captured class universe (membership law, 0 x 5xx), and the whitespace
  // discriminator legs serve 400 validation_failed 'rating|vote: must not be
  // blank' on the aliased tip deploy (i6gx4tvqp, built from fcbddc6 + the
  // 093-recipe shims; localgate 8/8 on the real Neon wire; cla/ask 097 law
  // + keyed tutor/ask 200 co-verified on the same alias). LLM-free law: the
  // two write surfaces never reach the LLM seam. NARROW per-exact-subpath
  // rows (bare /learners/me stays FORBIDDEN): the rows are proper prefixes
  // of NO other path (flashcard-ratings vs flashcard-rating-trail diverge at
  // the trailing 's' — segment-safe); note-votesx-style partial-segment
  // capture is DOCUMENTED INERT (no such route or hub emitter).
  "/api/v1/learners/me/flashcard-ratings",
  "/api/v1/learners/me/note-votes",
  // T-MIG-083 (r9-hubx rider) — admin revision-notes (ingest + status):
  // golden-verified of record (run-001: the 8-leg matrix 8/8 PASS on the local
  // scratch-Postgres boot of main 23c22e2 + the leg-04 wire repair, vs the r4b
  // wire truth golden-captures/t-mig-083/ captured from the frozen core
  // 6cad6ef local boot — 401/403/403/500/400/200/403/401 status+body
  // deep-equal; the gate FIRST found the leg-04 divergence: v2 answered the
  // part-less multipart bind with the sme.ts 400 while the core's @RequestPart
  // bind 500s through the unhandled catch-all — repaired in this rider, pinned
  // in the route tests; receipts T-MIG-083/run-001-verify). NARROW form: the
  // prefix covers exactly the two verified endpoints' family tree
  // (/ingest, /status) and NOTHING else; sibling /api/v1/admin/** stays core
  // until its own golden gates. startsWith-safety: NO hub page emits
  // /api/v1/admin/revision-notes today (grep-verified at the widening commit)
  // — this line is ROUTING AVAILABILITY of record with zero live-page routing
  // change (the T-MIG-090 precedent). LLM-free law: ingest/status never reach
  // the LLM seam; ingest write legs are fail-closed on the captured shapes
  // (part-less bind 500, non-package.json zip 400) — zero corpus mutation
  // reachable from the flipped surface without an admin-supplied valid zip.
  "/api/v1/admin/revision-notes",
  // T-MIG-084 (r4b rider, operator trace 1a119cd1c09507e5) — the GLOBAL
  // knowledge-tree family: GOLDEN-VERIFIED of record (run-002: 8/8 legs,
  // status+body deep-equal vs the r4b frozen-core 6cad6ef capture band
  // golden-captures/t-mig-084/ — 401 anon / 200 flat node / 200 PART_OF
  // tree (11 nodes) / 200 prerequisites [] / 200 misconceptions [] /
  // 404-first unknown / 400 malformed-UUID / 200 learner tree; scratch-PG
  // substrate seeded FROM the fixtures themselves (fake-UUID law, zero
  // remap); receipts T-MIG-084/run-002-golden-verify-r4b.json). NARROWEST
  // LEGAL FORM: /api/v1/knowledge/nodes is the ONLY segment family the hub
  // emits — the two request()-routed emitters (lib/api.ts knowledgeTree +
  // prerequisites) both live under /nodes/{id}, and the core-topics.ts tree
  // emitter rides fetchCoreJson (core-pinned, un-routed by this table;
  // citation-map's knowledge deepLink is a href mapper, never a fetch).
  // v2 serves EVERY /nodes/{id} shape with real implementations (flat node,
  // tree, prerequisites, misconceptions; malformed UUID -> the captured 400
  // leg-07 law BEFORE any sql; unknown -> the captured 404-first leg-06
  // law). Sibling paths outside /nodes stay core (no v2 mount, no hub
  // emitter). startsWith subpath capture is DOCUMENTED INERT (no nodesx
  // route or emitter exists on either side — pinned in the surface test).
  // Zero live-page routing change today: NO page call-sites exist for the
  // two dormant emitters (grep-verified at the widening commit) — ROUTING
  // AVAILABILITY of record, the T-MIG-090 posture. The hub's
  // includeMisconceptions=true tree form rides the SAME golden-verified
  // tree endpoint via the pinned Spring StringToBooleanConverter conversion
  // law (route-test x15; the fold is the V15 misconception family — never
  // LLM-reaching, so the zero-key law is unaffected). LLM-free law: the
  // whole family is read-only over the knowledge spine — no LLM seam, no
  // 404/501 failure mode (the flip law's target).
  "/api/v1/knowledge/nodes",
  // T-MIG-097 (r7a, operator chain order trace 1a119df7d930b609) — the CLA
  // ask surface: BOTH wires proven live of record. Refusal wire: run-003
  // 10/10 dual-live ALL PASS (9 deterministic byte-parity legs + L01 under
  // the declared first-field relaxation — the frozen core's multi-violation
  // order is NONDETERMINISTIC of record: run-001 sampled "question", run-003
  // sampled "mode"; the port pins the deterministic question-first choice,
  // GOLDEN_MASTER §5 declared-only) vs the LIVE core, at the redeployed
  // api-of-record dpl_Att7u carrying bc4ec31 (receipts T-MIG-097/run-003-*).
  // Generation wire: the run-004 rider probe — the live v2 served a real 200
  // answer-envelope (908 generated chars) on a learner-scoped KG_TOPIC
  // anchor with the #144 real-adapter chain + keys live, while the frozen
  // core 500'd the same ask (its legacy LLM path — the core is the retiring
  // surface; filed, not a v2 defect). NARROWEST form: the exact ask path
  // only; startsWith partial-segment capture (cla/askx) DOCUMENTED INERT
  // (no such route or emitter exists on either side — pinned in the surface
  // test). The hub emitter rides claAskFetch: table-governed, core fallback
  // whenever the v2 base is unset.
  "/api/v1/learners/me/cla/ask",
  // Wave S4 (T-MIG-085, r3a; reconciled onto the r4b 084 rider of record) —
  // teacher concept-graph: golden-verified of record (run-002-golden-verify-r3a,
  // PASS with ONE filed message-format class — non-blocking per the 081-class
  // precedent; receipt .syllabai/receipts/T-MIG-085/run-002-golden-verify-r3a.json
  // via PR #152) vs the r4b frozen-core 6cad6ef capture band
  // golden-captures/t-mig-085, on the lane-reproduced r4b scratch substrate
  // (PG 17.11 + pgvector, all 63 Flyway migrations, uuid-isomorphism compare
  // law, write legs executed on scratch only). Operator widen directive trace
  // 1a119d95d71fbce9 ("proceed with the widening PRs for the five verified
  // families"); wave-s4 was filed as PR #155 and superseded on the 084 leg by
  // the r4b rider — this row is the residual widening of record. T-MIG-083 of
  // the same verified five is NOT re-widened: its rider line above is already
  // of record (r9-hubx, 002a501/259746f) — the r3a run-002 083 receipt stands
  // as independent corroboration.
  //
  // /api/v1/teacher/concept-graph — family-exact form: activate + edges are
  // the ENTIRE teacherConceptGraphRoute (routes/teacher-kg.ts) and the hub's
  // only emitters under the base (lib/api.ts:1137/:1144 — the teacher
  // concept-graph page) — a live routing change for that page. TRUE siblings:
  // none (the router owns the base exclusively); the /api/v1/teacher/classes
  // subtree is a DIFFERENT route and stays core this band — the verified
  // class-KG/coverage families (T-MIG-086/087) are STRUCTURALLY NOT
  // PREFIX-ADDRESSABLE (their distinguishing segment sits after the {classId}
  // wildcard on a base shared with unverified class-management emitters,
  // lib/api.ts:881-923) — pinned in the surface-test CORE list of record with
  // the adjudication note (mid-path row form mechanism ask, PR #155).
  "/api/v1/teacher/concept-graph",
  // T-MIG-089 (r4b band rider, lane trace 1a119fc0f2824479) — the GLM-OCR
  // bridge family: GOLDEN-VERIFIED of record (run-002: 6/6 legs, status+body
  // deep-equal vs the r4b frozen-core 6cad6ef capture band
  // golden-captures/t-mig-089/ — 401 anon / 403 learner / the 500 catch-all
  // law on {} and on the all-null canonical body (the Jackson-wide binding
  // semantics, reproduced by the treeToValue-parity throw in
  // routes/ingestion.ts) / 404-first unknown paper under teacher AND admin
  // tokens; requests verbatim from the capture-driver.py definitions of
  // record; substrate = the surviving Task-33 scratch PG cluster with the
  // empty-content law asserted; receipts
  // T-MIG-089/run-002-golden-verify-r4b.json). NARROWEST LEGAL FORM: the
  // ONLY hub-emitted segment under this family is the paperFindings findings
  // row below (:1230-class) — the pairs POST is not hub-emitted; the PARENT
  // /api/v1/teacher/content tree (review-queue, exam-papers/*,
  // question-versions/*, mark-schemes/*, the topics-write honest-501 shells)
  // STAYS CORE (T-MIG-020/023 surfaces — pinned in the surface test; also
  // the 088 verify found the fetch parse-shape defect + the topics-write
  // coverage gap — T-MIG-100 — so the parent MUST NOT flip this band).
  // T-MIG-107 DISCHARGE NOTE: the parent STILL stays core, but the write
  // SUBTREES below it flipped in the 107 widening rider (PR #168 made them
  // real; the 53-leg golden-verify of record) — see the 107 rows at the
  // table tail.
  // Zero live-page routing change: paperFindings has ZERO page call-sites
  // (grep-verified at the widening commit) — ROUTING AVAILABILITY of record,
  // the T-MIG-090 posture. LLM-free law: the bridge is deterministic over
  // the sealed drafts — no LLM seam reachable.
  "/api/v1/teacher/content/glm-ocr",
  // T-MIG-100 (r0, the port owner's repair band, operator trace
  // 1a11b30a67f62ae9 'Continue') — the RoutingController read endpoints +
  // the exam-series import: REPAIRED and GOLDEN-VERIFIED of record (the
  // 22-leg replay, run-004: 088 legs 01-07 PASS incl. the CLASS A
  // parse-defect legs 05/06 — the empty-parse VIEW {empty:true,...} +
  // parseDefect:true, the Jackson record+isEmpty() wire law — and 091 ALL
  // 7 PASS incl. the CLASS C repeat legs 06/07 (the driver-coercion-safe
  // date law) — the two classes T-MIG-100 owns are CLOSED. The two
  // remaining 22-leg non-PASS legs are the topics-write 501 shells
  // (legs 08/09) = CLASS B, T-MIG-023 ownership — out of this band's scope
  // of record). NARROWEST LEGAL FORM: per-exact-endpoint rows — the PARENT
  // /api/v1/teacher/content STAYS CORE (the T-MIG-020/023 unverified
  // siblings: review-queue*, exam-papers/*, question-versions/*,
  // mark-schemes/*, the topics-write shells — pinned in the surface test);
  // the 089 row's "parent MUST NOT flip this band" widening condition is
  // hereby discharged for the verified endpoints only. T-MIG-107 DISCHARGE
  // NOTE: CLASS B (the topics-write shells) closed of record — PR #168 +
  // the 53-leg golden-verify — and the write SUBTREES flipped in the 107
  // widening rider (see the table tail); review-queue* and the bare parent
  // stay core. startsWith-safety:
  // the /enumerate row also captures /enumerate/structured (leg-04
  // verified, the same family tree); partial-segment capture
  // (fetchx/enumeratex) is DOCUMENTED INERT — no such route or hub emitter
  // exists on either side (pinned in the surface test). Zero live-page
  // routing change: NO hub page emits /api/v1/teacher/content/fetch,
  // /enumerate, or /api/v1/teacher/curriculum/exam-series today
  // (grep-verified at the widening commit) — ROUTING AVAILABILITY of
  // record, the 090/089 posture. LLM-free law: fetch/enumerate are the
  // frozen DETERMINISTIC bank-SQL paths (no vector calls); the import is
  // fail-closed reference data — no LLM seam reachable.
  "/api/v1/teacher/content/fetch",
  "/api/v1/teacher/content/enumerate",
  "/api/v1/teacher/curriculum/exam-series",
  // T-MIG-106 (r4b, operator ruling (b) trace 1a11c4b762f6043d
  // 'declare-justified (v2's designed laws; core 500s are the defect) and
  // flip both rows') — the tutor ASK family: the 092 zero-key blocker is
  // RETIRED of record (the LLM seam is KEYED — v2 serves real generations,
  // run-005 blocking ask 200 TutorAnswerView + the TUTOR-VERIFY run-002/002b
  // SSE event law proven on BOTH planes). GOLDEN-VERIFIED with ONE
  // DECLARED-JUSTIFIED divergence class (GOLDEN_MASTER §4, the T-MIG-071
  // declared-case convention; receipts T-MIG-092/run-004 + T-MIG-106/run-006):
  // the deterministic pre-flight legs serve byte-parity on unauthed 401 and
  // on the blocking twins (blank 400 / unknown-session 404), while the STREAM
  // pre-flight error classes serve the DESIGNED 400/404 on v2 vs the live
  // frozen core's 500 internal_error — the core-side stream-controller
  // pre-stream error-mapping DEFECT (its own BLOCKING controller maps the
  // identical classes correctly; the v2 port implemented the core SOURCE law,
  // TutorController.askStream :208-256). The declared law is pinned in the
  // corpus (tutor-askstream-unauthed-401 plain + -blank-question-400 /
  // -unknown-session-404 justified:true; the raw-bytes malformed leg is
  // receipt-only — not case-schema-expressible, disclosed in run-006).
  // FLIP UNIT = THE PAIR (the routing-inseparability finding of record): this
  // ONE prefix row captures BOTH /api/v1/tutor/ask AND /api/v1/tutor/ask/stream
  // under startsWith (and identically under the mid-path deeper-tails-free
  // law) — no exclusion form exists in either table; 'both rows' flipped.
  // LLM law: the flipped surface REACHES the LLM seam on v2 (keyed —
  // groq/gpt-oss-120b + openrouter failover; never a 503 tutor_unavailable,
  // the failure mode the flip law exists to prevent). Live routing change:
  // the hub's blocking-ask emitter (tutorAsk, api.ts:1161, the request()/
  // apiPath plane) now serves from v2; the chat SSE path stays core-hardwired
  // by design (apps/hub/src/app/api/ai/chat/route.ts coreStreamAuthorized —
  // NOT table-routed; the hub-proxy seam, T-MIG-094 territory).
  // Partial-segment capture (tutor/askx) DOCUMENTED INERT — no such route or
  // hub emitter exists on either side (pinned in the surface test).
  "/api/v1/tutor/ask",
  // T-MIG-107 (r0, the port owner's widening rider, operator trace
  // 1a11f7bc1d47fa31 'the write-row widening rides its own golden-verify leg
  // per the flip law') — the §7 review-WORKFLOW write family: PR #168 (merged
  // d2308eb) made the 17 honest-501 write routes REAL, and the widening's own
  // golden-verify leg verified them of record: 53 capture legs from a LOCAL
  // boot of the frozen core 6cad6ef (the GOLDEN_MASTER §2 write-surface
  // procedure — never prod Neon) replayed 53/53 against the booted v2 on a
  // fresh local substrate (run-001-capture-r0 + run-002-golden-verify-r0,
  // receipts .syllabai/receipts/T-MIG-107/) — 50 byte-honest deep-equals +
  // 3 DECLARED-JUSTIFIED legs (the T-MIG-106 ruling (b) class: the frozen
  // core 500s on a Hibernate LazyInitializationException session artifact in
  // reject/flag/unflag MarkScheme paths; v2 serves the DESIGNED law), plus 6
  // declared corpus cases (golden/cases/content-write-*, tranche empty).
  // NARROWEST LEGAL FORM: per-SUBTREE rows — the only row shape that can
  // capture the parametrized write verbs (/exam-papers/{id}/validate etc.)
  // under startsWith prefix matching. Each row captures ONLY hub-emitted
  // paths V2 serves with REAL implementations (the T-MIG-037 bar): the
  // question-versions/mark-schemes/questions subtrees are exactly the
  // verified families on both sides; the exam-papers subtree additionally
  // captures the review/audit GETs (hub-emitted, v2-real since the
  // ContentReviewService port — no 501 stubs remain anywhere under it). The
  // BARE PARENT /api/v1/teacher/content STAYS CORE (the review-queue* read
  // siblings stay core — not this band's verified set); documents/past-papers
  // are v2-served and verified but NOT hub-emitted (no rows — the 090/089
  // routing-availability posture). Partial-segment capture (exam-papersx) is
  // DOCUMENTED INERT — no such route or emitter exists on either side.
  "/api/v1/teacher/content/exam-papers/",
  "/api/v1/teacher/content/question-versions/",
  "/api/v1/teacher/content/mark-schemes/",
  "/api/v1/teacher/content/questions/",
];

/**
 * Mid-path row table (wave-s5, T-MIG-086/087) — the mechanism-A amendment of
 * record (r3a delegated ruling, operator trace 1a119eda53f9af4d, filed as PR
 * #155 comment 6053748307; the adjudication ask itself was filed with the
 * wave-s4 widening PR #155 and pinned in the surface-test CORE list before
 * any row landed).
 *
 * WHY mid-path rows exist: the class-scoped KG + coverage families are
 * golden-verified of record (run-002-golden-verify-r3a via PR #152 — 086
 * PASS-with-filed-ordering-class, ruled non-blocking per the 081-class
 * precedent; 087 ALL PASS 8/8) AND mounted real on v2 (routes/teacher-kg.ts
 * teacherClassesKgRoute) — but their distinguishing segment sits AFTER the
 * {classId} wildcard, on a base SHARED with the unverified class-management
 * emitters (list/detail/members/announcements/status, lib/api.ts:881-923).
 * No prefix row can express them: a broad row would route live class pages
 * into surfaces whose golden gates have not run — the exact failure the flip
 * law forbids. A mid-path row cannot capture those siblings: the tail
 * literal (knowledge-graph / coverage / learners) isolates them (the
 * management tails differ at the same segment positions), and bare-detail
 * or shorter paths fail the segment-count floor.
 *
 * ROW GRAMMAR (binding, pinned by test): segments are literals except ":uuid",
 * which matches exactly ONE path segment satisfying the UUID_RE law pinned in
 * the v2 api (routes/teacher-kg.ts:104 — the same regex behind the captured
 * 400-first malformed law, BEFORE any sql: teacher-kg.ts:156-158/:175; the
 * 084 leg-07 precedent class). Matching is segment-exact; path segments
 * beyond the row length are free (the same prefix-in-length semantics every
 * prefix row has — deeper verified-family tails ride the row). A malformed
 * {classId} does NOT match (stays core, where the same captured 400 law
 * governs at the origin) — the tightest wire-safe posture.
 *
 * Verified family coverage (run-002, golden-captures/t-mig-08{6,7}):
 * - /classes/:uuid/knowledge-graph        — 086 heatmap (leg-03/07) + node
 *                                           students (leg-04; deeper tail)
 * - /classes/:uuid/learners/:uuid/knowledge-graph — 086 learner-kg (leg-05)
 * - /classes/:uuid/coverage               — 087 list (leg-01..03/08) + mark
 *                                           (leg-04..06; POST subpath) +
 *                                           history (leg-07; deeper tail).
 *                                           Zero hub emitters — the 090
 *                                           routing-availability posture.
 */
export const V2_SURFACE_MIDPATH_PREFIXES: readonly string[] = [
  "/api/v1/teacher/classes/:uuid/knowledge-graph", // T-MIG-086: heatmap + node-students (verified legs 03/04/07)
  "/api/v1/teacher/classes/:uuid/learners/:uuid/knowledge-graph", // T-MIG-086: learner-kg (verified leg-05)
  "/api/v1/teacher/classes/:uuid/coverage", // T-MIG-087: list + mark + history (verified legs 01-08) — routing availability
];

const UUID_SEGMENT_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Segment-exact matcher for a mid-path row: every row segment must match the
 * path's corresponding segment (literals exactly; ":uuid" against the pinned
 * UUID shape); path segments beyond the row length are free. The query string
 * is stripped before segmentation. Trailing slashes and empty segments are
 * tolerated on both sides.
 */
function midPathPrefixMatches(row: string, path: string): boolean {
  const segs = path.split("?")[0].split("/").filter((s) => s.length > 0);
  const rowSegs = row.split("/").filter((s) => s.length > 0);
  if (segs.length < rowSegs.length) return false;
  return rowSegs.every((rs, i) => (rs === ":uuid" ? UUID_SEGMENT_RE.test(segs[i]) : rs === segs[i]));
}

/**
 * The pure strangler decision: which base serves `path` when the v2 api is
 * available at `v2Base`? Returns the v2 base (normalized: trailing slash and
 * a trailing /api/v1 are stripped, matching the operator-convention
 * tolerance below), or null when the path must stay on the legacy core
 * (env unset, or path outside the verified tables).
 * resolveBase delegates here — this is the single decision surface the
 * committed routing pins and the T-MIG-035-pattern live harness exercise.
 *
 * Mid-path evaluation (wave-s5, the mechanism-A amendment of record — r3a
 * ruling, operator trace 1a119eda53f9af4d, filed as PR #155 comment
 * 6053748307): the prefix table is evaluated FIRST and unchanged; only when
 * no prefix row matches do the mid-path rows get a chance. Segment-exact
 * matching eliminates the startsWith partial-segment capture class
 * (knowledge-graphx can never match the segment knowledge-graph), so a
 * mid-path row is strictly TIGHTER than any prefix row — the flip law's
 * no-unverified-surface-live guarantee is preserved with more precision.
 */
export function v2SurfaceBase(path: string, v2Base: string | undefined): string | null {
  const v2 = (v2Base ?? "").replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  if (!v2) return null;
  if (V2_SURFACE_PREFIXES.some((p) => path.startsWith(p))) return v2;
  if (V2_SURFACE_MIDPATH_PREFIXES.some((p) => midPathPrefixMatches(p, path))) return v2;
  return null;
}

function resolveBase(path: string): string {
  return v2SurfaceBase(path, API_V2_BASE) ?? API_BASE.replace(/\/api\/v1$/, "");
}

const TOKEN_KEY = "syllabai.token";
const USER_KEY = "syllabai.user";

export function apiPath(path: string): string {
  // path arrives like "/api/v1/auth/login" or ".../tree?includeMisconceptions=true".
  // The resolved base is documented as the bare API origin (e.g.
  // https://syllabai-core.onrender.com), but a trailing /api/v1 (as older
  // deployment notes described) must not double the prefix — normalize it
  // away so both operator conventions produce identical URLs.
  const base = resolveBase(path);
  return base
    ? `${base}${path}`
    : `${path}${path.includes("?") ? "&" : "?"}XTransformPort=8080`;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setSession(auth: AuthResponse) {
  window.localStorage.setItem(TOKEN_KEY, auth.accessToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function currentUser(): { id: string; email: string; displayName: string; roles: string[] } | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    // Shape-check, don't just parse: a truncated or old-schema payload that
    // still parses (a string, an object without roles) would otherwise flow
    // into auth.user.roles.some(...) and white-screen the app on every visit
    // until storage is cleared manually. A bad payload restores as no session.
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { id?: unknown }).id !== "string" ||
      typeof (parsed as { email?: unknown }).email !== "string" ||
      typeof (parsed as { displayName?: unknown }).displayName !== "string" ||
      !Array.isArray((parsed as { roles?: unknown }).roles) ||
      !(parsed as { roles: unknown[] }).roles.every((r) => typeof r === "string")
    ) {
      clearSession();
      return null;
    }
    return parsed as { id: string; email: string; displayName: string; roles: string[] };
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Honest degradation for AI-ask failures (session-136): when the backend's
 * LLM failover chain has no working provider (exhausted quota/credits, dead
 * key), every ask surfaces as a bare 500 "an internal error occurred" — a
 * string that tells a learner nothing. This maps 5xx asks to what is
 * actually true: AI generation is down server-side; everything else keeps
 * working. 4xx keeps the server's own message — those are honest by design
 * (404 unresolvable spec point, 409 attempt_required, 400 validation).
 */
export function aiAskErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status >= 500) {
    return "AI answers are temporarily unavailable on the server — your notes, practice and history all keep working. Please try asking again in a little while.";
  }
  return err instanceof ApiError && err.message ? err.message : fallback;
}

// ── backend-waking signals ─────────────────────────────────────────────
// A request >3 s with no success in the last 60 s is almost certainly a
// Render cold boot (or a network hiccup pretending to be one). The page
// subscribes to these events and shows an honest "waking up" banner
// instead of a silent spinner. Throttled so a slow burst of parallel boot
// calls cannot spam the UI.
const WAKING_EVENT = "syllabai:backend-waking";
const OK_EVENT = "syllabai:backend-ok";
const SLOW_AFTER_MS = 3_000;
const WAKE_EVENT_COOLDOWN_MS = 30_000;
const WARM_WINDOW_MS = 60_000;
let lastOkAt = 0;
let lastWakingEventAt = 0;

function fireWaking(): void {
  const now = Date.now();
  if (now - lastOkAt < WARM_WINDOW_MS) return; // recently warm — not a cold boot
  if (now - lastWakingEventAt < WAKE_EVENT_COOLDOWN_MS) return;
  lastWakingEventAt = now;
  window.dispatchEvent(new Event(WAKING_EVENT));
}

function fireOk(): void {
  lastOkAt = Date.now();
  window.dispatchEvent(new Event(OK_EVENT));
}

/**
 * ONE unauthenticated GET /actuator/health per browser session, fired when a
 * human being lands on the login screen. With the core's eager Spring init,
 * Tomcat only accepts connections after Flyway + Hibernate are up — so a
 * health response means the login POST that follows lands on a fully warm
 * server. Guarded by sessionStorage; failures swallowed by design. This is
 * user-triggered prefetch, NOT a keep-alive pinger (Render ToS: services
 * kept perpetually awake by uptime pingers risk suspension — do not turn
 * this into a timer).
 */
export function wakeBackend(): void {
  if (typeof window === "undefined") return;
  const GUARD = "syllabai.wake-pinged";
  try {
    if (sessionStorage.getItem(GUARD) === "1") return;
    sessionStorage.setItem(GUARD, "1");
  } catch {
    return; // storage blocked — skip the ping rather than risk repeats
  }
  void fetch(apiPath("/actuator/health"), { method: "GET", cache: "no-store" }).then(
    () => {
      lastOkAt = Date.now();
    },
    () => {
      /* the wake ping is best-effort; the login POST will trigger the boot anyway */
    },
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = apiPath(path);
  const isGet = !init?.method || init.method === "GET";
  // Identical in-flight GETs share one request (StrictMode double-mounts,
  // concurrent boot calls while the backend is cold).
  if (isGet) return singleFlight(url, () => doRequest<T>(path, url, init));
  return doRequest<T>(path, url, init);
}

async function doRequest<T>(path: string, url: string, init?: RequestInit): Promise<T> {
  const isGet = !init?.method || init.method === "GET";
  let wakingTimer: ReturnType<typeof setTimeout> | null = setTimeout(fireWaking, SLOW_AFTER_MS);

  // Headers are built per attempt so a retry re-reads the token (a 401 from
  // the first attempt may have just cleared the stale session).
  const go = () => {
    const h = new Headers(init?.headers);
    if (init?.body) h.set("Content-Type", "application/json");
    const t = getToken();
    if (t) h.set("Authorization", `Bearer ${t}`);
    return fetch(url, { ...init, headers: h });
  };

  let response: Response;
  try {
    try {
      response = await go();
    } catch (err) {
      // A cold Render instance sometimes resets the very first connection.
      // One retry for GETs before we surface an error to the user.
      if (!isGet || !(err instanceof TypeError)) throw err;
      await new Promise((r) => setTimeout(r, 1_200));
      response = await go();
    }
  } finally {
    if (wakingTimer) {
      clearTimeout(wakingTimer);
      wakingTimer = null;
    }
  }

  if (response.status === 401 && !path.startsWith("/api/v1/auth/")) {
    // an authenticated call lost its session (expired/invalid token) — clear and
    // tell the user to sign in again. NOT for /auth/* itself: a 401 there means
    // invalid credentials and must surface the backend's real message verbatim
    // (the pre-fix rewrite showed "Session expired" on a wrong-password login).
    clearSession();
    // Tell the app tree to drop every per-user read model and return to the
    // login screen (page.tsx listens) — clearing storage alone used to leave a
    // zombie logged-in UI that kept failing on every subsequent call.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("syllabai:session-expired"));
    }
    throw new ApiError(401, "Session expired — please sign in again.");
  }
  if (!response.ok) {
    // P3-1 (hub UI audit): the old bare "Request failed (404)" rendered on
    // teacher panels with no context and no next step. Status-aware fallback;
    // the server's own body.message still wins when it provides one.
    let message =
      response.status === 404
        ? "Request failed — the server returned 404 (not found). This data may not exist yet, or the backend was still waking up; please retry."
        : response.status >= 500
          ? `The server hit an error (HTTP ${response.status}) — please try again in a moment.`
          : `The request failed (HTTP ${response.status}) — please try again.`;
    try {
      const body = await response.json();
      if (body?.message) message = body.message;
    } catch {
      // keep default message
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) {
    fireOk();
    return undefined as T;
  }
  fireOk();
  return (await response.json()) as T;
}

/**
 * Revision-note diagram assets live behind the authenticated learner surface
 * (pilot-licensed corpus, LICENSE-DATA.md) — plain <img src> cannot carry the
 * bearer header, so assets are blob-fetched and cached as object URLs.
 */
const revisionAssetCache = new Map<string, Promise<string>>();

export function fetchRevisionNoteAsset(filename: string): Promise<string> {
  const cached = revisionAssetCache.get(filename);
  if (cached) return cached;
  const promise = (async () => {
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(
      apiPath(`/api/v1/learners/me/revision-notes/assets/${encodeURIComponent(filename)}`),
      { headers },
    );
    if (!response.ok) throw new ApiError(response.status, `Asset failed (${response.status})`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  })();
  revisionAssetCache.set(filename, promise);
  promise.catch(() => revisionAssetCache.delete(filename));
  return promise;
}

/**
 * Question diagram assets (SME corpus, ADR-026) — same authenticated-blob
 * pattern as revision-note assets, served from the question-asset endpoint
 * that ships with the corpus package.
 */
const questionAssetCache = new Map<string, Promise<string>>();

export function fetchQuestionAsset(filename: string): Promise<string> {
  const cached = questionAssetCache.get(filename);
  if (cached) return cached;
  const promise = (async () => {
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(
      apiPath(`/api/v1/content/question-assets/${encodeURIComponent(filename)}`),
      { headers },
    );
    if (!response.ok) throw new ApiError(response.status, `Asset failed (${response.status})`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  })();
  questionAssetCache.set(filename, promise);
  promise.catch(() => questionAssetCache.delete(filename));
  return promise;
}

/**
 * Teacher/content mutations that change what the serving gate exposes run
 * through this wrapper: on success, every cached content payload is dropped
 * so the next content GET re-fetches the post-validation truth.
 */
async function contentMutation<T>(path: string, init: RequestInit): Promise<T> {
  const result = await request<T>(path, init);
  invalidateContentCache();
  return result;
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (
    email: string,
    password: string,
    displayName: string,
    opts?: { role?: "TEACHER"; joinCode?: string },
  ) =>
    request<AuthResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        displayName,
        ...(opts?.role ? { role: opts.role } : {}),
        ...(opts?.joinCode ? { joinCode: opts.joinCode } : {}),
      }),
    }),

  // ── content GETs (cached, see ./api-cache): user-independent curriculum /
  // question / paper payloads behind the serving gate. A repeat visit serves
  // these from localStorage and never wakes the sleeping Render instance. ──

  subjects: () =>
    cachedGet<SubjectView[]>("subjects", () =>
      request<SubjectView[]>("/api/v1/curriculum/subjects"),
    ),

  knowledgeTree: (rootId: string, includeMisconceptions = true) =>
    cachedGet<NodeView>(`tree.${rootId}.${includeMisconceptions}`, () =>
      request<NodeView>(
        `/api/v1/knowledge/nodes/${rootId}/tree?includeMisconceptions=${includeMisconceptions}`,
      ),
    ),

  prerequisites: (nodeId: string) =>
    cachedGet<PrerequisiteView[]>(`prereq.${nodeId}`, () =>
      request<PrerequisiteView[]>(`/api/v1/knowledge/nodes/${nodeId}/prerequisites`),
    ),

  questions: (topicNodeId?: string, rootId?: string) => {
    // subject-scoped practice (pilot-readiness session-56): rootId narrows the
    // list to the subject's subtree so one subject's questions never surface
    // under another subject's workbench
    const params = new URLSearchParams();
    if (topicNodeId) params.set("topicNodeId", topicNodeId);
    else if (rootId) params.set("rootId", rootId);
    const qs = params.toString();
    const path = `/api/v1/questions${qs ? `?${qs}` : ""}`;
    return cachedGet<StudentQuestionView[]>(`questions.${topicNodeId ?? rootId ?? "all"}`, () =>
      request<StudentQuestionView[]>(path),
    );
  },

  // session-112: the servable-question taxonomy (sections → topics with
  // reachable counts) — drives the exam-questions sidebar and the practice
  // topic picker. Counts follow the same rule as the list itself.
  questionTaxonomy: (rootId?: string) =>
    request<QuestionTopicTaxonomyView>(
      `/api/v1/questions/topics${rootId ? `?rootId=${encodeURIComponent(rootId)}` : ""}`,
    ),

  submitAttempt: (body: {
    questionId: string;
    chosenOptionId: string;
    responseTimeMs: number;
    confidence: number | null;
    selfDoubtFlag: boolean;
    timedCondition: boolean;
  }) =>
    request<AttemptResultView>("/api/v1/attempts", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  submitStructuredAttempt: (body: {
    questionId: string;
    partAnswers: { partId: string; answerText: string }[];
    responseTimeMs: number;
    confidence: number | null;
    selfDoubtFlag: boolean;
    timedCondition: boolean;
  }) =>
    request<StructuredAttemptResultView>("/api/v1/attempts/structured", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // SME-style self-mark (ADR-026 practice tranche): reveal the validated
  // scheme, self-award every part in one shot. Single-shot by design — a
  // settled attempt (teacher- or self-marked) returns 409; self-marks are
  // recorded separately from teacher human marks so the κ sample stays
  // teacher-only.
  selfMarkAttempt: (
    attemptId: string,
    parts: { partId: string; marksAwarded: number }[],
    comment?: string | null,
  ) =>
    request<SelfMarkView>(
      `/api/v1/learners/me/attempts/${encodeURIComponent(attemptId)}/self-mark`,
      {
        method: "POST",
        body: JSON.stringify({ parts, comment: comment ?? null }),
      },
    ),

  learnerState: () => request<LearnerStateView>("/api/v1/learners/me/state"),

  // course-stats contract (ADR-029 tranche 4.11): full-trail coverage
  // aggregates — attempts volume + distinct questions/notes/cards. Fails
  // (rejects) on cores older than the contract; every consumer treats that
  // as "no account stats" and falls back to the local overlay silently.
  learnerCourseStats: () =>
    request<CourseStatsView>("/api/v1/learners/me/course-stats"),

  // Flashcard rating evidence (V47, ADR-029 tranche 4.4): one append-only
  // rating event per call, attributed to the deck's subtopic anchor — core
  // resolves the anchor against the curriculum and 404s an unknown one (the
  // caller degrades to local-only). Self-report: NEVER mastery on core.
  recordFlashcardRating: (body: {
    cardId: string;
    rating: "still-learning" | "know";
    subtopicCode: string;
  }) =>
    request<FlashcardRatingView>("/api/v1/learners/me/flashcard-ratings", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Flashcard review-schedule feed (T-C53, core ce0d7eb): the account-level
  // Ebbinghaus queue derived at READ from the append-only rating trail —
  // the core half of the deck queues' contract. TIMING ONLY (self-report,
  // never mastery; ADR-031 — computed at read, persisted nowhere). The
  // unified queue (lib/flashcard-unified.ts) unions this with the
  // device-local trail; every failure degrades to the device-local queue.
  flashcardReviewSchedule: () =>
    request<FlashcardReviewScheduleView>(
      "/api/v1/learners/me/flashcard-review-schedule",
    ),

  // Bounded raw rating trail (T-C61, core ADR-034): the learner's own
  // append-only V47 rows, newest first in keyset pages — the input for a
  // TRUE cross-device merge in lib/flashcard-unified.ts (the derived feed
  // above stays as the degradation rung). TIMING ONLY, never mastery; the
  // server clamps `limit`; `cursor` is opaque (walk until hasMore=false).
  flashcardRatingTrail: (params?: { limit?: number; cursor?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    const q = qs.toString();
    return request<FlashcardRatingTrailView>(
      "/api/v1/learners/me/flashcard-rating-trail" + (q ? `?${q}` : ""),
    );
  },

  // Note-vote evidence (V48, ADR-029 tranche 4.9): one append-only vote per
  // call, attributed to the note's subtopic anchor (same structural gate as
  // ratings — an unknown anchor 404s and the caller degrades to local-only).
  // Self-report: NEVER mastery on core, and never a content-quality verdict.
  recordNoteVote: (body: {
    noteId: string;
    /** the hub's local vocabulary — core maps up→helpful, down→not-helpful */
    vote: "up" | "down";
    subtopicCode: string;
  }) =>
    request<NoteVoteView>("/api/v1/learners/me/note-votes", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── Assignments (V49, ADR-029 tranche 4.10): the two-party workflow. The
  // teacher builds from the hub's real bank (assemble stays hub-side) and
  // registers the assignment on core; the learner hands in against it; the
  // teacher tracks REAL completion. Errors are surfaced, never mirrored to
  // localStorage — a hand-in that only reached one browser would be a lie.

  // Teacher: register an assembled assignment (fail-closed target validation
  // on core — every specRef must resolve to a curriculum-structure node).
  // classId (V51): target a specific class instead of the whole cohort —
  // null keeps the V49 default (every enabled student sees it).
  teacherCreateAssignment: (body: {
    title: string;
    courseSlug: string;
    courseLabel: string;
    specRefs: string[];
    marksTotal: number;
    questionCount: number;
    /** ISO-8601 instant */
    dueAt: string;
    classId?: string | null;
  }) =>
    request<AssignmentView>("/api/v1/teacher/assignments", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Teacher: newest-first list with real completion stats.
  teacherAssignments: () =>
    request<AssignmentSummaryView[]>("/api/v1/teacher/assignments"),

  // Teacher: the full roster for one assignment (every enabled student).
  teacherAssignmentRoster: (id: string) =>
    request<AssignmentRosterView>(`/api/v1/teacher/assignments/${id}`),

  // Teacher: lifecycle — close (no new hand-ins) or reopen.
  teacherSetAssignmentStatus: (id: string, status: "open" | "closed") =>
    request<AssignmentView>(`/api/v1/teacher/assignments/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  // Learner: newest-first assignments with my hand-in beside each.
  learnerAssignments: () =>
    request<LearnerAssignmentView[]>("/api/v1/learners/me/assignments"),

  // T-C78: the server-composed agenda read model (Spec §22 route) — the
  // "what is on my plate" view, due-soonest first. Called WITHOUT a rootId
  // here: actions stays null (the recommendations surface owns advice) and
  // due reviews already headline in the review-due strip — the dashboard
  // renders each block where it belongs, no second feed of either.
  learnerAgenda: () => request<AgendaView>("/api/v1/learners/me/agenda"),

  // ── Exam-series calendar (T-C79, ADR-035 D1 ruling): the IMPORTED
  // reference calendar + the learner's one bounded, optional target per
  // course. The learner picks a row id — they never type a date (the
  // rejected learner-entered-timetable option stays rejected). Cores older
  // than V62 404 these routes; consumers degrade to "no exam surface",
  // silently. Countdowns are derived at read on core (ADR-031) — nothing
  // here stores or recomputes them.
  learnerExamSeries: (qualification?: string) =>
    request<ExamSeriesView[]>(
      "/api/v1/learners/me/exam-series" +
        (qualification ? `?qualification=${encodeURIComponent(qualification)}` : ""),
    ),

  setExamSeriesTarget: (courseSlug: string, seriesId: string) =>
    request<CourseExamTargetView>(
      `/api/v1/learners/me/courses/${encodeURIComponent(courseSlug)}/target-series`,
      { method: "PUT", body: JSON.stringify({ seriesId }) },
    ),

  clearExamSeriesTarget: (courseSlug: string) =>
    request<void>(
      `/api/v1/learners/me/courses/${encodeURIComponent(courseSlug)}/target-series`,
      { method: "DELETE" },
    ),

  // Learner: append a hand-in (re-hand-in = new evidence, latest wins).
  submitAssignmentSubmission: (
    id: string,
    body: { questionsCompleted: number; score?: number | null },
  ) =>
    request<AssignmentSubmissionView>(
      `/api/v1/learners/me/assignments/${id}/submissions`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),

  // ── Classroom (V51, TFA-01 + TFA-02): the explicit class entity, class
  // membership, announcements, and the learner classroom overlay. Visibility
  // derives from membership rows ONLY — an independent student's reads come
  // back empty and the UI renders no classroom surface at all. Announcement
  // traffic is plain communication, never an AI path.

  // Teacher: create a class on one hub course.
  teacherCreateClass: (body: { courseSlug: string; courseLabel: string; name: string }) =>
    request<TeacherClassView>("/api/v1/teacher/classes", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Teacher: my classes, newest first, with live member counts.
  teacherClasses: () => request<TeacherClassView[]>("/api/v1/teacher/classes"),

  // Teacher: one class with its full roster.
  teacherClassDetail: (id: string) =>
    request<TeacherClassDetailView>(`/api/v1/teacher/classes/${id}`),

  // Teacher: enroll a registered student by email (idempotent on re-enroll).
  teacherClassEnroll: (id: string, body: { email: string }) =>
    request<TeacherClassDetailView>(`/api/v1/teacher/classes/${id}/members`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Teacher: remove a student from the class.
  teacherClassRemoveMember: (id: string, studentId: string) =>
    request<TeacherClassDetailView>(`/api/v1/teacher/classes/${id}/members/${studentId}`, {
      method: "DELETE",
    }),

  // Teacher: publish an announcement to the class (read counts start at 0).
  teacherPublishAnnouncement: (
    id: string,
    body: { title: string; body: string; category?: string },
  ) =>
    request<TeacherAnnouncementView>(`/api/v1/teacher/classes/${id}/announcements`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Teacher: the class's announcements with per-announcement read counts.
  teacherClassAnnouncements: (id: string) =>
    request<TeacherAnnouncementView[]>(`/api/v1/teacher/classes/${id}/announcements`),

  // Teacher: archive (or reopen) a class — archived classes refuse new
  // enrollment/publishing and drop out of the student overlay.
  teacherSetClassStatus: (id: string, status: "active" | "archived") =>
    request<TeacherClassView>(`/api/v1/teacher/classes/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  // Teacher: the F-072 class knowledge-graph heatmap — the curriculum
  // subtree with member-only §13.3 aggregation fused with the TFA-03
  // teaching-coverage overlay (§13.4). A pure read model; archived classes
  // stay readable.
  teacherClassKnowledgeGraph: (classId: string, rootId: string) =>
    request<ClassKnowledgeGraphView>(
      `/api/v1/teacher/classes/${classId}/knowledge-graph?rootId=${encodeURIComponent(rootId)}`,
    ),

  // Teacher, TFA-07 §13.5: one heatmap node's affected students — the
  // enabled-member roster at student grain (raw + effective mastery, band
  // vocabulary, misconceptions, bounded recent attempts). Member-only by
  // construction; unmeasured rows stay honestly null.
  teacherClassNodeStudents: (classId: string, rootId: string, nodeId: string) =>
    request<ClassNodeStudentsView>(
      `/api/v1/teacher/classes/${classId}/knowledge-graph/nodes/${nodeId}/students?rootId=${encodeURIComponent(rootId)}`,
    ),

  // Teacher, TFA-07 §14: ONE student's subject graph through the SAME F-034
  // read model the student sees — the backend gates it to enabled members of
  // this class (404 otherwise); the teacher lens adds no second graph.
  teacherClassLearnerKnowledgeGraph: (
    classId: string,
    learnerId: string,
    rootId: string,
  ) =>
    request<LearnerKnowledgeGraphView>(
      `/api/v1/teacher/classes/${classId}/learners/${learnerId}/knowledge-graph?rootId=${encodeURIComponent(rootId)}`,
    ),

  // Learner: my classroom overview — classes + flattened unread badge.
  // Empty for the independent student; that empty IS the honest state.
  learnerClassroom: () =>
    request<LearnerClassroomView>("/api/v1/learners/me/classroom"),

  // Learner: announcements across my live classes, with my read-state.
  learnerClassroomAnnouncements: () =>
    request<LearnerAnnouncementView[]>("/api/v1/learners/me/classroom/announcements"),

  // Learner: mark one announcement read (idempotent, membership-gated).
  markAnnouncementRead: (id: string) =>
    request<{ id: string; read: boolean }>(
      `/api/v1/learners/me/classroom/announcements/${id}/read`,
      { method: "POST" },
    ),

  // Attempt history (Review Hub minimal slice) — read-only view over the
  // learner's own attempts/answers evidence rows. Default limit 50 (max 100).
  learnerAttempts: (limit?: number) =>
    request<AttemptHistoryView>(
      `/api/v1/learners/me/attempts${limit ? `?limit=${limit}` : ""}`,
    ),

  // ── per-user read models: NEVER cached (must always reflect the learner's
  // live evidence) and never silently served stale. ──

  learnerKnowledgeGraph: (rootId: string) =>
    request<LearnerKnowledgeGraphView>(
      `/api/v1/learners/me/knowledge-graph?rootId=${encodeURIComponent(rootId)}`,
    ),

  // T-033: deterministic next-best-learning-action read model (Spec §22 route).
  // Advice derived from evidence — distinct from the /state measured facts.
  recommendations: (rootId: string) =>
    request<NextBestActionsView>(
      `/api/v1/learners/me/recommendations?rootId=${encodeURIComponent(rootId)}`,
    ),

  // Smart Lesson MVP (§2): one explainable next action for a topic. Re-query
  // after acting — new evidence changes the decision (closed loop).
  smartLesson: (rootId: string, topicNodeId: string) =>
    request<SmartLessonView>(
      `/api/v1/learners/me/smart-lesson?rootId=${encodeURIComponent(rootId)}&topicNodeId=${encodeURIComponent(topicNodeId)}`,
    ),

  // s139 working memory: the chat's prior turns ride the ask (client-held,
  // capped at the last 8 here — the server re-sanitizes at 12). Omitted/
  // empty behaves exactly like the pre-s139 single-turn ask. s140: an owned
  // sessionId persists the exchange to the §22 session store (omitted =
  // unpersisted ask, pre-s140 behavior).
  tutorAsk: (question: string, history?: TutorHistoryTurn[], sessionId?: string | null) =>
    request<TutorAnswerView>("/api/v1/tutor/ask", {
      method: "POST",
      body: JSON.stringify({
        question,
        history: history ?? [],
        ...(sessionId ? { sessionId } : {}),
      }),
    }),

  // s140 §22 session store: the sanctioned server-side transcript surface.
  // create starts a chat ("New chat" / first ask of a sitting); the id rides
  // subsequent asks so their turns persist; get hydrates after a refresh.
  tutorSessionCreate: () =>
    request<TutorSessionCreated>("/api/v1/tutor/sessions", { method: "POST" }),

  tutorSessionGet: (sessionId: string) =>
    request<TutorSessionView>(`/api/v1/tutor/sessions/${encodeURIComponent(sessionId)}`),

  // s143 conversation management: the learner's chats by recency (title +
  // turn count summaries — transcripts stay a per-chat fetch), and delete
  // for their own chat. A foreign/deleted id 404s server-side like an
  // unknown one.
  tutorSessionList: () =>
    request<TutorSessionSummary[]>("/api/v1/tutor/sessions"),

  tutorSessionDelete: (sessionId: string) =>
    request<void>(`/api/v1/tutor/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    }),

  // CLA (contract §2–§7): the context + mode are explicit and server-resolved
  // (fail-closed 404 on anything unvalidated/foreign); CHECK pre-attempt is a
  // deterministic 409 attempt_required the UI renders as guidance.
  claAsk: (body: {
    kind:
      | "KG_TOPIC"
      | "PAST_PAPER_QUESTION"
      | "QUESTION_PART"
      | "SPECIFICATION_POINT"
      | "SMART_LESSON"
      | "NOTE_SECTION";
    rootId?: string;
    topicNodeId?: string;
    questionId?: string;
    partId?: string;
    specCode?: string;
    noteId?: string;
    mode: ClaMode;
    question: string;
  }) =>
    request<ClaAnswerView>("/api/v1/learners/me/cla/ask", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** F-022 citation drill-in: the learner-readable citation document —
   *  header shape without page, verbatim page text with it. Core enforces
   *  the corpus law (existsCitable): non-citable rows are an honest 404,
   *  byte-identical to unknown-id — the UI copy must not pretend to know
   *  which. */
  citationDocument: (id: string, page?: number) =>
    request<CitationDocumentView>(
      `/api/v1/content/documents/${encodeURIComponent(id)}${page ? `?page=${page}` : ""}`,
    ),

  // ── T-029 teacher review surface (route security: TEACHER or ADMIN on the
  // backend; the role check in the UI is an affordance, never authorization) ──
  teacherLearners: () => request<TeacherLearnerView[]>("/api/v1/teacher/learners"),

  markingQueue: (state: string) =>
    request<AnswerMarkingView[]>(`/api/v1/teacher/marking/answers?state=${state}`),

  /** sprint-2 §6/§7: the deterministic paper-grouped queue with mark→next links */
  markingQueueV2: (state: string) =>
    request<MarkingQueueView>(`/api/v1/teacher/marking/queue-v2?state=${state}`),

  // G-5: opt-in paper-group pagination — the paged envelope ONLY when page/size
  // are present; without them the full view above is returned (compatibility)
  markingQueueV2Page: (state: string, page: number, size: number) =>
    request<MarkingQueuePageView>(
      `/api/v1/teacher/marking/queue-v2?state=${state}&page=${page}&size=${size}`,
    ),

  /** sprint-2 §6: throughput metrics — counts of what happened */
  markingThroughput: () =>
    request<MarkingThroughputView>("/api/v1/teacher/marking/throughput"),

  /** sprint-2 §6: bounded Smart Mark batch (partial success preserved) */
  smartMarkBatch: (answerIds: string[]) =>
    request<SmartMarkBatchView>("/api/v1/teacher/marking/smart-mark-batch", {
      method: "POST",
      body: JSON.stringify({ answerIds }),
    }),

  markingAnswer: (answerId: string) =>
    request<AnswerMarkingView>(`/api/v1/teacher/marking/answers/${answerId}`),

  runSmartMark: (answerId: string) =>
    request<SmartMarkView>(`/api/v1/teacher/marking/answers/${answerId}/smart-mark`, {
      method: "POST",
    }),

  recordHumanMark: (
    answerId: string,
    body: {
      marksAwarded: number;
      perPointDecisions: Record<string, number> | null;
      comments: string | null;
    },
  ) =>
    request<HumanMarkView>(`/api/v1/teacher/marking/answers/${answerId}/human-mark`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  kappaLatest: (paperId?: string) =>
    request<KappaEvaluationView>(
      `/api/v1/teacher/marking/kappa/latest${paperId ? `?paperId=${paperId}` : ""}`,
    ),

  evaluateKappa: (paperId?: string) =>
    request<KappaEvaluationView>("/api/v1/teacher/marking/kappa/evaluate", {
      method: "POST",
      body: JSON.stringify(paperId ? { paperId } : {}),
    }),

  conceptGraphActivate: () =>
    contentMutation<ConceptGraphSeedSummary>(
      "/api/v1/teacher/concept-graph/activate",
      { method: "POST" },
    ),

  conceptGraphEdges: (rootId: string) =>
    cachedGet<ConceptGraphEdgesView>(`concept-edges.${rootId}`, () =>
      request<ConceptGraphEdgesView>(
        `/api/v1/teacher/concept-graph/edges?rootId=${encodeURIComponent(rootId)}`,
      ),
    ),

  // ── P9 Test Builder (route security: TEACHER or ADMIN) ──

  testBuilderPreview: (
    rootId: string,
    topicNodeIds: string[],
    maxQuestions?: number,
    targetMarks?: number,
    includeAnswers = false,
  ) => {
    const params = new URLSearchParams();
    params.set("rootId", rootId);
    if (topicNodeIds.length) params.set("topicNodeIds", topicNodeIds.join(","));
    if (maxQuestions) params.set("maxQuestions", String(maxQuestions));
    if (targetMarks) params.set("targetMarks", String(targetMarks));
    if (includeAnswers) params.set("includeAnswers", "true");
    return request<TestPreviewView>(`/api/v1/teacher/tests/preview?${params}`);
  },

  /** sprint-2 §10: class-weakness targeting options (read-only class evidence) */
  testBuilderWeaknessOptions: (rootId: string) =>
    request<WeaknessOptionsView>(
      `/api/v1/teacher/tests/weakness-options?rootId=${encodeURIComponent(rootId)}`,
    ),

  // ── Teacher class intelligence (sprint 2 §2–§5; route security: TEACHER or
  // ADMIN; read-only aggregations over the existing learner-model tables) ──

  classOverview: (rootId: string) =>
    request<ClassOverviewView>(
      `/api/v1/teacher/class/overview?rootId=${encodeURIComponent(rootId)}`,
    ),

  classLearners: (rootId: string) =>
    request<ClassLearnerRow[]>(
      `/api/v1/teacher/class/learners?rootId=${encodeURIComponent(rootId)}`,
    ),

  classTopicDrillDown: (rootId: string, nodeId: string) =>
    request<ClassTopicDrillDown>(
      `/api/v1/teacher/class/topics/${nodeId}/drill-down?rootId=${encodeURIComponent(rootId)}`,
    ),

  // ── teacher content validation (Master Spec §7: SUGGESTED never serves) ──
  // Mutations run through contentMutation → cache invalidation on success;
  // the review queues themselves stay live (they reflect DB state the
  // teacher is actively working through).

  contentReviewQueue: () =>
    request<TeacherReviewQueueView>("/api/v1/teacher/content/review-queue"),

  paperReview: (paperId: string) =>
    request<TeacherPaperReviewView>(
      `/api/v1/teacher/content/exam-papers/${paperId}/review`,
    ),

  validatePaper: (paperId: string) =>
    contentMutation<TeacherPaperSummary>(
      `/api/v1/teacher/content/exam-papers/${paperId}/validate`,
      { method: "POST" },
    ),

  placePaper: (paperId: string, subjectId: string) =>
    contentMutation<TeacherPaperSummary>(
      `/api/v1/teacher/content/exam-papers/${paperId}/place`,
      { method: "POST", body: JSON.stringify({ subjectId }) },
    ),

  rejectPaper: (paperId: string) =>
    contentMutation<TeacherPaperSummary>(
      `/api/v1/teacher/content/exam-papers/${paperId}/reject`,
      { method: "POST" },
    ),

  validateQuestionVersion: (versionId: string) =>
    contentMutation<TeacherVersionActionResult>(
      `/api/v1/teacher/content/question-versions/${versionId}/validate`,
      { method: "POST" },
    ),

  rejectQuestionVersion: (versionId: string) =>
    contentMutation<TeacherVersionActionResult>(
      `/api/v1/teacher/content/question-versions/${versionId}/reject`,
      { method: "POST" },
    ),

  validateMarkScheme: (schemeId: string) =>
    contentMutation<TeacherSchemeActionResult>(
      `/api/v1/teacher/content/mark-schemes/${schemeId}/validate`,
      { method: "POST", body: JSON.stringify({}) },
    ),

  rejectMarkScheme: (schemeId: string) =>
    contentMutation<TeacherSchemeActionResult>(
      `/api/v1/teacher/content/mark-schemes/${schemeId}/reject`,
      { method: "POST" },
    ),

  // ── V20 high-throughput review: enriched queue, batch validate, flag/unflag, findings ──

  contentReviewQueueV2: () =>
    request<TeacherEnrichedReviewQueueView>(
      "/api/v1/teacher/content/review-queue-v2",
    ),

  /** sprint-2 §7: queue intelligence — §7 signals + rank reasons */
  contentReviewQueueV3: () =>
    request<TeacherEnrichedReviewQueueViewV3>(
      "/api/v1/teacher/content/review-queue-v3",
    ),

  validateAllForPaper: (paperId: string, force = false) =>
    contentMutation<TeacherValidateAllResult>(
      `/api/v1/teacher/content/exam-papers/${paperId}/validate-all${force ? "?force=true" : ""}`,
      { method: "POST" },
    ),

  // V22: durable audit history for a paper and everything under it
  paperAudit: (paperId: string) =>
    request<TeacherAuditRowView[]>(
      `/api/v1/teacher/content/exam-papers/${paperId}/audit`,
    ),

  paperFindings: (paperId: string) =>
    request<TeacherFindingView[]>(
      `/api/v1/teacher/content/glm-ocr/papers/${paperId}/findings`,
    ),

  flagPaper: (paperId: string) =>
    contentMutation<TeacherPaperSummary>(
      `/api/v1/teacher/content/exam-papers/${paperId}/flag`,
      { method: "POST" },
    ),

  unflagPaper: (paperId: string) =>
    contentMutation<TeacherPaperSummary>(
      `/api/v1/teacher/content/exam-papers/${paperId}/unflag`,
      { method: "POST" },
    ),

  flagQuestionVersion: (versionId: string) =>
    contentMutation<TeacherVersionActionResult>(
      `/api/v1/teacher/content/question-versions/${versionId}/flag`,
      { method: "POST" },
    ),

  unflagQuestionVersion: (versionId: string) =>
    contentMutation<TeacherVersionActionResult>(
      `/api/v1/teacher/content/question-versions/${versionId}/unflag`,
      { method: "POST" },
    ),

  flagMarkScheme: (schemeId: string) =>
    contentMutation<TeacherSchemeActionResult>(
      `/api/v1/teacher/content/mark-schemes/${schemeId}/flag`,
      { method: "POST" },
    ),

  unflagMarkScheme: (schemeId: string) =>
    contentMutation<TeacherSchemeActionResult>(
      `/api/v1/teacher/content/mark-schemes/${schemeId}/unflag`,
      { method: "POST" },
    ),

  // ── §10 topic mapping: ingestion anchors -> real curriculum topics ──

  mapQuestionTopics: (questionId: string, primaryNodeId: string, secondaryNodeIds: string[] = []) =>
    contentMutation<TeacherTopicMappingResult>(
      `/api/v1/teacher/content/questions/${questionId}/topics`,
      { method: "POST", body: JSON.stringify({ primaryNodeId, secondaryNodeIds }) },
    ),

  questionTopicRows: (questionId: string) =>
    request<TeacherTopicRowView[]>(
      `/api/v1/teacher/content/questions/${questionId}/topics`,
    ),

  // ── exam papers (learner browsing; content stays behind the serving gate) ──

  examPapers: (subjectId?: string) =>
    cachedGet<ExamPaperBrowseView[]>(`papers.${subjectId ?? "all"}`, () =>
      request<ExamPaperBrowseView[]>(
        `/api/v1/exam-papers${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ""}`,
      ),
    ),

  examPaper: (paperId: string) =>
    cachedGet<ExamPaperDetailView>(`paper.${paperId}`, () =>
      request<ExamPaperDetailView>(`/api/v1/exam-papers/${paperId}`),
    ),

  // single servable question with its parts (404 when not servable — the
  // same gate the practice list applies). Live, not cached: the exam player
  // fetches on demand and single-flight already de-dupes concurrent fetches.
  question: (id: string) =>
    request<StudentQuestionView>(`/api/v1/questions/${id}`),

  // SME-style mark-scheme reveal (Master Spec §15/§20/§22, policy-gated):
  // 200 = the reveal policy serves the scheme; 204 = withheld (pending
  // teacher validation under VALIDATED_ONLY, or rejected/flagged) which
  // request() maps to undefined so the UI can say so honestly.
  markScheme: (questionId: string) =>
    request<MarkSchemeRevealView | undefined>(
      `/api/v1/questions/${encodeURIComponent(questionId)}/mark-scheme`,
    ),

  // ── student Smart Mark (F-047 learner half) — button-driven, never a chat
  // box: the marking run and the two feedback actions take no request body,
  // grounding is resolved server-side from opaque ids. 409 = pre-settlement
  // only (self/teacher mark already settled) or scheme pending validation.
  smartMarkAttempt: (attemptId: string) =>
    request<SmartMarkAttemptView>(
      `/api/v1/learners/me/attempts/${encodeURIComponent(attemptId)}/smart-mark`,
      { method: "POST" },
    ),

  explainSmartFeedback: (attemptId: string, partId: string) =>
    request<SmartMarkFeedbackExplanation>(
      `/api/v1/learners/me/attempts/${encodeURIComponent(attemptId)}/parts/${encodeURIComponent(partId)}/feedback-explanation`,
      { method: "POST" },
    ),

  smartImprovementPlan: (attemptId: string, partId: string) =>
    request<SmartMarkImprovementPlan>(
      `/api/v1/learners/me/attempts/${encodeURIComponent(attemptId)}/parts/${encodeURIComponent(partId)}/improvement-plan`,
      { method: "POST" },
    ),

  // ── revision notes (SME-style corpus, learner-scoped, authenticated-only) ──

  revisionNotes: () =>
    request<RevisionNotesIndexView>("/api/v1/learners/me/revision-notes"),

  revisionNote: (noteId: string) =>
    request<RevisionNoteBodyView>(
      `/api/v1/learners/me/revision-notes/${encodeURIComponent(noteId)}`,
    ),

  markRevisionNoteViewed: (noteId: string) =>
    request<void>(`/api/v1/learners/me/revision-notes/progress/views`, {
      method: "POST",
      body: JSON.stringify({ noteId }),
    }),

  // ── answer-input transcription (HUB-ANSWER-BOX wave 3) ──────────────────
  // The learner's ink pad / photo is read by the core's vision-capable chain
  // member and returned as PLAIN TEXT (Unicode math + linear notation — the
  // answer format contract is unchanged). The image itself is never stored;
  // nothing persists until the learner's own autosave carries the text.

  transcribeHandwriting: (imageBase64: string, mimeType: string) =>
    request<HandwritingTranscription>("/api/v1/learners/me/answer-input/transcribe", {
      method: "POST",
      body: JSON.stringify({ imageBase64, mimeType }),
    }),
};

export type HandwritingTranscription = {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
};
