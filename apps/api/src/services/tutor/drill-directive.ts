/**
 * T-TUTOR-AIM-P3 (DC10 §7.8 + §13.2): the tutor→drill loop — the scheduling
 * directive and its claimable artefact.
 *
 * THE DETERMINISTIC RULE (no LLM in the decision): after an answer, when the
 * target node is decay-due, the response metadata carries a scheduling
 * directive; the hub surfaces it as the tonight-chip. Decay-due of record is
 * the signal the ask path ALREADY holds — the P2 read's pendingReviews rows
 * (review_schedules PENDING, the forgetting-curve's DECAY_CROSSED_THRESHOLD
 * writes) intersected with the matched topics. The plan's "under F184 decay
 * strength" resolves to the claim arm: the scheduled set is drawn by the
 * drill serve path's own F-185 model reading (the SAME law that powers the
 * F-184 practice-now queue), so the ITEMS that arrive tonight are the decay
 * law's pick, while the OFFER decision stays on the already-held read — the
 * M3 law (one indexed learner read per ask) stands, zero new reads.
 *
 * THE CORRECTION ARM: when a misconception correction landed (the aim's
 * correction), the answer closes with the Teach SillyAI handoff — the
 * predict→teach→check cadence home (§5.2). The handoff is OFFER metadata
 * (node id + corpus title) on the wire; the tap pre-fills the composer (the
 * P2 probe-chip pattern) — nothing is claimed, nothing is consumed until
 * the learner sends.
 *
 * THE TWO-STAGE SHAPE (the §22 ordering law): the pipeline publishes BEFORE
 * the route's session append allocates the assistant turn id, so the
 * DECISION (selectDrillDirectiveBasis — pure, turn-free) rides the pipeline
 * result, and the ROUTE mints the id + persists the claimable row AFTER the
 * append fixes the turn (mintDrillDirective + insertDrillDirective). A
 * sessionless ask has no turn of record → no directive, by the schema of
 * record (migration 0030: session-scoped).
 *
 * §13.2 OFFER-NOT-CLAIM: the directive and the handoff claim NOTHING and
 * consume NOTHING until the learner's explicit tap. The wire carries
 * metadata only — count, node ids, course scope — never learner-derived
 * free text (the §11.1 injection law: node ids, never free-text readings).
 * A claimable artefact (one scheduled drill set) is claimed EXACTLY ONCE
 * under TWO INDEPENDENT STATE GUARDS:
 *   guard 1 — the directive row must EXIST server-side (the serving path
 *     inserted it after the §22 append; the claim resolves the row by the
 *     deterministic id + learner ownership — a directive the server never
 *     issued is not claimable);
 *   guard 2 — the claim is a COMPARE-AND-SWAP: claimed_at flips from NULL
 *     under `where claimed_at is null` — exactly-once under concurrency, so
 *     a re-render / double-tap / racing client cannot double-schedule.
 * The scheduled draw creation happens AFTER the CAS wins; a failed
 * scheduling resets claimed_at to NULL (the compensating write) so the
 * claim stays retryable — a claim that scheduled nothing is not a claim.
 */

import { createHash } from "node:crypto";

import type { SqlFn } from "./sql";
import type { Clock } from "./session-store";
import type { AimBrief, MatchedTopic } from "./context";
import type { ExamUrgency } from "./exam-calendar";

/** The draw size of record (drill/draw.ts DRAW_SIZE) — re-declared here as
 *  the per-module seam (the ADR-032 copy doctrine); the planned count and
 *  the actual draw both flow from the drill path's own constant. */
export const DRILL_DRAW_SIZE = 5;

/** T-TUTOR-AIM-P3 run-003 (DC10 §7.9) — the SPACING arm's multiplier of
 *  record, fixed at build time (the §12 open-question-4 precedent):
 *  when the learner's DECLARED sitting is NEAR or IN_WINDOW, the pending
 *  review loop tightens — the directive's planned count doubles so the
 *  tonight-chip plans denser practice as the calendar closes. The CLAIM's
 *  actual scheduled count stays the F-182/F-185 draw law's own (the run-001
 *  chip law governs plan-vs-actual: the chip flips to the claimed copy from
 *  the response's ACTUAL count). FAR and every no-calendar ask keep the
 *  base ×1 law byte-identical (the existing pins stay green). */
export const EXAM_DRILL_SPACING_MULTIPLIER = 2;

/** The DECISION half of the directive — computed by the pipeline from the
 *  reads it already holds (M3: no new read, no LLM, no turn needed). */
