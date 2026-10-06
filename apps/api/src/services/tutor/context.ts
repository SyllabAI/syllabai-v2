/**
 * Tutor policy + context assembly + episodic memory (T-MIG-060 tranche 1) —
 * frozen sources @ 6cad6ef, line-against-line:
 *   - KnowledgeRetriever.java :20-74 (the KnowledgeContext records)
 *   - TutorPolicyService.java :42-111 (T-026 diagnosis-aware policy,
 *     POLICY_VERSION "rules-v0.2", precedence order documented :24-33)
 *   - TutorMemoryService.java :40-181 (s140 episodic digest, MAX_TOPICS 3,
 *     MAX_BLOCK_CHARS 700)
 *   - LearnerContextAssembler.java :17-142 + ContextAssembler.java :7-56
 *
 * Per-module structural-seam doctrine (the 043 ExamTargetReader precedent):
 * the learner-model reads are this module's own SQL over the same baseline
 * tables (skill_states / misconception_states); the ADR-032 relaxation math
 * carries its own copy here — consolidation to ONE canonical reader is
 * requested as an R0 intake ruling after the wave lands (the nba.ts
 * precedent, where the same request is already queued).
 */

import type { EvidenceItem } from "./evidence";

// ── KnowledgeRetriever.KnowledgeContext (:39-73) ────────────────────────────

export interface MatchedTopic {
  nodeId: string;
  code: string;
  title: string;
  /** deterministic match specificity 0..1 */
  matchScore: number;
}

export interface PrerequisiteLink {
  /** the matched topic that needs this prerequisite */
  forTopicId: string;
  nodeId: string;
  title: string;
  /** 1 = direct prerequisite, deeper = transitive */
  depth: number;
}

export interface MisconceptionSignal {
  /** the matched topic this misconception attaches to */
  forTopicId: string;
  nodeId: string;
  title: string;
}

export interface KnowledgeContext {
  topics: MatchedTopic[];
  prerequisites: PrerequisiteLink[];
  misconceptions: MisconceptionSignal[];
}

export function knowledgeContextIsEmpty(k: KnowledgeContext): boolean {
  const noTopics = k.topics == null || k.topics.length === 0;
  const noMisconceptions =
    k.misconceptions == null || k.misconceptions.length === 0;
  return noTopics && noMisconceptions;
}

// ── learner-model read models (the ports the assembler + policy consume) ────

/** learner.SkillState :24-76 — the fields the brief and memory digest read. */
export interface SkillState {
  nodeId: string;
  mastery: number;
  attempts: number;
  correctCount: number;
  lastPracticedAt: Date | null;
  proceduralFluencyGap: number | null;
}

/** learner.MisconceptionReading — the anchored row + its staleness-relaxed
 *  probability (MED-2, ADR-032: effective = prior + (P_e − prior)·e^(−age/τ)). */
export interface MisconceptionReading {
  misconceptionNodeId: string;
  effective: number;
}

/** LearnerProperties.Bdt paper defaults (the nba.ts precedent; tau 180d). */
export const TUTOR_BDT_PAPER_DEFAULTS = {
  prior: 0.3,
  activeThreshold: 0.5,
  stalenessTauDays: 180,
} as const;

const DAY_MS = 86_400_000;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** ADR-032 relaxation — the per-module copy (see the header disclosure). */
export function relaxedToPrior(
  posterior: number,
  prior: number,
  lastEvidenceAt: Date,
  now: Date,
  stalenessTauDays: number,
): number {
  if (stalenessTauDays <= 0) {
    throw new Error("staleness tau must be positive, got " + stalenessTauDays);
  }
  const p = clamp01(posterior);
  const base = clamp01(prior);
  if (!(now.getTime() > lastEvidenceAt.getTime())) return p;
  const ageMs = now.getTime() - lastEvidenceAt.getTime();
  return clamp01(base + (p - base) * Math.exp(-ageMs / (stalenessTauDays * DAY_MS)));
}

