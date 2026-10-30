/**
 * Paper-marking pipeline router — T-MG-CROPMARK-1 run-001.
 * Plan of record: docs/MG-MARK-PARITY-PLAN.md §3.4.
 *
 *   POST /api/v1/paper-marks/regions/:regionId/mark
 *     → 202 {markId, status:"queued"} (the long-running posture of record:
 *       202 + poll, retry: 0 per their offline class) | 400 malformed
 *       path/body/crop | 413 crop over cap | 404 unknown region | 422
 *       region without mark_points
 *   GET  /api/v1/paper-marks/marks/:markId
 *     → 200 the poll snapshot (queued | running | succeeded | failed) |
 *       400 malformed uuid | 404 unknown mark
 *   POST /api/v1/paper-marks/parts/:partId/regrade  {answerHtml}
 *     → the typed channel (the answer IS the transcription — no vision
 *       step); same 202 + poll posture
 *
 * POSTURE LAW (the Phase-2 surface posture): the learner id rides the JWT
 * context — getAuth(c).userId — NEVER the wire; authenticated-only shell
 * FIRST (401 before any handler work).
 *
 * Binding law (the v2-native surface posture, paper-awards parity): an
 * unparseable uuid path param is 400 bad_request "malformed request"; an
 * unreadable body is 400 malformed_body; a zod constraint failure is 400
 * validation_failed "field: message" (first issue — the structural
 * duplicate law; the fences stay independent). The pipeline's own
 * PipelineError taxonomy maps to its honest envelope right here (the
 * global onError keeps the identity domain; this module keeps its own).
 *
 * The registry is IN-PROCESS and NON-DURABLE — disclosed: a restart loses
 * queued/running jobs (the poll 404s honestly afterwards); retry: 0 (a
 * re-mark is a NEW job; the once-only claim absorbs the duplicate award
 * writes idempotently — the Phase-2 receipt law).
 */
import { Hono } from "hono";
import type { ZodError } from "zod";
import {
  PaperMarking,
  MarkJobRegistry,
  PipelineError,
  parseImageDataUrl,
  type PaperMarkingLlm,
} from "../../services/paper-marking";
import { PaperAwards, createPaperAwardPublisher } from "../../services/paper-awards";
import type { SqlFn } from "../../services/paper-awards/sql";
import type { TranscriptionProvider } from "../../services/answer-input/service";
import { buildLlmChain, chainAsTranscriptionProvider, type FailoverLlmChain } from "../../services/llmchain";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../../services/identity/users";
import { BadRequestException, apiError } from "../../services/identity/errors";
import { requireAuth, getAuth } from "../../middleware/auth";
import {
  paperMarkRegionPathSchema,
  paperMarkRegradePathSchema,
  paperMarkPollPathSchema,
  paperMarkRegionRequestSchema,
  paperMarkRegradeRequestSchema,
  paperMarkPollResponseSchema,
} from "@syllabai/contracts";

/** Port of MethodArgumentTypeMismatchException handling — the shared Boot
 * parity envelope (structural duplicate of the paper-awards helper; fences
 * stay independent). */
const malformedRequest = () => new BadRequestException("malformed request");

const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

/** First-issue "field: message" verdict (the paper-awards shape, scoped to
 * this surface's constraints — structural duplicate, fences independent). */
function validationVerdict(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return "invalid request body";
  const field = first.path.reduce<string>(
    (acc, seg) => (typeof seg === "number" ? `${acc}[${seg}]` : (acc ? `${acc}.${seg}` : String(seg))),
    "",
  );
  return field ? `${field}: ${first.message}` : first.message;
}

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

/** PipelineError → the honest envelope (the module's own taxonomy; the
 * identity domain stays with the global onError). */
function pipelineEnvelope(err: PipelineError) {
  return apiError(err.status as 400 | 413 | 422 | 502 | 503, err.code, err.message);
}