export interface DrillDirectiveBasis {
  /** the decay-due matched topics, deterministic order (topic order) */
  nodes: Array<{ nodeId: string; code: string; title: string }>;
  /** the serving ask's course scope — the claim draws at THIS course */
  courseRef: string | null;
  /** the deterministic planned count (nodes × the draw size of record) —
   *  the chip copy's N; the claim's response carries the ACTUAL count */
  plannedCount: number;
  /** the Teach SillyAI handoff (§7.8): set when a misconception correction
   *  landed — the node the learner could teach back */
  teachHandoff: { nodeId: string; title: string } | null;
}

/**
 * selectDrillDirectiveBasis — the deterministic §7.8 rule, pure. Null when
 * nothing decayed (most asks — the honest empty) and null on every refusal
 * (a refusal schedules nothing). Sessionless asks yield a basis at this
 * layer, but the route only mints a directive for SESSION-SCOPED asks (the
 * turn of record is the schema's own requirement) — the basis is inert
 * without a turn to key it on.
 */
export function selectDrillDirectiveBasis(
  aim: AimBrief | null,
  matchedTopics: ReadonlyArray<MatchedTopic>,
  pendingReviewNodeIds: ReadonlyArray<string>,
  courseRef: string | null,
  // T-TUTOR-AIM-P3 run-003 (DC10 §7.9, the spacing arm): the declared
  // sitting's urgency band — IN_WINDOW and NEAR tighten the planned count;
  // FAR and null keep the base law byte-identical (optional for call-site
  // compatibility — the existing pins stay green)
  examUrgency?: ExamUrgency | null,
): DrillDirectiveBasis | null {
  const pending = new Set(pendingReviewNodeIds);
  const dueNodes = matchedTopics
    .filter((t) => pending.has(t.nodeId))
    .map((t) => ({ nodeId: t.nodeId, code: t.code, title: t.title }));
  if (dueNodes.length === 0) return null;
  const spacing =
    examUrgency === "IN_WINDOW" || examUrgency === "NEAR"
      ? EXAM_DRILL_SPACING_MULTIPLIER
      : 1;
  return {
    nodes: dueNodes,
    courseRef,
    plannedCount: dueNodes.length * DRILL_DRAW_SIZE * spacing,
    // the handoff rides the CORRECTION arm (§7.8) — independent of decay
    teachHandoff: aim?.correction ?? null,
  };
}

/** The directive id of record: a domain-prefixed SHA-256 over (learner,
 *  session, turn) — recomputable by the claim from the caller's own ids,
 *  stable under re-render (the same answer re-served carries the SAME id),
 *  and learner-bound (a foreign learner's ids mint a different id). */
export function directiveIdOf(
  learnerId: string,
  sessionId: string,
  turnId: number,
): string {
  const h = createHash("sha256");
  h.update(`tutor-drill-directive/v1/${learnerId}/${sessionId}/${turnId}`);
  return `tdd1-${h.digest("hex").slice(0, 48)}`;
}

/** The WIRE half of the directive — the basis + the minted id + the §22
 *  turn key (the claim's identity pair: sessionId + turnId recompute the id
 *  server-side). The hub renders the chip from these fields only (metadata,
 *  never free text). */
export interface DrillDirective extends DrillDirectiveBasis {
  directiveId: string;
  turnId: number;
}

/** mintDrillDirective — the route-side assembly after the §22 append fixed
 *  the assistant turn id (the schema of record's session-scoped key). */
export function mintDrillDirective(
  basis: DrillDirectiveBasis,
  learnerId: string,
  sessionId: string,
  turnId: number,
): DrillDirective {
  return {
    ...basis,
    directiveId: directiveIdOf(learnerId, sessionId, turnId),
    turnId,
  };
}

/**
 * insertDrillDirective — the serving path's post-append write (awaited
 * inside the route's append-guard try). One row per EARNED directive; the
 * deterministic primary key makes a re-render's re-insert a no-op (on
 * conflict do nothing — the id is content-addressed, not a uuid).
 */
export async function insertDrillDirective(
  sql: SqlFn,
  clock: Clock,
  directive: DrillDirective,
  learnerId: string,
  sessionId: string,
  turnId: number,
): Promise<void> {
  await sql`
    insert into tutor_drill_directives
      (directive_id, learner_id, session_id, turn_id, course_ref,
       node_ids, correction_node_id, served_at)
    values
      (${directive.directiveId}, ${learnerId}, ${sessionId}, ${turnId},
       ${directive.courseRef},
       ${JSON.stringify(directive.nodes.map((n) => n.nodeId))},
       ${directive.teachHandoff == null ? null : directive.teachHandoff.nodeId},
       ${clock.now()})
    on conflict (directive_id) do nothing
  `;
}

