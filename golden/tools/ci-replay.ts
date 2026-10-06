/**
 * T-MIG-044 — CI-side golden replay driver (corpus-wide, two-posture).
 *
 * OPERATOR DIRECTIVE (IM trace 1a10ca697e382335 item 2): a GitHub Actions
 * workflow runs the golden replay against Neon (agent sandboxes are
 * DNS-blocked; CI is not) in a STRICT READ-ONLY POSTURE — replay only; the
 * cases stay forever-gates (GOLDEN_MASTER §4: "Cases are forever").
 *
 * What "strict read-only posture" means HERE, operationally:
 *   - this driver NEVER captures, scrubs, edits, retires, or re-pins a case;
 *     it replays the committed corpus at the checked-out sha verbatim;
 *   - it NEVER touches the production Neon branch — the workflow provisions
 *     disposable copy-on-write branches (neon-branch.ts) per run and drops
 *     them afterwards (+404-verified);
 *   - a divergence is REPORTED (per-case diff + JSON report + non-zero exit)
 *     for R0/R6 disposition per AGENT_COORDINATION §6 — never auto-fixed,
 *     never silently tolerated.
 *
 * Posture doctrine (recorded, T-MIG-022 run-001): the corpus pins two
 * mutually exclusive database postures, split by the SAME REALDATA regex the
 * proven v2 content tool uses (/realdata|-real-/):
 *   CASE_MODE=seed → the non-realdata tranche: replayed against a disposable
 *     COW branch reset to the Flyway-SEED posture via apply-reset.ts
 *     (content tables empty, zero users, roles re-seeded).
 *   CASE_MODE=prod → the realdata tranche (15 realdata / real- named cases):
 *     replayed AS-COWED (production pilot data intact, NO reset) — exactly
 *     the posture the F-5 extension was captured in.
 * The Wave-2 exit verdict was the UNION of the two passes; this runner
 * mechanizes the same union as the standing periodic re-proof instrument
 * named by R0-SWEEP-5 (cards T-MIG-022/023/024/030/032 standing conditions).
 *
 * KNOWN POSTURE NOTES (honest-replay disclosures, NOT pre-weakened):
 *   - w3/curriculum/teacher cases captured from LOCAL Flyway-seeded boots pin
 *     V6/V7 fixed-uuid seed rows; the seed pass's apply-reset wipes content
 *     tables (H-2 divergence preserved intact), so any such case FAILS
 *     honestly with full evidence for R0/R6 to rule a third posture or
 *     re-pin. First-run findings are the instrument working, not breaking.
 *   - cases pinning capture-time identity values in NON-tolerated fields
 *     (e.g. w3-history-after-submit-200 pins the capture student's
 *     learnerId) will fail until R6/R0 amend the case — the diff names the
 *     exact field. No silent tolerance is added here (§7: no silent widening).
 *
 * Comparator: deepEqualTolerant is IMPORTED from golden/runner.ts (the gated
 * engine itself — zero comparator drift; T-MIG-024 made runner importable for
 * tools). Token/auth model: verbatim from the proven T-MIG-022
 * replay-content-cases-v2.ts (role selection by ROUTE RULE per
 * SecurityConfig.java:66-91, tokens minted through the honest register/login
 * surface, unauthed probes keep the committed scrubbed-dummy bearer).
 *
 * Usage:
 *   CASE_MODE=seed|prod TARGET=http://localhost:8080 \
 *     SYLLABAI_TEACHER_JOIN_CODE=... bun golden/tools/ci-replay.ts \
 *     [--report-out reports/seed.json] [--plan]
 *   bun golden/tools/ci-replay.ts --union reports/seed.json reports/prod.json
 *     [--summary-out reports/union.md]   # merges two mode reports
 *   bun golden/tools/ci-replay.ts --selftest
 *
 * T-MIG-063 (rich-200 series disposition, run-001/run-002): the N-4
 * rich-200 family (the w3-sme- and w3-teacher-marking- rich-200 cases,
 * T-MIG-051) needs the capabilities T-MIG-051 gave the LOCAL
 * runner but this instrument lacked — its first live run (37408914789,
 * union 120/177) returned the family 0/7 purely on harness gaps: the sme
 * trio 403'd (no /admin route rule → default student bearer on
 * /api/v1/admin/**) and the marking quartet saw an empty store (the T51
 * lifecycle was never staged). This file therefore:
 *   1. ships bodyFile/multipart cases via buildMultipartBody IMPORTED from
 *      ../runner.ts (the gated engine stays untouched — import-only, zero
 *      comparator/runner drift);
 *   2. resolves /api/v1/admin/** to the ADMIN bearer — placed AFTER the
 *      name-based rules so the student/teacher 403 postures keep the role
 *      they captured (w3-sme-status-student-403 keeps the student bearer;
 *      w3-sme-status-teacher-403 gains the role-faithful TEACHER bearer per
 *      T-MIG-051 run-003's role model);
 *   3. builds the family's state IN PARTNERSHIP WITH THE CASES by spawning
 *      the committed golden/tools/seed-t51-rich200.ts VERBATIM at two loop
 *      boundaries (--stage accounts before the first w3-sme- case;
 *      --stage attempts before the first w3-teacher-marking- case — the
 *      ingest cases themselves stay the seq-10/11 state builders exactly
 *      as captured). The tool is the state the cases DECLARE
 *      ("Replay requires golden/tools/seed-t51-rich200.ts state"); it is
 *      reused unmodified. Fail-fast: family present + no DATABASE_URL =
 *      honest harness error, never a silent degraded replay. Zero case
 *      files touched (§7: no silent widening — the cases are forever).
 */
