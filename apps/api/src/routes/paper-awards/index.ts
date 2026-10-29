/**
 * Paper-marks award router — T-MG-AWARDS-1 run-001.
 * Plan of record: docs/MG-MARK-PARITY-PLAN.md §3.2.
 *
 *   GET  /api/v1/paper-marks?documentRefType&documentRefId
 *     → PaperMarksLedger (200; honest-empty regions:[] for an unmarked
 *       document) | 400 malformed query uuid
 *   POST /api/v1/paper-marks/regions/:regionId/awards
 *     → PaperAwardWriteResponse (200 claim receipt; suppressed re-fires
 *       are 200 counts, never errors) | 400 malformed body | 404 unknown
 *       region
 *
 * POSTURE LAW (plan §3.2, pin d): the learner id rides the JWT context —
 * getAuth(c).userId — NEVER the wire (no learnerId field exists on any
 * contract shape; the ledger is the CALLING learner's by construction).
 * Route security: authenticated-only shell FIRST (the SecurityConfig
 * anyRequest().authenticated() parity — the selfmark/assessment shell
 * posture; 401 before any handler work).
 *
 * Binding law (the v2-native surface posture, RECT-1 parity): an
 * unparseable uuid path/query param is 400 bad_request "malformed request"
 * (the shared MethodArgumentTypeMismatchException envelope — the
 * structural duplicate law); an unreadable body is 400 malformed_body; a
 * zod constraint failure is 400 validation_failed "field: message"
 * (first issue). The POST bridge 404s an unknown region (T-C20 envelope,
 * "region {uuid} not found").
 *
 * The POST is Phase 4's write site (plan §3.2: "Phase 4's pipeline writes
 * here") — shipped now so the pipeline lane only builds the crop-mark
 * stage; the service seam (PaperAwardPublisher) is the pipeline's
 * in-process path, the route is the operator/debug + external-marker
 * integration surface.
 */
import { Hono } from "hono";
import type { ZodError } from "zod";
import { PaperAwards, createPaperAwardPublisher, type SqlFn } from "../../services/paper-awards";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../../services/identity/users";
import { BadRequestException, apiError } from "../../services/identity/errors";
import { requireAuth, getAuth } from "../../middleware/auth";
import {
  paperMarksQuerySchema,
  paperAwardRegionPathSchema,
  paperAwardWriteRequestSchema,
} from "@syllabai/contracts";

/** Port of MethodArgumentTypeMismatchException handling
 * (GlobalExceptionHandler.java:167-170) — the shared Boot parity envelope
 * (structural duplicate of the paper-regions helper; fences stay
 * independent). */
const malformedRequest = () => new BadRequestException("malformed request");

const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

/** First-issue "field: message" verdict (the selfmark classifier shape,
 * scoped to this surface's constraints — no frozen-core binding cascade
 * to mirror on a v2-native surface). */
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

export function createPaperAwardsRouter(awards: PaperAwards): Hono {
  const r = new Hono();

  // authz shell FIRST — every surface here is learner-scoped (the JWT
  // context supplies the learner; 401 before any handler work).
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET /paper-marks — the getRegionMarks ledger, learner-scoped. The
  // documentRefType defaults to paper_asset (the Phase-2 scope); the
  // documentRefId is required (400 malformed when not a uuid).
  r.get("/", async (c) => {
    const parsed = paperMarksQuerySchema.safeParse({
      documentRefType: c.req.query("documentRefType") ?? undefined,
      documentRefId: c.req.query("documentRefId") ?? "",
    });
    if (!parsed.success) throw malformedRequest();
    const auth = getAuth(c)!;
    return c.json(await awards.ledger(auth.userId, parsed.data.documentRefType, parsed.data.documentRefId));
  });

  // POST /regions/:regionId/awards — the claim receipt. Identity: the
  // bridge resolves the region (404 unknown); the learner rides the JWT.
  r.post("/regions/:regionId/awards", async (c) => {
    const path = paperAwardRegionPathSchema.safeParse({ regionId: c.req.param("regionId") });
    if (!path.success) throw malformedRequest();
    const raw = await readJsonBody(c);
    if (raw === null) return c.json(malformedBody(), 400 as const);
    const body = paperAwardWriteRequestSchema.safeParse(raw);
    if (!body.success) {
      return c.json(apiError(400, "validation_failed", validationVerdict(body.error)), 400 as const);
    }
    const auth = getAuth(c)!;
    const resolution = await awards.resolveRegion(path.data.regionId);
    return c.json(
      await awards.recordRegionAwards({
        learnerId: auth.userId,
        resolution,
        pipelineVersion: body.data.pipelineVersion,
        awards: body.data.awards,
      }),
    );
  });

  return r;
}

/**
 * Module + router composition for the app root — the buildPaperRegionsRouters
 * shape (env → requireDatabaseUrl → createSql adapter); the LIVE DC-7
 * claim publisher rides the service (unit tests inject their own doubles
 * — the selfmark seam posture).
 */
export function buildPaperAwardsRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl) as unknown as SqlFn;
  const awards = new PaperAwards(sql, createPaperAwardPublisher(sql));
  return { awards, paperMarksRoute: createPaperAwardsRouter(awards) };
}
