/**
 * syllabai-v2 api — the TypeScript port target of the frozen Java core.
 *
 * Entry contract with the frozen world (docs/GOLDEN_MASTER.md):
 *   - Path parity: routes mirror the Java core's paths — /actuator/health,
 *     /api/v1/auth/** (AuthController.java:25 @RequestMapping). The seed's
 *     "/api/auth" mount was a path-parity bug; corrected with T-MIG-010.
 *   - Fail fast: missing secrets abort boot (src/env.ts + identity wiring) —
 *     inherited verbatim from the Java core's boot discipline.
 *
 * ⚠️ OUT-OF-FENCE COMMIT (T-MIG-016, R0 ratification requested; task
 * renumbered from T-MIG-014 at push time — ID yielded to PR #13):
 * T-MIG-016's scope.allowed covers middleware/ratelimit.ts,
 * services/identity/config.ts (ratelimit block), test/ratelimit/** — NOT this
 * file. The single change here is the minimal mount wiring the ported filter
 * needs, disclosed for R0 ratification at review (T-MIG-010 convention):
 *   6. mount the per-IP RateLimitFilter (deep-audit M1) app-wide AFTER the
 *      Bearer middleware (SecurityConfig.java:96-99 addFilterAfter
 *      JwtAuthenticationFilter — the LLM tier keys on the learner identity
 *      the auth pass resolved) and BEFORE the routers.
 *
 * ⚠️ OUT-OF-FENCE COMMIT (T-MIG-010, R0 ratification requested):
 * T-MIG-010's scope.allowed covers routes/auth/**, middleware/**,
 * services/identity/**, test/identity/** — NOT this file. The changes here
 * are the minimal app-level wiring the ported module needs, shipped as a
 * separate commit so R0 can ratify or lift them out at review:
 *   1. mount "/api/v1/auth" (path parity, was "/api/auth")
 *   2. app-wide Bearer middleware + require-auth for /api/v1/** before the
 *      404 fallthrough (anyRequest().authenticated() parity — an unknown
 *      /api/v1 path must 401 when anonymous, 404 when authenticated)
 *   3. onError maps identity-domain errors to the ApiError shape and the
 *      catch-all to the core's internal_error body
 *   4. CORS preflight handling (SecurityConfig corsConfigurationSource parity)
 *   5. dev server start guarded by import.meta.main (bun test imports this
 *      module; it must not bind :8080 under the test runner)
 *
 * Deployment: Vercel (this module's default export is the fetch handler);
 * locally run `bun run dev:api` at the repo root.
 */
import { Hono } from "hono";
import { healthRoute } from "./routes/health";
import { buildIdentityApp } from "./services/identity";
import { RateLimitFilter } from "./middleware/ratelimit";
import { buildContentApp } from "./services/content";
import { buildCurriculumRouters } from "./routes/curriculum";
import { buildAssessmentRouters } from "./routes/assessment";
import { buildSelfMarkRouters } from "./routes/selfmark";
import { buildSmartMarkRouters } from "./routes/smartmark";
import { buildCronRouters } from "./routes/cron";
import { buildQuestionsRouters } from "./routes/questions";
import { buildExamPapersRouters } from "./routes/exam-papers";
import { buildPaperRegionsRouters } from "./routes/paper-regions";
import { buildPaperAwardsRouters } from "./routes/paper-awards";
import { buildLearnerPdfDrawingsRouters } from "./routes/learner/pdf-drawings"; // T-MG-INK-1 (r0) — the annotation-ink persistence plane (v2-native, additive; the T-SENECA-001 one-import-line precedent)
import { buildTestBuilderRouters } from "./routes/testbuilder";
import { buildAnswerInputRouters } from "./routes/answer-input";
import { buildTeacherMarkingRouters } from "./routes/teachermarking";
import { buildSmeRouters } from "./routes/sme";
import { buildInterventionRouters } from "./routes/intervention";
import { buildLearnerRouters } from "./routes/learner";
import { buildLearnerProgressRouters } from "./routes/learner/progress";
import { buildLearnerStudyPlanRouters } from "./routes/learner/study-plan";
import { buildDrillRouters, drillErrorResponse } from "./routes/drill";
import { buildClassroomRouters } from "./routes/classroom";
import { buildTeacherAssignmentsRouters } from "./routes/assignments";
import { buildAssignmentPacksRouters } from "./routes/assignment-packs"; // T-SENECA-001 (r5) — the Seneca resource packs (v2-native, additive; the T-TEACH-012 one-mount-line precedent)
import { buildTeachingToolkitRouters } from "./routes/teaching-toolkit";
import { buildResearchRouters } from "./routes/research";
import { buildIngestionRouters } from "./routes/ingestion";
import { buildBooksApp } from "./services/books";
import { createBooksRouter } from "./routes/books";
import { buildLlmAdminRouters } from "./routes/llmadmin";
import { buildLearnerMeRouters } from "./routes/learnerme";
import { buildLearnerKgRouters } from "./routes/learnerkg";
import { buildRevisionNotesRouters } from "./routes/revision-notes";
import { buildKnowledgeRouters } from "./routes/knowledge";
import { buildTeacherKgRouters } from "./routes/teacher-kg";
import { buildClassAnalyticsRouters } from "./routes/class-analytics"; // T-CLASS-MOUNT-1 — the ClassAnalytics family wire routes (the T-MIG-053-t2 routes tranche)
import { buildTutorRouters } from "./routes/tutor";
import { buildTutorBankRouters } from "./routes/tutor-bank";
import { buildClaRouters } from "./routes/cla";
import { withClassFeatureGate, resolveTutorAnchor, resolveClaAnchor, resolveSmartMarkAnchor, type FeatureGateDeps } from "./services/classroom/feature-gate";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "./services/identity/users";
import { buildClaThreadsRouters } from "./routes/cla-threads";
import { buildLlmChain, chainAsDrillMethodCreditGenerator } from "./services/llmchain";
import { toErrorResponse, apiError } from "./services/identity/errors";
import { bootErrorBody, getAuth } from "./middleware/auth";
import { DEFAULT_CORS_ORIGINS } from "./services/identity/config";