import { loadCases, deepEqualTolerant, buildMultipartBody } from "../runner.ts";
import { join } from "node:path";

const REALDATA = /realdata|-real-/; // verbatim posture regex (T-MIG-022 v2 tool)
const DUMMY = "scrubbed-fixed-dummy-jwt-token";
const TARGET = process.env.TARGET ?? "http://localhost:8080";
const CASE_MODE = process.env.CASE_MODE ?? "";
const JOIN_CODE = process.env.SYLLABAI_TEACHER_JOIN_CODE ?? "";

interface GoldenCase {
  name: string;
  method: string;
  path: string;
  request?: { headers?: Record<string, string>; body?: unknown };
  expect: { status: number; body: unknown; headers?: Record<string, string> };
  tolerate?: string[];
  unordered?: string[];
  seq?: number;
  // T-MIG-051/063: multipart request bodies — the case names a FILE under
  // cases/files/ shipped as ONE part (the SME ingest's 'file' part). Built
  // by buildMultipartBody imported from the gated runner (wired in
  // --selftest here too).
  bodyFile?: string;
  multipart?: { partName: string; filename: string; contentType?: string };
}

interface CaseResult {
  name: string;
  mode: string;
  pass: boolean;
  diff?: string;
}

function fail(msg: string): never {
  console.error(`[ci-replay] ${msg}`);
  process.exit(2);
}

function selectCases(mode: string): GoldenCase[] {
  if (mode !== "seed" && mode !== "prod") {
    fail("CASE_MODE must be 'seed' or 'prod' (the two recorded postures, T-MIG-022 run-001)");
  }
  // loadCases() is the gated loader: seq'd (stateful write-path) cases run
  // FIRST in seq order (register-success(1) -> duplicate(2) -> login(3) ->
  // wrong-password(4) -> me(5)), the rest in filename order.
  return (loadCases() as GoldenCase[]).filter((k) =>
    mode === "prod" ? REALDATA.test(k.name) : !REALDATA.test(k.name),
  );
}

