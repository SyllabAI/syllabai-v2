/**
 * T-MIG-040-PREP replay-readiness checker (golden/tools/w4-readiness.ts).
 *
 * W4 learner-surface + decay-math golden tranche (57 w4-* cases: 22 Render
 * authz-shell + 35 LOCAL frozen-core boot). Mirrors the T-MIG-024
 * reorder-check.ts precedent: a committed, runnable instrument that proves
 * the tranche is READY for the future port lane to replay — before any
 * port code exists.
 *
 * Run: bun golden/tools/w4-readiness.ts   (exit 0 = ready)
 *
 * Checks:
 *   1. inventory: every w4 case parses and carries the schema fields the
 *      runner requires (name/method/path/expect.status+body).
 *   2. auth posture: every case against /api/v1/learners/me/** must carry
 *      the {{TOKEN}} placeholder EXCEPT the pre-auth authz-shell 401s and
 *      the register/login pair (those mint the token, seq 1/2).
 *   3. statefulness: write-shaped cases declare seq (runner T-MIG-006
 *      contract: seq cases run first, in seq order, fresh db required).
 *   4. tolerance hygiene: no per-boot uuid/instant field survives WITHOUT
 *      a tolerate declaration (the decay/read-model bodies embed
 *      now-dependent numerics — tolerated + formula-disclosed, never
 *      silently pinned).
 *   5. decay-determinism note: the tranche pins the deterministic core of
 *      ADR-031 (streak/intervalDays/tau bands/floor) while tolerating the
 *      anchor-clock-dependent values; the law is restated below so the
 *      port lane can recompute instead of guess.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CASES_DIR = join(import.meta.dir, "..", "cases");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
// replay-stable seed uuids (V6/V7/V63) — these are pinned, never tolerated
const SEED_PREFIXES = ["0a000000", "10000000", "20000000", "30000000", "40000000", "41000000", "00000000"];

interface GoldenCase {
  name: string;
  method: string;
  path: string;
  request?: { headers?: Record<string, string>; body?: unknown };
  expect: { status: number; body: unknown };
  tolerate?: string[];
  seq?: number;
  description?: string;
}

const failures: string[] = [];
const w4: GoldenCase[] = [];

const files = readdirSync(CASES_DIR).filter((f) => f.startsWith("w4-")).sort();
for (const f of files) {
  try {
    const parsed = JSON.parse(readFileSync(join(CASES_DIR, f), "utf8")) as GoldenCase;
    w4.push(parsed);
    if (!parsed.name || !parsed.method || !parsed.path) failures.push(`${f}: missing name/method/path`);
    if (!parsed.expect || typeof parsed.expect.status !== "number" || !("body" in parsed.expect))
      failures.push(`${f}: expect.status/expect.body missing`);
  } catch (e) {
    failures.push(`${f}: unparseable JSON (${String(e)})`);
  }
}

function walk(obj: unknown, visit: (key: string, value: unknown) => void, key?: string): void {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) walk(v, visit, k);
  } else if (Array.isArray(obj)) {
    for (const v of obj) walk(v, visit, key);
  } else if (key) {
    visit(key, obj);
  }
}

function isPerBoot(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (INSTANT_RE.test(value)) return true;
  if (UUID_RE.test(value) && !SEED_PREFIXES.some((p) => value.toLowerCase().startsWith(p))) return true;
  return false;
}

let authed = 0;
let preAuth = 0;
let stateful = 0;
const routeMatrix = new Map<string, Set<string>>();

for (const kase of w4) {
  const needsToken = (kase.request?.headers?.Authorization ?? "").includes("{{TOKEN}}");
  const learnerSurface = kase.path.startsWith("/api/v1/learners/me/");
  const identityCase = kase.path === "/api/v1/auth/register" || kase.path === "/api/v1/auth/login";

  // check 2 — auth posture
  if (identityCase) {
    if (kase.seq === undefined) failures.push(`${kase.name}: identity case must declare seq (1/2)`);
  } else if (kase.expect.status === 401) {
    preAuth++;
    if (needsToken) failures.push(`${kase.name}: pre-auth 401 case must NOT carry {{TOKEN}}`);
  } else if (learnerSurface || kase.path === "/api/v1/attempts") {
    authed++;
    if (!needsToken) failures.push(`${kase.name}: authed learner case must carry Bearer {{TOKEN}}`);
  }

  // check 3 — statefulness. Only write-shaped cases whose request actually
  // REACHED persistence (2xx) mutate state; 401 (filter chain stopped it),
  // 400 (validation before persistence) and 404 (existence before mutation)
  // never touch state — matching the w2/w3 precedent where only successful
  // writes carry seq.
  const writeShaped = ["POST", "PUT", "PATCH", "DELETE"].includes(kase.method) && !identityCase;
  const stateMutating = writeShaped && kase.expect.status >= 200 && kase.expect.status < 300;
  if (stateMutating || kase.seq !== undefined) {
    if (kase.seq !== undefined) stateful++;
    else failures.push(`${kase.name}: state-mutating case must declare seq (fresh-db replay contract)`);
  }

  // check 4 — tolerance hygiene
  const tolerate = new Set(kase.tolerate ?? []);
  walk(kase.expect.body, (key, value) => {
    if (isPerBoot(value) && !tolerate.has(key))
      failures.push(`${kase.name}: per-boot field "${key}" not tolerated (replay would false-fail)`);
  });

  // route matrix
  const surface = kase.path.split("?")[0].replace(/\/[0-9a-f-]{36}/g, "/{id}");
  if (!routeMatrix.has(surface)) routeMatrix.set(surface, new Set());
  routeMatrix.get(surface)!.add(`${kase.method}:${kase.expect.status}`);
}

// report
console.log(`W4 tranche: ${w4.length} cases (authed ${authed}, pre-auth ${preAuth}, seq-declared ${stateful})`);
console.log("\nroute x posture matrix:");
for (const [route, cells] of [...routeMatrix.entries()].sort()) {
  console.log(`  ${route}  ->  ${[...cells].sort().join(", ")}`);
}
console.log("\nreplay prerequisites (port lane, when wave-4 ports land):");
console.log("  1. fresh/reseeded db (flyway V1..V63-equivalent v2 migrations) — seq cases carry state");
console.log("  2. mint {{TOKEN}} by replaying w4-register-learner-201 (seq 1) + w4-login-learner-200 (seq 2)");
console.log("     and passing --token; the runner substitutes the placeholder (T-MIG-006 contract)");
console.log("  3. deterministic decay law (ADR-031) the port must implement, restated:");
console.log("     P(t) = P0 * e^(-t/tau); tau 30/90/365 days by band (<0.45, >=0.8); floor 0.1;");
console.log("     reviewBelow 0.6; nanosecond precision; recomputed from the anchor on every call,");
console.log("     never persisted. FlashcardReviewScheduler: derived-never-stored; streak = trailing");
console.log("     KNOW run; dueAt = latest occurred_at + intervalDays(streak); due = !now.isBefore(dueAt).");
console.log("     The tranche pins streak/intervalDays/nodeId/codes strictly and tolerates the");
console.log("     anchor-clock-dependent fields (lastRatedAt/dueAt/due/nextDueAt/mastery numerics).");
console.log("  4. captured-as-is quirks (divergence calls belong to R0, never fixed in-pass):");
console.log("     F-e dotted-anchor 400 (rating DTO @Pattern forbids the seed code's dot);");
console.log("     intervention unknown-run 400-before-404 (F-c family).");
console.log("");

if (failures.length > 0) {
  console.log(`NOT READY — ${failures.length} finding(s):`);
  for (const f of failures) console.log("  !! " + f);
  process.exit(1);
}
console.log(`W4 replay-readiness: READY (${w4.length} cases, 0 findings)`);
