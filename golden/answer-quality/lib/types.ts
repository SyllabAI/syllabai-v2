/**
 * T-TUTOR-AUDIT-P3 run-001 — the offline answer-quality lane (audit P3-04 +
 * P3-05 + P3-06, finding F2). Fixture / verdict / artifact shapes.
 *
 * The recorded turn of record is the WIRE turn — the scrubbed recording of
 * one tutor ask/response pair as the serving surface emitted it. The stored
 * DB transcript is NOT the citation archive of record (session-store strips
 * every citation marker at persist, conversation.ts :42-52; "its source
 * numbers belong to the KA_RAG_COMPLETED telemetry row, the citation archive
 * of record") — so citation support is scoreable ONLY on the wire answer,
 * whose in-range markers survive the H2 hygiene verbatim.
 */

/** Which serving path recorded the turn (both paths carry the same laws —
 *  the P2 lane's parity ruling is what this dimension KEEPS holding). */
export type ServePath = "blocking" | "stream";

/** One scrubbed recorded tutor turn (the scorer's unit of record). Every
 *  field is published by the serving surface today — the event of record
 *  (TutorAnsweredEvent, karag.ts :239-265) carries evidenceCount/refused/
 *  model/provider/latencyMs; the wire answer and the truncation disclosure
 *  ride the same ask's response (route :331-337 blocking, :443-448 + :498
 *  stream). The scorer adds NO plumbing — it scores what already exists. */
export interface RecordedTutorTurn {
  turnId: string;
  path: ServePath;
  /** The learner ask, scrubbed (no PII — the golden capture law). */
  query: string;
  /** The WIRE answer, citation markers intact (the archive of record). */
  answer: string;
  /** The SAME evidence count the H2 hygiene judged the markers against. */
  evidenceCount: number;
  /** The refusal analytics flag the event of record published. */
  refused: boolean;
  /** The wire's truncation disclosure flag (isTruncationFinish of the
   *  provider finish reason, karag.ts :973/:1156). */
  truncated: boolean;
  /** The raw provider finish reason when recorded (null tolerated — the
   *  deterministic classes never see a provider). */
  finishReason: string | null;
  model: string | null;
  provider: string | null;
  latencyMs: number | null;
  /** Scrubbed fixed timestamp (the capture-time law: no wall-clock pins). */
  at: string;
}

/** The committed fixture corpus of record. */
export interface TurnCorpus {
  schema: "answer-quality-turns/v1";
  notes: string;
  turns: RecordedTutorTurn[];
}

/** Per-turn verdict: the three P3-04 dimensions re-derived through the
 *  SERVING laws (imported verbatim — the no-drift discipline, P3-01). */
export interface TurnVerdict {
  turnId: string;
  /** null = the turn is not citation-eligible (refused or zero evidence). */
  citationSupported: boolean | null;
  /** A way forward was learner-visible (redirect line | in-range citation |
   *  the deterministic family's own opener). */
  wayForward: boolean;
  /** The serving detector re-derives a refusal shape on the wire answer. */
  refusalShape: boolean;
  /** The truncation disclosure flag agrees with the finish-reason law. */
  truncationConsistent: boolean;
  /** Empty on an honest serve — every code names the serving law it holds. */
  violations: string[];
}

/** The aggregate rates of record (the rubric v1 measurement). */
export interface QualityAggregate {
  total: number;
  refused: number;
  /** Citation support: eligible = not refused AND evidence present. */
  citationEligible: number;
  citationSupported: number;
  /** null when no eligible turn exists (an honest empty measurement). */
  citationSupportRate: number | null;
  /** Learner-experienced bare-refusal dead ends (the run-001 6/6 class). */
  refusalDeadEnds: number;
  refusalCorrectRate: number;
  truncated: number;
  truncationRate: number;
  violationTotal: number;
}

/** The score report of record (the weekly lane's published artifact). */
export interface QualityReport {
  schema: "answer-quality-report/v1";
  lane: string;
  run: string;
  generatedAt: string;
  corpusFile: string;
  corpusSha256: string;
  rubric: string;
  perTurn: TurnVerdict[];
  aggregate: QualityAggregate;
  baselineCheck: BaselineCheck;
}

/** The cross-check of the fresh measurement against the committed baseline
 *  of record (P3-06). drift = the corpus moved, the laws moved, or the
 *  baseline was re-pinned under a rubric the scorer no longer speaks. */
export interface BaselineCheck {
  present: boolean;
  corpusShaMatches: boolean;
  rubricMatches: boolean;
  ratesMatch: boolean;
  verdict: "pass" | "drift" | "absent";
  reasons: string[];
}

/** The committed baseline of record (P3-06): run-001 pins the corpus of
 *  record + the rubric v1 measurement. ANY drift (corpus edit, serving-law
 *  change, rubric change) turns the weekly lane RED — a deliberate re-pin
 *  is the same-PR conversation (§7: no silent widening). */
export interface BaselineRecord {
  schema: "answer-quality-baseline/v1";
  lane: string;
  run: string;
  rubric: string;
  corpusFile: string;
  corpusSha256: string;
  recordedAt: string;
  notes: string;
  aggregate: QualityAggregate;
}
