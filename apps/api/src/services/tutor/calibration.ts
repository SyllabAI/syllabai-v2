/**
 * T-TUTOR-AIM-P3 (DC10 §7.9): the calibration read-out — the consume-later
 * surface over the P2 confidence log. "Once the confidence log has a curve:
 * a learner-visible calibration read-out ('when you say you're sure, you're
 * right 85% of the time')."
 *
 * THE ARITHMETIC (deterministic, zero LLM, read-only):
 *   1. The learner's logged asks — tutor_ask_confidence rows (P2's
 *      log-first capture; a no-tap ask logged NOTHING, so every row IS a
 *      selection).
 *   2. THE PAIRING — a logged ask pairs to the ledger rows (P3's
 *      tutor_served_evidence, surface tutor_answer) of the SAME session
 *      whose served_at sits inside ASK_PAIRING_WINDOW_MS of the
 *      confidence row's created_at (the ask instant the two writers
 *      observed — the pipeline's completion clock vs the recorder's clock,
 *      a sub-second skew by construction; the window absorbs it without
 *      ever spanning the NEXT turn in a live conversation, where asks are
 *      seconds-to-minutes apart). A confidence row with a null session
 *      pairs to nothing (the ledger is session-scoped by the schema of
 *      record — the honest coverage residual, disclosed).
 *   3. THE OUTCOME — a paired ask is outcome-covered when the learner's
 *      graded drill evidence (drill_part_evidence, marksAwarded != null —
 *      the S1 anchor's graded discipline) exists at a PAIR's spec nodes
 *      within OUTCOME_WINDOW_DAYS after the ask. The drill address space
 *      is (course, code)-keyed while the ledger rows carry the KG node id:
 *      the reader resolves the node id → knowledge_nodes.code, and matches
 *      evidence by CODE (the codes are globally-unique spec-point codes —
 *      the cross-course collision is a disclosed residual of the code-keyed
 *      drill address space, not a new weakness). A graded part is CORRECT
 *      when marksAwarded/marksPossible >= 0.5 (the majority-of-marks
 *      reading; the same marks-weighted posture the S1 anchor law uses).
 *   4. THE BANDS — per confidence band: asks (outcome-covered), parts
 *      (graded parts attributed), accuracy (correct share). Attribution:
 *      each covered part counts for the band of the ask whose pairing
 *      covers its node; a part covered by several asks counts ONCE for its
 *      NEAREST preceding ask (the deterministic nearest-preceding law).
 *
 * THE §7.4 GATES (each a hard status, never a soft claim):
 *   - rule 1's normalisation floor: under CALIBRATION_MIN_ASKS covered
 *     asks → status "gathering" (the honest empty — no numbers beyond the
 *     counts themselves are implied).
 *   - rule 5's noise gate: when BOTH a sure band and a guessing band carry
 *     data and the accuracy gap stays under CALIBRATION_NOISE_GAP (0.10),
 *     → status "no_signal" (stay log-only — the surface says so, it does
 *     NOT render a calibration claim).
 *   - rule 1's per-learner law: EVERYTHING here is this learner's own
 *     rows — no population stats, no cross-learner pooling, ever.
 *   - rule 3's honesty law lives on the ANSWER path (never touched here —
 *     the answer never learns the confidence influenced anything).
 */

import type { SqlFn } from "./sql";
import type { Clock } from "./session-store";

/** The §7.4 rule-1 normalisation floor of record (~15 responses). */
export const CALIBRATION_MIN_ASKS = 15;
/** The §7.4 rule-5 noise floor of record (~10 accuracy points). */
export const CALIBRATION_NOISE_GAP = 0.1;
/** The outcome window of record: graded practice within 14 days of the ask. */
export const CALIBRATION_OUTCOME_WINDOW_DAYS = 14;
/** The correct share of record: majority of the part's marks. */
export const CALIBRATION_CORRECT_RATIO = 0.5;
/** The ask-pairing window (the two writers' clock skew absorber). */
export const ASK_PAIRING_WINDOW_MS = 120_000;

export interface CalibrationBand {
  confidence: "sure" | "think_so" | "guessing";
  asks: number;
  parts: number;
  accuracy: number | null;
}

export interface CalibrationReadout {
  status: "gathering" | "no_signal" | "ok";
  bands: CalibrationBand[];
  asksCovered: number;
  asksLogged: number;
  outcomeWindowDays: number;
  generatedAt: string;
}