// ── TutorPolicyService (:42-111) ────────────────────────────────────────────

export const TUTOR_POLICY_VERSION = "rules-v0.2";
/** TutorPolicyService.INTERVENTION_THRESHOLD :44 */
export const INTERVENTION_THRESHOLD = 0.65;
/** TutorPolicyService.ACTIVE_MISCONCEPTION_THRESHOLD :45 */
export const POLICY_ACTIVE_MISCONCEPTION_THRESHOLD = 0.5;

export type InterventionType =
  | "EXPLANATION"
  | "MISCONCEPTION_REMEDIATION"
  | "PREREQUISITE_REVIEW"
  | "PROCEDURAL_FLUENCY"
  | "METACOGNITIVE_CHECK";

export interface InterventionPlan {
  type: InterventionType;
  rationale: string;
  actions: string[];
}

/** A struggle-inference row (diagnostic.StruggleInference) as the policy
 *  reads it: the read contract (:18-22) — not expired, not superseded,
 *  not teacher-REJECTED; teacher-CONFIRMED meets the threshold outright. */
export interface StruggleInferenceRow {
  topicNodeId: string;
  probability: number;
  teacherConfirmed: boolean;
  teacherRejected: boolean;
  /** PREREQUISITE_GAP | EXAM_LITERACY | METACOGNITIVE | … */
  type: string;
  subtype: string | null;
}

/**
 * The T-026 selection (select :61-93). Deterministic precedence under equal
 * inputs; the misconception gate runs on the staleness-RELAXED probability
 * (MED-2/ADR-032 :80-84), not the raw anchored posterior.
 */
export function selectIntervention(
  learnerId: string | null,
  topics: ReadonlyArray<MatchedTopic>,
  misconceptions: ReadonlyArray<MisconceptionSignal>,
  readings: ReadonlyArray<MisconceptionReading>,
  activeInferences: ReadonlyArray<StruggleInferenceRow>,
): InterventionPlan {
  if (learnerId == null) {
    return plan("EXPLANATION", "anonymous request", [
      "Explain the concept from the supplied sources.",
    ]);
  }
  const topicIds = new Set(topics.map((t) => t.nodeId));
  // read path enforces: not expired, not superseded; REJECTED filtered here
  const active = activeInferences.filter(
    (i) => !i.teacherRejected && topicIds.has(i.topicNodeId),
  );
  const strongest =
    active.find((i) => i.teacherConfirmed || i.probability >= INTERVENTION_THRESHOLD) ??
    null;
  if (strongest != null) return planFor(strongest);
  // MED-2/ADR-032: gate on the staleness-relaxed probability
  const activeMisconception = readings.some(
    (r) =>
      r.effective >= POLICY_ACTIVE_MISCONCEPTION_THRESHOLD &&
      misconceptions.some((s) => s.nodeId === r.misconceptionNodeId),
  );
  return activeMisconception
    ? plan("MISCONCEPTION_REMEDIATION", "active BDT misconception on a matched topic", [
        "Address the misconception explicitly.",
        "Contrast it with the correct idea using source evidence.",
        "Finish with a brief verification question.",
      ])
    : plan("EXPLANATION", "no high-confidence diagnostic signal", [
        "Explain the matched concept from the supplied sources.",
        "Finish with a brief understanding check.",
      ]);
}

/** planFor :95-102 — the struggle-category → intervention mapping. */
function planFor(i: StruggleInferenceRow): InterventionPlan {
  switch (i.type) {
    case "PREREQUISITE_GAP":
      return plan("PREREQUISITE_REVIEW", i.subtype ?? "", [
        "Review the weakest prerequisite before the target concept.",
        "Connect it back to the learner's question.",
        "Check understanding before moving forward.",
      ]);
    case "EXAM_LITERACY":
      return plan("PROCEDURAL_FLUENCY", i.subtype ?? "", [
        "Explain the method briefly.",
        "Give a small timed-style verification step.",
        "Encourage transfer to a nearby exam-style task.",
      ]);
    case "METACOGNITIVE":
      return plan("METACOGNITIVE_CHECK", i.subtype ?? "", [
        "Use a low-pressure verification step.",
        "Ask the learner to state why their answer is justified.",
        "Avoid framing the learner as deficient.",
      ]);
    default:
      return plan("EXPLANATION", "unsupported struggle category for v0 intervention rules", [
        "Use a normal source-grounded explanation.",
      ]);
  }
}

