/**
 * Workspace document wire — T-AUDIT-TIER1 (the account-persistence band).
 *
 * The hub's client workspace stores (progress overlay, mock results,
 * last-opened, deck sessions, guided-flow state, teacher coverage / saved
 * tests / content reviews / test-builder drafts / classes, tutor /
 * assistant / CLA-question thread transcripts) previously persisted ONLY in
 * browser localStorage — device-bound, invisible to the account, wiped by
 * profile cleanup. This band moves every one of those stores into the
 * `user_documents` table (packages/db 0022) behind ONE generic document
 * surface scoped to the CALLING user:
 *
 *   GET    /api/v1/me/documents        → the user's whole doc set (hydration)
 *   GET    /api/v1/me/documents/:key   → one doc (honest null value when absent)
 *   PUT    /api/v1/me/documents/:key   → upsert { value } (write-through)
 *   DELETE /api/v1/me/documents/:key   → remove (the "clear" paths)
 *
 * ROUTE SECURITY: authenticated-only (the SecurityConfig
 * anyRequest().authenticated() posture — the router owns its 401 shell
 * internally, pdf-drawings precedent). The learner/teacher id rides the JWT
 * context — getAuth(c).userId — NEVER the wire (no userId field exists on
 * any shape here; a doc is the CALLING user's by construction).
 *
 * KEY LAW: doc keys are APP-PINNED, not free-form — the workspaceDocKeySchema
 * pattern allow-list below is the closed vocabulary the hub may persist.
 * A unknown key is a 400 validation_failed BEFORE any query runs, so the
 * surface can never degenerate into an arbitrary user-keyed KV dump.
 *
 * VALUE LAW: opaque JSONB with a hard 512 KB serialized cap (measured on the
 * wire JSON, matching the DB-side headroom). The cap is checked at the route
 * (413 document_too_large) and mirrored as a zod max on the raw string — the
 * per-store shapes (threads caps, mock-results caps, progress documents)
 * stay owned by their own store modules; this surface is the envelope.
 *
 * V2-NATIVE SURFACE (pdf-drawings posture): no frozen-core controller to
 * mirror — binding law is the v2-native vocabulary (400 malformed_body /
 * 400 validation_failed "field: message" / 404 not_found).
 */
import { z } from "zod";

/** The app-pinned doc-key vocabulary (the closed allow-list).
 *
 *   last-opened            — { slug, resource, ts } single entry
 *   mock-results           — MockResult[] (cap 20/course, mock-results.ts)
 *   deck-sessions          — map `${course}:${subtopic}` → DeckSessionState
 *   guided-flow            — map lessonId → the guided lesson's FlowState
 *   progress:<course>      — the per-course CourseProgress overlay document
 *   teacher-classes        — the teacher's local class containers
 *   teaching-coverage      — map courseSlug → taught subtopic codes
 *   saved-tests            — SavedTest[] (cap 30)
 *   content-reviews        — ContentReview[] (cap 200)
 *   test-builder-drafts    — map courseSlug → builder draft object
 *   assistant-threads      — { threads, activeId } (caps 40×100, assistant store)
 *   tutor-threads          — { threads, activeId } (caps 40×200, tutor store)
 *   cla-question-threads   — { threads, activeByQuestion } (caps 40×100)
 */
export const WORKSPACE_DOC_KEY_PATTERNS: readonly (string | RegExp)[] = [
  "last-opened",
  "mock-results",
  "deck-sessions",
  "guided-flow",
  /^progress:[a-z0-9][a-z0-9-]{0,79}$/,
  "teacher-classes",
  "teaching-coverage",
  "saved-tests",
  "content-reviews",
  "test-builder-drafts",
  "assistant-threads",
  "tutor-threads",
  "cla-question-threads",
];

export const workspaceDocKeySchema = z
  .string()
  .min(1)
  .max(100)
  .refine(
    (k) =>
      WORKSPACE_DOC_KEY_PATTERNS.some((p) =>
        typeof p === "string" ? p === k : p.test(k),
      ),
    { message: "unknown workspace document key" },
  );

export type WorkspaceDocKey = z.infer<typeof workspaceDocKeySchema>;

/** 512 KB serialized cap — measured on the PUT body's value JSON. */
export const WORKSPACE_DOC_MAX_BYTES = 512 * 1024;

/** PUT /:key body — the value is opaque JSON (any shape the store owns).
 *  Presence is REQUIRED (a body without `value` is a malformed body): the
 *  explicit null is the "clear the document" write, the absent field is a
 *  client bug — those must never conflate. */
export const workspaceDocPutRequestSchema = z
  .object({
    value: z.unknown(),
  })
  .superRefine((o, ctx) => {
    if (!("value" in o)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "required" });
    }
  });
export type WorkspaceDocPutRequest = z.infer<typeof workspaceDocPutRequestSchema>;

/** One stored document — the wire row. */
export const workspaceDocSchema = z.object({
  key: workspaceDocKeySchema,
  value: z.unknown(),
  updatedAt: z.string(),
});
export type WorkspaceDoc = z.infer<typeof workspaceDocSchema>;

/** GET / (the hydration list) — every stored doc for the calling user. */
export const workspaceDocListSchema = z.object({
  docs: z.array(workspaceDocSchema),
});
export type WorkspaceDocList = z.infer<typeof workspaceDocListSchema>;

/** GET /:key — honest-null posture (200 with value:null when never written),
 *  so the client's hydration path needs no 404 special-casing. */
export const workspaceDocGetSchema = z.object({
  key: workspaceDocKeySchema,
  value: z.unknown().nullable(),
  updatedAt: z.string().nullable(),
});
export type WorkspaceDocGet = z.infer<typeof workspaceDocGetSchema>;
