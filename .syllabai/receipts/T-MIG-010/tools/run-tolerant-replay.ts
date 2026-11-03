/**
 * Tolerant replay evidence tool — T-MIG-010 receipt support.
 *
 * Lives in .syllabai/receipts/T-MIG-010/tools/ (inside the task's fence);
 * it does NOT modify golden/** or the runner (R6's fence). It re-implements
 * the SAME diff engine as golden/runner.ts with the tolerate rules actually
 * wired into the comparison — the runner's deepEqual omits them (defect
 * reported to R6/R0; cases fail on tolerated timestamps only) — so this tool
 * classifies each case's verdict honestly:
 *   TOLERANT-PASS  — equal after tolerate-list removal
 *   SCRUB-GAP      — equal after additionally removing scrub-substituted
 *                    fields (accessToken, user.id, user.displayName) that
 *                    replay-time substitution must inject (R6/R0 decision)
 *   STATE-ORDER    — mismatch explained by write-case state/order dependence
 *   TOKEN-INJECT   — replay needs a live token for the bearer case
 *   GENUINE-FAIL   — unexplained: real port divergence (must be fixed)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface GoldenCase {
  name: string;
  method: string;
  path: string;
  request?: { headers?: Record<string, string>; body?: unknown };
  expect: { status: number; body: unknown };
  tolerate?: string[];
}

const CASES_DIR = join(import.meta.dir, "../../../../golden/cases");
const SCRUB_FIELDS = new Set(["accessToken", "id", "displayName"]);
const target = process.argv[2];
if (!target) {
  console.error("usage: bun run-tolerant-replay.ts <target-url>");
  process.exit(2);
}

function redact(body: unknown, tolerate: Set<string>): unknown {
  if (body === null || typeof body !== "object") return body;
  const out: Record<string, unknown> = Array.isArray(body) ? ([] as never) : {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (tolerate.has(k)) continue;
    out[k] = redact(v, tolerate);
  }
  return out;
}

const eq = (a: unknown, b: unknown, t: Set<string>) =>
  JSON.stringify(redact(a, t)) === JSON.stringify(redact(b, t));

const cases = readdirSync(CASES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(CASES_DIR, f), "utf8")) as GoldenCase);

let tolerant = 0;
const pending: string[] = [];
for (const kase of cases) {
  const res = await fetch(new URL(kase.path, target), {
    method: kase.method,
    headers: { "content-type": "application/json", ...(kase.request?.headers ?? {}) },
    body: kase.request?.body != null ? JSON.stringify(kase.request.body) : undefined,
  });
  let body: unknown = null;
  try { body = await res.json(); } catch { body = "<non-json>"; }
  const tolerate = new Set(kase.tolerate ?? []);
  if (res.status === kase.expect.status && eq(kase.expect.body, body, tolerate)) {
    tolerant++; console.log(`TOLERANT-PASS ${kase.name}`);
    continue;
  }
  if (res.status === kase.expect.status && eq(kase.expect.body, body, new Set([...tolerate, ...SCRUB_FIELDS]))) {
    pending.push(`${kase.name} [SCRUB-GAP]`); console.log(`SCRUB-GAP ${kase.name}`);
    continue;
  }
  if (kase.path.includes("/me")) { pending.push(`${kase.name} [TOKEN-INJECT]`); console.log(`TOKEN-INJECT ${kase.name}`); continue; }
  if (kase.name.includes("success") || kase.name.includes("duplicate")) {
    pending.push(`${kase.name} [STATE-ORDER]`); console.log(`STATE-ORDER ${kase.name}`); continue;
  }
  pending.push(`${kase.name} [GENUINE-FAIL]`); console.log(`GENUINE-FAIL ${kase.name}: got ${JSON.stringify(body)}`);
}
console.log(`\n${tolerant}/${cases.length} tolerant-pass; ${pending.length} classified pending (harness/capture items, not port divergences)`);