function plan(
  type: InterventionType,
  rationale: string,
  actions: string[],
): InterventionPlan {
  return { type, rationale, actions: [...actions] };
}

// ── TutorMemoryService (:40-181) ────────────────────────────────────────────

/** topics per digest (:44) */
export const MEMORY_MAX_TOPICS = 3;
/** (:45) */
export const MEMORY_MAX_BLOCK_CHARS = 700;

export interface TopicRef {
  nodeId: string;
  title: string;
}

/** TutorTopicEngagement rows as the digest reads them (signal :130-137). */
export interface TutorTopicEngagementRow {
  nodeId: string;
  signalType: string;
  occurredAt: Date;
}

/** ReviewSchedule status PENDING rows (:88-92). */
export interface ReviewSchedulePendingRow {
  nodeId: string;
}

/**
 * The s140 cross-session digest (digest :74-116): matched-topic scoped,
 * qualitative surface (counts and recency only), deterministic — two
 * repository reads + string building, no LLM. Null when the learner has no
 * prior signal on any matched topic (the block is omitted entirely).
 */
export function memoryDigest(
  learnerId: string | null,
  topics: ReadonlyArray<TopicRef>,
  skillStates: ReadonlyArray<SkillState> | null,
  engagements: ReadonlyArray<TutorTopicEngagementRow>,
  pendingReviews: ReadonlyArray<ReviewSchedulePendingRow>,
  now: Date,
): string | null {
  if (learnerId == null || topics == null || topics.length === 0) return null;
  const states = skillStates == null ? [] : skillStates;
  const scoped = topics.slice(0, MEMORY_MAX_TOPICS);
  const nodeIds = new Set(scoped.map((t) => t.nodeId));

  const asksByNode = new Map<string, TutorTopicEngagementRow[]>();
  for (const e of engagements) {
    if (!asksByNode.has(e.nodeId)) asksByNode.set(e.nodeId, []);
    asksByNode.get(e.nodeId)!.push(e);
  }
  const pending = new Set<string>();
  for (const r of pendingReviews) pending.add(r.nodeId);
  const skills = new Map<string, SkillState>();
  for (const s of states) {
    if (nodeIds.has(s.nodeId) && !skills.has(s.nodeId)) skills.set(s.nodeId, s);
  }

  const lines: string[] = [];
  for (const topic of scoped) {
    const line = topicLine(
      topic,
      asksByNode.get(topic.nodeId) ?? null,
      skills.get(topic.nodeId) ?? null,
      pending.has(topic.nodeId),
      now,
    );
    if (line == null) continue;
    let block = lines.join("\n");
    if (block.length > 0) block += "\n";
    block += line;
    lines.push(line);
    if (block.length >= MEMORY_MAX_BLOCK_CHARS) break;
  }
  if (lines.length === 0) return null;
  return lines.join("\n");
}

