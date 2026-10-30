/**
 * Learner PDF drawing (annotation ink) contracts — T-MG-INK-1 run-002.
 * Plan of record: docs/MG-MARK-PARITY-PLAN.md §3.3; verdict record:
 * docs/MG-INK-SDK-GATE.md (run-001: native canvas ink on pdf-pane v4 —
 * tldraw production-licence-prohibited, 575.5 KB gz vs 1.3 KB gz measured).
 *
 * NOT a Java-core port: a NEW v2-native surface (contracts-first shape
 * discipline — constraints are stated here once and the api validates
 * against exactly this file).
 *
 * Laws carried from the decision record + plan §3.3:
 * - the persistence unit is the FULL-DOC container {schema:"syllabai-ink/1",
 *   shapes[]} (the run-001 ink-native-ref.js container law) — shape
 *   payloads are opaque at this grain (run-003's stroke pipeline owns
 *   their inner schema; E4: 11,148 B / 17 shapes observed live).
 * - IDENTITY LAW (the plan §3.3 refine): a drawing is keyed by EXACTLY
 *   ONE of the internal documentRef (documentRefType + documentRefId) or
 *   the external sourceUrl — THEIRS hard-requires sourceUrl everywhere
 *   ("Missing sourceUrl"); ours makes it nullable WITH the
 *   sourceUrl-OR-documentRef refine (the external-PDF fallback pin needs
 *   sourceUrl-keyed rows with null documentRefId).
 * - REVISION LAW (the api pin "PUT carries revision — LWW, 409 on stale"):
 *   the PUT `revision` is the BASE the write is cut against — 0 seeds a
 *   fresh drawing; R rewrites the row last read at revision R. An accepted
 *   write advances the stored revision to base + 1. A base behind the
 *   stored revision is STALE → 409 revision_conflict (zero rows written;
 *   the client re-reads via GET and re-applies). Equal-or-ahead bases win
 *   (LWW at the stamp the caller read). E4: the writer is single per
 *   (learner, documentRef) — the guard is the two-tab / lost-device net,
 *   not a multi-writer arbitrator (the op-log solves multi-writer we do
 *   not have — dead per the decision record).
 * - POSTURE LAW (plan §3.2 pin d carried to §3.3): the learner id rides
 *   the JWT context, NEVER the wire — no learnerId field exists on any
 *   write or read shape.
 */
import { z } from "zod";
import { documentRefTypeSchema } from "./paper-awards";

/** The ink container schema id of record (run-001 native-ref container). */
export const INK_DOC_SCHEMA_ID = "syllabai-ink/1";

/** The {schema, shapes[]} container — the run-002 persistence pin. The
 * container law only: `schema` is the id of record, `shapes` an array;
 * the elements are opaque here (run-003 owns the stroke grammar). */
export const inkDocSchema = z.object({
  schema: z.literal(INK_DOC_SCHEMA_ID),
  shapes: z.array(z.unknown()),
});
export type InkDoc = z.infer<typeof inkDocSchema>;

/** The sourceUrl wire cap: the external-document KEY (a URL), not the
 * document payload; 2048 is the sane URL ceiling. */
const sourceUrlSchema = z.string().min(1).max(2048);

/** Exactly one of documentRefId / sourceUrl (the plan §3.3 refine). */
const refPairRefine = (v: { documentRefId?: string | null; sourceUrl?: string | null }) =>
  Boolean(v.documentRefId) !== Boolean(v.sourceUrl);
const REFINE_MESSAGE = "exactly one of documentRefId, sourceUrl is required";

/** GET /api/v1/learner/pdf-drawings query — the {sourceUrl, documentRef}
 * input pair (plan §3.3), exactly one key per request. */
export const pdfDrawingQuerySchema = z
  .object({
    documentRefType: documentRefTypeSchema.default("paper_asset"),
    documentRefId: z.string().uuid().optional(),
    sourceUrl: sourceUrlSchema.optional(),
  })
  .refine(refPairRefine, { message: REFINE_MESSAGE });
export type PdfDrawingQuery = z.infer<typeof pdfDrawingQuerySchema>;

/** PUT /api/v1/learner/pdf-drawings body — full-doc write, base revision
 * carried (see the REVISION LAW above). */
export const pdfDrawingPutRequestSchema = z
  .object({
    documentRefType: documentRefTypeSchema.default("paper_asset"),
    documentRefId: z.string().uuid().optional(),
    sourceUrl: sourceUrlSchema.optional(),
    doc: inkDocSchema,
    revision: z.number().int().min(0),
  })
  .refine(refPairRefine, { message: REFINE_MESSAGE });
export type PdfDrawingPutRequest = z.infer<typeof pdfDrawingPutRequestSchema>;

/** One served drawing row — the write receipt (200) and the GET payload
 * inner shape. documentRefId/sourceUrl are mutually exclusive by the
 * refine (one is null by construction). */
export const servedPdfDrawingSchema = z.object({
  documentRefType: documentRefTypeSchema,
  documentRefId: z.string().uuid().nullable(),
  sourceUrl: z.string().nullable(),
  doc: inkDocSchema,
  revision: z.number().int().min(1),
  updatedAt: z.string(),
});
export type ServedPdfDrawing = z.infer<typeof servedPdfDrawingSchema>;

/** GET response — honest-empty drawing:null for a not-yet-drawn document
 * (200, never an error; the paper-marks honest-empty law). */
export const pdfDrawingLoadSchema = z.object({
  documentRefType: documentRefTypeSchema,
  documentRefId: z.string().uuid().nullable(),
  sourceUrl: z.string().nullable(),
  drawing: servedPdfDrawingSchema.nullable(),
});
export type PdfDrawingLoad = z.infer<typeof pdfDrawingLoadSchema>;
