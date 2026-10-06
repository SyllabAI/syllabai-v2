/**
 * T-MIG-053 tranche-4 (r3a) — the deterministic MULTI-ROW tutor-signal
 * policies. Port of the frozen law (syllabai-core @ 6cad6ef,
 * learner/TutorSignalPolicy.java :14-103, sprint-2 §9):
 *
 *   - the V23/V25 row classifier records one signal TYPE per engagement row;
 *     some defensible signals need MORE than one row — repeated explanation
 *     requests, unresolved questions, post-explanation engagement, repeated
 *     engagement with the same topic. They are computed HERE, over the
 *     windowed rows of ONE learner+topic, by fixed rules — never stored as
 *     row facts (which would duplicate the substrate), never LLM-derived,
 *     never converted into mastery (:19-22);
 *   - every function is PURE over its input list; callers fetch the windowed
 *     rows once and reuse them (no per-topic queries, §11);
 *   - the confusion family (:26-29): DOUBT_SIGNAL, MISCONCEPTION_RELATED,
 *     CLARIFICATION_REQUEST, PREREQUISITE_HELP;
 *   - unresolvedQuestion is straight off the V23 refused flag (:44-47);
 *   - postExplanationEngagement counts only STRICTLY-later rows — equal
 *     timestamps do not count (honesty over optimism, :53-55);
 *   - signalCounts is display-ordered BY TYPE NAME (the Java TreeMap, :74-80)
 *     and null signal types read TOPIC_ENGAGEMENT;
 *   - lastConfusionAtByTopic keys the LATEST confusion-family timestamp per
 *     topic (the §8 advance pass-1 recency, :85-93).
 *
 * REUSE-not-redeclare: the row shape is the state.ts TutorTopicEngagementRow
 * (the LearnerModelService port's row — same frozen TutorTopicEngagement
 * columns the smart-lesson windowed fetch delivers).
 */
import type { TutorTopicEngagementRow } from "./state";

/** TutorSignalPolicy :26-29 — the signals that indicate the learner is struggling. */
export const CONFUSION_SIGNALS: ReadonlySet<string> = new Set([
  "DOUBT_SIGNAL",
  "MISCONCEPTION_RELATED",
  "CLARIFICATION_REQUEST",
  "PREREQUISITE_HELP",
]);

/** TutorSignalPolicy :32 — how many explanation requests count as "repeated". */
export const REPEATED_EXPLANATION_THRESHOLD = 2;

/** :37-40 — repeated explanation requests inside the window. */
export function repeatedExplanationRequest(rows: TutorTopicEngagementRow[]): boolean {
  return countBySignal(rows, "EXPLANATION_REQUEST") >= REPEATED_EXPLANATION_THRESHOLD;
}

/** :44-47 — an ask got no grounded answer (the deterministic refusal path). */
export function unresolvedQuestion(rows: TutorTopicEngagementRow[]): boolean {
  return rows.some((e) => e.refused);
}

/** :53-66 — post-explanation engagement: an explanation request followed by
 *  a STRICTLY-later engagement row on the same topic. */
export function postExplanationEngagement(rows: TutorTopicEngagementRow[]): boolean {
  let firstExplanation: number | null = null;
  for (const e of rows) {
    if (e.signalType === "EXPLANATION_REQUEST") {
      const t = e.occurredAt.getTime();
      if (firstExplanation == null || t < firstExplanation) firstExplanation = t;
    }
  }
  if (firstExplanation == null) return false;
  return rows.some((e) => e.occurredAt.getTime() > firstExplanation!);
}

/** :70-72 — repeated engagement with the same topic inside the window. */
export function engagementCount(rows: TutorTopicEngagementRow[]): number {
  return rows.length;
}

/** :74-80 — per-signal-type counts for one topic's windowed rows, ordered
 *  BY TYPE NAME (the Java TreeMap iteration order). */
export function signalCounts(rows: TutorTopicEngagementRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of rows) {
    const type = e.signalType == null ? "TOPIC_ENGAGEMENT" : e.signalType;
    counts[type] = (counts[type] ?? 0) + 1;
  }
  // the TreeMap's key order — ascending by type name — is the display law
  const out: Record<string, number> = {};
  for (const k of Object.keys(counts).sort()) out[k] = counts[k]!;
  return out;
}

/** :85-93 — the most recent confusion-family signal timestamp per topic
 *  (§8 advance pass-1 recency). */
export function lastConfusionAtByTopic(rows: TutorTopicEngagementRow[]): Map<string, Date> {
  const last = new Map<string, Date>();
  for (const e of rows) {
    if (e.signalType != null && CONFUSION_SIGNALS.has(e.signalType)) {
      const prev = last.get(e.nodeId);
      if (prev == null || e.occurredAt.getTime() > prev.getTime()) {
        last.set(e.nodeId, e.occurredAt);
      }
    }
  }
  return last;
}

function countBySignal(rows: TutorTopicEngagementRow[], signal: string): number {
  return rows.filter((e) => e.signalType === signal).length;
}
