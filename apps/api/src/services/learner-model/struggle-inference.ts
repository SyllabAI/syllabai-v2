/**
 * The struggle-inference WRITE path (T-MIG-131) — port of the frozen
 * StruggleInferenceService diagnosis engine (syllabai-core @ 6cad6ef,
 * diagnostic/StruggleInferenceService.java :1-117, line-against-line).
 *
 * THE FROZEN LAW: on every AssessmentEvidenceRecordedEvent the diagnosis
 * engine (@Order(100), AFTER LearnerModelService @Order(10)) reads the
 * POST-update learner state — "diagnosis never trails the evidence by one
 * attempt" (:25-28) — and, per tested TOPIC, writes up to three rule rows:
 *
 *   1. PREREQUISITE_GAP, subtype "1a_weak_prerequisite_mastery"
 *      (inferPrerequisiteGap :67-89): the topic has a transitive
 *      prerequisite chain AND at least one prerequisite with a measured
 *      post-update mastery < 0.50. A prerequisite with NO skill state is
 *      "no evidence", never a crash (:71-72). probability =
 *      clamp(0.55 + (0.50 - weakest), 0.55, 0.95). Evidence: signal,
 *      weakest_mastery, prerequisite_count, prerequisite_codes.
 *   2. EXAM_LITERACY, subtype "3b_procedural_fluency"
 *      (inferProceduralFluency :91-98): the topic's own procedural-fluency
 *      gap is non-null and >= 0.15. probability = clamp(0.50 + gap, 0.50, 0.95).
 *      Evidence: signal, gap.
 *   3. METACOGNITIVE, subtype "5a_self_efficacy" (:62-63): the attempt's
 *      self-doubt flag (Paper B §3.5, struggle type 4 signal) — fixed
 *      probability 0.80. Evidence: signal, attempt_id.
 *
 * THE SUPERSEDE LAW (save :100-114 + the header :30-34): a new inference for
 * the same (learner, topic, type) SUPERSEDES the previous ACTIVE one — the
 * prior row (expires_at > generated_at AND superseded_at IS NULL) keeps its
 * place in history with superseded_at stamped at the new generated_at
 * (research history is append-only; rows are never deleted) and is excluded
 * from active reads. The frozen supersede() null-guard (:111-115) is the
 * first-writer-kept law: a guarded UPDATE can never re-stamp an already
 * superseded row.
 *
 * ROW SHAPE (StruggleInference.java :18-84): uuid id, learner/topic uuids,
 * type (the Master Spec §6.7 enum, stored as its string name), subtype,
 * probability, jsonb supporting_evidence, model_version "rules-v0.2",
 * generated_at, expires_at = generated_at + EXPIRY (Duration.ofDays(7), :42).
 * teacher_override / overridden_by / overridden_at stay null — the T-029
 * teacher decision surface is a separate band; the read side already maps
 * CONFIRMED/REJECTED (services/tutor/learner-model.ts).
 *
 * FIRING SCOPE: the listener iterates event.topicNodeIds() ONLY (:59) — the
 * primary-first, secondary-deduped topic list (EvidencePublisher
 * .topicNodeIds :111-120 parity, the same derivation model-update.ts runs).
 * Spec-point nodes do NOT fire struggle rows in the frozen core. Zero topics
 * = zero reads, zero rows (the anonymous/unmapped-question posture).
 *
 * THE STATE READ: learnerModel.skillStates(learnerId) = findByLearnerIdOr
 * derByLastPracticedAtDesc (LearnerModelService :206-208) consumed into a
 * first-seen map ((a, b) -> a, :57-58) — v2 reuses skillStatesByRecency
 * (services/learner/state.ts), the canonical port of that exact ordering.
 *
 * THE PREREQUISITE READ: KnowledgeGraphService.prerequisiteChain(topicId) =
 * findPrerequisiteClosure (KnowledgeGraphService :119-123) — the transitive
 * REQUIRES_PREREQUISITE closure, deepest-first (the repository's recursive
 * CTE; PrerequisiteView carries id/code/title/type/depth). This module owns
 * its per-module copy of the closure read WITH code (the ADR-032 per-module
 * seam doctrine, the tutor/context.ts precedent): the tutor kg-retriever's
 * batched chains drop code because the tutor prompt never reads it — the
 * writer's evidence does. Consolidation to ONE canonical reader stays the
 * queued R0 intake ruling (the same request already queued for the tutor
 * module's ADR-032 copy).
 *
 * FAILURE LAW: fail-loud, the same-DB infra class as every other evidence
 * listener — a failure propagates and fails the submit exactly like the
 * learner-model phases (the frozen @Transactional listener fails the
 * publish the same way; the T-MIG-102 no-silent-skip law). EMPTY tables
 * degrade to the honest no-op: no weak prerequisite, no fluency gap, no
 * doubt flag = zero writes, byte-identical to the pre-band wire.
 *
 * DOWNSTREAM DISCLOSURE: the frozen StruggleInferredEvent's ONLY consumer
 * is DiagnosisTelemetryService (research §18) — the T-MIG-061 disclosed
 * dormant posture in v2. No downstream event is ported in this band; the
 * reader side (tutor policy + intervention + future NBA reads) goes live
 * unmodified the moment the first row lands (the T-MIG-126 activation-seam
 * law).
 */

