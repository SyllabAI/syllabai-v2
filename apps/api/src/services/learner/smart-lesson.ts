/**
 * T-MIG-053 tranche-4 (r3a) — Smart Lesson: ONE explainable next action for
 * a learner on a selected topic. Port of the frozen law (syllabai-core
 * @ 6cad6ef, learner/SmartLessonService.java :68-934):
 *
 *   THE DECISION LADDER (deterministic, evidence-gated; the class javadoc's
 *   claim is the law — "no new state, no new thresholds, NO LLM IN THE LOOP"):
 *     (1) prerequisite gate — a DIRECT prerequisite measured weak redirects
 *         (measured evidence only; the graph alone never acts);
 *     (2) active misconception on the topic — validated REMEDIATED_BY edge
 *         ⇒ STUDY_CORRECTIVE, else ASK_TUTOR. v2: probability desc, then
 *         FRESHEST evidence (nulls last), then code;
 *     (3) review due on the topic — v2 names the MOST OVERDUE schedule;
 *     (4) measured fluency gap (>= fluencyGapThreshold);
 *     (5) established weak mastery (attempts >= minAttemptsForWeakness and
 *         effective < weakMasteryCeiling);
 *     (6) tutor-engaged but never practised — the §9 signal mix + the
 *         TutorSignalPolicy derived multi-row signals as EVIDENCE;
 *     (7) no attempt evidence — start the topic (diagnostic);
 *     (8) mastered — the evidence-aware advance (pass 1 confusion recency /
 *         pass 1.5 most-overdue review / pass 2 prerequisite-ready unstarted /
 *         first weak measured / remediate the weakest blocker / consolidate
 *         on the stalest measured topic).
 *
 *   §11 POSTURE: the windowed engagement rows, the pending reviews and the
 *   prerequisite relations are each fetched ONCE per response — no rung
 *   re-queries. The advance-only batched servableCounts (activeWithin) fires
 *   ONLY when the ladder reaches rung 8 (the frozen computes it inside
 *   advance()); topicStatus's per-topic count and the practice-action fetch
 *   mirror the frozen call sites verbatim.
 *
 *   THE STARTER QUESTION (v2 repeated-exposure avoidance): the FIRST servable
 *   question of the target the learner has NOT attempted yet (one batched
 *   attempted-ids query); when all have been attempted, revisit the first
 *   and SAY SO (the rotation notes are verbatim).
 *
 *   DISCLOSED WIRE-TEXT POSTURES (both sub-visible, both precedented):
 *     - timestamps embedded in evidence/reasonDetail strings print through
 *       instantText() — the Java Instant.toString() shape (no ".000" for
 *       whole seconds); sub-millisecond precision is lost at the driver
 *       (Date grain) — the w0a NBA port disclosed the same class (nba.ts).
 *     - fmt() is toFixed(2) — for the 4-dp stored mastery values this
 *       matches the frozen String.format("%.2f", Locale.ROOT) (exact binary
 *       ties cannot occur at 4-dp inputs).
 *
 *   THE LLM-PATH CHECK (operator obligation, RESOLVED): the frozen 934-line
 *   service has ZERO LLM/Gemini/client references — the only "llm" hit in
 *   the file is the header's own "no LLM in the loop" claim; the tutor
 *   references are the engagement REPOSITORY (evidence rows) and the
 *   ASK_TUTOR reason text (a deterministic hand-off to the tutor surface,
 *   w0a's T-MIG-060). The port introduces NO LLM seam.
 *
 * REUSE-not-redeclare: kgTreeWithMisconceptions + prerequisiteRelations +
 * skillStatesFor + misconceptionReadingsFor (the nba 043 seams) +
 * ServableQuestions + decayedMastery + the TutorTopicEngagementRow shape
 * (the 041/043/053 machinery-reuse precedent). The WIRE was already ratified
 * in packages/contracts (learner.ts — T-MIG-041 pinned the SmartLessonView
 * records in advance): the contract pins in this tranche re-point at that
 * module (reuse-not-redeclare, the TS2308/F-034 law) — no new schema. The
 * prerequisiteRelations seam re-runs the 404 guard + subtree CTE (the t1
 * "call sequence ported, not fused" precedent — one extra guard read vs the
 * frozen single query, sub-visible).
 *
 * NO routes/mounts — the t4 tranche is contracts+services+fakeSql pins.
 */
import { NotFoundError, type SubmitClock } from "../selfmark";
import type { SqlFn } from "./sql";
import {
  LEARNER_BDT_PAPER_DEFAULTS,
  LEARNER_DECAY_PAPER_DEFAULTS,
  type TutorTopicEngagementRow,
} from "./state";
import {
  lastConfusionAtByTopic,
  repeatedExplanationRequest,
  signalCounts,
  unresolvedQuestion,
  postExplanationEngagement,
} from "./tutor-signals";
import { NBA_CONCEPT_GRAPH, type SemanticRelation } from "../learner-me/nba-concept-graph";
import {
  kgTreeWithMisconceptions,
  prerequisiteRelations,
  skillStatesFor,
  misconceptionReadingsFor,
  type NbaNode,
} from "../learner-me/nba";
import { ServableQuestions } from "../questions";
import { decayedMastery, type LearnerBdtParams, type LearnerDecayParams } from "../learner-model/decay";

// ── the engine numbers (the SAME tuning the learner + NBA surfaces use) ──────

export interface SmartLessonEngineParams {
  /** LearnerProperties.decay — the shared decay bands (learner-model/decay) */
  decay: LearnerDecayParams;
  /** LearnerProperties.bdt — the shared BDT params (MED-2/ADR-032) */
  bdt: LearnerBdtParams;
  /** RecommendationProperties — the frozen config law (application.yml :88-93
   *  + the record defaults :23-30): no teacher/lesson-specific tuning. */
  weakMasteryCeiling: number; // 0.45
  fluencyGapThreshold: number; // 0.2
  minAttemptsForWeakness: number; // 2
  /** RecommendationProperties.tutorEngagementWindowDays — the record default
   *  14 (P7); the frozen application.yml does not override it. */
  tutorEngagementWindowDays: number; // 14
}