// ── role selection by ROUTE RULE (SecurityConfig.java:66-91), v2 tool verbatim ──
// T-MIG-063: the name-based rules keep precedence over the path rules so the
// role-gated 403 postures replay with the role they captured; the /admin
// path rule resolves to the staging's bootstrap-claimant bearer (ADMIN+
// TEACHER — it passes every admin surface) and NEVER to the default student
// bearer (the run-37408914789 403s). Empty admin return = caller renders
// the honest per-case harness error.
function routeRuleBearer(name: string, path: string, teacher: string, student: string, admin = ""): string {
  if (name.includes("unauthed")) return DUMMY; // invalid bearer → anonymous → 401 parity
  if (name.includes("student")) return student; // 403-parity probes: STUDENT on teacher routes
  if (name.endsWith("-teacher-403")) return teacher; // T-MIG-063: role-faithful 403 posture (w3-sme-status-teacher-403 — the corpus's only -teacher-403 case)
  if (path.includes("/api/v1/admin/")) {
    if (!admin) return "";
    return admin;
  }
  if (path.includes("/api/v1/teacher/")) return teacher;
  return student;
}

// ── T-MIG-063: the rich-200 family's state partnership ─────────────────────
// The staging boundaries are computed from the SAME filtered, seq-ordered
// list the replay loop walks, so the ingest cases run as the state builders
// exactly as captured (seq 10/11) and the marking reads see the tied
// attempts (seq 13+, after --stage attempts). Sentinel: the family's first
// committed case by name; boundaries fire AT MOST ONCE each, before the
// first case of each sub-family.
const RICH_SENTINEL = "w3-sme-ingest-rich-200";

interface RichStageBoundary {
  at: number;
  stage: "accounts" | "attempts";
}

function richStagePlan(cases: GoldenCase[]): RichStageBoundary[] {
  const plan: RichStageBoundary[] = [];
  if (!cases.some((k) => k.name === RICH_SENTINEL)) return plan;
  const sme = cases.findIndex((k) => k.name.startsWith("w3-sme-"));
  const marking = cases.findIndex((k) => k.name.startsWith("w3-teacher-marking-"));
  if (sme >= 0) plan.push({ at: sme, stage: "accounts" });
  if (marking >= 0) plan.push({ at: marking, stage: "attempts" });
  return plan;
}

// Spawn the committed seed-t51-rich200.ts VERBATIM (the state builder the
// cases declare — zero copy, zero drift). Returns its ADMIN_TOKEN per the
// tool's declared stdout contract. Any staging failure is a fail-fast
// harness error: an unstaged replay would produce honest-but-worthless
// empty-vs-rich diffs (the exact run-37408914789 failure mode).
async function runRichStage(stage: "accounts" | "attempts"): Promise<string> {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl) {
    fail(
      `rich-200 family present but DATABASE_URL is not set — golden/tools/seed-t51-rich200.ts (the state the cases declare) cannot run; set DATABASE_URL to the disposable branch (fail-fast, never a degraded replay — T-MIG-063)`,
    );
  }
  const { spawnSync } = await import("node:child_process");
  const script = join(import.meta.dir, "seed-t51-rich200.ts");
  const r = spawnSync(
    process.execPath,
    [script, "--stage", stage, "--target", TARGET, "--database-url", dbUrl],
    { encoding: "utf8", timeout: 240_000, env: process.env },
  );
  if (r.error || r.status !== 0) {
    fail(
      `rich staging "${stage}" failed (status ${r.status}): ${(r.stderr ?? "").slice(-600) || String(r.error)}`,
    );
  }
  const admin = String(r.stdout ?? "").match(/ADMIN_TOKEN=(\S+)/)?.[1] ?? "";
  if (!admin) {
    fail(`rich staging "${stage}" produced no ADMIN_TOKEN (the tool's declared stdout contract)`);
  }
  console.log(`[ci-replay] rich staging "${stage}" complete (bootstrap-claimant admin bearer; role-faithful per T-MIG-051 run-003)`);
  return admin;
}

// ── token minting through the HONEST api surface (v2 tool verbatim) ──
async function ensureUser(
  email: string,
  password: string,
  displayName: string,
  role: "STUDENT" | "TEACHER",
): Promise<string> {
  const reg = await fetch(new URL("/api/v1/auth/register", TARGET), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      displayName,
      role,
      ...(role === "TEACHER" ? { joinCode: JOIN_CODE } : {}),
    }),
  });
  if (reg.status !== 201 && reg.status !== 409) {
    fail(`register ${email} failed: ${reg.status} ${await reg.text()}`);
  }
  const login = await fetch(new URL("/api/v1/auth/login", TARGET), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200) fail(`login ${email} failed: ${login.status}`);
  const body = (await login.json()) as { accessToken: string };
  return body.accessToken;
}

