/**
 * T-TUTOR-AUDIT-P1 run-001 — the SCHEDULED census-fold probe (audit P1-03 +
 * P1-04, finding F5).
 *
 * The instrument of record for the P1 exit criterion: "freshness lag is an
 * alert, not an operator discovery". The audit ruled P1-03 (a SCHEDULED daily
 * fold probe with alert) and P1-04 (fold-budget AUTO-DISPATCH of the embed
 * backfill) OPEN because no workflow carried schedule: + fold/census/backfill
 * and t-sib-embed-backfill.yml was workflow_dispatch-only. This file is the
 * probe; the workflow of record
 * (.github/workflows/t-tutor-audit-p1-fold-probe.yml) runs it DAILY against a
 * disposable COW of production, alerts on the fold budget, and auto-dispatches
 * the embed backfill when the budget is crossed AND the operator's per-run
 * keys are staged (the armed gate — the dispatch never fires the billed key
 * the operator did not stage; t-sib-embed-backfill.yml itself stays
 * workflow_dispatch-only, its operator gate untouched).
 *
 * NO-DRIFT LAW (the P3-01 discipline, imported verbatim): the funnel and the
 * cause classifier ARE the serving code of record — diagnoseEmpty +
 * classifyEmptyCause + CURRENT_EMBED_REV imported from
 * apps/api/src/services/content/retrieval.ts (the same module the frozen
 * backfill executor imports its embedDocument from). The probe re-implements
 * NOTHING: every fold it reports is the exact funnel whose cause the search
 * wire names in X-Search-Empty-Cause (the P1-02 anchor).
 *
 * Census law: every ACTIVE curriculum_versions row is a scope of record (the
 * resolveActive candidate query verbatim). A scope SERVES iff servingEligible
 * > 0; a folding scope's cause is classifyEmptyCause's verdict — the same
 * first-zero funnel law the wire emits. Boundary of record: the classifier is
 * the EMPTY-search classifier, so it is consulted ONLY on folding scopes (a
 * serving scope's all-positive funnel has no cause of record — the
 * classifier's fall-through UNEXPECTED there is a classifier artifact, not a
 * census alarm; folds are the law of record).
 *
 * Fold budget: the allowed fraction of folding scopes. The measured fraction
 * above budget = the F5 alert. Backfill-fixable folds (NOT_EMBEDDED /
 * EMBED_REV_EMPTY — exactly the funnel stages the embed backfill repairs)
 * above budget = the auto-dispatch fire order. SCOPE_EMPTY /
 * VALIDATION_GATE_EMPTY folds alert but stay operator-disposition (corpus
 * ingest / the validation law — no embedding pass can fix them; the backfill
 * driver of record is additionally SIB 4CH1-scoped by its own enumeration
 * law, so the dispatch repairs the slice it owns while the alert surfaces
 * everything). A monotone UNEXPECTED on a folding scope alerts REGARDLESS of
 * the budget (fail loud is the classifier's own law). A census with ZERO
 * scopes of record alerts too (nothing serves — a total fold by definition).
 *
 * Modes:
 *   --selftest
 *       The law matrix: synthetic funnels through the REAL diagnoseEmpty +
 *       classifyEmptyCause (fake SqlFn) and through the verdict law. The
 *       workflow's harness-sanity leg ("the comparators must prove themselves
 *       first", the neon-replay discipline). Provider-free.
 *   --db <url> --json <out> [--budget <fraction>]
 *       The live census (READ-ONLY — SELECT statements only, never writes).
 *       Writes the receipt of record and exits 0 even with folds: the census
 *       is an EVIDENCE producer; the workflow's alert step is the gate
 *       (T-MIG-047 doctrine).
 *   --verdict <receipt> [--budget <fraction>]
 *       The CI verdict leg: re-derives the verdict from the receipt's scopes
 *       and CROSS-CHECKS the receipt's own verdict (an instrument that
 *       disagrees with itself alerts). Emits step outputs, ::error
 *       annotations and the step summary. Exit 0 always (the workflow's
 *       alert step carries the gate).
 */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";

import {
  classifyEmptyCause,
  CURRENT_EMBED_REV,
  diagnoseEmpty,
  type SearchEmptyCause,
} from "../../apps/api/src/services/content/retrieval";
import type { SqlFn } from "../../apps/api/src/services/identity/users";

/** The fold budget of record (the allowed folding-scope fraction). */
export const FOLD_BUDGET_DEFAULT = 0.05;

/** The funnel stages the embed backfill of record repairs. */
export const BACKFILL_FIXABLE: readonly SearchEmptyCause[] = [
  "NOT_EMBEDDED",
  "EMBED_REV_EMPTY",
];