export function createPaperMarkingRouter(marking: PaperMarking, registry: MarkJobRegistry): Hono {
  const r = new Hono();

  // authz shell FIRST — every surface here is learner-scoped (the JWT
  // context supplies the learner; 401 before any handler work).
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // POST /regions/:regionId/mark — the crop channel. The synchronous
  // pre-checks fail FAST (400/413/404/422 before the job exists); the
  // model work runs async under the registry (202 + poll).
  r.post("/regions/:regionId/mark", async (c) => {
    const path = paperMarkRegionPathSchema.safeParse({ regionId: c.req.param("regionId") });
    if (!path.success) throw malformedRequest();
    const raw = await readJsonBody(c);
    if (raw === null) return c.json(malformedBody(), 400 as const);
    const body = paperMarkRegionRequestSchema.safeParse(raw);
    if (!body.success) {
      return c.json(apiError(400, "validation_failed", validationVerdict(body.error)), 400 as const);
    }
    try {
      // byte-level pre-check (mime/strict-base64/empty/4MB cap) — before
      // the job exists, so a bad payload never becomes a doomed job.
      parseImageDataUrl(body.data.imageDataUrl);
      const auth = getAuth(c)!;
      const plan = await marking.plan(path.data.regionId); // 404 unknown | 422 no definitions
      const markId = registry.enqueue((id) =>
        marking.markRegion({ learnerId: auth.userId, plan, imageDataUrl: body.data.imageDataUrl }).then((res) => {
          void id;
          return res;
        }),
      );
      return c.json({ markId, status: "queued" as const }, 202 as const);
    } catch (err) {
      if (err instanceof PipelineError) return c.json(pipelineEnvelope(err), err.status as 400 | 413 | 422);
      throw err; // NotFoundException → the global 404 envelope
    }
  });

  // POST /parts/:partId/regrade — the typed channel.
  r.post("/parts/:partId/regrade", async (c) => {
    const path = paperMarkRegradePathSchema.safeParse({ partId: c.req.param("partId") });
    if (!path.success) throw malformedRequest();
    const raw = await readJsonBody(c);
    if (raw === null) return c.json(malformedBody(), 400 as const);
    const body = paperMarkRegradeRequestSchema.safeParse(raw);
    if (!body.success) {
      return c.json(apiError(400, "validation_failed", validationVerdict(body.error)), 400 as const);
    }
    try {
      const auth = getAuth(c)!;
      const plan = await marking.plan(path.data.partId); // 404 unknown | 422 no definitions
      const markId = registry.enqueue(() =>
        marking.regradePart({ learnerId: auth.userId, plan, answerHtml: body.data.answerHtml }),
      );
      return c.json({ markId, status: "queued" as const }, 202 as const);
    } catch (err) {
      if (err instanceof PipelineError) return c.json(pipelineEnvelope(err), err.status as 400 | 413 | 422);
      throw err;
    }
  });

  // GET /marks/:markId — the poll.
  r.get("/marks/:markId", async (c) => {
    const path = paperMarkPollPathSchema.safeParse({ markId: c.req.param("markId") });
    if (!path.success) throw malformedRequest();
    const snap = registry.poll(path.data.markId);
    if (snap === null) return c.json(apiError(404, "not_found", `mark ${path.data.markId} not found`), 404 as const);
    return c.json(paperMarkPollResponseSchema.parse(snap));
  });

  return r;
}

// ── composition root ─────────────────────────────────────────────────────────

/**
 * Module + router composition for the app root — the buildPaperAwardsRouters
 * shape with the smartmark seam posture (tests inject their doubles; TEST
 * mode never constructs real adapters — CI stays model-free). The ONE chain
 * of record feeds BOTH model seams: the vision transcription rides the
 * chainAsTranscriptionProvider bridge (media routed ONLY to vision-capable
 * members — the frozen routing law), the doctrine-match rides the
 * paper-mark/v1 adapter below (text-only).
 */
export function buildPaperMarkingRouters(
  env: Record<string, string | undefined> = process.env,
  seams: {
    chain?: FailoverLlmChain;
    sql?: SqlFn;
    awards?: PaperAwards;
    transcriber?: TranscriptionProvider | null;
    markingLlm?: PaperMarkingLlm | null;
    registry?: MarkJobRegistry;
  } = {},
) {
  const chain = seams.chain ?? buildLlmChain(env);
  // LAZY database resolution: an injected sql seam never touches env (the
  // route-test posture — seams replace the env-dependent construction).
  const sql = (seams.sql ?? createSql(requireDatabaseUrl(env as { DATABASE_URL?: string }))) as unknown as SqlFn;
  const awards = seams.awards ?? new PaperAwards(sql, createPaperAwardPublisher(sql));
  const transcriber = seams.transcriber !== undefined ? seams.transcriber : chainAsTranscriptionProvider(chain);
  const markingLlm = seams.markingLlm !== undefined ? seams.markingLlm : chainAsPaperMarkingLlm(chain);
  const marking = new PaperMarking(sql, awards, transcriber, markingLlm);
  const registry = seams.registry ?? new MarkJobRegistry();
  return { marking, registry, paperMarkingRoute: createPaperMarkingRouter(marking, registry) };
}

/** The doctrine-match adapter: the ONE FailoverLlmChain of record onto the
 * pipeline's PaperMarkingLlm port (the chainAsFeedbackLlm shape; text-only
 * — the crop's pixels ride the transcription seam, never this one). */
export function chainAsPaperMarkingLlm(chain: FailoverLlmChain): PaperMarkingLlm {
  return {
    generate: async (req) => {
      const out = await chain.generate({
        system: req.system,
        user: req.user,
        temperature: req.temperature,
        maxTokens: req.maxTokens,
      });
      return { text: out.text };
    },
  };
}
