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
 *   - arrays at body paths listed in a case's `unordered` array are compared
 *     as MULTISETS — same elements after tolerate redaction, any order
 *     (T-MIG-024 / R0-SWEEP-2 F-3 ruling: captures that pinned unspecified
 *     DB heap order; declared relaxation only, never silent — GOLDEN_MASTER §5)
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
  // T-MIG-024 (operator queue W2-F3, R0-SWEEP-2 F-3 ruling): body-root-
  // relative dotted paths whose ARRAY values are compared as MULTISETS
  // (same elements, any order). Declared relaxation only — every undeclared
  // array, including arrays INSIDE a declared array's elements, keeps
  // strict order (§7: no silent widening).
  unordered?: string[];
  // T-MIG-006: optional replay ordinal. Stateful (write-path) cases declare
  // a seq and run FIRST in seq order (register-success before duplicate /
  // login / me); all other cases follow in filename order. Absent seq = no
  // state claim. Replay still requires a fresh/reset db for write cases.
  seq?: number;
  // T-MIG-051 (N-4 rich-200 capture): multipart request bodies. The case
  // names a FILE under cases/files/ (the flat, non-recursive loader never
  // picks it up as a case) shipped as ONE multipart part — the SME ingest's
  // 'file' part (SmeQuestionAdminController @RequestPart). fetch builds the
  // multipart envelope and sets the boundary content-type itself; the diff
  // engine is untouched. Declared-scope engine change, selftest-covered.
  bodyFile?: string;
  multipart?: { partName: string; filename: string; contentType?: string };
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

function redact(body: unknown, tolerate: string[] = []): unknown {
  if (body === null || typeof body !== "object") return body;
  const out: Record<string, unknown> = Array.isArray(body) ? ([] as never) : {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (tolerate.includes(k)) continue;
    out[k] = redact(v, tolerate);
  }
  return out;
}

/**
 * T-MIG-051: build the multipart body for a bodyFile case — one part, the
 * file's bytes under the case's partName/filename. Exported for selftest.
 * Fail-fast: a bodyFile case without a multipart descriptor is a harness
 * error for that case, never a silent JSON send.
 */