const identity = buildIdentityApp();
const content = buildContentApp();
const books = buildBooksApp();
const curriculum = buildCurriculumRouters();
const assessment = buildAssessmentRouters();
const learner = buildLearnerRouters();
const selfmark = buildSelfMarkRouters();
const smartmark = buildSmartMarkRouters();
const cron = buildCronRouters();
const questions = buildQuestionsRouters();
const examPapers = buildExamPapersRouters();
const paperRegions = buildPaperRegionsRouters();
const paperAwards = buildPaperAwardsRouters();
const learnerPdfDrawings = buildLearnerPdfDrawingsRouters();
const testbuilder = buildTestBuilderRouters();
const teachermarking = buildTeacherMarkingRouters();
const learnerMe = buildLearnerMeRouters();
const learnerKg = buildLearnerKgRouters();
const learnerProgress = buildLearnerProgressRouters();
const learnerStudyPlan = buildLearnerStudyPlanRouters();
const sme = buildSmeRouters();
const intervention = buildInterventionRouters();
const classroom = buildClassroomRouters();
// T-TEACH-002 (ADR-CLASS-0001): the class feature gate's deps — the same
// DATABASE_URL the per-router builders use; the gate consults the
// class_features side table + the course_registry bridge at request time.
const featureGateDeps: FeatureGateDeps = {
  sql: createSql(requireDatabaseUrl(process.env as { DATABASE_URL?: string })),
};
const teacherAssignments = buildTeacherAssignmentsRouters();
const assignmentPacks = buildAssignmentPacksRouters(); // T-SENECA-001
const revisionNotes = buildRevisionNotesRouters();
const knowledge = buildKnowledgeRouters();
const teacherKg = buildTeacherKgRouters();
const classAnalytics = buildClassAnalyticsRouters(); // T-CLASS-MOUNT-1
const research = buildResearchRouters();
const ingestion = buildIngestionRouters();

// THE ONE LLM CHAIN OF RECORD (ADR-MIG-0002, operator directive ① trace
// 1a117913519cd141): the §26.1 free-tier chain (groq → gemini → openrouter)
// is built ONCE here and shared by every consuming composition root — tutor,
// CLA, smart-mark, transcription and the admin chain-health report. Health
// counters, cooldowns and daily budgets are per-chain state; fragmenting
// them across five chains would break the observability contract. Zero-key
// boots (and SYLLABAI_LLM_MODE=test) register every member dormant — the
// honest 503 postures everywhere are byte-identical to the pre-adapter
// surface; keyed boots generate/mark/transcribe for real with failover.
const llmChain = buildLlmChain();
// F-183 — the drill's method-credit seam rides THE ONE CHAIN OF RECORD (the
// smartmark posture): dormant on zero-key boots (the honest null on the ack,
// law L6), live method-credit verdicts when the chain is up.
const drill = buildDrillRouters(process.env, {
  methodCreditGenerator: chainAsDrillMethodCreditGenerator(llmChain),
});
const tutor = buildTutorRouters(process.env, { chain: llmChain });
const cla = buildClaRouters(process.env, { chain: llmChain });
const claThreads = buildClaThreadsRouters(process.env);
const answerInput = buildAnswerInputRouters(process.env, { chain: llmChain });
const llmadmin = buildLlmAdminRouters(process.env, llmChain);
const teachingToolkit = buildTeachingToolkitRouters(process.env, { chain: llmChain });

const app = new Hono();

app.route("/", healthRoute);

// CORS (SecurityConfig.java:131-141 parity): reflected allowlisted origins,
// Authorization+Content-Type headers, Location exposed, 1h preflight cache.
// OPTIONS is permitAll and must never authenticate (SecurityConfig.java:66).
const allowedOrigins = identity.config.config.corsOrigins ?? DEFAULT_CORS_ORIGINS;
app.use("*", async (c, next) => {
  const origin = c.req.header("Origin");
  const isAllowed = origin !== undefined && allowedOrigins.includes(origin);
  if (c.req.method === "OPTIONS") {
    if (isAllowed || origin === undefined) {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Authorization,Content-Type",
          "Access-Control-Max-Age": "3600",
          ...(isAllowed ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
        },
      });
    }
    return new Response(null, { status: 403 });
  }
  await next();
  if (isAllowed) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
  }
  c.header("Access-Control-Expose-Headers", "Location");
});

// Bearer authentication — parse once, attach context (filter port). Invalid
// tokens never abort here; protected paths reject via requireAuth/requireRole.
app.use("*", identity.authMiddleware);

// Per-IP rate limiting (deep-audit 09-28 M1, T-MIG-016) — inside the security
// chain AFTER the JWT filter (SecurityConfig.java:96-99): the LLM tier keys
// on the learner identity the auth pass above resolved; auth-tier budgets
// gate the public identity routes below before any controller work.
const rl = identity.config.config.ratelimit;
const rateLimitFilter = new RateLimitFilter({
  enabled: rl.enabled,
  windowMs: rl.windowMs,
  budgets: {
    loginPerIp: rl.loginPerIp,
    registerPerIp: rl.registerPerIp,
    bootstrapPerIp: rl.bootstrapPerIp,
    passwordPerIp: rl.passwordPerIp,
    llmPerLearner: rl.llmPerLearner,
  },
});
app.use("*", rateLimitFilter.handle);

// Identity routers (AuthController + BootstrapAdminController). Registration
// ORDER matters: the routers own their paths first; the fallback below only
// sees paths NO router claimed. The public auth surfaces (register, login,
// bootstrap-status, bootstrap-admin — SecurityConfig.java:67-73 permitAll)
// must never see the authenticated() gate.
app.route("/api/v1/auth", identity.authRoute);
app.route("/api/v1/auth", identity.bootstrapRoute);

// Content READ routers (T-MIG-020 — Wave 2). Path parity with the frozen
// core: ContentController/ContentDocumentController under /api/v1/teacher
// /content, ContentReaderController under /api/v1/content/documents,
// QuestionAssetController under /api/v1/content/question-assets. Each
// router owns its authz internally (teacher: TEACHER/ADMIN;
// reader/assets: authenticated) — the /api/v1/* fallback below stays the
// 404-after-auth path for NO router claimed.
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-020, R0 ratification requested):
// T-MIG-020's scope.allowed covers routes/content/**, services/content/**,
// test/content/**, packages/contracts/src/content.ts — NOT this file. The
// three mount lines + this comment are the minimal app-level wiring the
// ported module needs, shipped as a separate commit per the T-MIG-010
// precedent so R0 can ratify or lift them out at review.
app.route("/api/v1/teacher/content", content.teacherRoute);
app.route("/api/v1/content/documents", content.readerRoute);
app.route("/api/v1/content/question-assets", content.assetRoute);

