/**
 * The baseline-of-record cross-check (T-TUTOR-AUDIT-P4 run-001, P4-08) —
 * the P3-06 posture extended to the DC-5 plane: the committed baseline pins
 * THREE things — the corpus of record (its sha256), the rubric the
 * measurement speaks, and the rubric v1 aggregate over that corpus. The
 * weekly lane re-scores the committed corpus and cross-checks the fresh
 * aggregate against the pin — ANY drift (a corpus edit without re-pin, a
 * serving-law change that moves the measurement, a rubric the scorer no
 * longer speaks) is RED: the deliberate re-pin is the same-PR conversation
 * (§7: no silent widening). This is what makes the conformance pass-rate
 * trend of record the flip conversation's evidence base rather than a hope:
 * the reference cannot move silently.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import type {
  BaselineCheck,
  ConformanceAggregate,
} from "./types.ts";
import { RUBRIC_VERSION } from "./scorer.ts";

/** sha256 of a file's bytes (the corpus pin of record). */
export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function rateEq(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) <= 1e-12;
}

function aggregateEq(a: ConformanceAggregate, b: ConformanceAggregate): boolean {
  return (
    a.total === b.total &&
    a.refusedTurns === b.refusedTurns &&
    a.streamTurns === b.streamTurns &&
    a.eligible === b.eligible &&
    a.conformancePassTurns === b.conformancePassTurns &&
    rateEq(a.conformancePassRate, b.conformancePassRate) &&
    a.ruleATotal === b.ruleATotal &&
    a.ruleBTotal === b.ruleBTotal &&
    a.stripTurns === b.stripTurns &&
    a.failOpenTurns === b.failOpenTurns &&
    a.passThroughTurns === b.passThroughTurns &&
    a.violationTotal === b.violationTotal
  );
}

/** Cross-check the fresh aggregate against the baseline of record at
 *  `baselinePath` (null/absent file → an ABSENT check — the weekly lane
 *  treats absent as drift: the baseline of record is the anchor, P4-08). */
export function checkBaseline(
  baselinePath: string,
  corpusSha256: string,
  aggregate: ConformanceAggregate,
): BaselineCheck {
  const reasons: string[] = [];
  let raw: string;
  try {
    raw = readFileSync(baselinePath, "utf8");
  } catch {
    return {
      present: false,
      corpusShaMatches: false,
      rubricMatches: false,
      ratesMatch: false,
      verdict: "absent",
      reasons: [`the baseline of record is unreadable at ${baselinePath}`],
    };
  }
  let base: import("./types.ts").ConformanceBaselineRecord;
  try {
    base = JSON.parse(raw) as import("./types.ts").ConformanceBaselineRecord;
  } catch (e) {
    return {
      present: true,
      corpusShaMatches: false,
      rubricMatches: false,
      ratesMatch: false,
      verdict: "drift",
      reasons: [
        `the baseline of record does not parse: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }

  const corpusShaMatches = base.corpusSha256 === corpusSha256;
  if (!corpusShaMatches) {
    reasons.push(
      `corpus drift: the baseline pins ${base.corpusSha256.slice(0, 12)}…, the corpus of record is ${corpusSha256.slice(0, 12)}… — re-pin in a deliberate same-PR conversation`,
    );
  }
  const rubricMatches = base.rubric === RUBRIC_VERSION;
  if (!rubricMatches) {
    reasons.push(
      `rubric drift: the baseline speaks ${base.rubric}, the scorer speaks ${RUBRIC_VERSION}`,
    );
  }
  const ratesMatch = aggregateEq(aggregate, base.aggregate);
  if (!ratesMatch) {
    reasons.push(
      `measurement drift: the fresh aggregate (eligible=${aggregate.eligible} pass=${aggregate.conformancePassTurns} ruleA=${aggregate.ruleATotal} ruleB=${aggregate.ruleBTotal} strip=${aggregate.stripTurns} failOpen=${aggregate.failOpenTurns} passThrough=${aggregate.passThroughTurns} violations=${aggregate.violationTotal}) disagrees with the baseline of record (eligible=${base.aggregate.eligible} pass=${base.aggregate.conformancePassTurns} ruleA=${base.aggregate.ruleATotal} ruleB=${base.aggregate.ruleBTotal} strip=${base.aggregate.stripTurns} failOpen=${base.aggregate.failOpenTurns} passThrough=${base.aggregate.passThroughTurns} violations=${base.aggregate.violationTotal}) — a serving law moved or the corpus moved without a re-pin`,
    );
  }
  const verdict: BaselineCheck["verdict"] =
    corpusShaMatches && rubricMatches && ratesMatch ? "pass" : "drift";
  return { present: true, corpusShaMatches, rubricMatches, ratesMatch, verdict, reasons };
}