import type { SqlFn } from "../tutor/sql";
import type { ModelUpdateClock as Clock } from "./model-update";
import { skillStatesByRecency } from "../learner/state";

/** StruggleInferenceService.MODEL_VERSION :38 */
export const STRUGGLE_MODEL_VERSION = "rules-v0.2";
/** :39 */
export const STRUGGLE_PREREQUISITE_THRESHOLD = 0.5;
/** :40 */
export const STRUGGLE_FLUENCY_GAP_THRESHOLD = 0.15;
/** :41 */
export const STRUGGLE_SELF_DOUBT_PROBABILITY = 0.8;
/** :42 — Duration.ofDays(7) */
export const STRUGGLE_EXPIRY_DAYS = 7;

/** StruggleType (Master Spec §6.7) — the members the engine writes (:62, :88, :96). */
export type StruggleType = "PREREQUISITE_GAP" | "EXAM_LITERACY" | "METACOGNITIVE";

/** The evidence event fields the diagnosis engine consumes (the frozen
 *  event's observable core for THIS listener — a superset need of the
 *  model-update core is NOT implied: the learner-model phases keep their
 *  own narrower interface). topicNodeIds is DERIVED here, exactly as the
 *  frozen listener read it off the event (primary first, secondary
 *  deduped — EvidencePublisher.topicNodeIds :111-120). */
export interface StruggleEvidenceEvent {
  attemptId: string;
  learnerId: string;
  primaryTopicNodeId: string | null;
  secondaryTopicNodeIds: string[];
  /** Paper B §3.5 — the learner self-doubt flag on the attempt. */
  selfDoubtFlag: boolean;
  occurredAt: string; // ISO instant
}

/** skill_states row as the engine reads it (SkillState :24-76 fields the rules consume). */
export interface StruggleSkillState {
  nodeId: string;
  mastery: number;
  proceduralFluencyGap: number | null;
}

/** PrerequisiteView (knowledge/dto :12-17) — the fields the evidence reads. */
export interface StrugglePrerequisite {
  id: string;
  code: string;
  title: string;
  depth: number;
}

const DAY_MS = 86_400_000;

/** clamp :116. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * onAssessmentEvidence (:53-65) — the listener, phase for phase: one
 * post-update states read per event, then per tested topic the prerequisite
 * rule, the fluency rule, and the self-doubt rule.
 */