/** One logged ask (the reader's projection of tutor_ask_confidence). */
export interface LoggedAskRow {
  sessionId: string | null;
  confidence: "sure" | "think_so" | "guessing";
  createdAt: Date;
}

/** One ledger observation (the reader's projection of
 *  tutor_served_evidence, surface tutor_answer only). */
export interface ServedRow {
  sessionId: string;
  specNodeId: string;
  servedAt: Date;
}

/** One graded drill evidence row (the reader's projection of
 *  drill_part_evidence — graded rows only, the S1 discipline). */
export interface OutcomeRow {
  code: string;
  correct: boolean;
  gradedAt: Date;
}

/**
 * the pure core — unit-pinned. takes the three projections + the resolve
 * map (node id → drill address code) and returns the read-out. Zero SQL
 * knowledge; the reader below owns every query.
 */
export function calibrationReadout(
  asks: ReadonlyArray<LoggedAskRow>,
  served: ReadonlyArray<ServedRow>,
  outcomes: ReadonlyArray<OutcomeRow>,
  nodeCodeOf: (nodeId: string) => string | null,
  now: Date,
): CalibrationReadout {
  const windowMs = CALIBRATION_OUTCOME_WINDOW_DAYS * 86_400_000;
  const generatedAt = now.toISOString();

  // THE PAIRING — each logged ask's served node set (nearest-in-time ledger
  // rows of the same session; a null-session ask pairs to nothing)
  interface PairedAsk {
    confidence: "sure" | "think_so" | "guessing";
    at: Date;
    nodeIds: string[];
  }
  const bySession = new Map<string, ServedRow[]>();
  for (const row of served) {
    const list = bySession.get(row.sessionId);
    if (list == null) bySession.set(row.sessionId, [row]);
    else list.push(row);
  }
  const paired: PairedAsk[] = asks.map((ask) => {
    if (ask.sessionId == null) return { confidence: ask.confidence, at: ask.createdAt, nodeIds: [] };
    const rows = bySession.get(ask.sessionId) ?? [];
    const nodeIds = [
      ...new Set(
        rows
          .filter(
            (r) =>
              Math.abs(r.servedAt.getTime() - ask.createdAt.getTime()) <=
              ASK_PAIRING_WINDOW_MS,
          )
          .map((r) => r.specNodeId),
      ),
    ];
    return { confidence: ask.confidence, at: ask.createdAt, nodeIds };
  });
  const covered = paired.filter((p) => p.nodeIds.length > 0);

  // THE OUTCOME — graded parts at a covered ask's nodes within the window;
  // each part attributes to its NEAREST PRECEDING covered ask at that node
  const bandStats = new Map<"sure" | "think_so" | "guessing", { asks: Set<string>; parts: number; correct: number }>();
  const bandOf = (c: "sure" | "think_so" | "guessing") => {
    let s = bandStats.get(c);
    if (s == null) {
      s = { asks: new Set(), parts: 0, correct: 0 };
      bandStats.set(c, s);
    }
    return s;
  };
  for (const p of covered) {
    bandOf(p.confidence).asks.add(
      `${p.at.getTime()}|${p.nodeIds.join(",")}`,
    );
  }
  const usedParts = new Set<string>();
  // nearest-preceding attribution: LATEST covered ask first — the part
  // counts for the closest ask that covers its node within the window
  const coveredLatestFirst = [...covered].reverse();
  for (const p of coveredLatestFirst) {
    const codes = new Set(
      p.nodeIds.map((n) => nodeCodeOf(n)).filter((c): c is string => c != null && c !== ""),
    );
    if (codes.size === 0) continue;
    for (const o of outcomes) {
      const key = `${o.gradedAt.getTime()}|${o.code}`;
      if (usedParts.has(key)) continue;
      if (!codes.has(o.code)) continue;
      if (o.gradedAt.getTime() < p.at.getTime()) continue;
      if (o.gradedAt.getTime() - p.at.getTime() > windowMs) continue;
      usedParts.add(key);
      const stat = bandOf(p.confidence);
      stat.parts += 1;
      if (o.correct) stat.correct += 1;
    }
  }

  const bands: CalibrationBand[] = (["sure", "think_so", "guessing"] as const).map(
    (c) => {
      const stat = bandStats.get(c);
      const asksCount = stat?.asks.size ?? 0;
      const parts = stat?.parts ?? 0;
      return {
        confidence: c,
        asks: asksCount,
        parts,
        accuracy: parts > 0 ? (stat!.correct / parts) : null,
      };
    },
  );

  const asksCovered = covered.length;
  let status: CalibrationReadout["status"] = "ok";
  if (asksCovered < CALIBRATION_MIN_ASKS) {
    status = "gathering";
  } else {
    // rule 5's noise gate: BOTH endpoints must carry accuracy for the gap
    // to be meaningful; either endpoint empty → the gate cannot fire
    const sure = bands.find((b) => b.confidence === "sure");
    const guessing = bands.find((b) => b.confidence === "guessing");
    if (
      sure?.accuracy != null &&
      guessing?.accuracy != null &&
      Math.abs(sure.accuracy - guessing.accuracy) < CALIBRATION_NOISE_GAP
    ) {
      status = "no_signal";
    }
  }

  return {
    status,
    bands,
    asksCovered,
    asksLogged: asks.length,
    outcomeWindowDays: CALIBRATION_OUTCOME_WINDOW_DAYS,
    generatedAt,
  };
}