// Student Books read surface (T-MIG-133 band 133c). PUBLIC-READ corpus
// family (student archive posture — read-only, zero PII), gated by the
// T-C20 validation law INSTEAD of auth: only VALIDATED books serve and
// non-validated books are indistinguishable from unknown ones (404, no
// state leak). The operator validation flip is the serving lever. The
// same out-of-fence disclosure as the T-MIG-020 mounts above applies to
// this one mount line (band 133c scope: the books module files; this file
// carries the mount only).
app.route("/api/v1/content/books", createBooksRouter(books.app));

// Curriculum routers (T-MIG-021 — Wave 2). Path parity with the frozen
// core: CurriculumController under /api/v1/curriculum (authenticated),
// TeacherCurriculumController under /api/v1/teacher/curriculum
// (TEACHER/ADMIN). Each router owns its authz internally — the /api/v1/*
// fallback below stays the 404-after-auth path for NO router claimed.
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-021, R0 ratification requested):
// T-MIG-021's scope.allowed covers routes/curriculum/**,
// services/curriculum/**, test/curriculum/** — NOT this file. The two
// mount lines + this comment are the minimal app-level wiring the ported
// module needs, shipped as a separate commit per the T-MIG-010/020
// precedent so R0 can ratify or lift them out at review.
app.route("/api/v1/curriculum", curriculum.learnerRoute);
app.route("/api/v1/teacher/curriculum", curriculum.teacherRoute);

// Assessment routers (T-MIG-030 — Wave 3). Path parity with the frozen
// core: AttemptController under /api/v1/attempts, AttemptHistoryController
// under /api/v1/learners/me (GET /attempts). Both fall under the frozen
// anyRequest().authenticated() rule (SecurityConfig.java:87-91 has no
// specific matchers for these prefixes) and each router owns its authz
// internally — the /api/v1/* fallback below stays the 404-after-auth path
// for NO router claimed.
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-030, R0 ratification requested):
// T-MIG-030's scope.allowed covers routes/assessment/**,
// services/assessment/**, test/assessment/** — NOT this file. The two
// mount lines + this comment are the minimal app-level wiring the ported
// module needs, shipped as a separate commit per the T-MIG-010/020/021
// precedent so R0 can ratify or lift them out at review.
app.route("/api/v1/attempts", assessment.attemptRoute);
app.route("/api/v1/learners/me", assessment.historyRoute);

// Learner state-model routers (T-MIG-041 tranche 2 — Wave 4). Path parity
// with the frozen core: LearnerStateController GET /api/v1/learners/me/state
// and CourseStatsController GET /api/v1/learners/me/course-stats share the
// /api/v1/learners/me base with T-MIG-030's history router (each owns its
// specific paths; Hono resolves per router). Falls under the frozen
// anyRequest().authenticated() rule — the router owns its authz internally
// (Boot 401 shell first, captured w4-*-unauthed-401); the /api/v1/* fallback
// below stays the 404-after-auth path for NO router claimed. The rest of the
// learner-me band (knowledge-graph, agenda, smart-lesson, flashcards, …) is
// T-MIG-043's title — NOT mounted here.
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-041, R0 ratification requested):
// T-MIG-041's tranche-2 scope.allowed covers routes/learner/**,
// services/learner/**, test/learner/** — NOT this file. The mount line +
// import + construction + this comment are the minimal app-level wiring,
// shipped as a separate commit per the T-MIG-010/020/021/030/032 precedent
// so R0 can ratify or lift them out at review.
app.route("/api/v1/learners/me", learner.learnerRoute);

// Learner KG + smart-lesson router (T-MIG-079 — Wave-7 port band). Path
// parity with the frozen core: LearnerStateController's
// GET /api/v1/learners/me/knowledge-graph and SmartLessonController's
// GET /api/v1/learners/me/smart-lesson share the /api/v1/learners/me base
// with T-MIG-041's state router and T-MIG-043's learner-me router (each
// owns its specific paths; Hono resolves per router). Falls under the
// frozen anyRequest().authenticated() rule — the router owns its authz
// internally (Boot 401 shell first, captured w4-knowledge-graph-
// unauthed-401 / w4-smart-lesson-unauthed-401); the /api/v1/* fallback
// below stays the 404-after-auth path for NO router claimed. The two
// services are the T-MIG-053 band's own ports (learnerGraphFor = the F-034
// t1 read model; smartLessonFor = the t4 deterministic ladder — NO LLM in
// the loop); this band closes the run-002 review F-9 (5 live reds).
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-079, R0 ratification requested):
// T-MIG-079's scope.allowed covers apps/api/src/routes/** (the two URL
// spaces), apps/api/src/services/**, packages/contracts/**, apps/api/test/**
// — this file INCLUDED by the card's explicit mount mandate, but the
// mount line + import + construction + this comment still ship as the
// minimal app-level wiring per the 010/020/021/030/032/041/062 precedent
// so R0 can ratify or lift them out at review.
app.route("/api/v1/learners/me", learnerKg.learnerKgRoute);

// DC-7 progress attribution routers (spec §3.7; prereg
// docs/DC7-PROGRESS-ATTRIBUTION-PLAN.md). DC-7-SPEC-NATIVE paths, not a
// frozen-port band: GET /api/v1/learners/me/progress and
// GET /api/v1/learners/me/plan-projection — the event→projection rollup
// (three display levels, separate notes|questions dimensions) and the
// study plan's subscription to the SAME projection (per-task-type
// thresholds). The router owns its authz internally (the
// createLearnerStateRouter shell posture); both handlers are pure
// read-time projections — the rollup writes nothing, so the tree, the
// plan and the dashboard can never disagree. Additive mount per the
// minimal app-level wiring precedent.
app.route("/api/v1/learners/me", learnerProgress.learnerProgressRoute);

// Study-Plan Builder routers (spec §5.3 + roadmap Table 3 P2 row; prereg
// docs/STUDY-PLAN-BUILDER-PLAN.md). DC-7-SPEC-NATIVE paths under the same
// band: GET/PUT /api/v1/learners/me/study-plan and GET
// /api/v1/learners/me/study-plan/defaults — the plan-config upsert (the
// lane's ONLY write, migration 0012_study_plans) and the deterministic
// week generator whose task completion states ride the DC-7
// buildPlanProjection subscription (nothing completion-shaped is stored).
// The router owns its authz internally (the shell posture). Additive mount
// per the minimal app-level wiring precedent.
app.route("/api/v1/learners/me", learnerStudyPlan.learnerStudyPlanRoute);

