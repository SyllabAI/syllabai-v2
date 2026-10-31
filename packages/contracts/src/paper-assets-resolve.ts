/**
 * Paper-assets resolve contract — T-MG-FEEDBACK-1 run-001.
 * Plan of record: docs/MG-MARK-PARITY-PLAN.md §3.6 (the Phase-6 surfaces:
 * the paper-level rollup needs a documentRefId per paper card; the corpus
 * card knows (paperCode, sessionLabel), the award ledger keys on the
 * exam_papers uuid — this resolves the two, additively).
 *
 * NOT a Java-core port: a NEW v2-native surface (contracts-first shape
 * discipline — constraints are stated here once and the api validates
 * against exactly this file).
 *
 * RESOLUTION LAW OF RECORD: the deployment seed's identity selection
 * (apps/api/scripts/seed-mark-point-rects.ts step (A)) — exam_papers is
 * unique on uq_exam_paper_identity (paper_code, session_label), so
 * (paperCode, sessionLabel) is the STABLE corpus↔ledger identity pair.
 * The hub computes both from the corpus card (ref = "unit/variant", the
 * sessionLabel law of lib/pastpapers-shared.ts sessionLabel()); the api
 * answers { paperId } | 404 unknown | 400 malformed. Corpus content
 * posture: any authenticated user (the sibling paper-assets shell), zero
 * learner rows, zero PII.
 *
 * 404 is the EXPECTED steady state for a corpus paper that has not been
 * ingested as an exam_papers row (the honest not-ingested class — the
 * Phase-6 rollup renders nothing for it, never a fabricated 0/0).
 */
import { z } from "zod";

/** GET /api/v1/paper-assets/resolve?paperCode&sessionLabel — the identity
 * pair. Caps mirror the columns (paper_code varchar(30), session_label
 * varchar(60)); min(1) rejects the empty-string degenerate. */
export const paperAssetResolveQuerySchema = z.object({
  paperCode: z.string().min(1).max(30),
  sessionLabel: z.string().min(1).max(60),
});
export type PaperAssetResolveQuery = z.infer<typeof paperAssetResolveQuerySchema>;

/** 200 body — the ledger key of record (documentRefId for
 * documentRefType "paper_asset" — the Phase-2/4 bridge law). */
export const paperAssetResolveResponseSchema = z.object({
  paperId: z.string().uuid(),
});
export type PaperAssetResolveResponse = z.infer<typeof paperAssetResolveResponseSchema>;
