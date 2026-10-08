/**
 * T-MIG-084 knowledge-tree golden-verify — leg replay harness (evidence-only).
 *
 * Serves apps/api/src/index.ts (working tree, zero code deltas over the
 * branch base) with the T-MIG-022 harness-owned envelope, CAPTURE posture +
 * ZERO-KEY law (no LLM credentials in env — asserted, exit 4).
 * Substrate: local scratch Postgres 17.11 user-tree (db syllabai_v2_verify,
 * pgvector 0.8.0) on 127.0.0.1:5433 — the T-MIG-014 dispatch rule puts any
 * non-neon host on postgres.js TCP. Zero prod / Neon contact.
 *
 * Legs (golden-captures/t-mig-084/, capture of record = r4b local-boot of
 * frozen core 6cad6ef, receipts/T-MIG-084/run-001-capture-r4b.json) — 8 legs:
 *   leg-01 GET nodes/{root} no-token   -> 401 Boot envelope
 *   leg-02 GET nodes/{root} ADMIN      -> 200 flat node (children [])
 *   leg-03 GET nodes/{root}/tree ADMIN -> 200 PART_OF subtree (11 nodes)
 *   leg-04 GET nodes/{root}/prerequisites ADMIN -> 200 []
 *   leg-05 GET nodes/{root}/misconceptions ADMIN -> 200 []
 *   leg-06 GET nodes/{unknown} ADMIN   -> 404 not_found (404-first law)
 *   leg-07 GET nodes/kn-1 ADMIN        -> 400 malformed (UUID_RE law)
 *   leg-08 GET nodes/{root}/tree LEARNER -> 200 (same tree body as leg-03)
 * Diffs vs captures: status + body deep-equal (envelope timestamp dropped —
 * the 082 run-003 method; order-insensitive canonical JSON). Header deltas
 * disclosed per-leg (api-wide default cache-posture class, 082 run-003).
 */
import app from "/home/z/my-project/repos/syllabai-v2/apps/api/src/index.ts";
import { JwtService } from "/home/z/my-project/repos/syllabai-v2/apps/api/src/services/identity/jwt";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.PORT ?? 8899);
const BASE = "http://127.0.0.1:" + PORT;
const CAP = "/home/z/my-project/repos/syllabai-v2/golden-captures/t-mig-084";
const ROOT = "00000000-0000-4000-8000-000000000001";

// ── ZERO-KEY boot law ──
const FORBIDDEN = Object.keys(process.env).filter((k) =>
  /^(GROQ|OPENROUTER|GEMINI).*API_KEY|SYLLABAI_(GROQ|GEMINI|OPENROUTER)_API_KEY$/i.test(k),
);
if (FORBIDDEN.length) {
  console.error("harness: ZERO-KEY law violated — LLM credentials present in env:", FORBIDDEN);
  process.exit(4);
}
console.log("harness: ZERO-KEY boot law asserted (no LLM credentials in env)");

Bun.serve({ port: PORT, idleTimeout: 60, fetch: app.fetch });
console.log(`harness: serving api on :${PORT}`);

// ── tokens (harness secret = boot secret; HS256 44+ byte law) ──
const SECRET = process.env.SYLLABAI_JWT_SECRET!;
const jwt = new JwtService(SECRET, "PT15M");
const tok = (id: string, email: string, roles: string[]) =>
  jwt.issueAccessToken({ id, email, tokenVersion: 1, roles });

const LEARNER = tok("08400000-0000-4000-8000-000000000001", "t084-learner@verify.local", ["STUDENT"]);
const ADMIN = tok("08400000-0000-4000-8000-000000000003", "t084-admin@verify.local", ["ADMIN"]);

// wait for boot
let up = false;
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(BASE + "/actuator/health"); if (r.ok) { up = true; break; } }
  catch { /* booting */ }
  await new Promise((r) => setTimeout(r, 500));
}
if (!up) { console.error("harness: api never came up"); process.exit(3); }

type Leg = { leg: string; method: string; path: string; status: number; body: unknown; response_headers?: Record<string, string> };
const LEGS: Record<string, Leg> = {};
for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
  const f = readFileSync(`${CAP}/leg-0${n}-${["node-no-token-401", "node-200", "tree-200", "prereq-200", "miscon-200", "node-unknown-404", "node-kn1-bad-uuid-400", "tree-learner-token-ok"][n - 1]}.json`, "utf8");
  LEGS[`leg-0${n}`] = JSON.parse(f);
}

// order-insensitive canonical JSON (GOLDEN_MASTER diff semantics)
function replacer(this: any, _k: string, v: any) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  return v;
}
const canon = (v: unknown) => JSON.stringify(v, replacer);
const norm = (b: any) => {
  if (b && typeof b === "object" && !Array.isArray(b) && "timestamp" in b) {
    const { timestamp, ...rest } = b;
    return rest;
  }
  return b;
};

const RESULTS: any[] = [];
async function runLeg(name: string, token?: string) {
  const leg = LEGS[name];
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(BASE + leg.path, { method: leg.method ?? "GET", headers });
  const rawText = await res.text();
  let body: any;
  try { body = JSON.parse(rawText); } catch { body = { __unparsed: rawText.slice(0, 200) }; }
  const statusMatch = res.status === leg.status;
  const bodyMatch = canon(norm(leg.body)) === canon(norm(body));
  const hDiffs: string[] = [];
  for (const [k, v] of Object.entries(leg.response_headers ?? {})) {
    const a = res.headers.get(k);
    if (a !== v) hDiffs.push(`${k}: capture=${v} actual=${a ?? "<absent>"}`);
  }
  RESULTS.push({
    leg: name,
    path: leg.path,
    expected_status: leg.status,
    actual_status: res.status,
    status_match: statusMatch,
    body_match: bodyMatch,
    header_diffs: hDiffs,
    actual_body: body,
    expected_body: leg.body,
  });
  console.log(
    `${name} [${leg.path}]: status ${res.status}/${leg.status} ${statusMatch ? "OK" : "MISMATCH"} | body ${bodyMatch ? "DEEP-EQUAL" : "DIFF"}` +
      (hDiffs.length ? ` | header-diffs: ${hDiffs.join("; ")}` : " | headers clean"),
  );
  if (!bodyMatch) {
    console.log(`   expected: ${JSON.stringify(norm(leg.body)).slice(0, 300)}`);
    console.log(`   actual  : ${JSON.stringify(norm(body)).slice(0, 300)}`);
  }
}

console.log("── replay ──");
await runLeg("leg-01");                 // anonymous
await runLeg("leg-02", ADMIN);
await runLeg("leg-03", ADMIN);
await runLeg("leg-04", ADMIN);
await runLeg("leg-05", ADMIN);
await runLeg("leg-06", ADMIN);
await runLeg("leg-07", ADMIN);
await runLeg("leg-08", LEARNER);

const pass = RESULTS.filter((r) => r.status_match && r.body_match).length;
console.log(`GOLDEN-VERIFY: ${pass}/8 ${pass === 8 ? "PASS" : "FAIL"}`);
await Bun.write("/home/z/build/t084-verify-results.json", JSON.stringify({ results: RESULTS, verdict: pass === 8 ? "PASS" : "FAIL" }, null, 1));
process.exit(pass === 8 ? 0 : 1);