export type SmartLessonDeps = {
  sql: SqlFn;
  clock: SubmitClock;
  engine?: Partial<SmartLessonEngineParams>;
};

const engineOf = (deps: SmartLessonDeps): SmartLessonEngineParams => ({
  decay: deps.engine?.decay ?? LEARNER_DECAY_PAPER_DEFAULTS,
  bdt: deps.engine?.bdt ?? LEARNER_BDT_PAPER_DEFAULTS,
  // the frozen config law (the #108 review finding's constant set — 0.45/2)
  weakMasteryCeiling: deps.engine?.weakMasteryCeiling ?? 0.45,
  fluencyGapThreshold: deps.engine?.fluencyGapThreshold ?? 0.2,
  minAttemptsForWeakness: deps.engine?.minAttemptsForWeakness ?? 2,
  tutorEngagementWindowDays: deps.engine?.tutorEngagementWindowDays ?? 14,
});

/** SmartLessonView :42 — the deterministic read-model marker. */
export const SMART_LESSON_POLICY_ID = "smart-lesson/v2";

const DAY_MS = 86_400_000;

/** the frozen fmt (:931-933) — see the disclosed posture in the header */
const fmt = (v: number): string => v.toFixed(2);

/** the Java Instant.toString() shape for strings that embed timestamps */
function instantText(v: Date): string {
  const iso = v.toISOString();
  return v.getUTCMilliseconds() === 0 ? iso.replace(".000Z", "Z") : iso;
}

/** the frozen embeds lastEvidenceAt() directly — a null prints "null" */
function instantTextOrNull(v: string | Date | null): string {
  return v == null ? "null" : instantText(new Date(v));
}

// ── the seam rows ────────────────────────────────────────────────────────────

/** LearnerModelService.skillStates row (state.ts SkillStateRow) */
type SkillRow = Awaited<ReturnType<typeof skillStatesFor>>[number];

/** MisconceptionReading overlay (nba.ts misconceptionReadingsFor row) */
type ReadingRow = Awaited<ReturnType<typeof misconceptionReadingsFor>>[number];

/** the ladder's per-request context (Context :151-168) — one fetch per source */
type Context = {
  tree: NbaNode;
  topic: NbaNode;
  byId: Map<string, NbaNode>;
  byCode: Map<string, NbaNode>;
  skills: Map<string, SkillRow>;
  misconceptions: Map<string, ReadingRow>;
  effective: Map<string, number>;
  pendingReviews: Array<{ nodeId: string; dueAt: Date }>;
  relations: Array<{ prerequisiteId: string; dependentNodeId: string }>;
  recentEngagements: TutorTopicEngagementRow[];
  now: Date;
};

type ActiveMisconception = { node: NbaNode; reading: ReadingRow };

/** freshness :124-141 — newest evidence first, nulls last */
function freshness(a: ActiveMisconception, b: ActiveMisconception): number {
  const la = a.reading.last_evidence_at;
  const lb = b.reading.last_evidence_at;
  const ta = la == null ? null : new Date(la).getTime();
  const tb = lb == null ? null : new Date(lb).getTime();
  if (ta == null && tb == null) return 0;
  if (ta == null) return 1; // unknown age sorts last
  if (tb == null) return -1;
  return tb - ta; // newest first
}

// ── the entry point (:172-255) ───────────────────────────────────────────────

