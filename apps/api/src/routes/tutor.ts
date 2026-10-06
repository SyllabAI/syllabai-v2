/**
 * Tutor ask router — T-MIG-060 tranche 2. Path parity with the frozen core
 * (syllabai-core @ 6cad6ef), TutorController.java @ /api/v1/tutor:
 *
 *   POST /ask         → 200 TutorAnswerView (the blocking pipeline)
 *   POST /ask/stream  → text/event-stream SSE (the streaming twin)
 *
 * Route security: /api/v1/tutor/** has NO specific SecurityConfig matcher —
 * it falls under anyRequest().authenticated() (SecurityConfig.java:91); the
 * authz shell runs FIRST and the router owns its authz internally. The R8
 * llm:ask budget admits BOTH paths (the v2 ratelimit middleware already
 * lists them — T-MIG-016's tier port).
 *
 * Exception law (GlobalExceptionHandler parity, verbatim):
 *   NotFoundError        → 404 not_found, e.message verbatim (the §22
 *                          foreign-session probe — indistinguishable from
 *                          unknown, never an existence signal)
 *   ConflictError        → 409 conflict (the V53 course-consistency probe)
 *   ArgumentError        → 400 bad_request "malformed request" (the
 *                          IllegalArgumentException mapping :167-170 — the
 *                          FIXED text, never e.message)
 *   TutorGenerationError → 503 tutor_unavailable with the FIXED
 *                          UNAVAILABLE_MESSAGE (:95-104, deep-audit 09-28
 *                          M2: the boundary NEVER trusts the exception text
 *                          — provider error bodies are untrusted third-party
 *                          content and never reach a client body)
 *
 * Two-envelope body law (Jackson binds the whole document before @Valid):
 *   binding failures (wrong JSON types, malformed sessionId uuid) → 400
 *     malformed_body; constraint violations (@NotBlank/@Size/@Pattern on
 *     question/history/courseRef) → 400 validation_failed "field: message"
 *     with the jakarta annotation messages.
 *
 * SSE delivery law (:208-256 + :258-337):
 *   - errors BEFORE the stream opens (validation, foreign session, course
 *     consistency) are ordinary JSON error responses — the stream is not
 *     open;
 *   - errors AFTER the stream opens travel as the wire `error` event with
 *     the fixed client-safe text, then the stream closes;
 *   - the §22 session append happens on the `completed` event only (a
 *     failed stream persists nothing, matching a blocking ask that throws);
 *     an append failure is logged and NEVER corrupts the delivered answer
 *     (the append guard :314-318);
 *   - the frozen bounded delivery pool + its "busy" rejection text
 *     (:99-107, :249-254) have NO v2 counterpart — the Hono response IS the
 *     stream, there is no executor admission step; the disclosure lives
 *     here, the unavailable text remains the only wire-error class.
 *
 * DORMANT SEAM (the smartmark posture): the LlmProvider infra is the
 * wave-3 LLM-chain lane's surface — the composition root wires a provider
 * whose available() is false, so generation-reaching asks serve the honest
 * 503 tutor_unavailable while every deterministic law (authz, §22 probes,
 * refusal honesty, citation plumbing, session lifecycle) stays LIVE and
 * pinned.
 */
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ZodError } from "zod";
import { tutorAskRequestSchema } from "@syllabai/contracts";
import {
  buildGroundedTutorGenerator,
  buildPaperQuestionResolver,
  buildSqlVectorArm,
  buildTutorModule,
  type LlmProvider,
  type TutorModule,
} from "../services/tutor";
import { CurriculumScopeResolver } from "../services/content/scope";
import { resolveEmbeddingProvider } from "../services/content/retrieval";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../services/identity/users";
import { defaultClock } from "../services/selfmark";
import {
  ArgumentError,
  ConflictError,
  NotFoundError,
  TUTOR_UNAVAILABLE_MESSAGE,
  TutorGenerationError,
  conversationTurnOf,
} from "../services/tutor";
import { apiError } from "../services/identity/errors";
import { requireAuth, getAuth } from "../middleware/auth";
import { createTutorSessionsRouter } from "./tutorsessions";
import type { ConversationTurn } from "../services/tutor/conversation";

