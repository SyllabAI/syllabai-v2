/**
 * Hub-side learner-pdf-drawings client — T-MG-INK-1 run-003 (plan of
 * record: docs/MG-MARK-PARITY-PLAN.md §3.3; the run-002 persistence
 * plane's read/write wire). lib/regions.ts discipline mirrored minus one
 * line: the ink layer is an INTERACTIVE viewer surface, so this fetcher
 * is client-safe (no server-only import) and every other law carries
 * verbatim:
 *
 * - SCHEMA MIRROR law: the hub resolves zod v4 while packages/contracts
 *   builds on v3 — parse trees do not compose across majors — so the
 *   strict serving shape is mirrored LOCALLY and the canonical shapes are
 *   imported TYPE-ONLY. The mirror is structural, never behavioral: any
 *   drift fails THIS parse first, loudly.
 * - Honest-failure law: reads return NULL on any failure (not configured,
 *   non-200, malformed body) — the ink layer renders its honest state.
 *   The PUT distinguishes the three defined outcomes (written / conflict /
 *   failed) because the revision law makes 409 a DEFINED outcome, not a
 *   failure — a null is only the undefined class (network, 5xx, garbage).
 * - no-store: the drawing is the learner's live document; a stale cache
 *   would draw yesterday's ink over today's page.
 * - POSTURE (paper-marks parity): the learner rides the JWT — the token
 *   is passed in by the caller (localStorage["syllabai.token"], the v0
 *   pilot posture); no learnerId ever appears on a wire shape.
 */
import { z } from "zod";

import type { PdfDrawingLoad, ServedPdfDrawing } from "@syllabai/contracts";
import { INK_DOC_SCHEMA_ID, type InkDoc } from "@/components/pastpapers/ink/ink";

// ── the strict-shape mirrors (pdfDrawingLoadSchema / servedPdfDrawingSchema) ──

const inkDocMirror = z.object({
  schema: z.literal(INK_DOC_SCHEMA_ID),
  shapes: z.array(z.unknown()),
});

const servedPdfDrawingMirror = z.object({
  documentRefType: z.enum([
    "printable",
    "paper_asset",
    "uploaded_paper",
    "daily_five_sheet",
    "collection_worksheet",
    "paper_mark_submission",
  ]),
  documentRefId: z.string().uuid().nullable(),
  sourceUrl: z.string().max(2048).nullable(),
  doc: inkDocMirror,
  revision: z.number().int().min(1),
  updatedAt: z.string(),
});

const pdfDrawingLoadMirror = z.object({
  documentRefType: servedPdfDrawingMirror.shape.documentRefType,
  documentRefId: z.string().uuid().nullable(),
  sourceUrl: z.string().max(2048).nullable(),
  drawing: servedPdfDrawingMirror.nullable(),
});

export type MirroredPdfDrawingLoad = z.infer<typeof pdfDrawingLoadMirror>;

/** Core origin, client-safe (the regions.ts resolution, verbatim). */
function drawingsBaseUrl(): string | null {
  const raw = process.env.SYLLABAI_CORE_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!raw) return null;
  return raw.replace(/\/$/, "").replace(/\/api\/v1$/, "");
}

function authHeaders(token: string | null): HeadersInit {
  return { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/**
 * GET /api/v1/learner/pdf-drawings?documentRefType&sourceUrl — the
 * sourceUrl-keyed load (the external-PDF fallback pin; the past-papers
 * corpus documents are keyed by their canonical raw URL). Honest-empty
 * (drawing:null) is a VALID parsed outcome, not a failure.
 */
export async function fetchPdfDrawing(
  sourceUrl: string,
  token: string | null,
): Promise<MirroredPdfDrawingLoad | null> {
  const base = drawingsBaseUrl();
  if (!base || !token) return null;
  try {
    const qs = new URLSearchParams({ documentRefType: "paper_asset", sourceUrl });
    const res = await fetch(`${base}/api/v1/learner/pdf-drawings?${qs.toString()}`, {
      headers: authHeaders(token),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const parsed = pdfDrawingLoadMirror.safeParse(await res.json());
    return parsed.success ? (parsed.data as PdfDrawingLoad) : null;
  } catch {
    return null;
  }
}

/** The three defined PUT outcomes (the revision law's full vocabulary).
 * The 409 carries NO row (the ApiError envelope law) — "conflict" means
 * "re-read now"; the caller rebases via GET + rebaseShapes. */
export type PutPdfDrawingResult =
  | { outcome: "written"; drawing: ServedPdfDrawing }
  | { outcome: "conflict" }
  | { outcome: "failed" };

/**
 * PUT /api/v1/learner/pdf-drawings — the full-doc write carrying the BASE
 * revision. 200 → written (the stored row at base+1); 409 → conflict
 * (stale base, zero rows written — the caller rebases via rebaseShapes
 * and retries once); anything else → failed (honest, retryable).
 */
export async function putPdfDrawing(
  sourceUrl: string,
  doc: InkDoc,
  baseRevision: number,
  token: string | null,
): Promise<PutPdfDrawingResult> {
  const base = drawingsBaseUrl();
  if (!base || !token) return { outcome: "failed" };
  try {
    const res = await fetch(`${base}/api/v1/learner/pdf-drawings`, {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        documentRefType: "paper_asset",
        sourceUrl,
        doc: { schema: INK_DOC_SCHEMA_ID, shapes: doc.shapes },
        revision: baseRevision,
      }),
    });
    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as unknown;
      // The 409 envelope carries NO row (the ApiError envelope law) — the
      // caller re-reads via GET; "conflict" here means "rebase now".
      void body;
      return { outcome: "conflict" };
    }
    if (!res.ok) return { outcome: "failed" };
    const parsed = servedPdfDrawingMirror.safeParse(await res.json());
    if (!parsed.success) return { outcome: "failed" };
    return { outcome: "written", drawing: parsed.data };
  } catch {
    return { outcome: "failed" };
  }
}