export function buildMultipartBody(kase: GoldenCase): FormData {
  if (!kase.bodyFile || !kase.multipart) {
    throw new Error(`${kase.name}: bodyFile requires a multipart descriptor`);
  }
  const bytes = readFileSync(join(CASES_DIR, kase.bodyFile));
  const form = new FormData();
  form.append(
    kase.multipart.partName,
    new Blob([bytes], { type: kase.multipart.contentType ?? "application/octet-stream" }),
    kase.multipart.filename,
  );
  return form;
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
  let reqBody: BodyInit | undefined;
  const headers: Record<string, string> = { ...req?.headers };
  if (kase.bodyFile) {
    // T-MIG-051: multipart case — fetch sets the boundary content-type;
    // a manual content-type here would strip it.
    try {
      reqBody = buildMultipartBody(kase);
    } catch (e) {
      return `harness error: ${e instanceof Error ? e.message : String(e)}`;
    }
  } else {
    headers["content-type"] = headers["content-type"] ?? "application/json";
    // T-MIG-003 run-002 hardening: a null body must mean ABSENT (GET cases
    // encode headers-only); JSON.stringify(null) would crash fetch on GET.
    // Construction only — the diff engine is untouched.
    reqBody = kase.request?.body != null ? JSON.stringify(kase.request.body) : undefined;
  }
  let res: Response;
  try {
    res = await fetch(new URL(kase.path, target), {
      method: kase.method,
      headers,
      body: reqBody,
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
  // T-MIG-051: multipart body construction — the SME ingest 'file' part.
  // The engine must prove the bodyFile path before any live ingest replay
  // trusts it: right part name, right filename, byte-exact size, and the
  // fail-fast when a bodyFile case lacks its multipart descriptor.
  try {
    const zipPath = join(CASES_DIR, "files", "t51-corpus.zip");
    const expected = readFileSync(zipPath).byteLength;
    const form = buildMultipartBody({
      name: "selftest-multipart",
      method: "POST",
      path: "/api/v1/admin/question-bank/ingest",
      bodyFile: "files/t51-corpus.zip",
      multipart: { partName: "file", filename: "t51-corpus.zip", contentType: "application/zip" },
      expect: { status: 200, body: null },
    } as unknown as GoldenCase);
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.name !== "t51-corpus.zip" ||
      file.size !== expected
    ) {
      console.error("selftest FAILED: multipart body construction (file/name/size)");
      return 1;
    }
    try {
      buildMultipartBody({
        name: "selftest-multipart-bad",
        method: "POST",
        path: "/x",
        bodyFile: "files/t51-corpus.zip",
        expect: { status: 200, body: null },
      } as unknown as GoldenCase);
      console.error("selftest FAILED: bodyFile without multipart descriptor must throw");
      return 1;
    } catch {
      // expected
    }
  } catch (e) {
    console.error("selftest FAILED: multipart construction threw:", e);
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
  // T-MIG-024 (W2-F3): declared-unordered multiset engine coverage.
  const mvA = {
    paper: { id: "p1" },
    versions: [
      { ref: "q1", marks: 5 },
      { ref: "q2", marks: 8 },
    ],
  };
  const mvB = {
    paper: { id: "p1" },
    versions: [
      { ref: "q2", marks: 8 },
      { ref: "q1", marks: 5 },
    ],
  };
  if (!deepEqualTolerant(mvA, mvB, [], ["versions"])) {
    console.error("selftest FAILED: same multiset, different order should pass under declared unordered");
    return 1;
  }
  if (deepEqualTolerant(mvA, mvB, [])) {
    console.error("selftest FAILED: order diff must fail when NO unordered is declared");
    return 1;
  }
  const mvC = { ...mvB, versions: [...mvB.versions, { ref: "q3", marks: 2 }] };
  if (deepEqualTolerant(mvA, mvC, [], ["versions"])) {
    console.error("selftest FAILED: different multiset must fail even under declared unordered");
    return 1;
  }
  if (
    !deepEqualTolerant(
      { versions: [{ ref: "q1", ts: "t1" }] },
      { versions: [{ ref: "q1", ts: "t2" }] },
      ["ts"],
      ["versions"],
    )
  ) {
    console.error("selftest FAILED: tolerate and unordered must compose");
    return 1;
  }
  const ordA = { versions: [{ ref: "q1" }], options: ["a", "b"] };
  const ordB = { versions: [{ ref: "q1" }], options: ["b", "a"] };
  if (deepEqualTolerant(ordA, ordB, [], ["versions"])) {
    console.error("selftest FAILED: order diff at a NON-declared sibling path must still fail");
    return 1;
  }
  if (
    !deepEqualTolerant(
      { paper: { questions: [1, 2, 3] } },
      { paper: { questions: [3, 2, 1] } },
      [],
      ["paper.questions"],
    )
  ) {
    console.error("selftest FAILED: dotted unordered path should apply");
    return 1;
  }
  console.log("selftest OK: tolerance engine behaves (incl. declared-unordered multiset — T-MIG-024)");
  return 0;
}

export function deepEqualTolerant(
  a: unknown,
  b: unknown,
  tolerate: string[],
  unordered: string[] = [],
): boolean {
  const ra = redact(a, tolerate);
  const rb = redact(b, tolerate);
  if (unordered.length === 0) {
    return JSON.stringify(ra) === JSON.stringify(rb);
  }
  return (
    JSON.stringify(canonicalizeUnordered(ra, unordered, "")) ===
    JSON.stringify(canonicalizeUnordered(rb, unordered, ""))
  );
}

// T-MIG-024 (W2-F3 / R0-SWEEP-2 F-3 ruling): canonicalize declared-unordered
// arrays into multiset form — each element is serialized (post-redaction)
// and the array sorted, so "same elements, any order" compares equal while
// element identity stays exact. Only the DECLARED dotted paths relax
// ordering; arrays nested inside a declared array's elements keep strict
// order. An undeclared path has no effect. Exported for golden/tools.
function canonicalizeUnordered(value: unknown, unordered: string[], path: string): unknown {
  if (Array.isArray(value)) {
    const arr = value.map((e) => canonicalizeUnordered(e, unordered, `${path}[]`));
    if (unordered.includes(path)) {
      return arr
        .map((e) => JSON.stringify(e))
        .sort()
        .map((s) => JSON.parse(s) as unknown);
    }
    return arr;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = canonicalizeUnordered(v, unordered, path ? `${path}.${k}` : k);
    }
    return out;
  }
  return value;
}

// ---- main ----
// import.meta.main guard (T-MIG-024): golden/tools/* import the comparator
// from this file; the CLI main must stay inert on import, byte-identical
// when run directly.
if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.includes("--selftest")) {
    process.exit(selftest());
  }

  if (args.includes("--target")) {
    const target = args[args.indexOf("--target") + 1];
    const token = args.includes("--token") ? args[args.indexOf("--token") + 1] : undefined;
    // T-MIG-051: optional name-substring filter — a family-scoped live replay
    // (the t51 rich-200 family needs only its seed state) without touching
    // loadCases or the diff engine. Undeclared = every case (unchanged).
    const filterIdx = args.indexOf("--filter");
    const filter = filterIdx >= 0 ? args[filterIdx + 1] : undefined;
    const all = loadCases();
    const cases = filter ? all.filter((k) => k.name.includes(filter)) : all;
    let failures = 0;
    for (const kase of cases) {
      // R0 fix (merged via PR #25 as T-MIG-016, re-attributed to T-MIG-017 by
      // R0 intake 008d64c): the live-replay path must apply each case's
      // `tolerate` rules exactly like the selftest does. This lane's kit
      // delivers the same fix (see provenance note inside replayAgainst) plus
      // seq/token support - the call below is the subsuming form (now incl.
      // the T-MIG-024 declared-unordered arg).
      const diff = await replayAgainst(target, kase, token);
      if (diff) {
        failures++;
        console.error(`FAIL ${kase.name}: ${diff}`);
      } else {
        console.log(`PASS ${kase.name}`);
      }
    }
    console.log(`\n${cases.length - failures}/${cases.length} golden cases pass against ${target}${filter ? ` (filter: ${filter})` : ""}`);
    process.exit(failures === 0 ? 0 : 1);
  }

  console.log("usage: bun golden/runner.ts (--selftest | --target <url> [--token <jwt>] [--filter <name-substring>])");
  process.exit(1);
}