// F-182 drill surface routers (the per-spec-point drill; prereg
// docs/F182-DRILL-BUILD-PLAN.md under the opening plan
// docs/F182-DRILL-SURFACE-PLAN.md §6.1). F-182-SPEC-NATIVE paths, not a
// frozen-port band: GET /api/v1/learners/me/drill/addresses (the drillable
// address picker — the census of record's fail-closed floor P3),
// POST /api/v1/learners/me/drill/draw (the 5-part draw, policies P1..P5
// untouched from the opening's pure modules) and
// POST /api/v1/learners/me/drill/evidence (the F-055-shaped attempt-evidence
// seam over the drill address space — one immutable row per (draw, part),
// the instant post-attempt reveal riding the ack). The router owns its
// authz internally (the createLearnerStateRouter shell posture). ZERO-STAKES
// LAW: the drill writes ONLY its own tables (drill_draws +
// drill_part_evidence, migration 0010_drill_surface) and reads NO
// progress-bearing table — no attempts, no ai_mark_events, no gradebook
// events, ever. Additive mount per the minimal app-level wiring precedent.
app.route("/api/v1/learners/me/drill", drill.drillRoute);

// Marking routers (T-MIG-032 — Wave 3). Path parity with the frozen core:
// LearnerSelfMarkController + StudentSmartMarkController share the
// /api/v1/learners/me/attempts base (POST self-mark / smart-mark / the two
// feedback actions). Both fall under the frozen anyRequest().authenticated()
// rule and each router owns its authz internally — the /api/v1/* fallback
// below stays the 404-after-auth path for NO router claimed. The smartmark
// module's LLM seams are DORMANT by default (generator refuses, feedback
// 503s) — the LlmProvider infra is the wave-3 LLM-chain lane's surface.
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-032, R0 ratification requested):
// T-MIG-032's scope.allowed covers routes/{selfmark,smartmark}/**,
// services/{selfmark,smartmark}/**, test/{selfmark,smartmark}/** — NOT this
// file. The two mount lines + import + construction + this comment are the
// minimal app-level wiring, shipped as a separate commit per the
// T-MIG-010/020/021/030 precedent so R0 can ratify or lift them out at review.
app.route("/api/v1/learners/me/attempts", selfmark.selfMarkRoute);
// T-TEACH-002 (ADR-CLASS-0001): the class feature GATE wraps ONLY the
// smart-mark router (self-mark is the learner's own act, not an AI
// feature — its mount stays unwrapped). Gated paths: the three POSTs
// (anchor = attemptId → the course_registry bridge).
app.route(
  "/api/v1/learners/me/attempts",
  withClassFeatureGate(smartmark.studentRoute, featureGateDeps, {
    feature: "smart_mark",
    paths: ["/smart-mark", "/feedback-explanation", "/improvement-plan"],
    resolve: resolveSmartMarkAnchor,
  }),
);

// T-MIG-042 cron router (the NightlyDecayJob takeover's api arm — the hub
// seam forwards here; CUTOVER_RUNBOOK §3).
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-032 precedent): T-MIG-042's scope.allowed
// covers routes/cron.ts + services/cron/** + test/cron/** — NOT this file.
// The import + construction + this one mount line are the minimal app-level
// wiring, shipped as this separate disclosed commit so R0 can ratify or
// lift them out at review.
app.route("/api/v1/cron", cron.cronRoute);

// Exam-papers + questions routers (T-MIG-031 — Wave 3). Path parity with the
// frozen core: ExamPaperController under /api/v1/exam-papers (list + detail),
// QuestionController under /api/v1/questions (list, /families, /topics, /{id},
// /{id}/mark-scheme). Both fall under the frozen anyRequest().authenticated()
// rule (SecurityConfig.java:91 — NO role-specific matchers for these prefixes;
// any authenticated user lists/views) and each router owns its authz
// internally — the /api/v1/* fallback below stays the 404-after-auth path for
// NO router claimed. The questions router's reveal policy rides
// SYLLABAI_MARKSCHEME_REVEAL_POLICY (default VALIDATED_ONLY, fail-fast at
// construction).
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-031, R0 ratification requested):
// T-MIG-031's scope.allowed covers routes/{questions,exam-papers}/**,
// services/{questions,exam-papers}/**, test/{questions,exam-papers}/** — NOT
// this file. The two mount lines + imports + construction + this comment are
// the minimal app-level wiring, shipped as a separate commit per the
// T-MIG-010/020/021/030/032 precedent so R0 can ratify or lift them out at
// review.
app.route("/api/v1/exam-papers", examPapers.examPapersRoute);
app.route("/api/v1/questions", questions.questionsRoute);

// Paper-assets regions router (T-MG-MP-RECT-1 — MG parity). Plan of record
// docs/MG-MARK-PARITY-PLAN.md §3.1: GET /api/v1/paper-assets/:id/regions —
// the MathsGenie getRegions contract shape over mark_point_rects +
// question_parts + mark_points, questionPartId WIRED. Read-only corpus
// surface, zero PII; auth shell mirrors the exam-papers/books routers (any
// authenticated user). Additive module — no fenced file touched; this mount
// block + import + construction are the minimal app-level wiring per the
// T-MIG-010/020/021/030/031/032 disclosed-commit precedent.
app.route("/api/v1/paper-assets", paperRegions.paperAssetsRoute);

// Paper-marks award router (T-MG-AWARDS-1 — MG parity). Plan of record
// docs/MG-MARK-PARITY-PLAN.md §3.2: GET /api/v1/paper-marks (the
// getRegionMarks ledger, learner-scoped — the JWT context supplies the
// learner, never the wire) + POST /api/v1/paper-marks/regions/:regionId/
// awards (Phase 4's pipeline write site — the DC-7 claim-before-write
// once-only seam lives in the service). Learner-scoped PII surface;
// auth shell mirrors selfmark/assessment (authenticated-only). Additive
// module — no fenced file touched; this mount block + import +
// construction are the minimal app-level wiring per the
// T-MIG-010/020/021/030/031/032 disclosed-commit precedent.
app.route("/api/v1/paper-marks", paperAwards.paperMarksRoute);

