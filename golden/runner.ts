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
 *   - arrays under keys listed in a case's `unordered` array compare as
 *     MULTISETS (element order ignored, duplicates preserved) — for surfaces
 *     whose frozen source reads rows with no ORDER BY (heap order is not
 *     law; T-MIG-036 implements the F-3 ruling, R0 verdict 5990536177)
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
  expect: { status: number; body: unknown; headers?: Record<string, string> };
  tolerate?: string[];
  // T-MIG-036 (F-3 re-pin): keys whose ARRAY values compare as multisets
  // (order-insensitive, duplicates preserved). Key-name scoped PER CASE —
  // same convention as `tolerate` — so annotating one case can never relax
  // another case's ordering pin. Data is never edited: the captured array
  // stays verbatim; only the comparator's sensitivity changes.
  unordered?: string[];
  // T-MIG-006: optional replay ordinal. Stateful (write-path) cases declare
  // a seq and run FIRST in seq order (register-success before duplicate /
  // login / me); all other cases follow in filename order. Absent seq = no
  // state claim. Replay still requires a fresh/reset db for write cases.
  seq?: number;
}

// T-MIG-006 bearer injection: a case may carry the {{TOKEN}} placeholder in
// a request header (e.g. "Authorization": "Bearer {{TOKEN}}"); --token
// substitutes it at replay time. Fail-fast: a placeholder without --token
// is a harness error, never a silent unauthenticated replay.
const TOKEN_PLACEHOLDER = "{{TOKEN}}";

function substituteToken(
  kase: GoldenCase,
  token: string | undefined,
): GoldenCase["request"] {
  const req = kase.request;
  if (!req?.headers) return req;
  const needsToken = Object.values(req.headers).some((v) =>
    v.includes(TOKEN_PLACEHOLDER),
  );
  if (!needsToken) return req;
  if (!token) {
    throw new Error(
      `${kase.name}: request carries ${TOKEN_PLACEHOLDER} but --token was not provided`,
    );
  }
  const headers = Object.fromEntries(
    Object.entries(req.headers).map(([k, v]) => [
      k,
      v.replaceAll(TOKEN_PLACEHOLDER, token),
    ]),
  );
  return { ...req, headers };
}

// T-MIG-006 (T-MIG-004 F-3): response-header comparison - subset match,
// case-insensitive header NAMES, exact VALUES (HTTP semantics). A missing
// actual header is a failure reported by name.
function checkHeaders(
  actual: Headers,
  expected: Record<string, string> | undefined,
): string | null {
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

const CASES_DIR = join(import.meta.dir, "cases");

export function loadCases(): GoldenCase[] {
  return readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(CASES_DIR, f), "utf8")) as GoldenCase)
    // T-MIG-006 replay-readiness: seq'd (stateful) cases run first in seq
    // order; the rest keep filename order after them. Stable sort.
    .sort((a, b) => {
      const sa = a.seq ?? Number.MAX_SAFE_INTEGER;
      const sb = b.seq ?? Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });
}

/**
 * Canonicalizer: drops `tolerate` keys (T-MIG-003) and multiset-canonicalizes
 * arrays under `unordered` keys (T-MIG-036). Both are key-name scoped per
 * case. Unordered arrays are sorted by each element's NORMALIZED serialization
 * — deterministic, nesting-safe, duplicates preserved (multiset, not set):
 * sorting happens AFTER children are themselves canonicalized, so tolerated
 * fields inside elements cannot destabilize the sort key.
 */
function normalize(
  body: unknown,
  tolerate: string[] = [],
  unordered: string[] = [],
): unknown {
  if (body === null || typeof body !== "object") return body;
  if (Array.isArray(body)) {
    return body.map((v) => normalize(v, tolerate, unordered));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (tolerate.includes(k)) continue;
    const nv = normalize(v, tolerate, unordered);
    if (unordered.includes(k) && Array.isArray(nv)) {
      // multiset canonical form: sort by the canonical serialization of each
      // (already normalized) element — order information deliberately discarded
      out[k] = nv
        .map((e) => JSON.stringify(e))
        .sort()
        .map((s) => JSON.parse(s) as unknown);
    } else {
      out[k] = nv;
    }
  }
  return out;
}