/** topicLine :119-155 — one topic's fact line, or null with no signal. */
function topicLine(
  topic: TopicRef,
  asks: TutorTopicEngagementRow[] | null,
  skill: SkillState | null,
  reviewPending: boolean,
  now: Date,
): string | null {
  if (asks == null && skill == null && !reviewPending) return null;
  let line = `- '${topic.title}':`;
  const practiceOnly = asks == null || asks.length === 0;
  if (!practiceOnly) {
    let doubtish = 0;
    let lastAsk: Date | null = null;
    for (const ask of asks) {
      if (ask.signalType === "DOUBT_SIGNAL" || ask.signalType === "MISCONCEPTION_RELATED") {
        doubtish++;
      }
      if (lastAsk == null || ask.occurredAt.getTime() > lastAsk.getTime()) {
        lastAsk = ask.occurredAt;
      }
    }
    line += ` ${asks.length} earlier tutor ask(s), the last ${ago(lastAsk, now)}`;
    if (doubtish * 2 > asks.length) line += " (mostly doubt-checks)";
  }
  if (skill != null && skill.attempts > 0) {
    line +=
      (practiceOnly ? "" : ";") +
      ` practiced ${skill.attempts} time(s), ${skill.correctCount} correct (last practice ${ago(skill.lastPracticedAt, now)})`;
  }
  if (reviewPending) {
    line +=
      (practiceOnly && (skill == null || skill.attempts === 0) ? "" : ";") +
      " due for a spaced review (mastery decayed)";
  }
  return line;
}

/** ago :158-180 — honest coarse recency. */
function ago(at: Date | null, now: Date): string {
  if (at == null) return "at an unknown time";
  const sinceMs = now.getTime() - at.getTime();
  const hours = Math.floor(sinceMs / 3_600_000);
  if (sinceMs < 0 || hours < 1) return "earlier today";
  if (hours < 24) return "earlier today";
  const days = Math.floor(sinceMs / 86_400_000);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `about ${Math.max(1, Math.floor(days / 30))} months ago`;
}

// ── LearnerContextAssembler (:17-142) + ContextAssembler.TutorContext ───────

const ANONYMOUS =
  "Learner state: not available for this request (anonymous/preview).";
const ASSEMBLER_ACTIVE_MISCONCEPTION_THRESHOLD = 0.5;

export interface TutorContext {
  learnerBrief: string;
  memoryBrief: string | null;
  knowledgeBrief: string;
  evidence: EvidenceItem[];
  interventionPlan: InterventionPlan;
}

/** Java String.format(Locale.ROOT, "%.2f", v) posture for the briefs. */
const fmt2 = (v: number): string => v.toFixed(2);
/** Java "%+.2f" — sign always rendered. */
const fmtSigned2 = (v: number): string =>
  (v >= 0 ? "+" : "-") + Math.abs(v).toFixed(2);

export interface AssembleInputs {
  knowledge: KnowledgeContext;
  evidence: ReadonlyArray<EvidenceItem>;
  learnerId: string | null;
  /** the learner's FULL skill-state list (M3: read ONCE per assemble) */
  states: ReadonlyArray<SkillState>;
  /** the learner's FULL misconception reading list */
  readings: ReadonlyArray<MisconceptionReading>;
  /** episodic-memory reads (s140) — the digest inputs */
  engagements: ReadonlyArray<TutorTopicEngagementRow>;
  pendingReviews: ReadonlyArray<ReviewSchedulePendingRow>;
  /** the learner's active struggle inferences (the policy's read contract:
   *  not expired, not superseded — enforced on read) */
  activeInferences?: ReadonlyArray<StruggleInferenceRow>;
  now: Date;
}

/**
 * assemble :53-89 — the learner model is read ONCE per assemble and
 * propagated to every consumer (brief + memory digest + policy). The policy
 * decision is deterministic (:81-86).
 */
export function assembleTutorContext(inputs: AssembleInputs): TutorContext {
  const { knowledge, evidence, learnerId, states, readings } = inputs;
  const relevantNodes = new Set<string>(knowledge.topics.map((t) => t.nodeId));
  for (const p of knowledge.prerequisites) relevantNodes.add(p.nodeId);

  const learnerBrief =
    learnerId == null
      ? ANONYMOUS
      : learnerBriefOf(states, readings, relevantNodes, knowledge);

  const memoryBrief =
    learnerId == null
      ? null
      : memoryDigest(
          learnerId,
          knowledge.topics.map((t) => ({ nodeId: t.nodeId, title: t.title })),
          states,
          inputs.engagements,
          inputs.pendingReviews,
          inputs.now,
        );

  const interventionPlan = selectIntervention(
    learnerId,
    knowledge.topics,
    knowledge.misconceptions,
    readings,
    inputs.activeInferences ?? [],
  );
  return {
    learnerBrief,
    memoryBrief,
    knowledgeBrief: knowledgeBriefOf(knowledge),
    evidence: [...evidence],
    interventionPlan,
  };
}