// Learner PDF drawing (annotation ink) router (T-MG-INK-1 run-002 — MG
// parity Phase 3). Plan of record docs/MG-MARK-PARITY-PLAN.md §3.3 (the
// SDK decision gate's run-002 consequences; verdict record
// docs/MG-INK-SDK-GATE.md): GET/PUT /api/v1/learner/pdf-drawings — the
// full-doc {schema:"syllabai-ink/1", shapes[]} container load/store with
// the revision LWW 409 law (E4: single-writer, full-doc PUT right-sized;
// no op-log). Learner-scoped PII surface; auth shell mirrors
// selfmark/assessment (authenticated-only). Additive module — no fenced
// file touched; this mount block + import + construction are the minimal
// app-level wiring per the T-MIG-010/020/021/030/031/032 disclosed-commit
// precedent.
app.route("/api/v1/learner/pdf-drawings", learnerPdfDrawings.pdfDrawingsRoute);

// Test-builder + answer-input routers (T-MIG-034 — Wave 3). Path parity with
// the frozen core: TestBuilderController under /api/v1/teacher/tests (the
// SecurityConfig.java:87 hasAnyRole('TEACHER','ADMIN') rule — the router owns
// its authz internally) and TranscriptionController under
// /api/v1/learners/me/answer-input (SecurityConfig.java:91
// anyRequest().authenticated() — the router owns its authz internally). The
// transcription provider seam is the shared §26.1 chain (ADR-MIG-0002):
// media rides ONLY to the vision-capable member; zero-key/test boots keep
// the dormant-equivalent 503 transcription_unavailable parity, T-MIG-032
// precedent); the weakness-options
// analytics port is AWAKE since CD-A (trace 1a18c0171724f5ed — the real
// classOverview adapter, frozen-core parity; the 501 mapping remains for
// the constructible dormant module). The /api/v1/* fallback
// below stays the 404-after-auth path for NO router claimed.
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-034, R0 ratification requested):
// T-MIG-034's scope.allowed covers routes/{testbuilder}.ts,
// routes/answer-input.ts, services/{testbuilder,answer-input}/**,
// test/{testbuilder,answer-input}/** — NOT this file. The two mount lines +
// import + construction + this comment are the minimal app-level wiring,
// shipped as a separate commit per the T-MIG-010/020/021/030/032 precedent
// so R0 can ratify or lift them out at review.
app.route("/api/v1/teacher/tests", testbuilder.testBuilderRoute);
app.route("/api/v1/learners/me/answer-input", answerInput.transcribeRoute);

// Teacher marking router (T-MIG-033 tranche-2 — Wave 3). Path parity with
// the frozen core: TeacherMarkingController under /api/v1/teacher/marking
// (TEACHER/ADMIN via SecurityConfig + @PreAuthorize defense-in-depth; the
// router owns its authz internally — the /api/v1/* fallback below stays the
// 404-after-auth path for NO router claimed).
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-033, R0 ratification requested):
// T-MIG-033's scope.allowed covers routes/teachermarking.ts,
// services/teachermarking/**, test/teachermarking/** — NOT this file. The
// import + construction + mount line + this comment are the minimal
// app-level wiring, shipped as a separate commit per the
// T-MIG-010/020/021/030/032/034 precedent so R0 can ratify or lift them out
// at review. LLM seams stay DORMANT (the 032 posture): smart-mark routes
// answer 503 until the LLM-chain lane lands; read surfaces are live.
app.route("/api/v1/teacher/marking", teachermarking.teacherRoute);

// Learner-me router (T-MIG-043 tranche-2 — Wave 4). Path parity with the
// frozen core: LearnerAgendaController (GET /agenda),
// LearnerRecommendationController (GET /recommendations),
// FlashcardRatingController (POST /flashcard-ratings),
// FlashcardRatingTrailController (GET /flashcard-rating-trail),
// FlashcardReviewScheduleController (GET /flashcard-review-schedule),
// NoteVoteController (POST /note-votes), LearnerExamSeriesController
// (GET /exam-series, PUT/DELETE /courses/{slug}/target-series),
// LearnerAssignmentController (GET /assignments,
// POST /assignments/{id}/submissions) — all under
// /api/v1/learners/me (SecurityConfig.java:91 anyRequest().authenticated();
// the router owns its authz internally — the /api/v1/* fallback below stays
// the 404-after-auth path for NO router claimed).
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-043, R0 ratification requested):
// T-MIG-043's scope.allowed covers routes/learnerme.ts,
// services/learner-me/**, test/learner-me/** — NOT this file. The import +
// construction + mount line + this comment are the minimal app-level
// wiring, shipped as a separate commit per the T-MIG-010/020/021/030/032/
// 034 precedent so R0 can ratify or lift them out at review. The NBA
// engine (nba-rules/v1.3) is LIVE as the agenda's default actions provider
// (the tranche-1 501 posture remains the no-provider safety net).
app.route("/api/v1/learners/me", learnerMe.learnerMeRoute);
// SME admin router (T-MIG-033 tranche-3 — Wave 3). Path parity with the
// frozen core: SmeQuestionAdminController under /api/v1/admin/question-bank
// (SecurityConfig.java:86 hasRole("ADMIN") + @PreAuthorize defense-in-depth;
// the router owns its authz internally — the /api/v1/* fallback below stays
// the 404-after-auth path for NO router claimed).
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-033, R0 ratification requested):
// T-MIG-033 tranche-3's scope.allowed covers routes/sme.ts,
// services/sme/**, test/sme/** — NOT this file. The import + construction
// + mount line + this comment are the minimal app-level wiring, shipped as
// a separate commit per the T-MIG-010/020/021/030/032/033t2 precedent so
// R0 can ratify or lift them out at review.
app.route("/api/v1/admin/question-bank", sme.adminRoute);

// LLM chain-observability router (T-MIG-090 — R0, the ruling4
// adopted-and-amended vehicle). Path parity with the frozen core:
// LlmAdminController under /api/v1/admin/llm (SecurityConfig.java
// /api/v1/admin/** hasRole("ADMIN") + @PreAuthorize defense-in-depth;
// the router owns its authz internally — the /api/v1/* fallback below
// stays the 404-after-auth path for NO router claimed).
// Mount lines IN-FENCE per the 090 card scope.allowed; config = the
// frozen-effective application.yml @ 6cad6ef layer (ruling4 §2);
// ZERO-KEY boot of record (ruling4 §3) — the report shows what is
// missing and generation stays ADR-023 fail-closed dormant.
app.route("/api/v1/admin/llm", llmadmin.llmAdminRoute);