async function replayAgainst(
  target: string,
  kase: GoldenCase,
  token: string | undefined,
): Promise<string | null> {
  let req: GoldenCase["request"];
  try {
    req = substituteToken(kase, token);
  } catch (e) {
    // Fail-fast stays CASE-LOCAL: a {{TOKEN}} placeholder without --token
    // fails this case loudly and honestly, but must not abort the whole run.
    return `harness error: ${e instanceof Error ? e.message : String(e)}`;
  }
  const headers = {
    "content-type": "application/json",
    ...req?.headers,
  };
  let res: Response;
  try {
    res = await fetch(new URL(kase.path, target), {
      method: kase.method,
      headers,
      // T-MIG-003 run-002 hardening: a null body must mean ABSENT (GET cases
      // encode headers-only); JSON.stringify(null) would crash fetch on GET.
      // Construction only — the diff engine is untouched.
      body: kase.request?.body != null ? JSON.stringify(kase.request.body) : undefined,
    });
  } catch (e) {
    // Transport failures (target down, connection refused) are CASE-LOCAL
    // harness errors too: the run completes and classifies every case
    // instead of crashing on the first unreachable one.
    return `harness error: target unreachable (${e instanceof Error ? e.message : String(e)})`;
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = "<non-json>";
  }
  const statusOk = res.status === kase.expect.status;
  // Tolerate wiring provenance: the replay-path defect (deepEqual dropped
  // kase.tolerate; deepEqualTolerant was selftest-only) was fixed
  // independently TWICE - by this lane's runner kit (T-MIG-007, authored
  // 06:24Z under the original T-MIG-006 claim) and by R0 merge-intake on
  // T-MIG-016 (PR #25). This kit subsumes the #25 one-line fix and extends
  // it with expect.headers comparison + structured failure diffs.
  const bodyOk = deepEqualTolerant(
    kase.expect.body,
    body,
    kase.tolerate ?? [],
    kase.unordered ?? [],
  );
  const headerDiff = checkHeaders(res.headers, kase.expect.headers);
  if (statusOk && bodyOk && headerDiff === null) return null;
  const parts = [`status ${res.status} vs ${kase.expect.status}`];
  if (!bodyOk) parts.push(`body ${JSON.stringify(body)} vs ${JSON.stringify(kase.expect.body)}`);
  if (headerDiff !== null) parts.push(headerDiff);
  return parts.join("; ");
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
  // T-MIG-006: header-subset engine coverage (closes T-MIG-004 F-3)
  const h = new Headers({ "x-search-empty-cause": "SCOPE_UNRESOLVED" });
  if (checkHeaders(h, { "X-Search-Empty-Cause": "SCOPE_UNRESOLVED" }) !== null) {
    console.error("selftest FAILED: header subset should pass (case-insensitive)");
    return 1;
  }
  if (checkHeaders(h, { "X-Missing": "v" }) === null) {
    console.error("selftest FAILED: missing expected header should fail");
    return 1;
  }
  if (checkHeaders(h, { "X-Search-Empty-Cause": "OTHER" }) === null) {
    console.error("selftest FAILED: header value mismatch should fail");
    return 1;
  }
  if (checkHeaders(h, undefined) !== null) {
    console.error("selftest FAILED: absent expectation must not constrain");
    return 1;
  }
  // T-MIG-036: multiset comparator coverage (F-3 re-pin engine law)
  const va = {
    paper: { id: "p1" },
    versions: [
      { versionId: "v2", marks: 3, ts: "x" },
      { versionId: "v1", marks: 5, ts: "y" },
    ],
  };
  const vb = {
    paper: { id: "p1" },
    versions: [
      { versionId: "v1", marks: 5, ts: "z" },
      { versionId: "v2", marks: 3, ts: "w" },
    ],
  };
  if (!deepEqualTolerant(va, vb, ["ts"], ["versions"])) {
    console.error("selftest FAILED: multiset reorder should pass (with tolerate composing)");
    return 1;
  }
  if (deepEqualTolerant(
    { versions: [1, 1, 2] },
    { versions: [1, 2, 2] },
    [],
    ["versions"],
  )) {
    console.error("selftest FAILED: multiset must preserve duplicates (not a set)");
    return 1;
  }
  if (deepEqualTolerant({ versions: [1, 2] }, { versions: [2, 1] }, [], [])) {
    console.error("selftest FAILED: order must still matter without the annotation");
    return 1;
  }
  if (!deepEqualTolerant(
    { versions: [{ a: 1, b: 2 }, { a: 3, b: 4 }] },
    { versions: [{ a: 3, b: 4 }, { a: 1, b: 2 }] },
    [],
    ["versions"],
  )) {
    console.error("selftest FAILED: nested-object multiset reorder should pass");
    return 1;
  }
  if (deepEqualTolerant(
    { versions: [{ a: 1 }, { a: 2 }] },
    { versions: [{ a: 1 }, { a: 3 }] },
    [],
    ["versions"],
  )) {
    console.error("selftest FAILED: multiset must still fail on real content diffs");
    return 1;
  }
  console.log("selftest OK: tolerance engine behaves");
  return 0;
}

function deepEqualTolerant(
  a: unknown,
  b: unknown,
  tolerate: string[],
  unordered: string[] = [],
): boolean {
  return (
    JSON.stringify(normalize(a, tolerate, unordered)) ===
    JSON.stringify(normalize(b, tolerate, unordered))
  );
}

// ---- main ----
const args = process.argv.slice(2);

if (args.includes("--selftest")) {
  process.exit(selftest());
}

if (args.includes("--target")) {
  const target = args[args.indexOf("--target") + 1];
  const token = args.includes("--token") ? args[args.indexOf("--token") + 1] : undefined;
  const cases = loadCases();
  let failures = 0;
  for (const kase of cases) {
    // R0 fix (merged via PR #25 as T-MIG-016, re-attributed to T-MIG-017 by
    // R0 intake 008d64c): the live-replay path must apply each case's
    // `tolerate` rules exactly like the selftest does. This lane's kit
    // delivers the same fix (see provenance note inside replayAgainst) plus
    // seq/token support - the 3-arg call below is the subsuming form.
    const diff = await replayAgainst(target, kase, token);
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

console.log("usage: bun golden/runner.ts (--selftest | --target <url> [--token <jwt>])");
process.exit(1);
