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
import { buildQuestionsRouters } from "./routes/questions";
import { buildExamPapersRouters } from "./routes/exam-papers";
import { buildTestBuilderRouters } from "./routes/testbuilder";
import { buildAnswerInputRouters } from "./routes/answer-input";
import { buildTeacherMarkingRouters } from "./routes/teachermarking";
import { buildSmeRouters } from "./routes/sme";
import { buildInterventionRouters } from "./routes/intervention";
import { buildLearnerRouters } from "./routes/learner";
import { buildClassroomRouters } from "./routes/classroom";
import { buildResearchRouters } from "./routes/research";
import { buildLearnerMeRouters } from "./routes/learnerme";
import { buildTutorRouters } from "./routes/tutor";
import { buildClaRouters } from "./routes/cla";
import { toErrorResponse, apiError } from "./services/identity/errors";
import { bootErrorBody, getAuth } from "./middleware/auth";
import { DEFAULT_CORS_ORIGINS } from "./services/identity/config";

const identity = buildIdentityApp();
const content = buildContentApp();
const curriculum = buildCurriculumRouters();
const assessment = buildAssessmentRouters();
const learner = buildLearnerRouters();
const selfmark = buildSelfMarkRouters();
const smartmark = buildSmartMarkRouters();
const questions = buildQuestionsRouters();
const examPapers = buildExamPapersRouters();
const testbuilder = buildTestBuilderRouters();
const answerInput = buildAnswerInputRouters();
const teachermarking = buildTeacherMarkingRouters();
const learnerMe = buildLearnerMeRouters();
const tutor = buildTutorRouters();
const cla = buildClaRouters();
const sme = buildSmeRouters();
const intervention = buildInterventionRouters();
const classroom = buildClassroomRouters();
const research = buildResearchRouters();

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
app.route("/api/v1/learners/me/attempts", smartmark.studentRoute);

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

// Test-builder + answer-input routers (T-MIG-034 — Wave 3). Path parity with
// the frozen core: TestBuilderController under /api/v1/teacher/tests (the
// SecurityConfig.java:87 hasAnyRole('TEACHER','ADMIN') rule — the router owns
// its authz internally) and TranscriptionController under
// /api/v1/learners/me/answer-input (SecurityConfig.java:91
// anyRequest().authenticated() — the router owns its authz internally). The
// transcription provider seam is DORMANT (null → 503
// transcription_unavailable parity, T-MIG-032 precedent); the weakness-options
// analytics port is DORMANT (null → 501 with the task reference — the
// class-analytics read service is unclaimed work). The /api/v1/* fallback
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
app.route("/api/v1/tutor", tutor.tutorRoute);

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
app.route("/api/v1/learners/me/cla", cla.claRoute);

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