export const LANE = "T-TUTOR-AUDIT-P1";
export const RUN = "run-001";

export interface ScopeFoldRow {
  scopeId: string;
  code: string;
  chunksInScope: number;
  embeddedInScope: number;
  inScopeAtRev: number;
  servingEligible: number;
  /** null = the scope serves (servingEligible > 0); else the wire cause vocabulary. */
  cause: SearchEmptyCause | null;
  serves: boolean;
}

export interface FoldVerdict {
  total: number;
  serves: number;
  folds: number;
  foldFraction: number;
  budget: number;
  budgetExceeded: boolean;
  backfillFixable: number;
  operatorCauses: number;
  unexpected: number;
  alert: boolean;
  dispatch: boolean;
}

/**
 * The verdict law (pure). budgetExceeded is STRICT > (the budget is the
 * allowed fraction — a census sitting exactly on the budget of record is in
 * tolerance). alert = budgetExceeded OR any monotone UNEXPECTED on a folding
 * scope OR a zero-scope census. dispatch = budgetExceeded AND at least one
 * backfill-fixable fold (an alert the embed backfill of record can actually
 * repair).
 */
export function foldVerdict(rows: ScopeFoldRow[], budget: number): FoldVerdict {
  let serves = 0;
  let backfillFixable = 0;
  let operatorCauses = 0;
  let unexpected = 0;
  for (const r of rows) {
    if (r.serves) {
      serves++;
      continue;
    }
    if (r.cause === "UNEXPECTED") unexpected++;
    else if (r.cause != null && BACKFILL_FIXABLE.includes(r.cause)) backfillFixable++;
    else operatorCauses++;
  }
  const total = rows.length;
  const folds = total - serves;
  // A zero-scope census is a total fold by definition (nothing serves).
  const foldFraction = total === 0 ? 1 : folds / total;
  const budgetExceeded = foldFraction > budget;
  return {
    total,
    serves,
    folds,
    foldFraction,
    budget,
    budgetExceeded,
    backfillFixable,
    operatorCauses,
    unexpected,
    alert: budgetExceeded || unexpected > 0 || total === 0,
    dispatch: budgetExceeded && backfillFixable > 0,
  };
}

/**
 * One scope's census through the SERVING funnel of record. diagnoseEmpty is
 * the empty-search funnel port (retrieval.ts :486) — the probe calls it
 * directly per scope: the census IS the funnel, judged by the wire's own
 * classifier.
 */
export async function censusScope(
  sql: SqlFn,
  scopeId: string,
  code: string,
): Promise<ScopeFoldRow> {
  const funnel = await diagnoseEmpty(sql, null, scopeId);
  const serves = funnel.servingEligible > 0;
  return {
    scopeId,
    code,
    chunksInScope: funnel.chunksInScope,
    embeddedInScope: funnel.embeddedInScope,
    inScopeAtRev: funnel.inScopeAtRev,
    servingEligible: funnel.servingEligible,
    cause: serves ? null : classifyEmptyCause(funnel),
    serves,
  };
}

/** Every ACTIVE curriculum_versions row is a scope of record — the
 *  resolveActive candidate query verbatim (scope.ts :169-172). Sequential
 *  per-scope census: ACTIVE versions are few and the funnel is two cheap
 *  aggregates per scope. */
export async function censusScopes(
  sql: SqlFn,
  budget: number,
): Promise<{ scopes: ScopeFoldRow[]; verdict: FoldVerdict }> {
  const versions = await sql`select id, code from curriculum_versions where status = 'ACTIVE' order by created_at desc`;
  const scopes: ScopeFoldRow[] = [];
  for (const v of versions) {
    const id = v.id == null ? null : String(v.id);
    if (id == null) continue;
    const code = v.code == null ? "" : String(v.code);
    scopes.push(await censusScope(sql, id, code));
  }
  return { scopes, verdict: foldVerdict(scopes, budget) };
}

export function parseBudget(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return FOLD_BUDGET_DEFAULT;
  const b = Number(raw);
  if (!Number.isFinite(b) || b < 0 || b > 1) {
    throw new Error(`--budget must be a fraction in [0,1], got ${raw}`);
  }
  return b;
}

// ───────────────────────────── selftest ─────────────────────────────

/** Synthetic funnel shape: [chunks, embedded, atRev, eligible]. */
type FakeFunnel = [number, number, number, number];