// Tutor routers (T-MIG-060 tranche 2 — Wave 6). Path parity with the frozen
// core: TutorController under /api/v1/tutor (POST /ask + the SSE twin
// POST /ask/stream — the R-VERCEL W6 spike carrier, streamed as a
// ReadableStream response with the idle-timeout + client-disconnect stall
// posture carried from the frozen controller) and TutorSessionController
// under /api/v1/tutor/sessions (the §22 CRUD). Both fall under the frozen
// anyRequest().authenticated() rule (SecurityConfig.java:91 — no specific
// matchers for these prefixes) and each router owns its authz internally;
// the R8 llm:ask tier (T-MIG-016's filter) already admits /ask + /ask/stream.
// The paper-question fail-open guard is WIRED (the tranche-1b port — no
// notPaperAsk default anywhere); the LLM provider seam is DORMANT (the
// smartmark posture — generation-reaching asks serve the honest 503
// tutor_unavailable while every deterministic law stays live).
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-060, R0 ratification requested):
// T-MIG-060's scope.allowed covers routes/{tutor,tutorsessions}.ts,
// services/tutor/**, test/tutor/**, packages/contracts/src/tutor.ts — NOT
// this file. The imports + construction + two mount lines + this comment
// are the minimal app-level wiring, shipped as a separate commit per the
// T-MIG-010/020/021/030/032/033/041/043 precedent so R0 can ratify or lift
// them out at review. The sessions router mounts BEFORE the ask router so
// the /latest-never-captured-by-/:sessionId law reads top-down.
app.route("/api/v1/tutor/sessions", tutor.tutorSessionsRoute);
// T-TEACH-002 (ADR-CLASS-0001): the class feature GATE wraps the tutor ask
// router at the composition root — the frozen route file stays byte-zero.
// Gated paths: POST /ask + /ask/stream (anchor = body courseRef ?? session
// course_ref; the §4 anchor-strength law owns the honest gaps).
app.route(
  "/api/v1/tutor",
  withClassFeatureGate(tutor.tutorRoute, featureGateDeps, {
    feature: "tutor",
    paths: ["/ask", "/ask/stream"],
    resolve: resolveTutorAnchor,
  }),
);

// Tutor bank bands (T-MIG-128/129 — post-core v2-native deterministic read
// surfaces, the operator's bands, trace 1a14080256278b41): band (1) the
// question-listing census (topic | spec point | node → the bank under FETCH
// semantics + the V20 paper gate) and band (2) the whole-paper one-view
// fetch (QP + paired MS chunks + bank questions with marks). Zero LLM, zero
// vector calls; T-C07 fail-closed scope; authed under the same
// anyRequest().authenticated() shell as the tutor family.
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-128/129, R0 ratification requested): the
// bands' scope.allowed covers routes/tutor-bank.ts, services/tutor/
// bank-bands.ts, test/tutor/bank-bands.test.ts, packages/contracts/src/
// tutor.ts — NOT this file. The import + construction + mount line + this
// comment are the minimal app-level wiring, shipped as a separate commit
// per the T-MIG-060 precedent so R0 can ratify or lift them out at review.
const tutorBank = buildTutorBankRouters(process.env);
app.route("/api/v1/tutor/bank", tutorBank.tutorBankRoute);

// CLA ask surface (T-MIG-069 tranche 2 — Wave 6). Path parity with the
// frozen core: ClaController under /api/v1/learners/me/cla (POST /ask —
// the ONE endpoint, :36-101 @ 6cad6ef). Falls under the frozen
// anyRequest().authenticated() rule (SecurityConfig.java:91 — no specific
// matcher for this prefix); the router owns its authz internally. The
// runtime-step law is WIRED: the four dependency-served kinds dispatch
// (KG_TOPIC / SPECIFICATION_POINT / PAST_PAPER_QUESTION / QUESTION_PART);
// SMART_LESSON + NOTE_SECTION are refused with the frozen closed-enum 400
// (the T-MIG-053 t3/t4 gate — r3a's tranches; disclosed, never silent).
// The paper-question serving gate is the landed ServableQuestions chain;
// the LLM provider seam is DORMANT (the 060 posture — generation-reaching
// asks serve the honest 503 tutor_unavailable, deterministic refusals
// never 503); the interaction event rides the no-op telemetry sink (the
// 061 posture — zero tables, ADR-031 intact).
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-069, R0 ratification requested):
// T-MIG-069's scope.allowed covers routes/cla.ts, services/cla/**,
// test/cla/**, packages/contracts/src/cla.ts — NOT this file. The import +
// construction + one mount line + this comment are the minimal app-level
// wiring, shipped as a separate commit per the
// T-MIG-010/020/031/043/052/061/060 precedent.
// T-TEACH-002 (ADR-CLASS-0001): the class feature GATE wraps the cla ask
// router at the composition root (routes/cla.ts stays byte-ZERO per the
// DC6 §8 fence). Gated path: POST /ask, kind CHECK only (anchor = its
// questionId → the course_registry bridge; other kinds are the disclosed
// §4 OPEN tier).
app.route(
  "/api/v1/learners/me/cla",
  withClassFeatureGate(cla.claRoute, featureGateDeps, {
    feature: "cla",
    paths: ["/ask"],
    resolve: resolveClaAnchor,
  }),
);

// CLA thread sync tier (DC-6 phase 3, docs/DC6-CLA-SYNC-TIER-PLAN.md).
// V2-NATIVE additive family — NO frozen-core counterpart (feasibility path
// (iii) of record); the frozen cla/ask route above is byte-untouched and
// this mount does not alter it (deeper path, own router).
//
// ⚠️ OUT-OF-FENCE COMMIT (DC-6 phase 3, R0 ratification requested):
// the plan's scope.allowed covers routes/cla-threads.ts,
// services/cla/threads-store.ts, test/cla/threads.test.ts,
// packages/contracts/src/cla.ts (additive tail), packages/db schema +
// migration 0004 — NOT this file. The import + construction + one mount
// line + this comment are the minimal app-level wiring per the
// T-MIG-010/020/031/043/052/060/069 precedent.
app.route("/api/v1/learners/me/cla/threads", claThreads.claThreadsRoute);