export async function inferStrugglesOnAssessmentEvidence(
  sql: SqlFn,
  event: StruggleEvidenceEvent,
  clock: Clock,
): Promise<void> {
  const now = new Date(event.occurredAt);
  const expires = new Date(now.getTime() + STRUGGLE_EXPIRY_DAYS * DAY_MS);

  // :56-58 — fetched once per event: the rules below all observe the same
  // post-update snapshot. First-seen map ((a, b) -> a) over the
  // last-practiced-desc order = the frozen toMap law.
  const states = await skillStatesByRecency(sql, event.learnerId);
  const statesByNode = new Map<string, StruggleSkillState>();
  for (const s of states) {
    if (!statesByNode.has(s.nodeId)) {
      statesByNode.set(s.nodeId, {
        nodeId: s.nodeId,
        mastery: s.mastery,
        proceduralFluencyGap: s.proceduralFluencyGap,
      });
    }
  }

  // :59 — event.topicNodeIds(): primary first, secondary deduped. Spec
  // points are NOT in the firing list (the frozen listener never saw them).
  const topicNodeIds: string[] = [];
  if (event.primaryTopicNodeId != null) topicNodeIds.push(event.primaryTopicNodeId);
  for (const secondary of event.secondaryTopicNodeIds) {
    if (!topicNodeIds.includes(secondary)) topicNodeIds.push(secondary);
  }

  for (const topicId of topicNodeIds) {
    await inferPrerequisiteGap(sql, event.learnerId, topicId, statesByNode, now, expires, clock);
    await inferProceduralFluency(sql, event.learnerId, topicId, statesByNode, now, expires, clock);
    if (event.selfDoubtFlag) {
      await save(sql, clock, event.learnerId, topicId, "METACOGNITIVE", "5a_self_efficacy",
        STRUGGLE_SELF_DOUBT_PROBABILITY,
        { signal: "self_doubt_flag", attempt_id: event.attemptId }, now, expires);
    }
  }
}

/** inferPrerequisiteGap :67-89. */
async function inferPrerequisiteGap(
  sql: SqlFn,
  learnerId: string,
  topicId: string,
  statesByNode: ReadonlyMap<string, StruggleSkillState>,
  now: Date,
  expires: Date,
  clock: Clock,
): Promise<void> {
  const prerequisites = await prerequisiteChain(sql, topicId);
  if (prerequisites.length === 0) return;
  // NB: filter BEFORE pairing (:71-72) — a prerequisite with no skill state
  // is "no evidence", never a crash.
  const weak: Array<{ prereq: StrugglePrerequisite; mastery: number }> = [];
  for (const p of prerequisites) {
    const state = statesByNode.get(p.id);
    if (state != null && state.mastery < STRUGGLE_PREREQUISITE_THRESHOLD) {
      weak.push({ prereq: p, mastery: state.mastery });
    }
  }
  if (weak.length === 0) return;
  const weakest = weak.reduce((m, e) => Math.min(m, e.mastery), Number.POSITIVE_INFINITY);
  const probability = clamp(
    0.55 + (STRUGGLE_PREREQUISITE_THRESHOLD - weakest), 0.55, 0.95,
  );
  const evidence: Record<string, unknown> = {
    signal: "weak_prerequisite_mastery",
    weakest_mastery: weakest,
    prerequisite_count: weak.length,
    prerequisite_codes: weak.map((e) => e.prereq.code),
  };
  await save(sql, clock, learnerId, topicId, "PREREQUISITE_GAP",
    "1a_weak_prerequisite_mastery", probability, evidence, now, expires);
}

/** inferProceduralFluency :91-98 — the v2 port awaits its save (fail-loud,
 *  the no-silent-skip law; the frozen JPA save was synchronous inside the
 *  listener transaction). */
async function inferProceduralFluency(
  sql: SqlFn,
  learnerId: string,
  topicId: string,
  statesByNode: ReadonlyMap<string, StruggleSkillState>,
  now: Date,
  expires: Date,
  clock: Clock,
): Promise<void> {
  const state = statesByNode.get(topicId);
  if (
    state == null ||
    state.proceduralFluencyGap == null ||
    state.proceduralFluencyGap < STRUGGLE_FLUENCY_GAP_THRESHOLD
  ) {
    return;
  }
  const gap = state.proceduralFluencyGap;
  await save(sql, clock, learnerId, topicId, "EXAM_LITERACY", "3b_procedural_fluency",
    clamp(0.5 + gap, 0.5, 0.95),
    { signal: "procedural_fluency_gap", gap }, now, expires);
}

