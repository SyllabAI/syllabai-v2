/**
 * The conformance trend lane CLI (T-TUTOR-AUDIT-P4 run-001) — the weekly
 * publish lane's instrument. Provider-free, read-only over the repo (the
 * report lands as a CI artifact, never a tracked-file mutation — the
 * workflow's git-diff proof step enforces the posture).
 *
 * Modes:
 *   score  --corpus <file> --json <out> [--baseline <file>]
 *       Score the corpus of record, write the report of record, cross-check
 *       the baseline of record. Emits the step summary, ::error annotations
 *       per violation, and the `drift` step output. EXIT 0 ALWAYS — the
 *       evidence producer never gates itself; the workflow's alert step
 *       carries the gate (the P1 verdict/alert doctrine, T-MIG-047).
 *   pin-baseline --corpus <file> --out <file> [--note <text>]
 *       The DELIBERATE pin: writes the baseline of record from a fresh
 *       score of the corpus. Run by the operator/agent in the same PR that
 *       moves the corpus or re-ratifies the rubric — never by CI.
 *
 * Usage: bun golden/conformance-trend/score.ts <mode> ...
 */

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

import { sha256File, checkBaseline } from "./lib/baseline.ts";
import { LANE, RUBRIC_VERSION, RUN, scoreCorpus } from "./lib/scorer.ts";
import type { ConformanceQualityReport, MarkedTurnCorpus } from "./lib/types.ts";

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function emitOutputs(pairs: Record<string, string>): void {
  const out = process.env.GITHUB_OUTPUT;
  const text = Object.entries(pairs).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  if (out) appendFileSync(out, text);
  else console.log(`(outputs) ${text.trimEnd()}`);
}

function emitSummary(md: string): void {
  const p = process.env.GITHUB_STEP_SUMMARY;
  if (p) appendFileSync(p, md + "\n");
  else console.log(md);
}

function scoreMode(corpusPath: string, jsonPath: string, baselinePath: string | undefined): void {
  const corpus = JSON.parse(readCorpus(corpusPath)) as MarkedTurnCorpus;
  if (corpus.schema !== "conformance-trend-turns/v1") {
    throw new Error(`corpus schema ${corpus.schema} is not conformance-trend-turns/v1`);
  }
  const corpusSha256 = sha256File(corpusPath);
  const { perTurn, aggregate } = scoreCorpus(corpus);
  const baselineCheck = baselinePath == null
    ? {
        present: false,
        corpusShaMatches: false,
        rubricMatches: false,
        ratesMatch: false,
        verdict: "absent" as const,
        reasons: ["no --baseline given — scoring without the anchor (dev posture)"],
      }
    : checkBaseline(baselinePath, corpusSha256, aggregate);

  const report: ConformanceQualityReport = {
    schema: "conformance-trend-report/v1",
    lane: LANE,
    run: RUN,
    generatedAt: new Date().toISOString(),
    corpusFile: corpusPath,
    corpusSha256,
    rubric: RUBRIC_VERSION,
    perTurn,
    aggregate,
    baselineCheck,
  };
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");

  for (const v of perTurn) {
    for (const code of v.violations) {
      console.log(`::error::turn ${v.turnId}: ${code} — the serving DC-5 law of record did not hold on the wire turn (see the report artifact)`);
    }
  }

  const cpr = aggregate.conformancePassRate == null
    ? "n/a"
    : aggregate.conformancePassRate.toFixed(4);
  emitSummary([
    `## Conformance pass rate of record — ${LANE} ${RUN} (P4-08)`,
    "",
    `- corpus of record: **${corpusPath}** (sha256 \`${corpusSha256.slice(0, 16)}…\`)`,
    `- turns: **${aggregate.total}** · refused **${aggregate.refusedTurns}** · stream **${aggregate.streamTurns}**`,
    `- conformance pass rate: **${aggregate.conformancePassTurns}/${aggregate.eligible}** eligible turns (rate ${cpr}) — the report-bearing surface of record`,
    `- violation mix: Rule A **${aggregate.ruleATotal}** · Rule B **${aggregate.ruleBTotal}**`,
    `- strip turns **${aggregate.stripTurns}** · fail-open turns **${aggregate.failOpenTurns}** · pass-through turns **${aggregate.passThroughTurns}**`,
    `- serving-law violations: **${aggregate.violationTotal}**`,
    `- baseline of record: **${baselineCheck.verdict}**${baselineCheck.reasons.length > 0 ? " — " + baselineCheck.reasons.join("; ") : ""}`,
    "",
  ].join("\n"));

  emitOutputs({
    drift: baselineCheck.verdict === "pass" ? "false" : "true",
    violations: String(aggregate.violationTotal),
    total: String(aggregate.total),
    conformance_pass_rate: cpr,
    rule_a_total: String(aggregate.ruleATotal),
    rule_b_total: String(aggregate.ruleBTotal),
    baseline_verdict: baselineCheck.verdict,
  });
  console.log(
    `conformance trend: ${aggregate.total} turns, violations ${aggregate.violationTotal}, baseline ${baselineCheck.verdict} — report of record: ${jsonPath}`,
  );
  // Evidence producer: exit 0 ALWAYS — the workflow's alert step is the gate.
}

function pinMode(corpusPath: string, outPath: string, note: string | undefined): void {
  const corpus = JSON.parse(readCorpus(corpusPath)) as MarkedTurnCorpus;
  if (corpus.schema !== "conformance-trend-turns/v1") {
    throw new Error(`corpus schema ${corpus.schema} is not conformance-trend-turns/v1`);
  }
  const corpusSha256 = sha256File(corpusPath);
  const { aggregate } = scoreCorpus(corpus);
  const baseline = {
    schema: "conformance-trend-baseline/v1",
    lane: LANE,
    run: RUN,
    rubric: RUBRIC_VERSION,
    corpusFile: corpusPath,
    corpusSha256,
    recordedAt: new Date().toISOString(),
    notes:
      note ??
      "the rubric v1 measurement over the corpus of record — ANY drift is the weekly lane's RED; re-pin deliberately in the same PR that moves the corpus",
    aggregate,
  };
  writeFileSync(outPath, JSON.stringify(baseline, null, 2) + "\n");
  console.log(
    `baseline of record pinned: ${outPath} (corpus ${corpusSha256.slice(0, 16)}…, violations ${aggregate.violationTotal})`,
  );
}

function readCorpus(path: string): string {
  return readFileSync(path, "utf8");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("score")) {
    const corpus = argValue("--corpus");
    const json = argValue("--json") ?? "cft-report.json";
    const baseline = argValue("--baseline");
    if (corpus == null || corpus.trim() === "") {
      console.error("usage: bun golden/conformance-trend/score.ts score --corpus <file> --json <out> [--baseline <file>]");
      process.exit(2);
    }
    scoreMode(corpus.trim(), json, baseline);
    return;
  }
  if (argv.includes("pin-baseline")) {
    const corpus = argValue("--corpus");
    const out = argValue("--out");
    if (corpus == null || out == null) {
      console.error("usage: bun golden/conformance-trend/score.ts pin-baseline --corpus <file> --out <file> [--note <text>]");
      process.exit(2);
    }
    pinMode(corpus.trim(), out.trim(), argValue("--note"));
    return;
  }
  console.error("usage: bun golden/conformance-trend/score.ts score | pin-baseline");
  process.exit(2);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  });
}