// Classroom/teacher foundation routers (T-MIG-052 tranche 2 — Wave 5). Path
// parity with the frozen core: TeacherClassController under /api/v1/teacher
// /classes (8 endpoints — TEACHER/ADMIN via SecurityConfig.java:87 + the M5
// method-level @PreAuthorize defense in depth; the per-object §17 ownership
// gate is 403 in the services), LearnerClassroomController under
// /api/v1/learners/me/classroom (3 endpoints — SecurityConfig.java:91
// anyRequest().authenticated(); the independent-student rule makes the empty
// read the honest state), TeacherRosterController's GET /api/v1/teacher
// /learners (the V49 ruling surface — mounted at the FULL path so its shell
// cannot bleed onto the sibling /api/v1/teacher/* routers; NOTE verified at
// t2: /api/v1/teacher/learners was served by NO mount before this — the
// teachermarking mount lives at /api/v1/teacher/marking — so this is
// conflict-free). Each router owns its authz internally — the /api/v1/*
// fallback below stays the 404-after-auth path for NO router claimed.
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-052 tranche 2, R0 ratification requested):
// T-MIG-052's tranche-2 scope covers routes/classroom.ts,
// services/classroom/** (landed in tranche-1), test/classroom/** — NOT this
// file. The import + construction + three mount lines + this comment are the
// minimal app-level wiring the ported module needs, shipped as a separate
// commit per the T-MIG-010/020/021/030/032/033/034/041t2 precedent so R0 can
// ratify or lift them out at review.
app.route("/api/v1/teacher/classes", classroom.teacherClassesRoute);
app.route("/api/v1/learners/me/classroom", classroom.learnerClassroomRoute);
app.route("/api/v1/teacher/learners", classroom.teacherRosterRoute);

// Teacher assignments router (T-MIG-117 — the B2 decommission band, r7a).
// Path parity with the frozen core: TeacherAssignmentController under
// /api/v1/teacher/assignments (the SecurityConfig.java:87
// hasAnyRole('TEACHER','ADMIN') rule — the router owns its authz
// internally). The /api/v1/* fallback below stays the 404-after-auth path
// for NO router claimed.
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-117, R0 ratification requested):
// T-MIG-117's scope.allowed covers routes/assignments.ts,
// services/teacher-assignments/**, test/teacher-assignments/** — NOT this
// file. The import + construction + one mount line + this comment are the
// minimal app-level wiring the ported module needs, shipped as a separate
// commit per the T-MIG-010/020/021/030/032/033/034/041t2/052t2 precedent so
// R0 can ratify or lift them out at review.
app.route("/api/v1/teacher/assignments", teacherAssignments.teacherAssignmentsRoute);

// Assignment packs (T-SENECA-001 — the teacher assignment creator's "Seneca
// resources" option; v2-native additive side-family, the frozen assignments
// wire untouched). Teacher: library feed + create + preview at
// /api/v1/teacher/assignment-packs; learner: pack detail + task completion
// under /api/v1/learners/me/assignment-packs. The pack IS an `assignments`
// row + side-table tasks, so the existing hand-in/roster/agenda surfaces
// work unchanged. OUT-OF-FENCE COMMIT (T-SENECA-001, R0 ratification
// requested): the import + construction + two mount lines are the minimal
// app-level wiring, the T-TEACH-012 precedent.
app.route("/api/v1/teacher/assignment-packs", assignmentPacks.teacherPacksRoute);
app.route("/api/v1/learners/me", assignmentPacks.learnerPacksRoute);

// Teaching Toolkit router (T-TEACH-012 — the 4 educator-ai generators,
// plan of record docs/TEACHING_TOOLKIT_PLAN.md). Mounted at
// /api/v1/teacher/toolkit (generate/context/resources); the router owns
// its TEACHER/ADMIN authz internally, and generation rides THE ONE chain
// of record above (chainAsToolkitGenerator, the T-TEACH-010 bridge).
//
// ⚠️ OUT-OF-FENCE COMMIT (T-TEACH-012, R0 ratification requested):
// T-TEACH-012's scope.allowed covers routes/teaching-toolkit.ts,
// middleware/ratelimit.ts (the llm-tier line) and test/teachingtoolkit/**
// — NOT this file. The import + construction + one mount line + this
// comment are the minimal app-level wiring, shipped as a separate commit
// per the T-MIG-010/020/021/030/032/033/034/041t2/052t2/T-MIG-117
// precedent so R0 can ratify or lift them out at review.
app.route("/api/v1/teacher/toolkit", teachingToolkit.toolkitRoute);

// Revision-notes + knowledge + teacher-KG/coverage/concept-graph routers
// (T-MIG-082 tranche-1 — the deferred-mount band, r4b). Path parity with the
// frozen core: RevisionNoteLearnerController (/api/v1/learners/me/revision-
// notes), RevisionNoteAdminController (/api/v1/admin/revision-notes),
// KnowledgeController (/api/v1/knowledge), TeachingCoverage + Class KG
// (/api/v1/teacher/classes/:id/{coverage,knowledge-graph}),
// TeacherConceptGraphController (/api/v1/teacher/concept-graph). Each
// router owns its authz internally (requireAuth learner gates; the M5
// TEACHER/ADMIN + ADMIN shells) — the /api/v1/* fallback below stays the
// 404-after-auth path for NO router claimed. The services are the
// T-MIG-053 ports (REUSE-not-redeclare — this band adds NO new service
// code); /api/v1/subjects + /api/v1/tree stay CORE-ONLY per T-MIG-035
// check-3 (adjudication of record in the card).
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-082, R0 ratification requested):
// T-MIG-082's scope.allowed covers routes/{revision-notes,knowledge,
// teacher-kg}.ts, test/{revision-notes,knowledge,teacher}/** — this file
// INCLUDED by the card's explicit mount mandate, but the five mount lines
// + imports + construction + this comment ship as the minimal app-level
// wiring per the 010/020/021/030/032/041/062/079 precedent so R0 can
// ratify or lift them out at review.
app.route("/api/v1/learners/me/revision-notes", revisionNotes.learnerRevisionNotesRoute);
app.route("/api/v1/admin/revision-notes", revisionNotes.adminRevisionNotesRoute);
app.route("/api/v1/knowledge", knowledge.knowledgeRoute);
app.route("/api/v1/teacher/classes", teacherKg.teacherClassesKgRoute);
app.route("/api/v1/teacher/concept-graph", teacherKg.teacherConceptGraphRoute);

// Class-analytics router (T-CLASS-MOUNT-1 — the T-MIG-053 tranche-2 routes
// tranche). Path parity with the frozen core: ClassAnalyticsController under
// /api/v1/teacher/class (SINGULAR — a different literal prefix from the
// /api/v1/teacher/classes family above; SecurityConfig.java's
// hasAnyRole('TEACHER','ADMIN') rule — the router owns its authz internally).
// The three GETs (overview / learners / topics/{nodeId}/drill-down) serialize
// the T-MIG-053 tranche-2 services VERBATIM (zero route-level reshaping; the
// engine inside is the frozen one — C6). This closes the CD-A run-001
// disclosure: the hub Class Intelligence page emits this exact family since
// the teacher-console tranche and no mount existed (the "dark path"). The
// /api/v1/* fallback below stays the 404-after-auth path for NO router
// claimed. Minimal app-level wiring per the T-MIG-010/020/021/030/032/034/082
// disclosed-commit precedent.
app.route("/api/v1/teacher/class", classAnalytics.classAnalyticsRoute);

