/**
 * T-MIG-053 tranche-3 (r3a) — the revision-notes wire (Wave-5 remainder
 * band). Port of the frozen shapes @ 6cad6ef:
 *
 *   - revisionnotes/RevisionNoteDtos.java :17-63 (the learner + admin wire)
 *     — the Save-My-Exams-style corpus read model: tree index with the
 *     caller's viewed markers, one note body with canonical prev/next,
 *     the authenticated asset, the progress model, and the admin
 *     ingest/status views;
 *   - RevisionNoteDtos.java :66-86 (RevisionNotePackage) — the corpus
 *     package format v1 the ingest parses (the corpus generator script in
 *     syllabai-resources is its producer).
 *
 * Jackson binding semantics for the PACKAGE tree mirror the SME precedent
 * (sme-question-package.ts, T-MIG-054): `.passthrough()` everywhere
 * (ignoreUnknown), absent primitives bind as Java defaults (optional int),
 * absent objects bind null (nullish) — the fail-closed laws live in the
 * ingest validate() port (services/revision-notes), which turns them into
 * the verbatim 400s. The RESPONSE schemas (what the controllers serve) are
 * STRICT — the service constructs them; nulls appear exactly where the
 * frozen records carry null.
 *
 * REUSE-not-redeclare (the 010/034/043/053 precedent): javaInstantSchema
 * from assessment.ts.
 */
import { z } from "zod";

import { javaInstantSchema } from "./assessment.js";

// ── the learner wire (RevisionNoteDtos :17-54) ───────────────────────────────

/** :34 — one viewed marker; the (user, note) pair is idempotent (V27 unique). */
export const revisionNoteViewedViewSchema = z.object({
  noteId: z.string(),
  viewedAt: javaInstantSchema,
});
export type RevisionNoteViewedView = z.infer<typeof revisionNoteViewedViewSchema>;

/** :30-32 — one note in the tree; specPointCodes split from the stored CSV
 *  (blank stays []). */
export const revisionNoteMetaViewSchema = z.object({
  noteId: z.string(),
  title: z.string(),
  order: z.number().int(),
  specPointCodes: z.array(z.string()),
});
export type RevisionNoteMetaView = z.infer<typeof revisionNoteMetaViewSchema>;

/** :26-28 — one subtopic; noteCount drives the progress ring denominator. */
export const revisionNoteSubtopicViewSchema = z.object({
  order: z.number().int(),
  title: z.string(),
  noteCount: z.number().int(),
  notes: z.array(revisionNoteMetaViewSchema),
});
export type RevisionNoteSubtopicView = z.infer<typeof revisionNoteSubtopicViewSchema>;

/** :23-25 — one topic of the canonical tree (topic → subtopic → note order). */
export const revisionNoteTopicViewSchema = z.object({
  order: z.number().int(),
  title: z.string(),
  subtopics: z.array(revisionNoteSubtopicViewSchema),
});
export type RevisionNoteTopicView = z.infer<typeof revisionNoteTopicViewSchema>;

/** :17-21 — the full tree + the caller's viewed markers in ONE GET. An
 *  un-ingested corpus reads nulls + empty arrays honestly (:38) — never a
 *  fabricated tree. */
export const revisionNotesIndexViewSchema = z.object({
  corpusVersion: z.string().nullable(),
  ingestedAt: javaInstantSchema.nullable(),
  topics: z.array(revisionNoteTopicViewSchema),
  viewed: z.array(revisionNoteViewedViewSchema),
});
export type RevisionNotesIndexView = z.infer<typeof revisionNotesIndexViewSchema>;

/** :39-48 — one note's render payload; prev/next follow the CANONICAL corpus
 *  order (topic → subtopic → note) and are null at the ends (:90-91).
 *  specMapJson is the stored JSON TEXT passed through verbatim — parsed by
 *  the client, never re-serialized by the API. */
export const revisionNoteBodyViewSchema = z.object({
  noteId: z.string(),
  title: z.string(),
  bodyMd: z.string(),
  specMapJson: z.string(),
  sourceUrl: z.string().nullable(),
  assets: z.array(z.string()),
  prevNoteId: z.string().nullable(),
  nextNoteId: z.string().nullable(),
});
export type RevisionNoteBodyView = z.infer<typeof revisionNoteBodyViewSchema>;

