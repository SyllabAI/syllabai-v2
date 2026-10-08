/**
 * CLA ask router — T-MIG-069 tranche 2. Path parity with the frozen core
 * (syllabai-core @ 6cad6ef), ClaController.java @ /api/v1/learners/me/cla:
 *
 *   POST /ask → 200 ClaAnswerView (the deterministic pipeline)
 *
 * Route security: learner surface under /api/v1/learners/me — the
 * SecurityConfig default rule (anyRequest().authenticated(), :91); the
 * authz shell runs FIRST and the router owns its authz internally. Students
 * ask on their own identity; a teacher token previews with its own
 * identity, exactly like the free Tutor — there is no cross-learner context
 * composition anywhere on this surface.
 *
 * Fail-closed request semantics (the controller javadoc :28-33, verbatim
 * law): an unknown kind/mode is a 400 (undeclared values rejected, §3); a
 * kind whose required reference is missing is a 400; kinds not served by
 * the current runtime step are a 400 (closed enum, §1 — the
 * SMART_LESSON/NOTE_SECTION deferral is served by THIS law, disclosed);
 * unresolvable references are 404 with no existence oracles; CHECK without
 * attempt evidence is a 409 (the §7.3 answer-leakage gate).
 *
 * T-MIG-097 repair (run-001 capture L01-L06, capture > source-reading —
 * the 095 finding generalized): the live frozen wire CONTRADICTED the
 * 069-era reading of this file in three laws, repaired here —
 *   (1) the two-envelope law is a LAYER law: Jackson binds the whole
 *       document BEFORE @Valid, so any binding-class failure (wrong type,
 *       closed-enum violation, malformed uuid) answers malformed_body even
 *       when a constraint violation coexists (capture L02/L03: unknown
 *       kind/mode = malformed_body, NOT validation_failed);
 *   (2) among constraint violations the QUESTION field reports first
 *       (capture L01: on {} the core serves "question: must not be blank",
 *       not "kind: must not be null");
 *   (3) the DEFERRED kinds' required-reference gates fire BEFORE the
 *       runtime-step refusal (capture L05/L06: "SMART_LESSON context
 *       requires rootId and topicNodeId" / "NOTE_SECTION context requires
 *       rootId and noteId" verbatim) — the runtime-step refusal remains
 *       for refs-present asks (the generation wire rides the operator's
 *       section-3 lever, disclosed).
 *
 * Exception law (GlobalExceptionHandler parity, verbatim):
 *   NotFoundError / NotFoundException → 404 not_found, e.message verbatim
 *   BadRequestException               → 400 bad_request, e.message verbatim
 *                                       (the dispatch's required-reference
 *                                       messages are load-bearing)
 *   ArgumentError                     → 400 bad_request "malformed request"
 *                                       (the IllegalArgumentException
 *                                       mapping — the FIXED text)
 *   ClaAttemptRequiredError           → 409 attempt_required with the FIXED
 *                                       CLA_CHECK_ATTEMPT_REQUIRED_MESSAGE
 *                                       (the §7.3 gate)
 *   TutorGenerationError              → 503 tutor_unavailable with the
 *                                       FIXED TUTOR_UNAVAILABLE_MESSAGE —
 *                                       the dormant seam; deterministic
 *                                       refusals NEVER 503
 *
 * Two-envelope body law (Jackson binds the whole document before @Valid):
 *   binding failures (wrong JSON types, closed-enum values, malformed
 *   uuids) → 400 malformed_body — LAYER 1, answers before any constraint
 *   reading (capture L02/L03);
 *   constraint violations (@NotNull kind/mode, @NotBlank/@Size question,
 *   @Size specCode/noteId) → 400 validation_failed "field: message" —
 *   LAYER 2, the question field reports first (capture L01).
 */