// ── response-header subset match — same semantics as golden/runner.ts checkHeaders ──
function checkHeaders(actual: Headers, expected: Record<string, string> | undefined): string | null {
  if (!expected) return null;
  const lower = new Map<string, string>();
  actual.forEach((value, key) => lower.set(key.toLowerCase(), value));
  for (const [name, want] of Object.entries(expected)) {
    const got = lower.get(name.toLowerCase());
    if (got === undefined) return `header ${name} missing (expected "${want}")`;
    if (got !== want) return `header ${name}: "${got}" vs expected "${want}"`;
  }
  return null;
}

async function replayOne(kase: GoldenCase, teacher: string, student: string, admin: string): Promise<CaseResult> {
  // Only cases that CARRY an Authorization header get one (capture-faithful);
  // its value is re-minted per route rule — {{TOKEN}} placeholders and the
  // committed scrubbed dummy alike (v2 tool model, corpus-wide).
  const headers: Record<string, string> = { "content-type": "application/json" };
  const hadAuth = Object.keys(kase.request?.headers ?? {}).some(
    (h) => h.toLowerCase() === "authorization",
  );
  if (hadAuth) {
    const bearer = routeRuleBearer(kase.name, kase.path, teacher, student, admin);
    if (bearer === "") {
      return {
        name: kase.name,
        mode: CASE_MODE,
        pass: false,
        diff: `harness error: ${kase.path} resolves to the ADMIN bearer but the rich staging provided none (T-MIG-063 fail-fast)`,
      };
    }
    headers["Authorization"] = `Bearer ${bearer}`;
  } else if (kase.request?.headers) {
    Object.assign(headers, kase.request.headers);
  }
  // T-MIG-063: bodyFile cases ship their declared file as ONE multipart part
  // through the gated runner builder (import-only); the content-type header
  // is dropped so fetch sets the boundary itself (the runner's exact
  // convention).
  let reqBody: BodyInit | undefined;
  if (kase.bodyFile) {
    delete headers["content-type"];
    try {
      reqBody = buildMultipartBody(kase);
    } catch (e) {
      return {
        name: kase.name,
        mode: CASE_MODE,
        pass: false,
        diff: `harness error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  } else {
    reqBody = kase.request?.body != null ? JSON.stringify(kase.request.body) : undefined;
  }
  let res: Response;
  try {
    res = await fetch(new URL(kase.path, TARGET), {
      method: kase.method,
      headers,
      body: reqBody,
    });
  } catch (e) {
    return { name: kase.name, mode: CASE_MODE, pass: false, diff: `harness error: target unreachable (${e instanceof Error ? e.message : String(e)})` };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = "<non-json>";
  }
  // Bun fetch quirk (T-MIG-022, recorded for R6): res.json() returns null for
  // 0-byte bodies; the wire is truly empty → normalize to the sentinel.
  if (body === null && JSON.stringify(kase.expect.body) === '"<non-json:0 bytes>"') body = "<non-json>";
  const statusOk = res.status === kase.expect.status;
  const bodyOk = statusOk && deepEqualTolerant(kase.expect.body, body, kase.tolerate ?? [], kase.unordered ?? []);
  const headerDiff = checkHeaders(res.headers, kase.expect.headers);
  if (statusOk && bodyOk && headerDiff === null) {
    return { name: kase.name, mode: CASE_MODE, pass: true };
  }
  const parts: string[] = [`status ${res.status} vs ${kase.expect.status}`];
  if (!bodyOk) {
    parts.push(
      `body ${JSON.stringify(body).slice(0, 400)} vs ${JSON.stringify(kase.expect.body).slice(0, 400)}`,
    );
  }
  if (headerDiff !== null) parts.push(headerDiff);
  return { name: kase.name, mode: CASE_MODE, pass: false, diff: parts.join("; ") };
}

async function runMode(reportOut?: string): Promise<CaseResult[]> {
  const cases = selectCases(CASE_MODE);
  console.log(`[ci-replay] CASE_MODE=${CASE_MODE} target=${TARGET} cases=${cases.length} (read-only replay; divergences are reported, never fixed)`);
  const PASSWORD = "Replay-Only-2026-x7k2"; // v2-tool verbatim convention
  const teacher = await ensureUser("user_20@example.invalid", PASSWORD, "User 20", "TEACHER");
  const student = await ensureUser("user_21@example.invalid", PASSWORD, "User 21", "STUDENT");
  console.log("[ci-replay] tokens minted (teacher+student) via /api/v1/auth");
  // T-MIG-063: the rich-200 family's staging boundaries fire inline — the
  // ingest cases remain the state builders (seq 10/11), the marking reads
  // replay against the staged tied attempts (seq 13+).
  const stages = richStagePlan(cases);
  if (stages.length > 0) {
    console.log(`[ci-replay] rich-200 staging plan: ${stages.map((s) => `${s.stage} @ ${cases[s.at]?.name}`).join(", ")} (state per the committed seed-t51-rich200.ts, verbatim)`);
  }
  let admin = "";
  const results: CaseResult[] = [];
  let pass = 0;
  for (let i = 0; i < cases.length; i++) {
    const boundary = stages.find((s) => s.at === i);
    if (boundary) {
      admin = await runRichStage(boundary.stage);
    }
    const kase = cases[i]!;
    const r = await replayOne(kase, teacher, student, admin);
    results.push(r);
    if (r.pass) {
      pass++;
      console.log(`PASS ${r.name}`);
    } else {
      console.log(`FAIL ${r.name}: ${r.diff}`);
    }
  }
  console.log(`\n${pass}/${cases.length} golden cases pass against ${TARGET} (CASE_MODE=${CASE_MODE})`);
  if (reportOut) {
    const fs = await import("node:fs");
    const path = await import("node:path");
    // T-MIG-047 (live finding, run 37355029779): the previous
    // new URL(".", "file://reports/seed.json") form parses "reports" as a
    // URL HOST, so the mkdir landed on "/" and the report write ENOENT'd —
    // the per-case evidence was lost exactly when the run was RED. Plain
    // path.dirname is the honest fix; the report must survive every verdict.
    fs.mkdirSync(path.dirname(path.resolve(reportOut)), { recursive: true });
    fs.writeFileSync(reportOut, JSON.stringify({ mode: CASE_MODE, target: TARGET, total: cases.length, pass, fail: cases.length - pass, results }, null, 2));
    console.log(`[ci-replay] report written: ${reportOut}`);
  }
  return results;
}

// --plan: deterministic posture split WITHOUT a target — proves the scoping
// (which cases each posture owns) is exactly the recorded doctrine; CI-checkable.
function plan(): void {
  const all = loadCases() as GoldenCase[];
  const seed = all.filter((k) => !REALDATA.test(k.name));
  const prod = all.filter((k) => REALDATA.test(k.name));
  const fam = (n: string) => (n.match(/^[a-z0-9]+(-[a-z0-9]+)?/) ?? [n])[0];
  console.log(`posture split (REALDATA=${REALDATA}) over ${all.length} committed cases:`);
  console.log(`  seed: ${seed.length}  prod: ${prod.length}  (disjoint: ${seed.length + prod.length === all.length})`);
  const byFam = (arr: GoldenCase[]) => {
    const m = new Map<string, number>();
    for (const k of arr) m.set(fam(k.name), (m.get(fam(k.name)) ?? 0) + 1);
    return [...m.entries()].sort().map(([f, n]) => `${f}:${n}`).join(" ");
  };
  console.log(`  seed families  → ${byFam(seed)}`);
  console.log(`  prod families  → ${byFam(prod)}`);
  console.log(`  seq'd stateful cases (run first, seq order): ${all.filter((k) => k.seq != null).map((k) => `${k.name}#${k.seq}`).join(", ")}`);
  console.log(`  cases with expect.headers: ${all.filter((k) => Object.keys(k.expect.headers ?? {}).length > 0).length}`);
  // T-MIG-063: disclose the rich-200 staging boundaries (deterministic —
  // computed from the seed posture's own case list; DATABASE_URL is
  // required at run time, fail-fast without it — never checked here, plan
  // stays target-free).
  const stages = richStagePlan(seed);
  console.log(`  rich-200 staging (T-MIG-063): ${stages.length === 0 ? "none — family absent" : stages.map((s) => `${s.stage} @ ${seed[s.at]?.name}`).join(", ")} (seed pass only; DATABASE_URL required at run time)`);
}

// --union: merge the two posture reports into the standing re-proof verdict.
async function union(aPath: string, bPath: string, summaryOut?: string): Promise<void> {
  const fs = await import("node:fs");
  const a = JSON.parse(fs.readFileSync(aPath, "utf8")) as { mode: string; results: CaseResult[] };
  const b = JSON.parse(fs.readFileSync(bPath, "utf8")) as { mode: string; results: CaseResult[] };
  const all = [...a.results, ...b.results];
  const fails = all.filter((r) => !r.pass);
  console.log(`\nUNION VERDICT: ${all.length - fails.length}/${all.length} golden cases pass (seed ${a.results.filter((r) => r.pass).length}/${a.results.length} + prod ${b.results.filter((r) => r.pass).length}/${b.results.length})`);
  if (fails.length > 0) {
    console.log("failures (FILED, not fixed — AGENT_COORDINATION §6):");
    for (const f of fails) console.log(`  - [${f.mode}] ${f.name}: ${f.diff}`);
  }
  if (summaryOut) {
    const lines = [
      `## Neon golden replay — union verdict: ${all.length - fails.length}/${all.length} PASS`,
      "",
      "| posture | pass | total |",
      "|---|---|---|",
      `| seed (apply-reset, non-realdata) | ${a.results.filter((r) => r.pass).length} | ${a.results.length} |`,
      `| prod (as-cowed, realdata) | ${b.results.filter((r) => r.pass).length} | ${b.results.length} |`,
      "",
      ...(fails.length
        ? ["<details><summary>failures (filed for R0/R6, never auto-fixed)</summary>", "", ...fails.map((f) => `- **[${f.mode}] ${f.name}** — ${f.diff}`), "</details>"]
        : ["All cases green."]),
    ];
    fs.writeFileSync(summaryOut, lines.join("\n") + "\n");
    console.log(`[ci-replay] union summary written: ${summaryOut}`);
  }
  process.exit(fails.length === 0 ? 0 : 1);
}

// --selftest: the T-MIG-063 extensions must prove themselves before any live
// replay (the runner's own selftest convention). Deterministic, zero network:
// rule precedence, boundary plan, multipart import wiring, spawn-arg shape.
function selftest(): number {
  let bad = 0;
  const t = (name: string, ok: boolean): void => {
    if (!ok) {
      bad++;
      console.error(`ci-replay selftest FAILED: ${name}`);
    }
  };
  const A = "admin-jwt";
  const T = "teacher-jwt";
  const S = "student-jwt";
  // 1. route-rule precedence (the run-37408914789 postures, decided exactly)
  t("admin path -> admin bearer", routeRuleBearer("w3-sme-status-admin-rich-200", "/api/v1/admin/question-bank/status", T, S, A) === A);
  t("ingest rich -> admin bearer", routeRuleBearer("w3-sme-ingest-rich-200", "/api/v1/admin/question-bank/ingest", T, S, A) === A);
  t("student NAME beats admin path (403 posture kept)", routeRuleBearer("w3-sme-status-student-403", "/api/v1/admin/question-bank/status", T, S, A) === S);
  t("teacher-403 NAME -> teacher bearer (role-faithful)", routeRuleBearer("w3-sme-status-teacher-403", "/api/v1/admin/question-bank/status", T, S, A) === T);
  t("unauthed NAME beats admin path (401 posture kept)", routeRuleBearer("w3-sme-status-unauthed-401", "/api/v1/admin/question-bank/status", T, S, A) === DUMMY);
  t("teacher path -> teacher", routeRuleBearer("w3-teacher-marking-queue-v2-rich-200", "/api/v1/teacher/marking/queue-v2", T, S, A) === T);
  t("default -> student", routeRuleBearer("auth-me-with-bearer-200", "/api/v1/auth/me", T, S, A) === S);
  t("admin path without staging -> empty (honest per-case error)", routeRuleBearer("w3-sme-ingest-rich-200", "/api/v1/admin/question-bank/ingest", T, S, "") === "");
  // 2. boundary plan on synthetic layouts
  const fake = (name: string, seq?: number): GoldenCase =>
    ({ name, method: "GET", path: "/", expect: { status: 200, body: null }, ...(seq !== undefined ? { seq } : {}) }) as GoldenCase;
  const rich = [
    fake("auth-register-success-201", 1),
    fake("auth-login-200", 3),
    fake("w3-sme-ingest-rich-200", 10),
    fake("w3-sme-ingest-replace-rich-200", 11),
    fake("w3-sme-status-admin-rich-200", 12),
    fake("w3-teacher-marking-queue-v2-rich-200", 13),
    fake("w3-teacher-marking-throughput-rich-200", 16),
    fake("w3-sme-status-teacher-403"), // non-seq: filename-order tail
  ];
  const p1 = richStagePlan(rich);
  t("plan: two boundaries", p1.length === 2);
  t("plan: accounts before the first w3-sme- case", p1[0]?.stage === "accounts" && p1[0]?.at === 2);
  t("plan: attempts before the first w3-teacher-marking- case", p1[1]?.stage === "attempts" && p1[1]?.at === 5);
  const p0 = richStagePlan([fake("auth-me-with-bearer-200"), fake("content-docs-teacher-realdata-200")]);
  t("plan: family absent -> no staging", p0.length === 0);
  const pSentinel = richStagePlan([fake("w3-sme-status-teacher-403")]); // 403s without the builder cases: sentinel governs
  t("plan: sentinel governs (no sentinel -> no staging even with family-named 403s)", pSentinel.length === 0);
  // 3. multipart import wiring (the gated runner builder, unchanged)
  const mf: GoldenCase = {
    name: "w3-sme-ingest-rich-200",
    method: "POST",
    path: "/api/v1/admin/question-bank/ingest",
    bodyFile: "files/t51-corpus.zip",
    multipart: { partName: "file", filename: "t51-corpus.zip", contentType: "application/zip" },
    expect: { status: 200, body: null },
  };
  let fd: FormData | null = null;
  try {
    fd = buildMultipartBody(mf);
  } catch {
    fd = null;
  }
  t("multipart: bodyFile builds a FormData via the runner import", fd !== null && fd.get("file") !== null);
  t(
    "multipart: fail-fast without the descriptor (never a silent JSON send)",
    (() => {
      try {
        buildMultipartBody({ ...mf, multipart: undefined });
        return false;
      } catch {
        return true;
      }
    })(),
  );
  console.log(bad === 0 ? "ci-replay selftest OK" : `ci-replay selftest FAILED (${bad} assertion(s))`);
  return bad;
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) {
  process.exit(selftest());
} else if (args.includes("--plan")) {
  plan();
} else if (args.includes("--union")) {
  const i = args.indexOf("--union");
  const a = args[i + 1];
  const b = args[i + 2];
  if (!a || !b) fail("--union requires two report paths");
  const si = args.indexOf("--summary-out");
  await union(a, b, si >= 0 ? args[si + 1] : undefined);
} else {
  const ri = args.indexOf("--report-out");
  const results = await runMode(ri >= 0 ? args[ri + 1] : undefined);
  // T-MIG-047: the recorded contract is "exits nonzero on ANY fail" — the
  // runMode path never propagated it (the contract was accidentally enforced
  // by the report-write crash this task fixes). Restore it explicitly; the
  // workflow's union step remains the single job gate.
  const failCount = results.filter((r) => !r.pass).length;
  console.log(`[ci-replay] exit ${failCount === 0 ? 0 : 1} (${failCount} fail(s))`);
  process.exit(failCount === 0 ? 0 : 1);
}
