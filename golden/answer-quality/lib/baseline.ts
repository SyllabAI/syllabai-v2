/**
 * The baseline-of-record cross-check (T-TUTOR-AUDIT-P3 run-001, P3-06).
 *
 * The committed baseline pins THREE things: the corpus of record (its
 * sha256), the rubric the measurement speaks, and the rubric v1 aggregate
 * over that corpus. The weekly lane re-scores the committed corpus and
 * cross-checks the fresh aggregate against the pin — ANY drift (a corpus
 * edit without re-pin, a serving-law change that moves the measurement, a
 * rubric the scorer no longer speaks) is RED: the deliberate re-pin is the
 * same-PR conversation (§7: no silent widening). This is what makes the
 * P3 exit criterion's "first week of trend is the reference for P4 and P5"
 * a LAW rather than a hope: the reference cannot move silently.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import type {
  BaselineCheck,
  BaselineRecord,
  QualityAggregate,
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

function aggregateEq(a: QualityAggregate, b: QualityAggregate): boolean {
  return (
    a.total === b.total &&
    a.refused === b.refused &&
    a.citationEligible === b.citationEligible &&
    a.citationSupported === b.citationSupported &&
    rateEq(a.citationSupportRate, b.citationSupportRate) &&
    a.refusalDeadEnds === b.refusalDeadEnds &&
    rateEq(a.refusalCorrectRate, b.refusalCorrectRate) &&
    a.truncated === b.truncated &&
    rateEq(a.truncationRate, b.truncationRate) &&
    a.violationTotal === b.violationTotal
  );
}

/** Cross-check the fresh aggregate against the baseline of record at
 *  `baselinePath` (null/absent file → an ABSENT check — the weekly lane
 *  treats absent as drift: the baseline of record is the anchor, P3-06). */
export function checkBaseline(
  baselinePath: string,
  corpusSha256: string,
  aggregate: QualityAggregate,
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
  let base: BaselineRecord;
  try {
    base = JSON.parse(raw) as BaselineRecord;
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
      `measurement drift: the fresh aggregate (eligible=${aggregate.citationEligible} cited=${aggregate.citationSupported} deadEnds=${aggregate.refusalDeadEnds} truncated=${aggregate.truncated} violations=${aggregate.violationTotal}) disagrees with the baseline of record (eligible=${base.aggregate.citationEligible} cited=${base.aggregate.citationSupported} deadEnds=${base.aggregate.refusalDeadEnds} truncated=${base.aggregate.truncated} violations=${base.aggregate.violationTotal}) — a serving law moved or the corpus moved without a re-pin`,
    );
  }
  const verdict: BaselineCheck["verdict"] =
    corpusShaMatches && rubricMatches && ratesMatch ? "pass" : "drift";
  return { present: true, corpusShaMatches, rubricMatches, ratesMatch, verdict, reasons };
}
