/**
 * The engagement recorder (T-MIG-124 Phase 2, operator order trace
 * 1a13422c277c0171 "Proceed, both phases") — the learner-memory half of the
 * conversational pipeline (frozen law @ 6cad6ef,
 * learner/TutorEngagementRecorder.java, V21/P7 + V24 + V25 sprint-2 §9):
 * turns every TutorAnsweredEvent (the FREE_TUTOR surface) and every
 * ClaInteractionEvent (the CONTEXTUAL_ASSISTANT surface) into structured
 * per-topic engagement rows over tutor_topic_engagements.
 *
 * Hard boundaries (operator directive, P7; LIM contract §3; CLA contract §6),
 * verbatim from the frozen header: only the deterministic topic anchors, the
 * grounding strength and the model identity are recorded — NEVER the raw
 * chat text, never LLM-invented entities. Anonymous previews (null
 * learnerId) and asks with no deterministically-matched topic write NOTHING.
 * The raw question is read by the classifier and discarded: only the TYPE is
 * recorded. (The research log — the §18 TelemetryService consumer — is a
 * DIFFERENT frozen listener and stays the disclosed T-MIG-061 dormant
 * posture; this recorder is the engagement-row listener, not the research
 * consumer.)
 *
 * THE V25 ROW CLASSIFIER (SIGNAL_POLICY_VERSION "tutor-signals/v2", one
 * TYPE per row, precedence-ordered, all deterministic — never LLM-derived):
 *   1. MISCONCEPTION_RELATED — the tutor policy intervened on an active BDT
 *      misconception on a matched topic (the intervention plan is a rule
 *      output over measured learner state);
 *   2. PREREQUISITE_HELP — the policy's deterministic plan chose
 *      PREREQUISITE_REVIEW for the ask;
 *   3. DOUBT_SIGNAL — the question contains an explicit self-reported
 *      confusion phrase (fixed substring list, case-insensitive);
 *   4. CLARIFICATION_REQUEST — the question asks to re-state/clarify a
 *      previous explanation (checked BEFORE the explanation patterns so
 *      "what do you mean" is a clarification, not a fresh explanation
 *      request — "what do" is an explanation pattern);
 *   5. EXPLANATION_REQUEST — explanation command vocabulary (mirrors the
 *      intent matcher's);
 *   6. TOPIC_ENGAGEMENT — the topic-match fact alone (default).
 * Signals that would need multi-row context (repeated explanation request,
 * post-explanation engagement, unresolved question) are NOT row types —
 * consumers derive them over the windowed rows (services/learner/
 * tutor-signals.ts); the refused flag stays the honest "unresolved
 * interaction" fact.
 *
 * FAILURE LAW (the §22 append-guard class, TutorController.java :314-318):
 * the v2 telemetry sinks are post-delivery fire-and-forget — a write
 * failure is swallowed (logged class) and NEVER corrupts a delivered
 * answer. The frozen listener rode the request transaction and could fail
 * the ask; the v2 disclosure follows the repo's append-guard doctrine (the
 * same posture as the §22 transcript append). Engagement rows are pure
 * appends with no read-modify-write, so nothing downstream can observe the
 * gap beyond a missing row.
 *
 * TIME FIDELITY (disclosed): the tutor surface stamps event.at (the
 * pipeline's own ask instant — frozen parity with TutorAnsweredEvent).
 * The v2 ClaInteractionEvent carries no instant (the frozen event did), so
 * the CLA surface stamps the recorder's clock at record time — a
 * sub-second skew, honest and disclosed.
 */

import type { SqlFn } from "../tutor/sql";
import type { Clock } from "../tutor/session-store";
import type { TutorAnsweredEvent } from "../tutor/karag";
import type { ClaInteractionEvent } from "../cla/service";

/** the deterministic classifier version stamped on every row (V25 provenance) */
export const SIGNAL_POLICY_VERSION = "tutor-signals/v2";

/** explicit self-reported confusion (fixed list, substring, case-insensitive) */
const DOUBT_PATTERNS: readonly string[] = [
  "don't understand", "dont understand", "do not understand",
  "confused", "not sure", "don't get", "dont get", "don't see", "dont see",
  "struggling", "stuck on", "no idea", "lost on",
];

/** requests to re-state / clarify a previous explanation (V25, §9) */
const CLARIFICATION_PATTERNS: readonly string[] = [
  "clarify", "clarification", "what do you mean", "what did you mean",
  "you mean", "say that again", "say it again", "repeat that",
  "didn't catch that", "did not catch that", "rephrase", "more precisely",
  "be more specific",
];