/** A fake SqlFn that answers diagnoseEmpty's TWO queries from one funnel. */
function fakeSql(f: FakeFunnel): SqlFn {
  return async (strings: TemplateStringsArray, ..._params: unknown[]) => {
    void _params;
    const text = Array.from(strings).join("");
    if (text.includes("as eligible")) return [{ eligible: f[3] }];
    return [
      {
        chunks_in_scope: f[0],
        embedded_in_scope: f[1],
        in_scope_at_rev: f[2],
      },
    ];
  };
}

let selftestFails = 0;
function st(cond: boolean, msg: string): void {
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${msg}`);
  if (!cond) selftestFails++;
}

async function selftest(): Promise<void> {
  console.log("fold-census-probe selftest — the instrument proves itself first");
  console.log(`  no-drift import: diagnoseEmpty + classifyEmptyCause + CURRENT_EMBED_REV = ${CURRENT_EMBED_REV} (serving retrieval.ts, verbatim)`);

  // 1. The classifier law round-trips through the REAL diagnoseEmpty on a
  //    fake sql — the harness itself is wired to the serving code.
  const healthy: FakeFunnel = [120, 100, 90, 90];
  const healthyRow = await censusScope(fakeSql(healthy), "00000000-0000-0000-0000-000000000001", "healthy");
  st(healthyRow.serves && healthyRow.cause === null, "serving scope: servingEligible > 0 => serves, no cause of record");
  st(
    healthyRow.chunksInScope === 120 && healthyRow.embeddedInScope === 100 &&
      healthyRow.inScopeAtRev === 90 && healthyRow.servingEligible === 90,
    "serving scope: the funnel stages pass through verbatim",
  );

  // 2. Cause shapes through the REAL classifier (the wire's vocabulary).
  const shapes: Array<[FakeFunnel, SearchEmptyCause]> = [
    [[10, 0, 0, 0], "NOT_EMBEDDED"],
    [[10, 8, 0, 0], "EMBED_REV_EMPTY"],
    [[10, 8, 6, 0], "VALIDATION_GATE_EMPTY"],
    [[0, 0, 0, 0], "SCOPE_EMPTY"],
  ];
  for (const [f, want] of shapes) {
    const row = await censusScope(fakeSql(f), "00000000-0000-0000-0000-000000000002", String(want));
    st(!row.serves && row.cause === want, `fold shape ${want}: classifyEmptyCause names the first zero (got ${row.cause})`);
  }
  const bad = await censusScope(fakeSql([5, 8, 6, 0]), "00000000-0000-0000-0000-000000000003", "monotone-violation");
  st(!bad.serves && bad.cause === "UNEXPECTED", "monotone violation on a FOLD (eligible 0): UNEXPECTED, fail loud");
  const boundary = await censusScope(fakeSql([5, 8, 6, 6]), "00000000-0000-0000-0000-000000000004", "boundary");
  st(boundary.serves && boundary.cause === null,
    "boundary of record: a monotone-violating funnel with servingEligible > 0 SERVES — the classifier is the EMPTY-search classifier and is consulted only on folds");

  // 3. The verdict law — the budget matrix.
  const v = (folds: FakeFunnel[], serving = 0, budget = FOLD_BUDGET_DEFAULT): FoldVerdict =>
    foldVerdict(
      folds.map((f, i) => ({
        scopeId: `f${i}`,
        code: `fold${i}`,
        chunksInScope: f[0],
        embeddedInScope: f[1],
        inScopeAtRev: f[2],
        servingEligible: f[3],
        cause: f[3] > 0 ? null : classifyEmptyCause({
          chunksInScope: f[0],
          embeddedInScope: f[1],
          inScopeAtRev: f[2],
          servingEligible: f[3],
        }),
        serves: f[3] > 0,
      })).concat(
        Array.from({ length: serving }, (_, i) => ({
          scopeId: `s${i}`,
          code: `serve${i}`,
          chunksInScope: 9,
          embeddedInScope: 9,
          inScopeAtRev: 9,
          servingEligible: 9,
          cause: null,
          serves: true,
        })),
      ),
      budget,
    );

  st(v([], 2).alert === false && v([], 2).dispatch === false, "healthy census (2 serving, 0 folds): no alert, no dispatch");
  st(v([[10, 0, 0, 0]], 3).alert === true && v([[10, 0, 0, 0]], 3).dispatch === true,
    "NOT_EMBEDDED fold at 25% > 5% budget: alert + auto-dispatch");
  st(v([[10, 8, 0, 0]], 3).dispatch === true, "EMBED_REV_EMPTY fold: backfill-fixable, auto-dispatch");
  st(v([[10, 8, 6, 0]], 3).alert === true && v([[10, 8, 6, 0]], 3).dispatch === false,
    "VALIDATION_GATE_EMPTY fold: alerts, NOT dispatched (no embed pass fixes a validation gate)");
  st(v([[0, 0, 0, 0]], 3).alert === true && v([[0, 0, 0, 0]], 3).dispatch === false,
    "SCOPE_EMPTY fold: alerts, NOT dispatched (corpus ingest is operator-disposition)");
  st(v([[5, 8, 6, 0]], 999).alert === true && v([[5, 8, 6, 0]], 999).dispatch === false,
    "monotone UNEXPECTED at 0.1% << budget: alerts ANYWAY (fail-loud law), no dispatch");

  // 4. The budget boundary — strict >.
  const hundred = (n: number) => Array.from({ length: n }, () => [10, 0, 0, 0] as FakeFunnel);
  st(v(hundred(5), 95).alert === false, "5 folds / 100 scopes = exactly the 5% budget: in tolerance (strict >)");
  st(v(hundred(6), 94).alert === true && v(hundred(6), 94).dispatch === true,
    "6 folds / 100 scopes > the budget: alert + auto-dispatch");

  // 5. Degenerate censuses + the honest budget law.
  const empty = foldVerdict([], FOLD_BUDGET_DEFAULT);
  st(empty.alert === true && empty.dispatch === false, "zero scopes of record: alert (a total fold), no dispatch");
  st(v([[10, 8, 6, 0]], 3, 1).alert === false,
    "budget 1.0 (legal) tolerates every fold — alert only via UNEXPECTED or a zero-scope census");

  console.log(selftestFails === 0 ? "selftest: ALL PASS" : `selftest: ${selftestFails} FAIL`);
  if (selftestFails > 0) process.exit(1);
}

// ───────────────────────────── live census ─────────────────────────────

interface Receipt {
  instrument: string;
  lane: string;
  run: string;
  generated_at: string;
  posture: string;
  embed_rev: number;
  budget: number;
  scopes: ScopeFoldRow[];
  verdict: FoldVerdict;
}

async function live(dbUrl: string, jsonPath: string, budget: number): Promise<void> {
  const sql = postgres(dbUrl, { max: 1, prepare: false });
  try {
    const { scopes, verdict } = await censusScopes(sql as unknown as SqlFn, budget);
    const receipt: Receipt = {
      instrument: "scripts/dbprobe/fold-census-probe.ts",
      lane: LANE,
      run: RUN,
      generated_at: new Date().toISOString(),
      posture:
        "READ-ONLY census (SELECT only) over a disposable COW of production, dropped after with 404 verification (T-MIG-035); production never touched",
      embed_rev: CURRENT_EMBED_REV,
      budget,
      scopes,
      verdict,
    };
    writeFileSync(jsonPath, JSON.stringify(receipt, null, 2) + "\n");
    console.log(`fold census: ${verdict.serves}/${verdict.total} scopes serve, ` +
      `${verdict.folds} fold(s), fraction ${verdict.foldFraction.toFixed(4)} vs budget ${verdict.budget}`);
    for (const s of scopes) {
      const line = `${s.serves ? "SERVES" : String(s.cause)}`;
      console.log(
        `  ${s.code || s.scopeId}  ${line}  [chunks=${s.chunksInScope} embedded=${s.embeddedInScope} @rev=${s.inScopeAtRev} eligible=${s.servingEligible}]`,
      );
    }
    console.log(`receipt of record: ${jsonPath}`);
  } finally {
    await sql.end();
  }
}

// ───────────────────────────── CI verdict leg ─────────────────────────────

function emitOutputs(pairs: Record<string, string>): void {
  const out = process.env.GITHUB_OUTPUT;
  const text = Object.entries(pairs).map(([k, val]) => `${k}=${val}`).join("\n") + "\n";
  if (out) appendFileSync(out, text);
  else console.log(`(outputs) ${text.trimEnd()}`);
}

function emitSummary(md: string): void {
  const p = process.env.GITHUB_STEP_SUMMARY;
  if (p) appendFileSync(p, md + "\n");
  else console.log(md);
}

function note(msg: string): void {
  console.log(`::notice::${msg}`);
}
function alarm(msg: string): void {
  console.log(`::error::${msg}`);
}

function verdictMode(receiptPath: string, budgetFlag: number | null): void {
  const raw = JSON.parse(readFileSync(receiptPath, "utf8")) as Receipt;
  const budget = budgetFlag ?? raw.budget;
  const derived = foldVerdict(raw.scopes, budget);
  let alert = derived.alert;
  if (budgetFlag == null || budgetFlag === raw.budget) {
    if (JSON.stringify(derived) !== JSON.stringify(raw.verdict)) {
      alarm(`the receipt's own verdict disagrees with the re-derived law — instrument inconsistency`);
      alert = true;
    }
  } else {
    note(`verdict re-derived under the flag budget ${budgetFlag} (the receipt was taken under ${raw.budget})`);
  }

  const staged =
    process.env.SIB_GEMINI_KEY_STAGED === "true" &&
    process.env.SIB_PROD_DATABASE_URL_STAGED === "true";

  emitSummary([
    "## Fold census of record — T-TUTOR-AUDIT-P1 run-001 (F5)",
    "",
    `- scopes of record: **${derived.total}** (ACTIVE curriculum_versions — the resolveActive candidate query verbatim)`,
    `- serving: **${derived.serves}** · folding: **${derived.folds}** (fraction ${derived.foldFraction.toFixed(4)} vs budget ${derived.budget})`,
    `- backfill-fixable folds (NOT_EMBEDDED / EMBED_REV_EMPTY): **${derived.backfillFixable}**`,
    `- operator-disposition folds (SCOPE_EMPTY / VALIDATION_GATE_EMPTY): **${derived.operatorCauses}**`,
    `- monotone UNEXPECTED: **${derived.unexpected}**`,
    `- verdict: alert **${alert}** · dispatch **${derived.dispatch}** · armed **${staged}**`,
    "",
    derived.folds > 0 ? "| scope | cause | chunks | embedded | @rev | eligible |" : "_No folding scopes — the census is in tolerance._",
    derived.folds > 0 ? "|---|---|---|---|---|---|" : "",
    ...raw.scopes
      .filter((s) => !s.serves)
      .map((s) =>
        `| ${s.code || s.scopeId} | ${String(s.cause)} | ${s.chunksInScope} | ${s.embeddedInScope} | ${s.inScopeAtRev} | ${s.servingEligible} |`,
      ),
    "",
  ].join("\n"));

  const folds = raw.scopes.filter((s) => !s.serves);
  folds.slice(0, 10).forEach((s) => {
    alarm(
      `scope ${s.code || s.scopeId}: ${String(s.cause)} — funnel chunks=${s.chunksInScope} embedded=${s.embeddedInScope} @rev=${s.inScopeAtRev} eligible=${s.servingEligible}`,
    );
  });
  if (folds.length > 10) alarm(`…and ${folds.length - 10} more folding scope(s) — see the receipt artifact`);

  emitOutputs({
    alert: String(alert),
    dispatch: String(derived.dispatch),
    armed: String(staged),
    folds: String(derived.folds),
    total: String(derived.total),
    fold_fraction: derived.foldFraction.toFixed(4),
    budget: String(derived.budget),
    backfill_fixable: String(derived.backfillFixable),
    dispatch_note: `auto-dispatch by the T-TUTOR-AUDIT-P1 fold probe: ${derived.folds}/${derived.total} scopes fold (${derived.foldFraction.toFixed(4)} > budget ${derived.budget}); backfill-fixable ${derived.backfillFixable}; run ${process.env.GITHUB_RUN_ID ?? "local"}`,
  });
  note(
    `fold verdict: alert=${alert} dispatch=${derived.dispatch} armed=${staged} — ` +
      (derived.dispatch && staged
        ? "the F5 fire order will dispatch t-sib-embed-backfill (prod-only)"
        : derived.dispatch
          ? "budget crossed but the per-run keys are NOT staged — the operator gate holds; stage SIB_GEMINI_KEY + SIB_PROD_DATABASE_URL to arm"
          : alert
            ? "the F5 alert fires (the job red is the alert of record)"
            : "in tolerance"),
  );
  // Evidence producer: exit 0 ALWAYS — the workflow's alert step is the gate.
}

// ───────────────────────────── CLI ─────────────────────────────

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) {
    await selftest();
    return;
  }
  if (argv.includes("--verdict")) {
    verdictMode(argValue("--verdict") ?? "", parseBudget(argValue("--budget")));
    return;
  }
  const db = argValue("--db");
  const json = argValue("--json") ?? "fold-census.json";
  if (db == null || db.trim() === "") {
    console.error("usage: bun scripts/dbprobe/fold-census-probe.ts --selftest | --verdict <receipt> [--budget f] | --db <url> --json <out> [--budget f]");
    process.exit(2);
  }
  await live(db.trim(), json, parseBudget(argValue("--budget")));
}

// Entry-point guard: the verdict/verdict-fn exports stay importable (the
// selftest imports them), only a DIRECT invocation runs the CLI.
if (import.meta.main) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  });
}