/** learnerBrief :91-124. */
function learnerBriefOf(
  states: ReadonlyArray<SkillState>,
  readings: ReadonlyArray<MisconceptionReading>,
  relevantNodes: ReadonlySet<string>,
  knowledge: KnowledgeContext,
): string {
  const masteryByNode = new Map<string, number>();
  for (const s of states) {
    if (relevantNodes.size === 0 || relevantNodes.has(s.nodeId)) {
      if (!masteryByNode.has(s.nodeId)) masteryByNode.set(s.nodeId, s.mastery);
    }
  }
  const fluencyGaps = new Map<string, number>();
  for (const s of states) {
    if (relevantNodes.has(s.nodeId) && s.proceduralFluencyGap != null) {
      if (!fluencyGaps.has(s.nodeId)) fluencyGaps.set(s.nodeId, s.proceduralFluencyGap);
    }
  }
  // MED-2/ADR-032: membership on the staleness-relaxed probability
  const activeMisconceptions = new Set(
    readings
      .filter((r) => r.effective >= ASSEMBLER_ACTIVE_MISCONCEPTION_THRESHOLD)
      .map((r) => r.misconceptionNodeId),
  );
  const relevantMisconceptions = knowledge.misconceptions.filter((m) =>
    activeMisconceptions.has(m.nodeId),
  );
  if (
    masteryByNode.size === 0 &&
    relevantMisconceptions.length === 0 &&
    fluencyGaps.size === 0
  ) {
    return "Learner state: no prior evidence on the topics in this question.";
  }
  const sb: string[] = ["Learner state for this question:\n"];
  for (const topic of knowledge.topics) {
    const mastery = masteryByNode.get(topic.nodeId);
    if (mastery != null) {
      sb.push(`- mastery of '${topic.title}': ${fmt2(mastery)}\n`);
    }
  }
  for (const [, gap] of fluencyGaps) {
    sb.push(
      `- timed/untimed fluency gap on a relevant topic: ${fmtSigned2(gap)}` +
        " (positive = weaker under timed conditions)\n",
    );
  }
  for (const m of relevantMisconceptions) {
    sb.push(`- active misconception: ${m.title}\n`);
  }
  if (masteryByNode.size === 0) {
    sb.push("- no mastery estimates yet for the matched topics\n");
  }
  return sb.join("").trim();
}

/** knowledgeBrief :126-141. */
function knowledgeBriefOf(knowledge: KnowledgeContext): string {
  if (knowledgeContextIsEmpty(knowledge)) {
    return "Curriculum context: no topics matched this question.";
  }
  const sb: string[] = ["Curriculum context:\n"];
  for (const topic of knowledge.topics) {
    sb.push(`- topic ${topic.code}: ${topic.title}\n`);
  }
  if (knowledge.prerequisites.length > 0) {
    sb.push("Prerequisites of the matched topics:\n");
    for (const p of knowledge.prerequisites.slice(0, 8)) {
      sb.push(`- ${p.title} (${p.depth}${p.depth === 1 ? " hop" : " hops deep"})\n`);
    }
  }
  if (knowledge.misconceptions.length > 0) {
    sb.push("Known misconceptions attached to these topics:\n");
    for (const m of knowledge.misconceptions.slice(0, 6)) {
      sb.push(`- ${m.title}\n`);
    }
  }
  return sb.join("").trim();
}