/** explanation command vocabulary (mirrors the intent matcher's) */
const EXPLANATION_PATTERNS: readonly string[] = [
  "explain", "why ", "why?", "how ", "how?", "what is", "what are",
  "what does", "what do", "describe", "help me understand",
];

/** V25 classify (:137-172) — the precedence-ordered deterministic row type. */
export function classifyEngagementSignal(
  question: string | null,
  interventionType: string | null,
): string {
  if (interventionType === "MISCONCEPTION_REMEDIATION") return "MISCONCEPTION_RELATED";
  if (interventionType === "PREREQUISITE_REVIEW") return "PREREQUISITE_HELP";
  const q = (question ?? "").toLowerCase();
  for (const pattern of DOUBT_PATTERNS) {
    if (q.includes(pattern)) return "DOUBT_SIGNAL";
  }
  for (const pattern of CLARIFICATION_PATTERNS) {
    if (q.includes(pattern)) return "CLARIFICATION_REQUEST";
  }
  for (const pattern of EXPLANATION_PATTERNS) {
    if (q.includes(pattern)) return "EXPLANATION_REQUEST";
  }
  return "TOPIC_ENGAGEMENT";
}

interface EngagementAppend {
  learnerId: string | null;
  nodeIds: readonly string[];
  occurredAt: Date;
  evidenceCount: number;
  refused: boolean;
  answerModel: string | null;
  signal: string;
  surface: string;
  responseMode: string | null;
  contextKind: string | null;
  contextReference: string | null;
}

/** the frozen append (:77-99) — one pure-append row per matched topic. */
async function appendEngagements(sql: SqlFn, clock: Clock, row: EngagementAppend): Promise<void> {
  if (row.learnerId == null || row.nodeIds.length === 0) {
    return; // anonymous preview, or nothing matched deterministically
  }
  const createdAt = clock.now();
  for (const nodeId of row.nodeIds) {
    await sql`
      insert into tutor_topic_engagements
        (id, learner_id, node_id, occurred_at, evidence_count, refused,
         answer_model, signal_type, surface, response_mode, context_kind,
         context_reference, classifier_version, created_at)
      values
        (${crypto.randomUUID()}, ${row.learnerId}, ${nodeId}, ${row.occurredAt},
         ${row.evidenceCount}, ${row.refused}, ${row.answerModel}, ${row.signal},
         ${row.surface}, ${row.responseMode}, ${row.contextKind},
         ${row.contextReference}, ${SIGNAL_POLICY_VERSION}, ${createdAt})
    `;
  }
}

/**
 * The FREE_TUTOR telemetry sink (the frozen onTutorAnswered, order 30):
 * wires into the tutor pipeline's existing TutorAnsweredEvent seam — the
 * sink the composition root previously left as the disclosed no-op. Never
 * throws (the append-guard failure law above).
 */
export function tutorEngagementTelemetrySink(
  sql: SqlFn,
  clock: Clock,
): (event: TutorAnsweredEvent) => void {
  return (event) => {
    void appendEngagements(sql, clock, {
      learnerId: event.learnerId,
      nodeIds: event.matchedTopicIds,
      occurredAt: event.at,
      evidenceCount: event.evidenceCount,
      refused: event.refused,
      answerModel: event.model,
      signal: classifyEngagementSignal(event.query, event.interventionType),
      surface: "FREE_TUTOR",
      responseMode: null,
      contextKind: null,
      contextReference: null,
    }).catch(() => {
      // logged class: a lost engagement row never corrupts the delivered
      // answer (the append guard) — no error text may reach the pipeline
    });
  };
}

/**
 * The CONTEXTUAL_ASSISTANT telemetry sink (the frozen onClaInteraction,
 * order 30, V24): the surface identity triple (surface, mode, context)
 * rides the row — the server-resolved anchors, never model-invented. The
 * CLA event's reference is the resolved knowledge-node id (the context
 * resolver's :307 law) — a uuid-shaped string for the uuid column. Never
 * throws.
 */
export function claInteractionTelemetrySink(
  sql: SqlFn,
  clock: Clock,
): (event: ClaInteractionEvent) => void {
  return (event) => {
    void appendEngagements(sql, clock, {
      learnerId: event.learnerId,
      nodeIds: event.topicNodeIds,
      occurredAt: clock.now(), // disclosed: the v2 CLA event carries no instant
      evidenceCount: event.evidenceCount,
      refused: event.refused,
      answerModel: event.model,
      signal: classifyEngagementSignal(event.question, event.interventionType),
      surface: "CONTEXTUAL_ASSISTANT",
      responseMode: event.mode,
      contextKind: event.kind,
      contextReference: event.reference,
    }).catch(() => {
      // the append guard — same law as the tutor sink
    });
  };
}