export async function smartLessonFor(
  deps: SmartLessonDeps,
  learnerId: string,
  rootId: string,
  topicNodeId: string,
): Promise<{
  learnerId: string;
  rootId: string;
  topicNodeId: string;
  topicCode: string;
  topicTitle: string;
  asOf: string;
  policy: string;
  action: {
    actionType: string;
    reasonCode: string;
    targetNodeId: string;
    targetCode: string;
    targetTitle: string;
    questionId: string | null;
    servableQuestionCount: number;
    reasonDetail: string;
  };
  topicStatus: {
    coverage: "UNMEASURED" | "PARTIAL" | "ESTABLISHED";
    attempts: number;
    mastery: number | null;
    effectiveMastery: number | null;
    reviewDue: boolean;
    strongestMisconceptionProbability: number | null;
    fluencyGap: number | null;
    tutorAsks: number;
    servableQuestions: number;
  };
  prerequisites: Array<{
    nodeId: string;
    code: string;
    title: string;
    effectiveMastery: number | null;
    attempts: number | null;
    measuredWeak: boolean;
  }>;
  misconceptions: Array<{
    nodeId: string;
    code: string;
    title: string;
    probability: number | null;
    active: boolean;
    remediationNodeCode: string | null;
  }>;
  evidence: Array<{ key: string; value: string }>;
}> {
  const engine = engineOf(deps);
  const now = deps.clock.now();
  const sql = deps.sql;

  const tree = await kgTreeWithMisconceptions(sql, rootId);

  // registries over the subject subtree (hard subject isolation — a topic
  // outside the root's PART_OF subtree is a 404, never a cross-subject hop)
  const byId = new Map<string, NbaNode>();
  const byCode = new Map<string, NbaNode>();
  collect(tree, byId, byCode);

  const topic = byId.get(topicNodeId);
  if (topic == null) {
    // NotFoundException("curriculum topic in this subject", topicNodeId) — :189
    throw new NotFoundError("curriculum topic in this subject", topicNodeId);
  }

  // learner evidence, subject-scoped (the same maps the NBA engine builds)
  const skills = new Map<string, SkillRow>();
  for (const s of await skillStatesFor(sql, learnerId)) {
    if (byId.has(s.node_id)) {
      skills.set(s.node_id, s);
    }
  }
  const misconceptions = new Map<string, ReadingRow>();
  for (const r of await misconceptionReadingsFor(sql, learnerId, now, engine.bdt)) {
    if (byId.has(r.misconception_node_id)) {
      misconceptions.set(r.misconception_node_id, r);
    }
  }
  const effective = new Map<string, number>();
  for (const [nodeId, s] of skills) {
    effective.set(
      nodeId,
      decayedMastery(Number(s.mastery), new Date(s.last_practiced_at), now, engine.decay),
    );
  }

  // one fetch per evidence source for the WHOLE response (v2 §8/§11)
  const pendingReviews = (await deps.sql`
    select node_id, due_at from review_schedules
    where learner_id = ${learnerId}::uuid and status = 'PENDING'
    order by due_at asc`) as Array<{ node_id: string; due_at: string | Date }>;
  const reviews = pendingReviews.map((r) => ({ nodeId: r.node_id, dueAt: new Date(r.due_at) }));
  const relations = await prerequisiteRelations(sql, rootId);
  const tutorWindow = new Date(now.getTime() - engine.tutorEngagementWindowDays * DAY_MS);
  const engagementRows = (await deps.sql`
    select node_id, occurred_at, refused, signal_type
    from tutor_topic_engagements
    where learner_id = ${learnerId}::uuid and occurred_at >= ${tutorWindow.toISOString()}
    order by occurred_at desc`) as Array<{
    node_id: string;
    occurred_at: string | Date;
    refused: boolean;
    signal_type: string | null;
  }>;
  const recentEngagements: TutorTopicEngagementRow[] = engagementRows.map((r) => ({
    nodeId: String(r.node_id),
    occurredAt: new Date(r.occurred_at),
    refused: Boolean(r.refused),
    signalType: r.signal_type == null ? null : String(r.signal_type),
  }));

  const ctx: Context = {
    tree,
    topic,
    byId,
    byCode,
    skills,
    misconceptions,
    effective,
    pendingReviews: reviews,
    relations,
    recentEngagements,
    now,
  };

  const servable = new ServableQuestions(sql);
  const evidence: Array<{ key: string; value: string }> = [];
  const skill = skills.get(topicNodeId);
  const status = await topicStatusOf(ctx, skill, engine, servable);
  evidence.push({ key: "topic", value: topic.code + " — " + topic.title });
  if (skill != null) {
    evidence.push({ key: "attempts", value: String(skill.attempts) });
    evidence.push({ key: "mastery (raw)", value: fmt(Number(skill.mastery)) });
    evidence.push({
      key: "mastery (decay-adjusted)",
      value: fmt(effective.get(topicNodeId)!),
    });
  } else {
    evidence.push({ key: "attempts", value: "0 (no attempt evidence on this topic)" });
  }

  const prereqPanel = prerequisitePanel(ctx, engine);
  const misconceptionPanel = misconceptionPanelOf(topic, byCode, misconceptions, engine);

  const action = await decide(deps, learnerId, ctx, evidence, engine, servable);

  return {
    learnerId,
    rootId,
    topicNodeId,
    topicCode: topic.code,
    topicTitle: topic.title,
    asOf: now.toISOString(),
    policy: SMART_LESSON_POLICY_ID,
    action,
    topicStatus: status,
    prerequisites: prereqPanel,
    misconceptions: misconceptionPanel,
    evidence,
  };
}

// ── the panels (:257-337) ────────────────────────────────────────────────────

