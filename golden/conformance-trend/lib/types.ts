/**
 * T-TUTOR-AUDIT-P4 run-001 — the conformance pass-rate trend lane (audit
 * P4-08, finding F2's marked-part plane). Fixture / verdict / artifact /
 * baseline shapes.
 *
 * The recorded turn of record is the WIRE marked-part turn — the scrubbed
 * recording of one tutor ask/response pair on a marked part, exactly as the
 * serving surface emitted it. The scorer adds NO plumbing: every field it
 * scores is published by the serving surface today —
 *
 *   - the CONFORMANCE REPORT of record rides the TutorAnsweredEvent
 *     (karag.ts :960, `conformance: generated.conformance ?? null` — null
 *     on tier-1 turns and refusals; the lint only activates on tier-2
 *     marked-part turns);
 *   - the WIRE answer rides the same ask's response — the POST-lint text
 *     (the lint runs AFTER the H2 hygiene, karag.ts :1263-1274, and the
 *     stream wrapper composes after the fence-marker sanitizer :1299-1338);
 *   - the SCHEME ROWS of record ride the resolved MarkContext
 *     (mark_points + mark_point_alternatives rows, mark-context.ts :52-85 —
 *     refs, scheme lines, awarded flags, the DC-5 materialised surfaces).
 *
 * The stored DB transcript is NOT scoreable here either: the session store
 * strips every citation marker at persist (conversation.ts :42-52) and the
 * lint's own strip lives only on the wire — the wire answer is the
 * conformance archive of record.
 */

import type { MarkContext } from "../../../apps/api/src/services/tutor/mark-context.ts";

/** Which serving path recorded the turn (the DC-5 surface of record is the
 *  BLOCKING path — karag :1274 publishes the report there; the ask-path
 *  stream runs the same per-sentence law but publishes no report, the
 *  :1299-1338 posture). */
export type ServePath = "blocking" | "stream";

/** The recorded conformance report of record (the wire shape — the
 *  ConformanceReport projection mark-conformance.ts :77-83 publishes). */
export interface RecordedConformanceReport {
  active: boolean;
  stripped: number;
  ruleA: number;
  ruleB: number;
  passThrough: number;
}

/** One scrubbed recorded marked-part tutor turn (the scorer's unit). */
export interface RecordedMarkedTurn {
  turnId: string;
  path: ServePath;
  /** The scrubbed learner ask (no PII — the golden capture law). */
  query: string;
  /** The resolved scheme of record (scrubbed scheme rows, verbatim shape
   *  of MarkContext minus the learner's own submission text). */
  markContext: MarkContext;
  /** The WIRE answer, POST-lint (what the learner saw). */
  answer: string;
  /** The refusal analytics flag the event of record published. */
  refused: boolean;
  /** The recorded conformance report — null on refusals (the lint never
   *  activates) and on stream turns (no report published today, the
   *  karag :1130-1146 stream event posture). */
  conformance: RecordedConformanceReport | null;
  /** The wire's truncation disclosure flag (run-013 law, carried for the
   *  same disclosure posture the answer-quality lane pins). */
  truncated: boolean;
  finishReason: string | null;
  model: string | null;
  provider: string | null;
  latencyMs: number | null;
  /** Scrubbed fixed timestamp (no wall-clock pins — the capture-time law). */
  at: string;
}

/** The committed fixture corpus of record. */
export interface MarkedTurnCorpus {
  schema: "conformance-trend-turns/v1";
  notes: string;
  turns: RecordedMarkedTurn[];
}

/** Per-turn verdict: the serving law re-derived through VERBATIM imports
 *  (the no-drift discipline, P3-01's ruling extended to the DC-5 plane). */
export interface MarkedTurnVerdict {
  turnId: string;
  /** The re-derived report on the WIRE answer (the post-lint text obeys
   *  the law on an honest serve). */
  reDerived: {
    violations: number;
    ruleA: number;
    ruleB: number;
    passThrough: number;
    stripped: number;
  };
  /** The decision-tree branch the recorded report puts this turn in. */
  branch: "clear" | "stripped" | "fail-open" | "refusal" | "stream";
  violations: string[];
}

/** The aggregate rates of record (the rubric v1 measurement). */
export interface ConformanceAggregate {
  total: number;
  refusedTurns: number;
  streamTurns: number;
  /** The report-bearing surface (blocking serving turns — the DC-5
   *  surface of record). */
  eligible: number;
  /** ruleA + ruleB == 0 on the recorded report. */
  conformancePassTurns: number;
  /** null when no eligible turn exists (an honest empty measurement). */
  conformancePassRate: number | null;
  ruleATotal: number;
  ruleBTotal: number;
  stripTurns: number;
  failOpenTurns: number;
  passThroughTurns: number;
  /** The lane's own law violations (the corpus of record is all-legal). */
  violationTotal: number;
}

/** The score report of record (the weekly lane's published artifact). */
export interface ConformanceQualityReport {
  schema: "conformance-trend-report/v1";
  lane: string;
  run: string;
  generatedAt: string;
  corpusFile: string;
  corpusSha256: string;
  rubric: string;
  perTurn: MarkedTurnVerdict[];
  aggregate: ConformanceAggregate;
  baselineCheck: BaselineCheck;
}

/** The cross-check of the fresh measurement against the committed baseline
 *  of record (P4-08's anchor law, the P3-06 posture: ANY drift is the
 *  weekly lane's RED — a deliberate re-pin is the same-PR conversation). */
export interface BaselineCheck {
  present: boolean;
  corpusShaMatches: boolean;
  rubricMatches: boolean;
  ratesMatch: boolean;
  verdict: "pass" | "drift" | "absent";
  reasons: string[];
}

/** The committed baseline of record (P4-08). */
export interface ConformanceBaselineRecord {
  schema: "conformance-trend-baseline/v1";
  lane: string;
  run: string;
  rubric: string;
  corpusFile: string;
  corpusSha256: string;
  recordedAt: string;
  notes: string;
  aggregate: ConformanceAggregate;
}
