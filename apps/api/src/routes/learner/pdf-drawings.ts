/**
 * Learner PDF drawing (annotation ink) router — T-MG-INK-1 run-002.
 * Plan of record: docs/MG-MARK-PARITY-PLAN.md §3.3; verdict record:
 * docs/MG-INK-SDK-GATE.md (run-001: native canvas ink on pdf-pane v4).
 *
 *   GET /api/v1/learner/pdf-drawings?documentRefType&documentRefId|sourceUrl
 *     → PdfDrawingLoad (200; honest-empty drawing:null for a
 *       not-yet-drawn document) | 400 malformed query (uuid / refine)
 *   PUT /api/v1/learner/pdf-drawings
 *     → ServedPdfDrawing (200 write receipt — the stored row at base + 1)
 *       | 400 malformed body | 409 revision_conflict (stale base)
 *
 * POSTURE LAW (paper-marks parity, plan §3.2 pin d carried to §3.3): the
 * learner id rides the JWT context — getAuth(c).userId — NEVER the wire
 * (no learnerId field exists on any contract shape; the drawing is the
 * CALLING learner's by construction). Route security: authenticated-only
 * shell FIRST (the SecurityConfig anyRequest().authenticated() parity —
 * the selfmark/assessment shell posture; 401 before any handler work).
 *
 * Binding law (v2-native surface posture, RECT-1/AWARDS-1 parity): an
 * unparseable uuid query param or a refine violation is 400 bad_request
 * "malformed request" (the shared MethodArgumentTypeMismatchException
 * envelope — the structural duplicate law); an unreadable body is 400
 * malformed_body; a zod constraint failure is 400 validation_failed
 * "field: message" (first issue). The stale-base 409 is revision_conflict
 * (the v2-native error-code string; ApiError envelope — the row itself
 * never rides the error body; the client rebases via GET).
 */
import { Hono } from "hono";
import type { ZodError } from "zod";
import { PdfDrawings, type SqlFn } from "../../services/learner-pdf-drawings";
import { requireDatabaseUrl } from "@syllabai/db";
import { createSql } from "../../services/identity/users";
import { BadRequestException, apiError } from "../../services/identity/errors";
import { requireAuth, getAuth } from "../../middleware/auth";
import {
  pdfDrawingPutRequestSchema,
  pdfDrawingQuerySchema,
} from "@syllabai/contracts";

/** Port of MethodArgumentTypeMismatchException handling
 * (GlobalExceptionHandler.java:167-170) — the shared Boot parity envelope
 * (structural duplicate of the paper-awards helper; fences stay
 * independent). */
const malformedRequest = () => new BadRequestException("malformed request");

const malformedBody = () =>
  apiError(400, "malformed_body", "request body is not readable (check field types and enum values)");

/** First-issue "field: message" verdict (the paper-awards shape, scoped
 * to this surface's constraints — no frozen-core binding cascade to
 * mirror on a v2-native surface). */
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

export function createLearnerPdfDrawingsRouter(drawings: PdfDrawings): Hono {
  const r = new Hono();

  // authz shell FIRST — every surface here is learner-scoped (the JWT
  // context supplies the learner; 401 before any handler work).
  r.use("*", async (c, next) => {
    const gate = requireAuth(c);
    if (gate instanceof Response) return gate;
    await next();
  });

  // GET / — the load. Honest-empty (drawing:null) for a not-yet-drawn
  // document; the identity pair is exactly one of documentRefId /
  // sourceUrl (the refine is a contract law — violations are malformed).
  r.get("/", async (c) => {
    const parsed = pdfDrawingQuerySchema.safeParse({
      documentRefType: c.req.query("documentRefType") ?? undefined,
      documentRefId: c.req.query("documentRefId") || undefined,
      sourceUrl: c.req.query("sourceUrl") || undefined,
    });
    if (!parsed.success) throw malformedRequest();
    const auth = getAuth(c)!;
    return c.json(
      await drawings.load(auth.userId, {
        documentRefType: parsed.data.documentRefType,
        documentRefId: parsed.data.documentRefId ?? null,
        sourceUrl: parsed.data.sourceUrl ?? null,
      }),
    );
  });

  // PUT / — the full-doc write through the revision law: stale base →
  // 409 revision_conflict (zero rows written server-side); accepted →
  // the stored row at base + 1.
  r.put("/", async (c) => {
    const raw = await readJsonBody(c);
    if (raw === null) return c.json(malformedBody(), 400 as const);
    const body = pdfDrawingPutRequestSchema.safeParse(raw);
    if (!body.success) {
      return c.json(apiError(400, "validation_failed", validationVerdict(body.error)), 400 as const);
    }
    const auth = getAuth(c)!;
    const result = await drawings.save(auth.userId, {
      ref: {
        documentRefType: body.data.documentRefType,
        documentRefId: body.data.documentRefId ?? null,
        sourceUrl: body.data.sourceUrl ?? null,
      },
      doc: body.data.doc,
      revision: body.data.revision,
    });
    if (!result.ok) {
      return c.json(
        apiError(
          409,
          "revision_conflict",
          `stale revision: stored ${result.current.revision}, got base ${body.data.revision} — re-read and re-apply`,
        ),
        409 as const,
      );
    }
    return c.json(result.drawing);
  });

  return r;
}

/**
 * Module + router composition for the app root — the buildPaperAwardsRouters
 * shape (env → requireDatabaseUrl → createSql adapter); the LIVE sql rides
 * the service (unit tests inject their own doubles — the 032 seam posture).
 */
export function buildLearnerPdfDrawingsRouters(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = requireDatabaseUrl(env as { DATABASE_URL?: string });
  const sql = createSql(databaseUrl) as unknown as SqlFn;
  const drawings = new PdfDrawings(sql);
  return { drawings, pdfDrawingsRoute: createLearnerPdfDrawingsRouter(drawings) };
}