/** V53: blank courseRef = absent — the hub may send "" from unmapped
 *  courses, and the contract wants ONE absent shape downstream (:144-149). */
function normalizeCourseRef(courseRef: string | null | undefined): string | null {
  if (courseRef == null || courseRef.trim() === "") {
    return null;
  }
  return courseRef.trim();
}

const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

async function readJsonBody(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** The jakarta annotation messages the captured 400s pin. */
const ASK_DEFAULTS: Record<string, Record<string, string>> = {
  question: { absent: "must not be blank", size: "size must be between 0 and 2000" },
  courseRef: { size: "size must be between 0 and 64" },
  history: { size: "size must be between 0 and 12" },
  "history.role": { absent: "must not be blank", pattern: 'must match "user|assistant"' },
  "history.text": { absent: "must not be blank", size: "size must be between 0 and 2000" },
};

/**
 * Two-envelope classifier — the tutor edition of the ratified law (R-1).
 * Jackson binds before @Valid: wrong JSON types and malformed uuids are
 * BINDING failures (malformed_body); @NotBlank/@Size/@Pattern failures are
 * CONSTRAINT violations (validation_failed). zod's enum failure is the
 * @Pattern law (invalid_enum_value / invalid_value across zod majors).
 * T-MIG-070: the @NotBlank discriminator on question/history.text is the
 * notBlank REFINE (contracts/tutor.ts — the #93/#96 precedent), so blank
 * binds report as `custom` issues carrying the verbatim jakarta message.
 */
function classifyAskError(error: ZodError): { kind: "malformed" } | { kind: "validation"; message: string } {
  const first = error.issues[0];
  if (!first) return { kind: "malformed" };
  const field = first.path.reduce<string>(
    (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : String(seg)),
    "",
  );
  // indexed history paths carry their field suffix ("history[0].role")
  const base = field.replace(/\[\d+\]/, "");
  const suffix = field.includes(".") ? field.slice(field.lastIndexOf(".") + 1) : field;
  const defaults =
    ASK_DEFAULTS[field] ??
    (field.includes("[") ? ASK_DEFAULTS[`${base}.${suffix}`] : undefined) ??
    ASK_DEFAULTS[base] ??
    {};
  if (first.code === "invalid_type") {
    const received = (first as { received?: string }).received;
    // a present-but-wrong JSON type cannot reach bean validation
    if (received !== "undefined" && received !== "null") return { kind: "malformed" };
    // an absent field: @NotBlank → "must not be blank", @Size-only → null
    return { kind: "validation", message: `${field}: ${defaults.absent ?? "must not be null"}` };
  }
  if (first.code === "invalid_string") {
    const validation = (first as { validation?: string }).validation;
    if (validation === "uuid") {
      // a malformed uuid fails Jackson's UUID binding, before @Valid
      return { kind: "malformed" };
    }
    return { kind: "validation", message: `${field}: request invalid` };
  }
  if (first.code === "invalid_enum_value") {
    // the @Pattern("user|assistant") constraint law (zod v3 enum code)
    return { kind: "validation", message: `${field}: ${defaults.pattern ?? "request invalid"}` };
  }
  if (first.code === "too_small" || first.code === "too_big") {
    // T-MIG-070: the notBlank refine replaced min(1) on question/history.text,
    // so blank binds no longer arrive as too_small — this branch is DEFENSIVE
    // (any future min(1) chain would re-arm it; zod v3 issues carry no input
    // value, so the law keys on (type, minimum))
    const minimum = (first as { minimum?: number }).minimum;
    const zodType = (first as { type?: string }).type;
    if (first.code === "too_small" && zodType === "string" && minimum === 1) {
      return { kind: "validation", message: `${field}: ${defaults.absent ?? "must not be blank"}` };
    }
    if (defaults.size) {
      return { kind: "validation", message: `${field}: ${defaults.size}` };
    }
    const max = (first as { maximum?: number }).maximum;
    return {
      kind: "validation",
      message: `${field}: size must be between ${minimum ?? 0} and ${max ?? 0}`,
    };
  }
  if (first.code === "custom") {
    // the @NotBlank refine reports as a `custom` issue carrying its own
    // jakarta default message — surface it verbatim (the #93 classroom
    // precedent; without this branch the refine's message is swallowed by
    // the "request invalid" fallback). zod skips refinements when an earlier
    // check fails, so a custom issue on these fields IS the @NotBlank hit.
    return { kind: "validation", message: `${field}: ${first.message ?? defaults.absent ?? "request invalid"}` };
  }
  return { kind: "validation", message: `${field}: request invalid` };
}

/** The shared error mapping for the tutor ask routes (the frozen handler). */
function mapTutorErrors(
  e: unknown,
  c: { json: (b: unknown, s: number) => Response },
): Response | null {
  if (e instanceof NotFoundError) return c.json(apiError(404, "not_found", e.message), 404);
  if (e instanceof ConflictError) return c.json(apiError(409, "conflict", e.message), 409);
  if (e instanceof ArgumentError) {
    return c.json(apiError(400, "bad_request", "malformed request"), 400);
  }
  if (e instanceof TutorGenerationError) {
    // deep-audit M2: the FIXED honest text — never the exception's message
    return c.json(apiError(503, "tutor_unavailable", TUTOR_UNAVAILABLE_MESSAGE), 503);
  }
  return null;
}

interface ParsedAskBody {
  question: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  sessionId?: string;
  courseRef?: string;
}

/**
 * The §22 pre-flight both ask routes run BEFORE the pipeline/stream opens
 * (:151-174 / :209-229): history re-sanitization, the foreign-session 404
 * probe, the V53 course-consistency 409 probe. A failure here is a JSON
 * error response — the stream has not opened.
 */
async function askPreFlight(
  module: TutorModule,
  learnerId: string,
  body: ParsedAskBody,
): Promise<{ history: ConversationTurn[]; courseRef: string | null }> {
  const history = (body.history ?? [])
    .map((turn) => conversationTurnOf(turn.role, turn.text))
    .filter((turn): turn is NonNullable<ReturnType<typeof conversationTurnOf>> => turn != null);
  const courseRef = normalizeCourseRef(body.courseRef);
  if (body.sessionId != null) {
    // §22 integrity probe BEFORE the pipeline: a foreign/unknown session id
    // fails fast (404) instead of spending an LLM call and failing after
    await module.sessionStore.requireOwned(learnerId, body.sessionId);
    // V53 (ADR-030): a session that already serves a course refuses a
    // different one up front (409) — before the LLM call, same shape as the
    // foreign-session probe
    if (courseRef != null) {
      await module.sessionStore.requireCourseConsistent(learnerId, body.sessionId, courseRef);
    }
  }
  return { history, courseRef };
}

export function createTutorRouter(module: TutorModule): Hono {
  const r = new Hono();
  // authz shell FIRST (SecurityConfig.java:91 fall-through parity)
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST /ask — TutorController.ask (:151-193)
  r.post("/ask", async (c) => {
    const auth = getAuth(c)!; // shell invariant
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = tutorAskRequestSchema.safeParse(body);
    if (!parsed.success) {
      const verdict = classifyAskError(parsed.error);
      if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
      return c.json(apiError(400, "validation_failed", verdict.message), 400);
    }
    try {
      const { history, courseRef } = await askPreFlight(module, auth.userId, parsed.data);
      const answer = await module.ask(
        auth.userId,
        parsed.data.question,
        history,
        parsed.data.sessionId ?? null,
        courseRef,
      );
      // §22 session append AFTER the pipeline (:177-191); the append guard:
      // a persistence failure must not 5xx an answer the learner already
      // paid the full pipeline for — the exchange is lost from the
      // transcript, the answer itself is delivered
      if (parsed.data.sessionId != null) {
        try {
          await module.sessionStore.append(auth.userId, {
            sessionId: parsed.data.sessionId,
            question: parsed.data.question,
            answer: answer.answer,
            evidenceCount: answer.evidenceCount,
            refused: answer.refused,
            model: answer.model,
            provider: answer.provider,
            latencyMs: answer.latencyMs,
            courseRef,
          });
        } catch {
          // logged-only by the frozen law (log.error :188-189)
        }
      }
      return c.json(answer, 200);
    } catch (e) {
      const mapped = mapTutorErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  // POST /ask/stream — TutorController.askStream (:208-256): same request
  // contract, same §22 probes (JSON errors before the stream opens), then
  // the pipeline delivered as text/event-stream
  r.post("/ask/stream", async (c) => {
    const auth = getAuth(c)!;
    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);
    const parsed = tutorAskRequestSchema.safeParse(body);
    if (!parsed.success) {
      const verdict = classifyAskError(parsed.error);
      if (verdict.kind === "malformed") return c.json(malformedBody(), 400);
      return c.json(apiError(400, "validation_failed", verdict.message), 400);
    }
    try {
      const { history, courseRef } = await askPreFlight(module, auth.userId, parsed.data);
      const learnerId = auth.userId;
      const question = parsed.data.question;
      const sessionId = parsed.data.sessionId ?? null;
      return streamSSE(c, async (stream) => {
        try {
          for await (const event of module.askStream(learnerId, question, history, sessionId, courseRef)) {
            if (event.kind === "citations") {
              await stream.writeSSE({
                event: "citations",
                data: JSON.stringify({ citations: event.citations, sufficient: event.sufficient }),
              });
            } else if (event.kind === "meta") {
              await stream.writeSSE({
                event: "meta",
                data: JSON.stringify({
                  provider: event.provider,
                  model: event.model, // null on refusals — Jackson writes it
                  refused: event.refused,
                  evidenceCount: event.evidenceCount,
                }),
              });
            } else if (event.kind === "delta") {
              await stream.writeSSE({ event: "delta", data: JSON.stringify({ text: event.text }) });
            } else {
              // completed (:304-321): the §22 append on success only — a
              // failed stream persists nothing; the wire shape stays the
              // lean {ok:true} the browser ignores-but-tolerates
              if (sessionId != null) {
                try {
                  await module.sessionStore.append(learnerId, {
                    sessionId,
                    question,
                    answer: event.fullAnswer,
                    evidenceCount: event.evidenceCount,
                    refused: event.refused,
                    model: event.model,
                    provider: event.provider,
                    latencyMs: event.latencyMs,
                    courseRef,
                  });
                } catch {
                  // the append guard: a persistence failure must not corrupt
                  // the delivered answer (:314-318)
                }
              }
              await stream.writeSSE({ event: "done", data: JSON.stringify({ ok: true }) });
            }
          }
        } catch {
          // M2 contract: fixed client-safe text AFTER the stream opened —
          // provider error bodies and ops guidance stay in the server logs
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ message: TUTOR_UNAVAILABLE_MESSAGE }),
          });
        }
      });
    } catch (e) {
      const mapped = mapTutorErrors(e, c);
      if (mapped) return mapped;
      throw e;
    }
  });

  return r;
}

