/**
 * T-TUTOR-AIM-P3 (DC10 §7.7): the served-evidence LEDGER — the v3 reshape's
 * deterministic join table written by the serving path. What was ACTUALLY
 * served to this learner, one row per distinct (session turn, spec node,
 * chunk, kind) observation. Zero LLM. Zero extraction — the plan's own law:
 * the rows are a PROJECTION of the data the ask path already produced (the
 * resolved citations + the aim's correction/prereq/example selections), never
 * a re-reading of the answer text.
 *
 * Consumers of record (the plan §7.7): aimed answering's no-re-teaching rule
 * (§7.5), the drill loop (§7.8), the outcome metric (§10) and the calibration
 * read-out (§7.9 — the confidence log's per-ask node coverage rides THIS
 * table). Escalation toward anything richer is allowed only after 6–8 weeks
 * of live evidence that ledger + existing learner state is insufficient.
 *
 * LAWS:
 *   - DETERMINISTIC PROJECTION — pure function over (evidence, aim); no
 *     clock, no reads, no LLM. The same ask state yields the same rows.
 *   - SESSION-SCOPED — session_id + turn_id are NOT NULL by the schema of
 *     record (migration 0030): a sessionless ask persists NOTHING here (its
 *     engagement row already logged the ask; a transcript-free ask has no
 *     turn of record to key rows on). Anonymous previews persist nothing
 *     (the account-only law, PR #801 posture).
 *   - NODE-KEYED — spec_node_id comes from the KG catalog only: a
 *     KG-grounded evidence item carries its own node id; a chunk-backed item
 *     keys on its associated KG topics (EvidenceItem.topicIds, the v0
 *     intent-matched topics) with the chunk's own id riding chunk_id. An
 *     item with NO node association is not ledger-addressable and is SKIPPED
 *     (the honest residual, counted nowhere — the ledger records node-
 *     addressable evidence only).
 *   - APPEND-GUARD — the write is post-delivery fire-and-forget (the §22
 *     append-guard class, the P2 confidence-log posture): a lost ledger row
 *     never corrupts a delivered answer, and no error text may reach the
 *     pipeline.
 *   - RETENTION (§12 open question 4, FIXED AT BUILD TIME): 180 days — the
 *     learner-model's own staleness tau (TUTOR_BDT_PAPER_DEFAULTS
 *     .stalenessTauDays, context.ts). purgeExpiredServedEvidence is the
 *     purge of record; run-002 CLOSED the run-001 disclosed residual by
 *     wiring the sweep into the nightly cron dispatch (runNightlyDispatch,
 *     services/cron/nightly-decay.ts) — AFTER the window transaction
 *     commits, guarded, degrade-never-block (housekeeping never fails the
 *     decay window; see the dispatch's header law).
 */

import type { EvidenceItem } from "./evidence";
import type { AimBrief } from "./context";
import type { SqlFn } from "./sql";
import type { Clock } from "./session-store";

/** The plan's surface taxonomy of record (the §7.7 sketch). P3's serving
 *  path writes tutor_answer rows; the probe/drill/mock_mark writers ride
 *  those surfaces' own builds (the enum is forward-compatible by design). */
export type ServedEvidenceSurface = "tutor_answer" | "probe" | "drill" | "mock_mark";

/** The plan's kind taxonomy of record: WHY this node's evidence was served. */
export type ServedEvidenceKind = "citation" | "correction" | "example" | "prereq_recap";

/** One ledger observation — the projection row shape (the wire-free internal
 *  carrier; the API route turns these into inserts after the §22 append). */
export interface ServedEvidenceRow {
  specNodeId: string;
  chunkId: string | null;
  kind: ServedEvidenceKind;
}

/**
 * projectServedEvidence — the deterministic projection for ONE ask. Order of
 * record: citations (evidence order), then the correction, then the prereq
 * recaps, then the example-bias targets. Dedupe by (specNodeId, chunkId,
 * kind) — multiple citations of the same node/chunk are ONE observation
 * (the ledger records WHAT was served, not how often it appeared). A refusal
 * serves nothing; an aim-less ask serves citations only.
 */
