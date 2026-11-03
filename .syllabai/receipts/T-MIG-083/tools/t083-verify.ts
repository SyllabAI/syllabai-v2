/**
 * T-MIG-083 admin revision-notes golden-verify — leg replay harness (evidence-only).
 *
 * Serves apps/api/src/index.ts (working tree @ main 23c22e2 + any rider deltas)
 * with the T-MIG-022 harness-owned envelope, CAPTURE posture + ZERO-KEY law:
 *   SYLLABAI_LLM_MODE irrelevant (family is LLM-free), NO LLM credentials in env.
 * Substrate: local scratch Postgres 17.11 user-tree (db syllabai_v2_verify) —
 * the T-MIG-014 dispatch rule puts any non-neon host on postgres.js TCP.
 * Zero prod / Neon contact; the DB holds only harness-seeded synthetic users.
 *
 * Legs (golden-captures/t-mig-083/, capture of record = r4b local-boot of frozen
 * core 6cad6ef, receipts/T-MIG-083/run-001-capture-r4b.json):
 *   leg-01 POST ingest no-token          -> 401 Boot envelope
 *   leg-02 POST ingest STUDENT           -> 403
 *   leg-03 POST ingest TEACHER           -> 403
 *   leg-04 POST ingest ADMIN multipart-without-file-part -> capture 500
 *   leg-05 POST ingest ADMIN zip-without-package.json    -> 400
 *   leg-06 GET  status ADMIN             -> 200 empty-state shape
 *   leg-07 GET  status TEACHER           -> 403
 *   leg-08 GET  status no-token          -> 401
 * Diffs vs captures: status + body deep-equal (envelope timestamp normalized,
 * the 082 run-003 method; order-insensitive canonical JSON). Header deltas
 * disclosed per-leg (api-wide default cache-posture class, 082 run-003 finding).
 */
import app from "/home/z/my-project/syllabai-v2/apps/api/src/index.ts";
import { JwtService } from "/home/z/my-project/syllabai-v2/apps/api/src/services/identity/jwt";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.PORT ?? 8898);
const BASE = "http://127.0.0.1:" + PORT;
const CAP = "/home/z/my-project/syllabai-v2/golden-captures/t-mig-083";

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

const LEARNER = tok("08300000-0000-4000-8000-000000000001", "t083-learner@verify.local", ["STUDENT"]);
const TEACHER = tok("08300000-0000-4000-8000-000000000002", "t083-teacher@verify.local", ["TEACHER"]);
const ADMIN   = tok("08300000-0000-4000-8000-000000000003", "t083-admin@verify.local", ["ADMIN"]);

// wait for boot
let up = false;
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(BASE + "/actuator/health"); if (r.ok) { up = true; break; } }
  catch { /* booting */ }
  await new Promise((r) => setTimeout(r, 500));
}
if (!up) { console.error("harness: api never came up"); process.exit(3); }

const zipBytes = new Uint8Array(readFileSync("/home/z/build/fixture-no-package.zip"));

/** multipart body WITH a part, but NOT the 'file' part (the captured leg-04 shape) */
function multipartNoFilePart(): FormData {
  const fd = new FormData();
  fd.append("note", "no file part here");
  return fd;
}
/** multipart body with the 'file' part = a valid zip lacking package.json (leg-05) */
function multipartZipNoPackageJson(): FormData {
  const fd = new FormData();
  fd.append("file", new Blob([zipBytes], { type: "application/zip" }), "corpus.zip");
  return fd;
}

type Leg = { leg: string; status: number; body: unknown; response_headers?: Record<string, string> };
const LEGS: Record<string, Leg> = {};
for (const n of [1,2,3,4,5,6,7,8]) {
  const f = readFileSync(`${CAP}/leg-0${n}-${["ingest-no-token-401","ingest-learner-403","ingest-teacher-403","ingest-admin-multipart-nopart-400","ingest-admin-non-zip-400","status-admin-200","status-teacher-403","status-no-token-401"][n-1]}.json`, "utf8");
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
async function runLeg(name: string, opts: { token?: string; body?: FormData | null }) {
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  const res = await fetch(BASE + "/api/v1/admin/revision-notes/" + (name.startsWith("leg-0") && Number(name[5]) >= 6 ? "status" : "ingest"), {
    method: Number(name[5]) >= 6 ? "GET" : "POST",
    headers,
    body: opts.body ?? undefined,
  });
  const rawText = await res.text();
  let body: any;
  try { body = JSON.parse(rawText); } catch { body = { __unparsed: rawText.slice(0, 200) }; }
  const cap = LEGS[name];
  const statusMatch = res.status === cap.status;
  const bodyMatch = canon(norm(cap.body)) === canon(norm(body));
  const hDiffs: string[] = [];
  for (const [k, v] of Object.entries(cap.response_headers ?? {})) {
    const a = res.headers.get(k);
    if (a !== v) hDiffs.push(`${k}: capture=${v} actual=${a ?? "<absent>"}`);
  }
  RESULTS.push({
    leg: name,
    expected_status: cap.status,
    actual_status: res.status,
    status_match: statusMatch,
    body_match: bodyMatch,
    header_diffs: hDiffs,
    actual_body: body,
    expected_body: cap.body,
  });
  console.log(
    `${name}: status ${res.status}/${cap.status} ${statusMatch ? "OK" : "MISMATCH"} | body ${bodyMatch ? "DEEP-EQUAL" : "DIFF"}` +
      (hDiffs.length ? ` | header-diffs: ${hDiffs.join("; ")}` : " | headers clean"),
  );
  if (!bodyMatch) {
    console.log(`   expected: ${JSON.stringify(norm(cap.body)).slice(0, 220)}`);
    console.log(`   actual  : ${JSON.stringify(norm(body)).slice(0, 220)}`);
  }
}

console.log("── replay ──");
await runLeg("leg-01", { body: multipartNoFilePart() });
await runLeg("leg-02", { token: LEARNER, body: multipartNoFilePart() });
await runLeg("leg-03", { token: TEACHER, body: multipartNoFilePart() });
await runLeg("leg-04", { token: ADMIN, body: multipartNoFilePart() });
await runLeg("leg-05", { token: ADMIN, body: multipartZipNoPackageJson() });
await runLeg("leg-06", { token: ADMIN });
await runLeg("leg-07", { token: TEACHER });
await runLeg("leg-08", { body: null });

const pass = RESULTS.filter((r) => r.status_match && r.body_match).length;
console.log(`GOLDEN-VERIFY: ${pass}/8 ${pass === 8 ? "PASS" : "FAIL"}`);
await Bun.write("/home/z/build/t083-verify-results.json", JSON.stringify({ results: RESULTS, verdict: pass === 8 ? "PASS" : "FAIL" }, null, 1));
process.exit(pass === 8 ? 0 : 1);
