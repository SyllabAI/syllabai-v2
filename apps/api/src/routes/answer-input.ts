/**
 * Answer-input route factory — path parity with the frozen Java core
 * (T-MIG-034; verified 2026-10-05):
 *   TranscriptionController @RequestMapping("/api/v1/learners/me/answer-input") (:44)
 *     POST /transcribe   (JSON body: imageBase64 + mimeType)
 *
 * Route security (SecurityConfig.java:91): no specific matcher for this
 * prefix → anyRequest().authenticated(); the authz shell runs before the
 * handler (captured w3-transcribe-unauthed-401 Boot 401 envelope). The
 * frozen controller's null-learnerId check is carried as a documented
 * invariant (the port's auth always yields a userId; an absent one is the
 * 400 transcription_bad_request "authenticated learner required" path).
 *
 * Body binding law (capture + frozen handler parity, the T-MIG-030 tranche-2
 * conventions):
 *   - truly empty / non-JSON body, or non-object JSON → 400 malformed_body
 *     "request body is not readable (check field types and enum values)"
 *     (HttpMessageNotReadableException :172-179);
 *   - String-typed fields: numbers/booleans coerce (Jackson scalar→String);
 *     arrays/objects fail binding → malformed_body; null/absent stay null
 *     and reach the SERVICE law (→ 400 transcription_bad_request
 *     "image is required" / "unsupported image type …");
 *   - the mime whitelist, strict-base64, size-cap, [empty] and provider
 *     failure mappings are SERVICE law (AnswerInputTranscriptionService
 *     port) — the route only translates the thrown envelopes.
 *
 * DOCTRINE: LLM-OUTPUT surface — NOT golden-gated (GOLDEN_MASTER §3);
 * behavioural gates only. The provider seam is DORMANT by default (null) —
 * validated requests answer 503 transcription_unavailable with the frozen
 * chain-exhausted message until the LLM-chain lane wires a provider.
 */
import { Hono } from "hono";
import {
  transcriptionRequestSchema,
  transcriptionViewSchema,
  type TranscriptionView,
} from "@syllabai/contracts";
import { requireAuth } from "../middleware/auth";
import { apiError } from "../services/identity/errors";
import { buildAnswerInputComponents } from "../services/answer-input";
import {
  AnswerInputTranscriptionService,
  TranscriptionBadRequestError,
  TranscriptionImageTooLargeError,
  TranscriptionNothingReadableError,
  TranscriptionUnavailableError,
} from "../services/answer-input/service";

/** HttpMessageNotReadableException handler body (:172-179) — verbatim. */
const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

async function readJsonBody(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown> | null> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return null; // syntax error / empty body → unreadable (captured)
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/**
 * Jackson scalar→String coercion (routes/auth coerceStringFields
 * precedent): numbers/booleans coerce to their string form for the two
 * String-typed fields; arrays/objects stay (binding failure).
 */
function coerceStringFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  for (const k of ["imageBase64", "mimeType"]) {
    const v = out[k];
    if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
  }
  return out;
}

export function createAnswerInputRouter(deps: {
  transcription: AnswerInputTranscriptionService;
}): Hono {
  const r = new Hono();

  r.post("/transcribe", async (c) => {
    const auth = requireAuth(c);
    if (auth instanceof Response) return auth;
    // frozen invariant: this surface is ALWAYS per-learner (no anonymous
    // image transcription) — the port's auth always resolves a userId.
    if (auth.userId === undefined || auth.userId.length === 0) {
      return c.json(
        apiError(400, "transcription_bad_request", "authenticated learner required"),
        400,
      );
    }

    const body = await readJsonBody(c);
    if (body === null) return c.json(malformedBody(), 400);

    const coerced = coerceStringFields(body);
    const parsed = transcriptionRequestSchema.safeParse(coerced);
    if (!parsed.success) return c.json(malformedBody(), 400);

    try {
      const result = await deps.transcription.transcribe(
        parsed.data.imageBase64 ?? null,
        parsed.data.mimeType ?? null,
      );
      const view: TranscriptionView = {
        text: result.text,
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
      };
      // shape guard: the view is validated against the canonical contract
      // before the wire (the response envelope is the contract; the TEXT
      // inside it is never golden-gated).
      transcriptionViewSchema.parse(view);
      return c.json(view, 200);
    } catch (e) {
      if (e instanceof TranscriptionBadRequestError) {
        return c.json(apiError(e.status, e.code, e.message), 400);
      }
      if (e instanceof TranscriptionImageTooLargeError) {
        return c.json(apiError(e.status, e.code, e.message), 413);
      }
      if (e instanceof TranscriptionNothingReadableError) {
        return c.json(apiError(e.status, e.code, e.message), 422);
      }
      if (e instanceof TranscriptionUnavailableError) {
        return c.json(apiError(e.status, e.code, e.message), 503);
      }
      throw e;
    }
  });

  return r;
}

/**
 * Module + routers composition for the app root — the provider seam stays
 * DORMANT (null) until the LLM-chain lane wires it (T-MIG-032 precedent);
 * the validation shell + error envelopes are live.
 */
export function buildAnswerInputRouters() {
  const components = buildAnswerInputComponents(null);
  return {
    components,
    transcribeRoute: createAnswerInputRouter({ transcription: components.transcription }),
  };
}