/** The claim outcome — the honest idempotent answer both the first claim
 *  and the re-render read. */
export interface DrillDirectiveClaimOutcome {
  status: "claimed" | "already_claimed" | "not_found";
  scheduledCount: number | null;
}

/**
 * claimDirectiveRow — guard 2 (the CAS): flips claimed_at from NULL under
 * `where claimed_at is null`. `claimed` = this call won the flip;
 * `already_claimed` = a prior call won it (the re-render's honest answer —
 * the row's scheduled_count is the artefact of record);
 * `not_found` = guard 1 failed (no server-issued directive for this id).
 */
export async function claimDirectiveRow(
  sql: SqlFn,
  clock: Clock,
  directiveId: string,
  learnerId: string,
): Promise<DrillDirectiveClaimOutcome> {
  const won = (await sql`
    update tutor_drill_directives
    set claimed_at = ${clock.now()}
    where directive_id = ${directiveId} and learner_id = ${learnerId}
      and claimed_at is null
    returning scheduled_count
  `) as unknown as Array<{ scheduled_count: number | null }>;
  if (Array.isArray(won) && won.length > 0) {
    return { status: "claimed", scheduledCount: won[0]!.scheduled_count };
  }
  // the CAS lost — either a prior claim (return its outcome) or no row
  const existing = (await sql`
    select scheduled_count from tutor_drill_directives
    where directive_id = ${directiveId} and learner_id = ${learnerId}
  `) as unknown as Array<{ scheduled_count: number | null }>;
  if (Array.isArray(existing) && existing.length > 0) {
    return { status: "already_claimed", scheduledCount: existing[0]!.scheduled_count };
  }
  return { status: "not_found", scheduledCount: null };
}

/**
 * loadDirectiveTargets — the claim's draw targets, resolved from the row's
 * OWN data (never the caller's wire): the stored node ids join the KG
 * catalog for their drill-address codes, and the row's OWN course scope
 * rides the result (the claim draws at the serving ask's course, never the
 * caller's). A node whose catalog row has vanished resolves to nothing (the
 * honest skip — a decayed catalog). Null = no row (guard 1 failed).
 */
export async function loadDirectiveTargets(
  sql: SqlFn,
  directiveId: string,
  learnerId: string,
): Promise<{ courseRef: string | null; targets: Array<{ nodeId: string; code: string }> } | null> {
  const rows = (await sql`
    select node_ids, course_ref from tutor_drill_directives
    where directive_id = ${directiveId} and learner_id = ${learnerId}
  `) as unknown as Array<{ node_ids: unknown; course_ref: string | null }>;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const raw = rows[0]!.node_ids;
  const ids: string[] = Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string")
    : [];
  if (ids.length === 0) return { courseRef: rows[0]!.course_ref, targets: [] };
  const nodeRows = (await sql`
    select id, code from knowledge_nodes where id = any(${ids})
  `) as unknown as Array<{ id: string; code: string }>;
  const byId = new Map(nodeRows.map((n) => [n.id, n.code]));
  return {
    courseRef: rows[0]!.course_ref,
    targets: ids
      .map((id) => ({ nodeId: id, code: byId.get(id) ?? "" }))
      .filter((t) => t.code !== ""),
  };
}

/**
 * releaseDirectiveClaim — the compensating write: a claim whose scheduling
 * produced ZERO draws was not a claim (the learner retries). The CAS's
 * claimed_at flips back to NULL — guard 2 is only ever consumed by a claim
 * that actually scheduled something.
 */
export async function releaseDirectiveClaim(
  sql: SqlFn,
  directiveId: string,
  learnerId: string,
): Promise<void> {
  await sql`
    update tutor_drill_directives
    set claimed_at = null, scheduled_count = null
    where directive_id = ${directiveId} and learner_id = ${learnerId}
      and scheduled_count is null
  `;
}

/**
 * recordDirectiveOutcome — persist the claim's real scheduled count (the
 * idempotent re-render reads THIS — the artefact of record).
 */
export async function recordDirectiveOutcome(
  sql: SqlFn,
  directiveId: string,
  learnerId: string,
  scheduledCount: number,
): Promise<void> {
  await sql`
    update tutor_drill_directives
    set scheduled_count = ${scheduledCount}
    where directive_id = ${directiveId} and learner_id = ${learnerId}
  `;
}