// Intervention-run router (T-MIG-061 tranche 2 — Wave 6). Path parity with the
// frozen core: InterventionRunController under /api/v1/learners/me
// /intervention-runs (9 endpoints — SecurityConfig.java:91
// anyRequest().authenticated(); the learner ownership gate inside the module
// makes another learner's run an indistinguishable 404). Each router owns its
// authz internally — the /api/v1/* fallback below stays the 404-after-auth
// path for NO router claimed.
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-061 tranche 2, R0 ratification requested):
// T-MIG-061's tranche-2 scope covers routes/intervention.ts,
// test/intervention/routes.test.ts — NOT this file. The import + construction
// + mount line + this comment are the minimal app-level wiring the tranche-1
// module needs (the NBA engine is built over the SAME sql + clock the
// learner-me engine uses — one deterministic engine, composition only),
// shipped as a separate commit per the
// T-MIG-010/020/021/030/032/033/034/041/043/052t2 precedent so R0 can
// ratify or lift them out at review.
app.route("/api/v1/learners/me/intervention-runs", intervention.interventionRoute);

// Research calibration router (T-MIG-062 — Wave 6). Path parity with the
// frozen core: ResearchCalibrationController GET /api/v1/research/learner-
// model/calibration (SecurityConfig.java:88-90 hasAnyRole('TEACHER','ADMIN')
// on /api/v1/research/** — the router owns its authz internally, Boot
// 401/403 shells before any query). The /api/v1/* fallback below stays the
// 404-after-auth path for NO router claimed.
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-062, R0 ratification requested):
// T-MIG-062's scope covers routes/research/**, services/research/**,
// test/research/**, packages/contracts/src/research.* — NOT this file. The
// mount line + import + construction + this comment are the minimal
// app-level wiring, shipped per the 010/020/021/031/032/041/052/061
// precedent so R0 can ratify or lift them out at review.
app.route("/api/v1/research", research.researchRoute);

// Tranche-B ingestion routers (T-MIG-082 tranche B — the service-ports band,
// R0). Path parity with the frozen core: RoutingController (GET /api/v1/
// teacher/content/{fetch,enumerate,enumerate/structured}), GlmOcrIngestion
// Controller (/api/v1/teacher/content/glm-ocr — POST /pairs, GET /papers/:
// paperId/findings), TeacherExamSeriesImportController (POST /api/v1/teacher
// /curriculum/exam-series — mounted at the FULL path so its shell cannot
// bleed onto the T-MIG-021 teacher-curriculum routes; the 052 precedent).
// Each router owns its authz internally (the TEACHER/ADMIN M5 shells; the
// curriculum router's identical shell still fires first for the shared
// prefix — double-gated by design, never differently); the /api/v1/*
// fallback below stays the 404-after-auth path for NO router claimed. The
// services are the tranche-B ports (services/ingestion/**): Fetch/
// Enumerate + the FetchQueryParser (T-C07 scope law riding the T-MIG-020
// CurriculumScopeResolver), the GLM-OCR bridge (T-013 store + T-011 bank +
// the V13 bridge record), and the fail-closed exam-series import (T-C79).
// golden/** is UNTOUCHED (the capture pass owns golden truth — r4-api-b,
// trace 1a1151442250feb1); the V2_SURFACE_PREFIXES widening stays the filed
// RIDER (the band card) — hub api.ts is NOT touched by this band.
//
// ⚠️ OUT-OF-FENCE COMMIT (T-MIG-082 tranche B, R0 ratification requested):
// tranche-B scope.allowed covers routes/ingestion.ts,
// services/ingestion/**, packages/contracts/src/ingestion.ts,
// test/ingestion/** — this file INCLUDED by the card's explicit mount
// mandate, but the three mount lines + import + construction + this
// comment ship as the minimal app-level wiring per the
// 010/020/021/030/032/041/062/079/revision-notes precedent so R0 can
// ratify or lift them out at review.
app.route("/api/v1/teacher/content", ingestion.contentRoutingRoute);
app.route("/api/v1/teacher/content/glm-ocr", ingestion.glmOcrRoute);
app.route("/api/v1/teacher/curriculum/exam-series", ingestion.examSeriesImportRoute);

// anyRequest().authenticated() parity for paths NO router claimed
// (SecurityConfig.java:91): anonymous callers get the 401 Boot-shaped body;
// authenticated callers get 404 not_found (NoResourceFoundException parity,
// GlobalExceptionHandler.java:192-195). First-match-wins registration keeps
// the routers above authoritative for their own paths.
app.all("/api/v1/*", (c) => {
  if (!getAuth(c)) {
    return c.json(bootErrorBody(401, new URL(c.req.url).pathname), 401);
  }
  return c.json(apiError(404, "not_found", "resource not found"), 404);
});

/**
 * Error boundary — identity-domain errors render the frozen core's ApiError
 * shape; everything else stays the opaque 500 the GlobalExceptionHandler
 * serves (:224-230: "internal_error" / "an internal error occurred").
 */
app.onError((err, c) => {
  // F-182 lane: UnknownCourseError is the drill's fail-closed course registry
  // (the anchor law) — 404 not_found, never a 500 (drillErrorResponse also
  // maps the identity-domain errors; the drill module shares the shape).
  const drillMapped = drillErrorResponse(err);
  if (drillMapped) return c.json(drillMapped.body, drillMapped.status as 400 | 401 | 403 | 404 | 409 | 429);
  const mapped = toErrorResponse(err);
  if (mapped) {
    if (mapped.headers) for (const [k, v] of Object.entries(mapped.headers)) c.header(k, v);
    return c.json(mapped.body, mapped.status as 400 | 401 | 403 | 404 | 409 | 429);
  }
  console.error("[api] unhandled error:", err);
  return c.json(apiError(500, "internal_error", "an internal error occurred"), 500);
});

export default app;

// Local dev: `bun apps/api/src/index.ts` — Bun auto-serves the default fetch
// handler (honours $PORT, default 3000); do NOT also call Bun.serve here, the
// double-bind crashes boot (found in T-MIG-010 replay bring-up). On Vercel the
// default export above is the entry; under `bun test` nothing serves (module
// is imported, import.meta.main false).