/** prerequisite panel: one row per DIRECT prerequisite, mastery overlaid */
function prerequisitePanel(
  ctx: Context,
  engine: SmartLessonEngineParams,
): Array<{
  nodeId: string;
  code: string;
  title: string;
  effectiveMastery: number | null;
  attempts: number | null;
  measuredWeak: boolean;
}> {
  const direct = directPrerequisites(ctx.topic, ctx.relations, ctx.byId, ctx.byCode);
  const rows: Array<{
    nodeId: string;
    code: string;
    title: string;
    effectiveMastery: number | null;
    attempts: number | null;
    measuredWeak: boolean;
  }> = [];
  for (const prereqId of direct) {
    const node = ctx.byId.get(prereqId);
    if (node == null) continue;
    const s = ctx.skills.get(prereqId);
    const eff = s == null ? null : ctx.effective.get(prereqId) ?? null;
    rows.push({
      nodeId: node.id,
      code: node.code,
      title: node.title,
      effectiveMastery: eff,
      attempts: s == null ? null : s.attempts,
      measuredWeak: eff != null && s != null && s.attempts >= 1 && eff < engine.weakMasteryCeiling,
    });
  }
  rows.sort((a, b) => {
    // Comparator.comparing(code, nullsLast(naturalOrder)) — :281-282
    if (a.code == null && b.code == null) return 0;
    if (a.code == null) return 1;
    if (b.code == null) return -1;
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
  return rows;
}

/** misconception panel: rows for every attached misconception + remediation */
function misconceptionPanelOf(
  topic: NbaNode,
  byCode: Map<string, NbaNode>,
  misconceptions: Map<string, ReadingRow>,
  engine: SmartLessonEngineParams,
): Array<{
  nodeId: string;
  code: string;
  title: string;
  probability: number | null;
  active: boolean;
  remediationNodeCode: string | null;
}> {
  // the concept-graph seam is a static packaged resource read (the t2
  // snapshot law) — no SQL; the panel walks it in memory like the frozen
  const rows: Array<{
    nodeId: string;
    code: string;
    title: string;
    probability: number | null;
    active: boolean;
    remediationNodeCode: string | null;
  }> = [];
  if (topic.children == null) return rows;
  for (const child of topic.children) {
    if (child.type !== "MISCONCEPTION") continue;
    const r = misconceptions.get(child.id);
    let remediation: string | null = null;
    for (const edge of conceptEdges("REMEDIATED_BY")) {
      if (child.code != null && child.code === edge.source) {
        const corrective = byCode.get(edge.target);
        if (corrective != null) {
          remediation = corrective.code;
          break;
        }
      }
    }
    rows.push({
      nodeId: child.id,
      code: child.code,
      title: child.title,
      probability: r == null ? null : r.effective,
      active: r != null && r.effective >= engine.bdt.activeThreshold,
      remediationNodeCode: remediation,
    });
  }
  rows.sort((a, b) => {
    if (a.code == null && b.code == null) return 0;
    if (a.code == null) return 1;
    if (b.code == null) return -1;
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
  return rows;
}

/** direct prerequisites of a topic: DB relations + validated chain edges (:295-316) */
function directPrerequisites(
  topic: NbaNode,
  relations: Array<{ prerequisiteId: string; dependentNodeId: string }>,
  byId: Map<string, NbaNode>,
  byCode: Map<string, NbaNode>,
): Set<string> {
  const direct = new Set<string>();
  for (const rel of relations) {
    if (topic.id === rel.dependentNodeId && byId.has(rel.prerequisiteId)) {
      direct.add(rel.prerequisiteId);
    }
  }
  for (const edge of conceptEdges("REQUIRES_PREREQUISITE")) {
    if (topic.code != null && topic.code === edge.source) {
      const prereq = byCode.get(edge.target);
      if (prereq != null) {
        direct.add(prereq.id);
      }
    }
  }
  return direct;
}

// ── the ladder (:339-700) ────────────────────────────────────────────────────

type ActionView = {
  actionType: string;
  reasonCode: string;
  targetNodeId: string;
  targetCode: string;
  targetTitle: string;
  questionId: string | null;
  servableQuestionCount: number;
  reasonDetail: string;
};

async function decide(
  deps: SmartLessonDeps,
  learnerId: string,
  ctx: Context,
  evidence: Array<{ key: string; value: string }>,
  engine: SmartLessonEngineParams,
  servable: ServableQuestions,
): Promise<ActionView> {
  const topic = ctx.topic;

  // (1) prerequisite gate — direct prerequisites of the selected topic
  const directPrereqs = directPrerequisites(topic, ctx.relations, ctx.byId, ctx.byCode);
  type WeakPrereq = { node: NbaNode; eff: number; attempts: number };
  const weakPrereqs: WeakPrereq[] = [];
  for (const prereqId of directPrereqs) {
    const node = ctx.byId.get(prereqId);
    if (node == null) continue; // outside this subject's subtree — isolation wins
    const s = ctx.skills.get(prereqId);
    if (s == null) {
      evidence.push({
        key: "prerequisite " + node.code,
        value: "not yet measured — not a blocker",
      });
      continue;
    }
    const eff = ctx.effective.get(prereqId);
    if (eff != null && s.attempts >= 1 && eff < engine.weakMasteryCeiling) {
      weakPrereqs.push({ node, eff, attempts: s.attempts });
    }
  }
  if (weakPrereqs.length > 0) {
    weakPrereqs.sort(
      (a, b) => a.eff - b.eff || (a.node.code < b.node.code ? -1 : a.node.code > b.node.code ? 1 : 0),
    );
    const weakest = weakPrereqs[0]!;
    for (const wp of weakPrereqs) {
      evidence.push({
        key: "prerequisite " + wp.node.code,
        value: "measured " + fmt(wp.eff) + " over " + wp.attempts + " attempt(s)",
      });
    }
    return practiceAction(deps, learnerId, "REMEDIATE_PREREQUISITE", "PREREQUISITE_WEAK", weakest.node,
      "Prerequisite " + weakest.node.code + " (" + weakest.node.title
      + ") is measured weak (" + fmt(weakest.eff) + " over "
      + weakest.attempts + " attempts) — strengthen the foundation"
      + " before " + topic.code);
  }

  // (2) active misconception attached to this topic. v2: probability desc,
  // then FRESHEST evidence first, then code — all deterministic.
  const activeMisconceptions: ActiveMisconception[] = [];
  if (topic.children != null) {
    for (const child of topic.children) {
      if (child.type !== "MISCONCEPTION") continue;
      const r = ctx.misconceptions.get(child.id);
      if (r == null || r.effective < engine.bdt.activeThreshold) continue;
      activeMisconceptions.push({ node: child, reading: r });
    }
  }
  activeMisconceptions.sort(
    (a, b) =>
      b.reading.effective - a.reading.effective ||
      freshness(a, b) ||
      (a.node.code < b.node.code ? -1 : a.node.code > b.node.code ? 1 : 0),
  );
  if (activeMisconceptions.length > 0) {
    const strongest = activeMisconceptions[0]!;
    const strongestReading = strongest.reading;
    const strongestMisconception = strongest.node;
    evidence.push({
      key: "misconception " + strongestMisconception.code,
      value: "probability " + fmt(strongestReading.effective) + " from "
        + strongestReading.evidence_count + " evidence item(s), last evidence "
        + instantTextOrNull(strongestReading.last_evidence_at),
    });
    // validated corrective concept?
    for (const edge of conceptEdges("REMEDIATED_BY")) {
      if (
        strongestMisconception.code != null &&
        strongestMisconception.code === edge.source
      ) {
        const corrective = ctx.byCode.get(edge.target);
        if (corrective != null) {
          return practiceAction(deps, learnerId, "STUDY_CORRECTIVE", "MISCONCEPTION_REMEDIATION", corrective,
            "Misconception \"" + strongestMisconception.title
            + "\" (probability " + fmt(strongestReading.effective)
            + ", last evidence " + instantTextOrNull(strongestReading.last_evidence_at)
            + ") — validated remediation: study "
            + corrective.code + " (" + corrective.title
            + "), then ask the Tutor for the corrective explanation");
        }
      }
    }
    return {
      actionType: "ASK_TUTOR",
      reasonCode: "MISCONCEPTION_SUSPECTED",
      targetNodeId: strongestMisconception.id,
      targetCode: strongestMisconception.code,
      targetTitle: strongestMisconception.title,
      questionId: null,
      servableQuestionCount: 0,
      reasonDetail:
        "Misconception \"" + strongestMisconception.title + "\" is active "
        + "(probability " + fmt(strongestReading.effective) + " from "
        + strongestReading.evidence_count + " evidence items, last evidence "
        + instantTextOrNull(strongestReading.last_evidence_at)
        + ") — ask the Tutor for a grounded explanation before practising",
    };
  }

  // (3) review due on the topic — v2: the MOST OVERDUE pending schedule
  const skill = ctx.skills.get(topic.id);
  let due: { nodeId: string; dueAt: Date } | null = null;
  for (const r of ctx.pendingReviews) {
    if (r.nodeId === topic.id) {
      if (due == null || r.dueAt.getTime() < due.dueAt.getTime()) due = r;
    }
  }
  if (due != null && skill != null) {
    evidence.push({
      key: "review schedule",
      value: "retrieval practice due " + instantText(due.dueAt) + " ("
        + overdueNote(due.dueAt, ctx.now) + ", decay-triggered)",
    });
    return practiceAction(deps, learnerId, "REVIEW_TOPIC", "DUE_REVIEW", topic,
      "Retrieval practice is due on " + topic.code + " (scheduled "
      + instantText(due.dueAt) + ", " + overdueNote(due.dueAt, ctx.now)
      + ") — last practised "
      + (skill.last_practiced_at == null
        ? "never in this window"
        : instantText(new Date(skill.last_practiced_at)))
      + ", decay-adjusted mastery " + fmt(ctx.effective.get(topic.id)!));
  }

  // (4) fluency gap
  if (
    skill != null &&
    skill.procedural_fluency_gap != null &&
    Number(skill.procedural_fluency_gap) >= engine.fluencyGapThreshold
  ) {
    evidence.push({
      key: "fluency gap (untimed − timed accuracy)",
      value: fmt(Number(skill.procedural_fluency_gap)) + " over " + skill.attempts + " attempts",
    });
    return practiceAction(deps, learnerId, "TIMED_PRACTICE", "FLUENCY_GAP", topic,
      "Untimed-vs-timed accuracy gap " + fmt(Number(skill.procedural_fluency_gap))
      + " over " + skill.attempts + " attempts — practise under timed conditions");
  }

  // (5) established weak mastery
  if (skill != null && skill.attempts >= engine.minAttemptsForWeakness) {
    const eff = ctx.effective.get(topic.id);
    if (eff != null && eff < engine.weakMasteryCeiling) {
      return practiceAction(deps, learnerId, "PRACTISE_QUESTIONS", "LOW_MASTERY", topic,
        "Measured mastery " + fmt(eff) + " over " + skill.attempts
        + " attempts is below the weak ceiling (" + fmt(engine.weakMasteryCeiling)
        + ") — keep practising " + topic.code);
    }
  }

  // (6) tutor-engaged but never practised (NBA T7a), with the V23/V25
  // structured signals — the §9 derived multi-row signals stated as evidence
  const topicAsks = ctx.recentEngagements.filter((e) => e.nodeId === topic.id);
  const asks = topicAsks.length;
  if (asks > 0 && skill == null) {
    const counts = signalCounts(topicAsks);
    evidence.push({
      key: "tutor engagement",
      value: asks + " ask(s) in the last " + engine.tutorEngagementWindowDays
        + " day(s), no attempt evidence yet",
    });
    evidence.push({ key: "engagement signals", value: signalCountsText(counts) });
    const derived: string[] = [];
    if (repeatedExplanationRequest(topicAsks)) derived.push("repeated explanation requests");
    if (unresolvedQuestion(topicAsks)) derived.push("an unresolved ask (no grounded answer)");
    if (postExplanationEngagement(topicAsks)) derived.push("engagement after an explanation");
    if (derived.length > 0) {
      evidence.push({ key: "derived signals", value: derived.join("; ") });
    }
    const signalNote = Object.hasOwn(counts, "DOUBT_SIGNAL")
      ? " — including confusion you reported yourself"
      : Object.hasOwn(counts, "MISCONCEPTION_RELATED")
      ? " — including a question linked to an active misconception"
      : Object.hasOwn(counts, "PREREQUISITE_HELP")
      ? " — including prerequisite help the Tutor policy selected"
      : "";
    const derivedNote = derived.length === 0 ? "" : " (" + derived.join("; ") + ")";
    return practiceAction(deps, learnerId, "PRACTISE_QUESTIONS", "TUTOR_ENGAGED", topic,
      "You asked the Tutor " + asks + " time(s) about " + topic.code + " but have "
      + "no attempt evidence yet" + signalNote + derivedNote
      + " — convert the curiosity into practice");
  }

  // (7) no attempt evidence — start the topic
  if (skill == null) {
    return practiceAction(deps, learnerId, "PRACTISE_QUESTIONS", "INSUFFICIENT_COVERAGE", topic,
      "No attempt evidence on " + topic.code + " yet — start with the "
      + "first validated question to find your level (diagnostic practice)");
  }

  // (8) mastered — advance (evidence-aware, deterministic)
  return advance(deps, learnerId, ctx, evidence, engine, servable);
}

/** the Java TreeMap.toString() shape — "{k=v, k=v}" with keys ascending */
function signalCountsText(counts: Record<string, number>): string {
  return (
    "{" +
    Object.entries(counts)
      .map(([k, v]) => k + "=" + v)
      .join(", ") +
    "}"
  );
}

/** the evidence-aware advance (:700-880) */
async function advance(
  deps: SmartLessonDeps,
  learnerId: string,
  ctx: Context,
  evidence: Array<{ key: string; value: string }>,
  engine: SmartLessonEngineParams,
  servable: ServableQuestions,
): Promise<ActionView> {
  const topic = ctx.topic;

  // practicable candidates follow the NBA T7 convention: TOPIC/SUBTOPIC
  // nodes with servable questions — ONE batched activeWithin query, and it
  // fires only on this rung (the frozen computes it inside advance())
  const servableCounts = new Map<string, number>();
  for (const q of await servable.activeWithin([...ctx.byId.keys()])) {
    if (q.primaryTopicNodeId != null) {
      servableCounts.set(q.primaryTopicNodeId, (servableCounts.get(q.primaryTopicNodeId) ?? 0) + 1);
    }
  }
  const order = curriculumOrder(ctx.tree);
  const lastConfusionAt = lastConfusionAtByTopic(ctx.recentEngagements);
  const isPracticable = (node: NbaNode): boolean =>
    (node.type === "TOPIC" || node.type === "SUBTOPIC") &&
    (servableCounts.get(node.id) ?? 0) > 0;

  // pass 1 (§3/§8): an unstarted topic the learner reported confusion about
  // jumps the queue — the MOST RECENT confusion signal first (recency),
  // curriculum order breaking exact ties
  if (lastConfusionAt.size > 0) {
    let best: NbaNode | null = null;
    let bestAt = 0;
    for (const node of order) {
      if (node.type !== "TOPIC" && node.type !== "SUBTOPIC") continue;
      if (node.id === topic.id || !lastConfusionAt.has(node.id)) continue;
      if ((servableCounts.get(node.id) ?? 0) <= 0) continue;
      if (ctx.skills.has(node.id)) continue; // confusion pass targets unstarted topics only
      const at = lastConfusionAt.get(node.id)!.getTime();
      if (best == null || at > bestAt) {
        best = node;
        bestAt = at;
      }
    }
    if (best != null) {
      evidence.push({
        key: "mastered " + topic.code,
        value: fmt(ctx.effective.get(topic.id)!) + " over "
          + ctx.skills.get(topic.id)!.attempts + " attempts",
      });
      evidence.push({
        key: "confusion signal",
        value: best.code + " — most recent confusion-family engagement "
          + instantText(lastConfusionAt.get(best.id)!),
      });
      return practiceAction(deps, learnerId, "ADVANCE_TOPIC", "TOPIC_MASTERED", best,
        topic.code + " is mastered (decay-adjusted mastery "
        + fmt(ctx.effective.get(topic.id)!) + ") — move on to "
        + best.code + " (" + best.title
        + "): you reported confusion here most recently ("
        + instantText(lastConfusionAt.get(best.id)!) + ")");
    }
  }

  // pass 1.5 (§8 review state): the most overdue pending review anywhere in
  // the subject with servable work — dueAt asc, curriculum order on ties
  let mostOverdue: { nodeId: string; dueAt: Date } | null = null;
  let reviewTarget: NbaNode | null = null;
  for (const node of order) {
    if (node.type !== "TOPIC" && node.type !== "SUBTOPIC") continue;
    if (node.id === topic.id || (servableCounts.get(node.id) ?? 0) <= 0) continue;
    let due: { nodeId: string; dueAt: Date } | null = null;
    for (const r of ctx.pendingReviews) {
      if (r.nodeId === node.id) {
        if (due == null || r.dueAt.getTime() < due.dueAt.getTime()) due = r;
      }
    }
    if (due == null) continue;
    if (mostOverdue == null || due.dueAt.getTime() < mostOverdue.dueAt.getTime()) {
      mostOverdue = due;
      reviewTarget = node;
    }
  }
  if (mostOverdue != null && reviewTarget != null) {
    evidence.push({
      key: "mastered " + topic.code,
      value: fmt(ctx.effective.get(topic.id)!) + " over "
        + ctx.skills.get(topic.id)!.attempts + " attempts",
    });
    evidence.push({
      key: "due review",
      value: reviewTarget.code + " — scheduled " + instantText(mostOverdue.dueAt)
        + " (" + overdueNote(mostOverdue.dueAt, ctx.now) + ")",
    });
    return practiceAction(deps, learnerId, "REVIEW_TOPIC", "DUE_REVIEW", reviewTarget,
      topic.code + " is mastered, and a review of " + reviewTarget.code + " ("
      + reviewTarget.title + ") is due — scheduled "
      + instantText(mostOverdue.dueAt) + " (" + overdueNote(mostOverdue.dueAt, ctx.now)
      + "). Retrieval practice before new material");
  }

  // pass 2 (a): first UNSTARTED topic in curriculum order whose direct
  // prerequisites are not measured-weak. (b): the first weak measured topic
  // in curriculum order (standing rule) — unless a ready topic was already
  // found; if EVERY unstarted topic is blocked, remediate the weakest blocker.
  let ready: NbaNode | null = null;
  let blocked: NbaNode | null = null;
  for (const node of order) {
    if (node.type !== "TOPIC" && node.type !== "SUBTOPIC") continue;
    if (node.id === topic.id) continue;
    if ((servableCounts.get(node.id) ?? 0) <= 0) continue; // nothing validated to practise
    const s = ctx.skills.get(node.id);
    if (s != null) {
      const eff = ctx.effective.get(node.id);
      if (eff != null && eff < engine.weakMasteryCeiling) {
        if (ready == null) {
          evidence.push({
            key: "mastered " + topic.code,
            value: fmt(ctx.effective.get(topic.id)!) + " over "
              + ctx.skills.get(topic.id)!.attempts + " attempts",
          });
          evidence.push({
            key: "next in curriculum order",
            value: node.code + " — measured " + fmt(eff) + " (weak)",
          });
          return practiceAction(deps, learnerId, "ADVANCE_TOPIC", "TOPIC_MASTERED", node,
            topic.code + " is mastered (decay-adjusted mastery "
            + fmt(ctx.effective.get(topic.id)!) + ") — move on to "
            + node.code + " (" + node.title + "): measured " + fmt(eff) + " (weak)");
        }
      }
      continue;
    }
    // unstarted candidate — check prerequisite readiness
    const blocker = measuredWeakPrerequisite(node, ctx, engine);
    if (blocker == null) {
      ready = node;
      break; // first prerequisite-ready unstarted topic in curriculum order
    }
    if (blocked == null) blocked = node;
  }
  if (ready != null) {
    evidence.push({
      key: "mastered " + topic.code,
      value: fmt(ctx.effective.get(topic.id)!) + " over "
        + ctx.skills.get(topic.id)!.attempts + " attempts",
    });
    evidence.push({
      key: "next in curriculum order",
      value: ready.code + " — not yet started, direct prerequisites not weak",
    });
    return practiceAction(deps, learnerId, "ADVANCE_TOPIC", "TOPIC_MASTERED", ready,
      topic.code + " is mastered (decay-adjusted mastery "
      + fmt(ctx.effective.get(topic.id)!) + ") — move on to "
      + ready.code + " (" + ready.title + "): not yet started");
  }

  // every unstarted topic is blocked: remediate the weakest blocker
  if (blocked != null) {
    type Blocker = { node: NbaNode; eff: number; attempts: number };
    const blockers: Blocker[] = [];
    for (const node of order) {
      if (node.type !== "TOPIC" && node.type !== "SUBTOPIC") continue;
      if (
        node.id === topic.id ||
        (servableCounts.get(node.id) ?? 0) <= 0 ||
        ctx.skills.has(node.id)
      ) {
        continue;
      }
      const blocker = measuredWeakPrerequisite(node, ctx, engine);
      if (blocker != null) {
        const bs = ctx.skills.get(blocker.id);
        const eff = ctx.effective.get(blocker.id);
        if (bs != null && eff != null) {
          blockers.push({ node: blocker, eff, attempts: bs.attempts });
        }
      }
    }
    if (blockers.length > 0) {
      blockers.sort(
        (a, b) =>
          a.eff - b.eff ||
          (a.node.code < b.node.code ? -1 : a.node.code > b.node.code ? 1 : 0),
      );
      const weakest = blockers[0]!;
      evidence.push({
        key: "mastered " + topic.code,
        value: fmt(ctx.effective.get(topic.id)!) + " over "
          + ctx.skills.get(topic.id)!.attempts + " attempts",
      });
      evidence.push({
        key: "advance blocked",
        value: "every unstarted topic has a measured-weak prerequisite; weakest is "
          + weakest.node.code + " (" + fmt(weakest.eff) + ")",
      });
      return practiceAction(deps, learnerId, "REMEDIATE_PREREQUISITE", "PREREQUISITE_WEAK", weakest.node,
        topic.code + " is mastered, but every unstarted topic is blocked by a "
        + "measured-weak prerequisite — strengthen " + weakest.node.code
        + " (" + weakest.node.title + ", measured " + fmt(weakest.eff)
        + " over " + weakest.attempts + " attempts) first");
    }
    // no measurable blocker (defensive honest fallthrough, :785-793)
    evidence.push({
      key: "advance blocked",
      value: blocked.code + " is unstarted with weak prerequisite evidence",
    });
    return practiceAction(deps, learnerId, "ADVANCE_TOPIC", "TOPIC_MASTERED", blocked,
      topic.code + " is mastered — move on to " + blocked.code + " ("
      + blocked.title + "): not yet started");
  }

  // consolidation: every topic measured strong — review the STALEST measured
  // topic (lastPracticedAt oldest first; exact ties prefer the selected topic,
  // then curriculum order; servable work preferred but not required here)
  let stalest: NbaNode | null = null;
  let stalestAt = 0;
  for (const node of order) {
    if (node.type !== "TOPIC" && node.type !== "SUBTOPIC") continue;
    const s = ctx.skills.get(node.id);
    if (s == null || s.last_practiced_at == null) continue;
    if ((servableCounts.get(node.id) ?? 0) <= 0 && node.id !== topic.id) {
      continue; // no servable work elsewhere — not a review target
    }
    const at = new Date(s.last_practiced_at).getTime();
    if (stalest == null || at < stalestAt) {
      stalest = node;
      stalestAt = at;
    }
  }
  evidence.push({
    key: "curriculum scan",
    value: "every topic in this subject is measured strong or has no servable work left",
  });
  if (stalest != null && stalest.id !== topic.id) {
    evidence.push({
      key: "stalest measured topic",
      value: stalest.code + " — last practised " + instantText(new Date(stalestAt)),
    });
    return practiceAction(deps, learnerId, "REVIEW_TOPIC", "TOPIC_MASTERED", stalest,
      topic.code + " is mastered and every curriculum topic is measured strong — "
      + "consolidate with a review round on " + stalest.code + " ("
      + stalest.title + "), your stalest measured topic (last practised "
      + instantText(new Date(stalestAt)) + ")");
  }
  return practiceAction(deps, learnerId, "REVIEW_TOPIC", "TOPIC_MASTERED", topic,
    topic.code + " is mastered and every curriculum topic is measured strong — "
    + "consolidate with a review round here, or pick a new subject area");
}

/** the measured-weak direct prerequisite of a candidate, or null (:857-882) */
function measuredWeakPrerequisite(
  candidate: NbaNode,
  ctx: Context,
  engine: SmartLessonEngineParams,
): NbaNode | null {
  for (const prereqId of directPrerequisites(candidate, ctx.relations, ctx.byId, ctx.byCode)) {
    const node = ctx.byId.get(prereqId);
    if (node == null) continue;
    const s = ctx.skills.get(prereqId);
    if (s == null) continue; // unmeasured — an honest gap, not a blocker
    const eff = ctx.effective.get(prereqId);
    if (eff != null && s.attempts >= 1 && eff < engine.weakMasteryCeiling) {
      return node;
    }
  }
  return null;
}

/** the deterministic starter question (:889-919) */
async function practiceAction(
  deps: SmartLessonDeps,
  learnerId: string,
  actionType: string,
  reasonCode: string,
  target: NbaNode,
  detail: string,
): Promise<ActionView> {
  const servable = await new ServableQuestions(deps.sql).activeByTopic(target.id);
  let questionId: string | null = null;
  let rotationNote = "";
  if (servable.length > 0) {
    const attempted = new Set(
      (
        (await deps.sql`
          select distinct question_id from attempts
          where learner_id = ${learnerId}::uuid
            and question_id = any(${servable.map((q) => q.id)}::uuid[])`) as Array<{
          question_id: string;
        }>
      ).map((r) => r.question_id),
    );
    let chosen: { id: string } | null = null;
    for (const q of servable) {
      if (!attempted.has(q.id)) {
        chosen = q;
        break;
      }
    }
    const attemptedServable = servable.filter((q) => attempted.has(q.id)).length;
    if (chosen == null) {
      chosen = servable[0]!; // all attempted — revisit the first, honestly
      rotationNote =
        " (all " + servable.length + " validated question(s) attempted — revisiting the first)";
    } else if (attemptedServable > 0) {
      rotationNote =
        " (starter question not attempted yet; " + attemptedServable
        + " of " + servable.length + " already attempted)";
    }
    questionId = chosen.id;
  }
  return {
    actionType,
    reasonCode,
    targetNodeId: target.id,
    targetCode: target.code,
    targetTitle: target.title,
    questionId,
    servableQuestionCount: servable.length,
    reasonDetail: detail + rotationNote,
  };
}

// ── topicStatus + the humanization helpers (:921-929, :810-846) ─────────────

async function topicStatusOf(
  ctx: Context,
  skill: SkillRow | undefined,
  engine: SmartLessonEngineParams,
  servable: ServableQuestions,
): Promise<{
  coverage: "UNMEASURED" | "PARTIAL" | "ESTABLISHED";
  attempts: number;
  mastery: number | null;
  effectiveMastery: number | null;
  reviewDue: boolean;
  strongestMisconceptionProbability: number | null;
  fluencyGap: number | null;
  tutorAsks: number;
  servableQuestions: number;
}> {
  const topic = ctx.topic;
  const attempts = skill == null ? 0 : skill.attempts;
  const coverage =
    skill == null
      ? "UNMEASURED"
      : attempts < engine.minAttemptsForWeakness
      ? "PARTIAL"
      : "ESTABLISHED";
  const reviewDue = ctx.pendingReviews.some((r) => r.nodeId === topic.id);
  let misProb: number | null = null;
  if (topic.children != null) {
    for (const child of topic.children) {
      if (child.type === "MISCONCEPTION") {
        const r = ctx.misconceptions.get(child.id);
        if (r != null && (misProb == null || r.effective > misProb)) misProb = r.effective;
      }
    }
  }
  const asks = ctx.recentEngagements.filter((e) => e.nodeId === topic.id).length;
  return {
    coverage,
    attempts,
    mastery: skill == null ? null : Number(skill.mastery),
    effectiveMastery: skill == null ? null : ctx.effective.get(topic.id) ?? null,
    reviewDue,
    strongestMisconceptionProbability: misProb,
    fluencyGap: skill == null || skill.procedural_fluency_gap == null
      ? null
      : Number(skill.procedural_fluency_gap),
    tutorAsks: asks,
    // the frozen topicStatus queries activeByTopic here (:928) — the same
    // call site, verbatim
    servableQuestions: (await servable.activeByTopic(topic.id)).length,
  };
}

/** overdueNote/humanize (:810-846) — verbatim vocabulary */
export function overdueNote(dueAt: Date | null, now: Date): string {
  if (dueAt == null) return "no due date recorded";
  const dMs = now.getTime() - dueAt.getTime();
  if (dMs === 0) return "due now";
  if (dMs < 0) return "due in " + humanize(-dMs);
  return "overdue by " + humanize(dMs);
}

function humanize(ms: number): string {
  const days = Math.floor(ms / DAY_MS);
  if (days >= 1) return days + " day(s)";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return hours + " hour(s)";
  return Math.floor(ms / 60_000) + " minute(s)";
}

// ── the tree walks (:848-884) ───────────────────────────────────────────────

function collect(node: NbaNode, byId: Map<string, NbaNode>, byCode: Map<string, NbaNode>): void {
  byId.set(node.id, node);
  if (node.code != null && node.code.trim() !== "") {
    if (!byCode.has(node.code)) byCode.set(node.code, node);
  }
  if (node.children != null) {
    for (const child of node.children) collect(child, byId, byCode);
  }
}

function curriculumOrder(root: NbaNode): NbaNode[] {
  const out: NbaNode[] = [];
  walkOrder(root, out);
  return out;
}

function walkOrder(node: NbaNode, out: NbaNode[]): void {
  out.push(node);
  if (node.children != null) {
    for (const child of node.children) walkOrder(child, out);
  }
}

// the concept-graph seam (ConceptDependencyGraph :1-160) — the nba band's
// in-memory port of the settled T-C11 store (nba-concept-graph.ts); the smart
// lesson reads the SAME validated edges (REQUIRES_PREREQUISITE chain edges +
// REMEDIATED_BY correctives) — reuse-not-redeclare
function conceptEdges(relation: SemanticRelation): Array<{ source: string; target: string }> {
  return NBA_CONCEPT_GRAPH.edges(relation);
}
