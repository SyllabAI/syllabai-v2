/**
 * Golden-master runner — the migration's parity gate (docs/GOLDEN_MASTER.md).
 *
 * A golden case is a recorded request/response pair captured from the
 * FROZEN Java core:
 *   { name, method, path, request?: {headers?, body?}, expect: {status, body} }
 *
 * Modes:
 *   --selftest   sanity-run of the engine + committed static cases
 *                (no live target; CI lane, always green by construction)
 *   --target URL replay every case against the v2 api and diff
 *                status + body (deep, with tolerance rules)
 *
 * Tolerance rules (what is NOT compared byte-for-byte):
 *   - fields listed in a case's `tolerate` array (timestamps, uuids, tokens)
 *   - LLM-dependent surfaces are NEVER golden-gated (nondeterministic);
 *     they get behavioural/eval gates instead (see docs/MIGRATION_PLAN.md §Risks)
 *
 * Capture discipline: fixtures are scrubbed (no pilot PII — emails/names
 * masked deterministically so diffs stay stable) before they are committed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface GoldenCase {
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  request?: { headers?: Record<string, string>; body?: unknown };
  expect: { status: number; body: unknown };
  tolerate?: string[];
}

const CASES_DIR = join(import.meta.dir, "cases");

export function loadCases(): GoldenCase[] {
  return readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(CASES_DIR, f), "utf8")) as GoldenCase);
}

function redact(body: unknown, tolerate: string[] = []): unknown {
  if (body === null || typeof body !== "object") return body;
  const out: Record<string, unknown> = Array.isArray(body) ? ([] as never) : {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (tolerate.includes(k)) continue;
    out[k] = redact(v, tolerate);
  }
  return out;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(redact(a)) === JSON.stringify(redact(b));
}

async function replayAgainst(target: string, kase: GoldenCase): Promise<string | null> {
  const res = await fetch(new URL(kase.path, target), {
    method: kase.method,
    headers: { "content-type": "application/json", ...(kase.request?.headers ?? {}) },
    // T-MIG-003 run-002 hardening: a null body must mean ABSENT (GET cases
    // encode headers-only); JSON.stringify(null) would crash fetch on GET.
    // Construction only — the diff engine is untouched.
    body: kase.request?.body != null ? JSON.stringify(kase.request.body) : undefined,
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = "<non-json>";
  }
  const statusOk = res.status === kase.expect.status;
  const bodyOk = deepEqualTolerant(kase.expect.body, body, kase.tolerate ?? []);
  if (statusOk && bodyOk) return null;
  return `status ${res.status} vs ${kase.expect.status}; body ${JSON.stringify(body)} vs ${JSON.stringify(kase.expect.body)}`;
}

// ---- engine self-test: the engine must prove ITSELF before gating anything ----
function selftest(): number {
  const a = { x: 1, ts: "2026-01-01", nested: { y: 2, id: "uuid-1" } };
  const b = { x: 1, ts: "2099-12-31", nested: { y: 2, id: "uuid-2" } };
  if (!deepEqualTolerant(a, b, ["ts", "id"])) {
    console.error("selftest FAILED: tolerant diff should pass");
    return 1;
  }
  if (deepEqualTolerant({ x: 1 }, { x: 2 }, [])) {
    console.error("selftest FAILED: real diff should fail");
    return 1;
  }
  console.log("selftest OK: tolerance engine behaves");
  return 0;
}

function deepEqualTolerant(a: unknown, b: unknown, tolerate: string[]): boolean {
  return JSON.stringify(redact(a, tolerate)) === JSON.stringify(redact(b, tolerate));
}

// ---- main ----
const args = process.argv.slice(2);

if (args.includes("--selftest")) {
  process.exit(selftest());
}

if (args.includes("--target")) {
  const target = args[args.indexOf("--target") + 1];
  const cases = loadCases();
  let failures = 0;
  for (const kase of cases) {
    // R0 fix (T-MIG-017): the live-replay path must apply each case's
    // `tolerate` rules exactly like the selftest does. The previous code
    // used the byte-strict deepEqual here, making every case with a
    // volatile field (e.g. ApiError.timestamp) permanently unpassable —
    // the false-failure mirror of the false-confidence trap §5 warns about.
    const diff = await replayAgainst(target, kase);
    if (diff) {
      failures++;
      console.error(`FAIL ${kase.name}: ${diff}`);
    } else {
      console.log(`PASS ${kase.name}`);
    }
  }
  console.log(`\n${cases.length - failures}/${cases.length} golden cases pass against ${target}`);
  process.exit(failures === 0 ? 0 : 1);
}

console.log("usage: bun golden/runner.ts (--selftest | --target <url>)");
process.exit(1);