/**
 * The dormant LLM seam (the smartmark posture): the provider infra is the
 * wave-3 LLM-chain lane's surface. available() = false makes every
 * generation-reaching ask serve the honest 503 tutor_unavailable while the
 * deterministic laws stay live; never a fake 200.
 */
const dormantTutorLlm: LlmProvider = {
  available: () => false,
  generate: async () => ({ text: "", model: "dormant", providerName: "dormant" }),
  stream: async function* () {},
};

/**
 * buildTutorRouters — the tranche-2 composition root. Wires the REAL
 * module: the content module's curriculum scopes (resolveActive /
 * resolveForCourse compose, never mirrored), the T-C32-compliant vector
 * arm over the injected embedding provider (honest empty when unkeyed),
 * the tranche-1b paper-question resolver (the REQUIRED port — no
 * notPaperAsk default anywhere), the grounded generator over the dormant
 * LLM seam, and a no-op telemetry sink (the §18 research consumer is
 * T-MIG-061's title — disclosed dormant).
 */
export function buildTutorRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl);
  const module = buildTutorModule(sql, defaultClock, {
    scopes: new CurriculumScopeResolver(sql),
    vectorRetriever: buildSqlVectorArm(sql, resolveEmbeddingProvider(env)),
    paperQuestionResolver: buildPaperQuestionResolver(sql),
    generator: buildGroundedTutorGenerator(dormantTutorLlm),
    telemetry: () => {},
  });
  return {
    module,
    tutorRoute: createTutorRouter(module),
    tutorSessionsRoute: createTutorSessionsRouter(module),
  };
}
