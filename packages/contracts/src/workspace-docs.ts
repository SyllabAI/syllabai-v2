/**
 * Workspace-document plane wire — T-AUDIT-TIER1 run-003 (v2-NATIVE,
 * additive; NO frozen-core counterpart — the frozen core never exposed a
 * generic per-user document surface, so like the teacher-me row this family
 * needs no capture/verify band).
 *
 * Tier-1 of the frontend deep-audit: the hub's REMAINING localStorage-only
 * conversation/workspace stores (tutor threads, assistant threads, CLA
 * question threads — plus the deck/guided-flow/progress families that
 * follow in run-004) get ONE durable account plane instead of a bespoke
 * table per store:
 *
 *   GET    /api/v1/me/documents            → WorkspaceDocList
 *   GET    /api/v1/me/documents/{key}      → WorkspaceDocGet (honest null)
 *   PUT    /api/v1/me/documents/{key}      ← PutWorkspaceDocRequest → 200
 *   DELETE /api/v1/me/documents/{key}      → 204
 *
 * WHY A CLOSED VOCABULARY: the key IS the routing decision (which store's
 * state this row carries). An open document plane would let any client
 * spray unbounded keys into the account (quota abuse, silent schema
 * drift); the allow-list keeps the plane auditable — a new store joins by
 * ADDING its key pattern here in its own reviewed band (the surfacing law
 * every flipped family followed).
 *
 * The KEY is also the whole merge law: values are opaque JSON to this
 * plane (no server-side interpretation, no size-shaping beyond the 512KB
 * cap — the plane carries STATE, not documents of record). Reconcile is
 * the hub's job per store (the conservative union law, run-003 bridge);
 * the server is last-write-wins per key.
 */
import { z } from "zod";

/**
 * The closed key vocabulary of record. Eight string literals, three family
 * regexes — the fifteen stores this plane serves.
 *
 *  - "deck-sessions"          (run-004) the deck player session state;
 *  - "guided-flow"            (run-004) the guided flow wizard state;
 *  - /^progress:<slug>/       (run-004) ONE doc per course progress pool —
 *                             the slug is a registry kebab key (lowercase
 *                             alphanumerics + dashes, 1..80 chars);
 *  - "teacher-classes"        (run-004) the teacher classes rail state;
 *  - "test-builder-drafts"    (run-004) the Test Builder in-progress draft;
 *  - "assistant-threads"      (run-003, this band) the assistant pool;
 *  - "tutor-threads"          (run-003, this band) the tutor pool;
 *  - "cla-question-threads"   (run-003, this band) the CLA question pool;
 *  - "theme"                  (T-ACCOUNT-ONLY run-001) the quad-theme +
 *                             light/dark/system preference;
 *  - "cla-panel-mode"         (T-ACCOUNT-ONLY run-001) the CLA popup/sidebar
 *                             panel form;
 *  - "dashboard-prefs"        (T-ACCOUNT-ONLY run-001) the dashboard rail +
 *                             level-filter preferences;
 *  - "course-shell-prefs"     (T-ACCOUNT-ONLY run-001) the course shell
 *                             sidebar width;
 *  - "tutor-prefs"            (T-ACCOUNT-ONLY run-001) the tutor chat sidebar
 *                             open/closed preference;
 *  - "pdf-viewer-prefs"       (T-ACCOUNT-ONLY run-001) the past-paper viewer
 *                             setup (fit/zoom/rotation/spread) + the ink hint
 *                             flag;
 *  - /^note-scroll:<slug>/    (T-ACCOUNT-ONLY run-001) ONE doc per course —
 *                             the reading-position memory (the same slug law
 *                             as progress:<slug>).
 */
export const WORKSPACE_DOC_KEY_PATTERNS: readonly (string | RegExp)[] = [
  "deck-sessions",
  "guided-flow",
  /^progress:[a-z0-9][a-z0-9-]{0,79}$/,
  "teacher-classes",
  "test-builder-drafts",
  "assistant-threads",
  "tutor-threads",
  "cla-question-threads",
  "theme",
  "cla-panel-mode",
  "dashboard-prefs",
  "course-shell-prefs",
  "tutor-prefs",
  "pdf-viewer-prefs",
  /^note-scroll:[a-z0-9][a-z0-9-]{0,79}$/,
];

/** 512KB per document value — the plane carries bounded workspace state,
 *  never documents of record (the learner_pdf_drawings 2MB law is for
 *  binary-backed ink; conversation pools are JSON well under this). */
export const WORKSPACE_DOC_MAX_BYTES = 512 * 1024;

function keyMatchesPatterns(key: string): boolean {
  return WORKSPACE_DOC_KEY_PATTERNS.some((p) => (typeof p === "string" ? p === key : p.test(key)));
}

/** The path key law: 1..100 chars AND a member of the closed vocabulary.
 *  Unknown keys fail validation_failed BEFORE any query runs (the
 *  fail-closed routing law — an unknown key can never be read, written or
 *  deleted into existence). */
export const workspaceDocKeySchema = z
  .string()
  .min(1)
  .max(100)
  .refine(keyMatchesPatterns, {
    message: `unknown workspace document key (allowed: ${WORKSPACE_DOC_KEY_PATTERNS.map((p) =>
      typeof p === "string" ? p : p.source,
    ).join(", ")})`,
  });

/** PUT /api/v1/me/documents/{key} — { value } is REQUIRED (present, may be
 *  null/any JSON). The superRefine (not a bare z.unknown()) keeps the
 *  absent-field case a CONSTRAINT failure ("value: must not be null" — the
 *  jakarta default law) instead of silently persisting undefined. */
export const putWorkspaceDocRequestSchema = z
  .object({ value: z.unknown() })
  .superRefine((val, ctx) => {
    if (!("value" in val)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "must not be null" });
    }
  });

/** The receipt shape of record: PUT returns the stored row (key echoed,
 *  value as-normalized, updatedAt = the server write instant). */
export const workspaceDocSchema = z.object({
  key: workspaceDocKeySchema,
  value: z.unknown(),
  updatedAt: z.string(),
});
export type WorkspaceDoc = z.infer<typeof workspaceDocSchema>;

/** GET /api/v1/me/documents — every stored doc for the account,
 *  updated_at ascending (append-order; the hub's per-store reconcile
 *  re-orders by its own law). */
export const workspaceDocListSchema = z.object({
  documents: z.array(workspaceDocSchema),
});
export type WorkspaceDocList = z.infer<typeof workspaceDocListSchema>;

/** GET /api/v1/me/documents/{key} — the honest-null read: an absent doc is
 *  200 { key, value: null, updatedAt: null }, NOT a 404 (the plane's first
 *  read happens on a fresh account; a 404 would force every caller into a
 *  special case). */
export const workspaceDocGetSchema = z.object({
  key: workspaceDocKeySchema,
  value: z.unknown().nullable(),
  updatedAt: z.string().nullable(),
});
export type WorkspaceDocGet = z.infer<typeof workspaceDocGetSchema>;