import { Hono } from "hono";
import type { ZodError } from "zod";
import {
  CLA_CHECK_ATTEMPT_REQUIRED_MESSAGE,
  claAskRequestSchema,
} from "@syllabai/contracts";
import { claAnswerViewSchema } from "@syllabai/contracts";
import {
  buildGroundedTutorGenerator,
  buildSqlVectorArm,
  type LlmProvider,
} from "../services/tutor";
import { resolveEmbeddingProvider } from "../services/content/retrieval";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { defaultClock } from "../services/selfmark";
import {
  LEARNER_BDT_PAPER_DEFAULTS,
  misconceptionStatesByProbability,
  relaxedToPrior,
  skillStatesByRecency,
} from "../services/learner/state";
import { buildClaContextResolver } from "../services/cla/context-resolver";
import { buildClaService } from "../services/cla/service";
import { ClaAttemptRequiredError } from "../services/cla/leakage-policy";
import { buildLlmChain, chainAsLlmProvider, type FailoverLlmChain } from "../services/llmchain";
import {
  ArgumentError,
  TUTOR_UNAVAILABLE_MESSAGE,
  TutorGenerationError,
} from "../services/tutor/errors";
import {
  BadRequestException,
  NotFoundException,
  apiError,
} from "../services/identity/errors";
import { getAuth, requireAuth } from "../middleware/auth";
import type { ClaService } from "../services/cla/service";

const malformedBody = () => apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

