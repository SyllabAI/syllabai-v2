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
 */
import { loadCases, deepEqualTolerant } from "../runner.ts";

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
function routeRuleBearer(name: string, path: string, teacher: string, student: string): string {
  if (name.includes("unauthed")) return DUMMY; // invalid bearer → anonymous → 401 parity
  if (name.includes("student")) return student; // 403-parity probes: STUDENT on teacher routes
  if (path.includes("/api/v1/teacher/")) return teacher;
  return student;
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

async function replayOne(kase: GoldenCase, teacher: string, student: string): Promise<CaseResult> {
  // Only cases that CARRY an Authorization header get one (capture-faithful);
  // its value is re-minted per route rule — {{TOKEN}} placeholders and the
  // committed scrubbed dummy alike (v2 tool model, corpus-wide).
  const headers: Record<string, string> = { "content-type": "application/json" };
  const hadAuth = Object.keys(kase.request?.headers ?? {}).some(
    (h) => h.toLowerCase() === "authorization",
  );
  if (hadAuth) {
    headers["Authorization"] = `Bearer ${routeRuleBearer(kase.name, kase.path, teacher, student)}`;
  } else if (kase.request?.headers) {
    Object.assign(headers, kase.request.headers);
  }
  let res: Response;
  try {
    res = await fetch(new URL(kase.path, TARGET), {
      method: kase.method,
      headers,
      body: kase.request?.body != null ? JSON.stringify(kase.request.body) : undefined,
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
  const results: CaseResult[] = [];
  let pass = 0;
  for (const kase of cases) {
    const r = await replayOne(kase, teacher, student);
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

const args = process.argv.slice(2);
if (args.includes("--plan")) {
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