/**
 * readCalibration — the reader: THREE bounded reads (the learner's own
 * rows only — the account-only law), then the pure core. Read-only, zero
 * writes, zero LLM.
 */
export async function readCalibration(
  sql: SqlFn,
  clock: Clock,
  learnerId: string,
): Promise<CalibrationReadout> {
  const now = clock.now();

  const askRows = (await sql`
    select session_id, confidence, created_at
    from tutor_ask_confidence
    where learner_id = ${learnerId}
    order by created_at asc
  `) as unknown as Array<{
    session_id: string | null;
    confidence: string;
    created_at: Date | string;
  }>;
  const asks: LoggedAskRow[] = askRows.map((r) => ({
    sessionId: r.session_id == null ? null : String(r.session_id),
    confidence:
      r.confidence === "sure" || r.confidence === "guessing"
        ? r.confidence
        : "think_so",
    createdAt:
      r.created_at instanceof Date ? r.created_at : new Date(String(r.created_at)),
  }));

  const servedRows = (await sql`
    select session_id, spec_node_id, served_at
    from tutor_served_evidence
    where learner_id = ${learnerId} and surface = ${"tutor_answer"}
    order by served_at asc
  `) as unknown as Array<{
    session_id: string;
    spec_node_id: string;
    served_at: Date | string;
  }>;
  const served: ServedRow[] = servedRows.map((r) => ({
    sessionId: String(r.session_id),
    specNodeId: String(r.spec_node_id),
    servedAt: r.served_at instanceof Date ? r.served_at : new Date(String(r.served_at)),
  }));

  const outcomeRows = (await sql`
    select code, marks_awarded, marks_possible, created_at
    from drill_part_evidence
    where learner_id = ${learnerId} and marks_awarded is not null
    order by created_at asc
  `) as unknown as Array<{
    code: string;
    marks_awarded: number;
    marks_possible: number;
    created_at: Date | string;
  }>;
  const outcomes: OutcomeRow[] = outcomeRows.map((r) => {
    const awarded = Number(r.marks_awarded);
    const possible = Number(r.marks_possible);
    return {
      code: String(r.code),
      correct:
        possible > 0 && awarded / possible >= CALIBRATION_CORRECT_RATIO,
      gradedAt:
        r.created_at instanceof Date ? r.created_at : new Date(String(r.created_at)),
    };
  });

  // the node → drill-address resolve (the KG catalog's own codes); the
  // distinct served node set is small (per-learner window)
  const nodeIds = [...new Set(served.map((s) => s.specNodeId))];
  const nodeCodeOf = new Map<string, string>();
  if (nodeIds.length > 0) {
    const nodeRows = (await sql`
      select id, code from knowledge_nodes where id = any(${nodeIds})
    `) as unknown as Array<{ id: string; code: string }>;
    for (const n of nodeRows) nodeCodeOf.set(String(n.id), String(n.code));
  }

  return calibrationReadout(
    asks,
    served,
    outcomes,
    (nodeId) => nodeCodeOf.get(nodeId) ?? null,
    now,
  );
}