export function projectServedEvidence(
  evidence: ReadonlyArray<EvidenceItem>,
  aim: AimBrief | null,
): ServedEvidenceRow[] {
  const rows: ServedEvidenceRow[] = [];
  const seen = new Set<string>();
  const push = (row: ServedEvidenceRow): void => {
    const key = `${row.specNodeId}|${row.chunkId ?? "-"}|${row.kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  // CITATIONS — one observation per (node, chunk) the served evidence named.
  for (const item of evidence) {
    if (item.nodeId != null) {
      // KG-grounded: the node IS the evidence (no chunk behind it)
      push({ specNodeId: item.nodeId, chunkId: null, kind: "citation" });
      continue;
    }
    // chunk-backed: the item keys on its associated KG topics (v0: the
    // intent-matched topics), the chunk's own id riding chunk_id
    if (item.chunkId != null) {
      for (const topicId of item.topicIds) {
        push({ specNodeId: topicId, chunkId: item.chunkId, kind: "citation" });
      }
    }
    // no node association at all -> not ledger-addressable: skipped
  }

  if (aim != null) {
    // CORRECTION — the plan's own comment: corrections may not map to a
    // chunk (the correction is generated from the cited material, never a
    // verbatim chunk) — chunk_id is null by construction
    if (aim.correction != null) {
      push({ specNodeId: aim.correction.nodeId, chunkId: null, kind: "correction" });
    }
    for (const p of aim.provenPrerequisites) {
      push({ specNodeId: p.nodeId, chunkId: null, kind: "prereq_recap" });
    }
    for (const s of aim.strongAreas) {
      push({ specNodeId: s.nodeId, chunkId: null, kind: "example" });
    }
  }
  return rows;
}

/** The retention window of record (§12 open question 4, fixed at build
 *  time): 180 days — the learner-model's staleness tau of record. */
export const SERVED_EVIDENCE_RETENTION_DAYS = 180;

/**
 * appendServedEvidence — the ledger write for ONE delivered ask. Pure
 * appends, no read-modify-write; the caller wraps it fire-and-forget (the
 * append guard). Empty rows write nothing (a zero-row insert is not sent).
 */
export async function appendServedEvidence(
  sql: SqlFn,
  clock: Clock,
  input: {
    learnerId: string;
    sessionId: string;
    turnId: number;
    rows: ReadonlyArray<ServedEvidenceRow>;
  },
): Promise<void> {
  if (input.rows.length === 0) return;
  const servedAt = clock.now();
  for (const row of input.rows) {
    await sql`
      insert into tutor_served_evidence
        (id, learner_id, spec_node_id, chunk_id, session_id, turn_id,
         surface, kind, served_at)
      values
        (${crypto.randomUUID()}, ${input.learnerId}, ${row.specNodeId},
         ${row.chunkId}, ${input.sessionId}, ${input.turnId},
         ${"tutor_answer"}, ${row.kind}, ${servedAt})
    `;
  }
}

/**
 * purgeExpiredServedEvidence — the retention sweep of record (the 180-day
 * window above). Returns the HONEST deleted row count.
 *
 * RUN-002 NOTE (the count law): the count rides the data-modifying CTE
 * (`WITH deleted AS (DELETE ... RETURNING 1) SELECT count(*)::int`) — the
 * createSql adapter surfaces ROWS ONLY (identity/users.ts drops the Neon
 * rowCount and the postgres.js .count at the adapter boundary), so a bare
 * DELETE would report a dishonest 0 through this seam forever. ONE
 * statement, ONE row back, the real count — the T-MIG-126 real-counts law
 * applied to the sweep. The nightly dispatch (runNightlyDispatch) calls
 * this AFTER the window transaction commits — the sweep is housekeeping:
 * idempotent by construction (served_at < cutoff), never transaction-
 * bound, never window-blocking.
 */
export async function purgeExpiredServedEvidence(sql: SqlFn, clock: Clock): Promise<number> {
  const cutoff = new Date(
    clock.now().getTime() - SERVED_EVIDENCE_RETENTION_DAYS * 86_400_000,
  );
  const rows = (await sql`
    with deleted as (
      delete from tutor_served_evidence where served_at < ${cutoff} returning 1
    )
    select count(*)::int as deleted from deleted
  `) as unknown as Array<Record<string, unknown>>;
  const row = rows[0];
  if (row === undefined) return 0;
  return Number(row.deleted ?? 0);
}