async function readJsonBody(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  try {
    const body = await c.req.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** the frozen constraint texts (ClaController :79-89 + jakarta defaults). */
const CLA_ASK_DEFAULTS: Record<string, { absent?: string; size?: string; pattern?: string }> = {
  kind: { absent: "must not be null" },
  mode: { absent: "must not be null" },
  question: { absent: "must not be blank", size: "size must be between 0 and 2000" },
  specCode: { size: "size must be between 0 and 80" },
  noteId: { size: "size must be between 0 and 256" },
};

/**
 * Two-envelope classifier — the 060 classifier shape re-applied to the CLA
 * request fields (the tutor's classifier is module-private to its landed
 * fence; this copy-adapt is disclosed, same law, different fields).
 *
 * T-MIG-097 repair: the classifier now implements the LAYER law (Jackson
 * binds before @Valid) instead of first-issue-by-field-order — a
 * binding-class issue anywhere answers malformed_body even when a
 * constraint violation coexists; among constraint issues the question
 * field reports first (capture L01), otherwise schema-field order.
 */
type ClaZodIssue = ZodError["issues"][number];

function issueField(issue: ClaZodIssue): string {
  return issue.path.reduce<string>(
    (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : String(seg)),
    "",
  );
}

/** LAYER 1 — Jackson binding class: wrong types, closed-enum values, bad uuids. */
function isBindingClass(issue: ClaZodIssue): boolean {
  if (issue.code === "invalid_type") {
    const received = (issue as { received?: string }).received;
    return received !== "undefined" && received !== "null";
  }
  if (issue.code === "invalid_string") {
    return (issue as { validation?: string }).validation === "uuid";
  }
  // the Jackson strict-enum read failure (capture L02/L03: unknown
  // kind/mode = malformed_body "request body is not readable ...")
  return issue.code === "invalid_enum_value";
}

/** LAYER 2 — the @Valid constraint class (single first-violation message). */
function classifyConstraintIssue(issue: ClaZodIssue): string {
  const field = issueField(issue);
  const defaults = CLA_ASK_DEFAULTS[field] ?? {};
  if (issue.code === "invalid_type") {
    // received undefined/null — the @NotNull class
    return `${field}: ${defaults.absent ?? "must not be null"}`;
  }
  if (issue.code === "too_small" || issue.code === "too_big") {
    const minimum = (issue as { minimum?: number }).minimum;
    const zodType = (issue as { type?: string }).type;
    if (issue.code === "too_small" && zodType === "string" && minimum === 1) {
      return `${field}: ${defaults.absent ?? "must not be blank"}`;
    }
    if (defaults.size) return `${field}: ${defaults.size}`;
    const max = (issue as { maximum?: number }).maximum;
    return `${field}: size must be between ${minimum ?? 0} and ${max ?? 0}`;
  }
  return `${field}: request invalid`;
}

function classifyAskError(error: ZodError): { kind: "malformed" } | { kind: "validation"; message: string } {
  const issues = error.issues;
  if (issues.length === 0) return { kind: "malformed" };
  // LAYER 1 — any binding-class failure answers malformed_body regardless
  // of coexisting constraint violations (the Jackson bind-before-@Valid law)
  if (issues.some(isBindingClass)) return { kind: "malformed" };
  // LAYER 2 — constraint violations: the question field reports first
  // (capture L01); the size class does NOT take precedence (conservative:
  // no capture pins it against kind/mode absences)
  const questionIssue = issues.find(
    (i) => issueField(i) === "question" && (i.code === "invalid_type" || i.code === "too_small"),
  );
  const chosen = questionIssue ?? issues[0];
  if (!chosen) return { kind: "malformed" }; // unreachable: issues.length > 0 above
  return { kind: "validation", message: classifyConstraintIssue(chosen) };
}

/** the shared error mapping for the CLA ask route (the frozen handler). */
function mapClaErrors(
  e: unknown,
  c: { json: (b: unknown, s: number) => Response },
): Response | null {
  if (e instanceof NotFoundException) return c.json(apiError(404, "not_found", e.message), 404);
  if (e instanceof BadRequestException) {
    return c.json(apiError(400, "bad_request", e.message), 400);
  }
  if (e instanceof ClaAttemptRequiredError) {
    return c.json(apiError(409, "attempt_required", CLA_CHECK_ATTEMPT_REQUIRED_MESSAGE), 409);
  }
  if (e instanceof ArgumentError) {
    return c.json(apiError(400, "bad_request", "malformed request"), 400);
  }
  if (e instanceof TutorGenerationError) {
    // the dormant seam: the FIXED honest text — never the exception's message
    return c.json(apiError(503, "tutor_unavailable", TUTOR_UNAVAILABLE_MESSAGE), 503);
  }
  return null;
}

export function createClaRouter(cla: ClaService): Hono {
  const r = new Hono();
  // authz shell FIRST (SecurityConfig.java:91 fall-through parity)
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST /ask — ClaController.ask (:91-100)
  r.post("/ask", async (c) => {
    const auth = getAuth(c)!; // shell invariant — the learner identity
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = claAskRequestSchema.safeParse(body);
    if (!parsed.success) {
      const verdict = classifyAskError(parsed.error);
      if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
      return c.json(apiError(400, "validation_failed", verdict.message), 400);
    }
    // the web-layer @NotBlank parity (capture L04): a whitespace-only
    // question BINDS (zod min(1) counts whitespace) but the frozen
    // constraint stage answers validation_failed before the service runs
    if (parsed.data.question.trim().length === 0) {
      return c.json(apiError(400, "validation_failed", "question: must not be blank"), 400);
    }
    // the T-MIG-097 deferred-kind reference gates (capture L05/L06): the
    // frozen dispatch checks SMART_LESSON/NOTE_SECTION required references
    // BEFORE the runtime-step refusal — the context-requirement law is
    // load-bearing on the wire. Refs-present asks still reach the disclosed
    // runtime-step deferral below (SmartLessonService/RevisionNoteRepository
    // ride T-MIG-053 t3/t4; the generation wire rides the operator's
    // section-3 lever).
    const rootId = parsed.data.rootId ?? null;
    const topicNodeId = parsed.data.topicNodeId ?? null;
    const noteId = parsed.data.noteId ?? null;
    if (parsed.data.kind === "SMART_LESSON" && (rootId === null || topicNodeId === null)) {
      return c.json(
        apiError(400, "bad_request", "SMART_LESSON context requires rootId and topicNodeId"),
        400,
      );
    }
    if (parsed.data.kind === "NOTE_SECTION" && (rootId === null || noteId === null)) {
      return c.json(
        apiError(400, "bad_request", "NOTE_SECTION context requires rootId and noteId"),
        400,
      );
    }
    try {
      const answer = await cla.contextualAsk({
        learnerId: auth.userId,
        kind: parsed.data.kind,
        rootId,
        topicNodeId,
        questionId: parsed.data.questionId ?? null,
        partId: parsed.data.partId ?? null,
        specCode: parsed.data.specCode ?? null,
        noteId,
        mode: parsed.data.mode,
        question: parsed.data.question,
      });
      // the wire law: the view validates against the ratified contract —
      // a defensive parse (never fires; the service constructs the shape)
      const wire = claAnswerViewSchema.parse(answer);
      return c.json(wire, 200);
    } catch (e) {
      const mapped = mapClaErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  return r;
}

/**
 * buildClaRouters — the tranche-2 composition root. Wires the REAL module:
 * the resolver (the four dependency-served kinds), the tool registry over
 * the sql-backed learner-model reads (skillStates + the staleness-relaxed
 * misconception readings — the SAME composition the learner-me state view
 * uses, MED-2/ADR-032), the T-C32-compliant vector arm over the injected
 * embedding provider (honest empty when unkeyed), the grounded generator
 * over the LLM seam of record, and a no-op telemetry sink (the 061 posture
 * — zero tables, ADR-031 intact; disclosed). activeStruggleInferences has
 * NO landed v2 read (the struggle-inference table read is a later wave; the
 * tutor module itself runs with NO learner model at all) — the port returns
 * the honest empty list, the policy falls through to the no-signal
 * EXPLANATION plan, disclosed.
 *
 * LLM SEAM OF RECORD (ADR-MIG-0002, operator directive ①): the §26.1 chain
 * rides the chainAsLlmProvider bridge — zero-key/test boots keep the honest
 * 503 tutor_unavailable posture (every member registers dormant, the
 * deterministic refusals NEVER 503 law is untouched); keyed boots generate
 * for real with failover. opts.chain accepts the shared composition-root
 * chain; chain null forces the dormant seam (rig work only).
 */
export function buildClaRouters(
  env: Record<string, string | undefined> = process.env,
  opts: { chain?: FailoverLlmChain | null } = {},
) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const resolver = buildClaContextResolver({ sql, clock: defaultClock });
  const learnerModel = {
    skillStates: (learnerId: string) => skillStatesByRecency(sql, learnerId),
    misconceptionReadings: async (learnerId: string) => {
      const rows = await misconceptionStatesByProbability(sql, learnerId);
      // LearnerModelService.misconceptionReadings :225-235 — the
      // staleness-relaxed probability per MED-2/ADR-032 (the SAME
      // composition the learner-me state view runs)
      return rows.map((m) => ({
        misconceptionNodeId: m.misconceptionNodeId,
        effective: relaxedToPrior(
          m.probability,
          LEARNER_BDT_PAPER_DEFAULTS.prior,
          m.lastEvidenceAt,
          defaultClock.now(),
          LEARNER_BDT_PAPER_DEFAULTS.stalenessTauDays,
        ),
      }));
    },
    // no landed v2 read (disclosed — the honest empty list; the policy's
    // no-signal fall-through is the frozen law for zero inferences)
    activeStruggleInferences: async () => [],
  };
  const dormantClaLlm: LlmProvider = {
    available: () => false,
    generate: async () => ({ text: "", model: "dormant", providerName: "dormant" }),
    stream: async function* () {},
  };
  const chain = opts.chain === undefined ? buildLlmChain(env) : opts.chain;
  const cla = buildClaService({
    sql,
    clock: defaultClock,
    resolver,
    registryDeps: { sql, clock: defaultClock, learnerModel },
    learnerModel,
    vectorRetriever: buildSqlVectorArm(sql, resolveEmbeddingProvider(env)),
    generator: buildGroundedTutorGenerator(chain === null ? dormantClaLlm : chainAsLlmProvider(chain)),
    telemetry: () => {},
  });
  return {
    cla,
    claRoute: createClaRouter(cla),
  };
}