/**
 * save :100-114 — supersede the prior ACTIVE inference of the same
 * (learner, topic, type), then insert the new row. History append-only.
 */
async function save(
  sql: SqlFn,
  clock: Clock,
  learnerId: string,
  topicId: string,
  type: StruggleType,
  subtype: string,
  probability: number,
  evidence: Record<string, unknown>,
  generatedAt: Date,
  expiresAt: Date,
): Promise<void> {
  // findByLearnerIdAndTopicNodeIdAndTypeAndExpiresAtAfterAndSupersededAtIsNull
  // (:104-106) — the ids of the prior ACTIVE rows.
  const prior = (await sql`
    select id from struggle_inferences
    where learner_id = ${learnerId}
      and topic_node_id = ${topicId}
      and type = ${type}
      and expires_at > ${generatedAt.toISOString()}
      and superseded_at is null
  `) as unknown as Array<{ id: string }>;
  for (const previous of prior) {
    // previous.supersede(generatedAt) + save (:107-110) — the null-guard
    // becomes the guarded UPDATE (first writer keeps its stamp).
    await sql`
      update struggle_inferences
      set superseded_at = ${generatedAt.toISOString()}
      where id = ${previous.id} and superseded_at is null
    `;
  }
  // :111-112 — the insert (jsonb param follows the repo insert convention,
  // model-update.ts :219: JSON.stringify ::jsonb).
  await sql`
    insert into struggle_inferences
      (id, learner_id, topic_node_id, type, subtype, probability,
       supporting_evidence, model_version, generated_at, expires_at)
    values
      (${clock.newId()}, ${learnerId}, ${topicId}, ${type}, ${subtype},
       ${probability}, ${JSON.stringify(evidence)}::jsonb,
       ${STRUGGLE_MODEL_VERSION}, ${generatedAt.toISOString()},
       ${expiresAt.toISOString()})
  `;
  // :113 — events.publishEvent(new StruggleInferredEvent(...)) is NOT
  // ported: the frozen event's only consumer is DiagnosisTelemetryService
  // (research §18), the T-MIG-061 disclosed dormant posture in v2. See the
  // header's downstream disclosure.
}

/**
 * The single-origin prerequisite closure WITH code (PrerequisiteView
 * parity). The recursive CTE is the same law the tutor kg-retriever ports
 * verbatim (deepest-first, depth < 10, union dedup, node_id tiebreak) —
 * this copy adds code to the node fetch because the writer's evidence
 * carries prerequisite_codes (the per-module seam doctrine, header).
 */
export async function prerequisiteChain(
  sql: SqlFn,
  topicId: string,
): Promise<StrugglePrerequisite[]> {
  const rows = (await sql`
    with recursive prereq as (
      select e.target_node_id as node_id, 1 as depth
      from knowledge_edges e
      where e.source_node_id = ${topicId}
        and e.relation_type = 'REQUIRES_PREREQUISITE'
      union
        select e.target_node_id, p.depth + 1
        from knowledge_edges e
        join prereq p on e.source_node_id = p.node_id
        where e.relation_type = 'REQUIRES_PREREQUISITE' and p.depth < 10
    )
    select p.node_id, max(p.depth) as depth, n.code, n.title
    from prereq p
    join knowledge_nodes n on n.id = p.node_id
    group by p.node_id, n.code, n.title
    order by depth desc, p.node_id
  `) as unknown as Array<{ node_id: string; depth: number; code: string; title: string }>;
  return rows.map((r) => ({
    id: String(r.node_id),
    code: String(r.code),
    title: String(r.title),
    depth: Number(r.depth),
  }));
}