/** :50 — the ring input: viewed markers only, newest first (:70/:119). */
export const revisionNoteProgressViewSchema = z.object({
  viewed: z.array(revisionNoteViewedViewSchema),
});
export type RevisionNoteProgressView = z.infer<typeof revisionNoteProgressViewSchema>;

/** :53 — MarkNoteViewedRequest; the @Size(max = 80) wire bound. */
export const markNoteViewedRequestSchema = z.object({
  noteId: z.string().max(80),
});
export type MarkNoteViewedRequest = z.infer<typeof markNoteViewedRequestSchema>;

// ── the admin wire (RevisionNoteDtos :56-63) ─────────────────────────────────

/** :56-58 — the replace-all ingest report. */
export const revisionNoteIngestSummarySchema = z.object({
  topics: z.number().int(),
  subtopics: z.number().int(),
  notes: z.number().int(),
  assets: z.number().int(),
  replaced: z.boolean(),
});
export type RevisionNoteIngestSummary = z.infer<typeof revisionNoteIngestSummarySchema>;

/** :60-63 — what is live; ingested=false reads honest nulls (:111). */
export const revisionNoteStatusViewSchema = z.object({
  ingested: z.boolean(),
  notes: z.number().int(),
  assets: z.number().int(),
  ingestedAt: javaInstantSchema.nullable(),
  corpusVersion: z.string().nullable(),
});
export type RevisionNoteStatusView = z.infer<typeof revisionNoteStatusViewSchema>;

// ── the corpus package format v1 (RevisionNoteDtos :66-86) ───────────────────
// Jackson-parity parse tree (the SME precedent): passthrough + nullish/optional
// — the ingest validate() port carries the fail-closed laws.

/** :84 — one declared asset; contentType must be in the R14 allowlist. */
export const revisionNotePkgAssetSchema = z
  .object({
    filename: z.string().nullish(),
    contentType: z.string().nullish(),
  })
  .passthrough();
export type RevisionNotePkgAsset = z.infer<typeof revisionNotePkgAssetSchema>;

/** :79-82 — one note in the package; specPointCodes is the raw CSV string
 *  (stored verbatim, split at read time); specMapJson the raw JSON text. */
export const revisionNotePkgNoteSchema = z
  .object({
    noteId: z.string().nullish(),
    title: z.string().nullish(),
    order: z.number().int().optional(),
    bodyMd: z.string().nullish(),
    specMapJson: z.string().nullish(),
    specPointCodes: z.string().nullish(),
    sourceUrl: z.string().nullish(),
    assets: z.array(z.string()).nullish(),
  })
  .passthrough();
export type RevisionNotePkgNote = z.infer<typeof revisionNotePkgNoteSchema>;

/** :76-77 — one subtopic of the package tree. */
export const revisionNotePkgSubtopicSchema = z
  .object({
    order: z.number().int().optional(),
    title: z.string().nullish(),
    notes: z.array(revisionNotePkgNoteSchema).nullish(),
  })
  .passthrough();
export type RevisionNotePkgSubtopic = z.infer<typeof revisionNotePkgSubtopicSchema>;

/** :73-75 — one topic of the package tree. */
export const revisionNotePkgTopicSchema = z
  .object({
    order: z.number().int().optional(),
    title: z.string().nullish(),
    subtopics: z.array(revisionNotePkgSubtopicSchema).nullish(),
  })
  .passthrough();
export type RevisionNotePkgTopic = z.infer<typeof revisionNotePkgTopicSchema>;

/** :66-71 — the package.json root (Corpus Package format v1). Absent OBJECT
 *  components bind null (Jackson parity) — validate() rejects the missing
 *  packageVersion/corpusVersion/topics with the verbatim 400s. */
export const revisionNotePackageSchema = z
  .object({
    packageVersion: z.string().nullish(),
    corpusVersion: z.string().nullish(),
    generatedAt: z.string().nullish(),
    topics: z.array(revisionNotePkgTopicSchema).nullish(),
    assets: z.array(revisionNotePkgAssetSchema).nullish(),
  })
  .passthrough();
export type RevisionNotePackage = z.infer<typeof revisionNotePackageSchema>;
