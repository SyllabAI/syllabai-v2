/**
 * T-MIG-114 — the 44-leg re-verify driver (run-001-reverify-r0).
 *
 * Replays the capture of record (golden-captures/t-mig-113/, 44 law legs,
 * LOCAL boot of the frozen core 6cad6ef) against the v2 api IN-PROCESS
 * (Bun.serve, ZERO-KEY boot law, the t100/107 harness pattern) on the local
 * userspace PG 17.11 + pgvector @ 127.0.0.1:5544, db syllabai_verify (fresh:
 * drizzle push 62 tables + the Flyway roles seed rows (V1, verbatim) + the
 * literal-uuid rig seed). Comparator: deepEqualTolerant from golden/runner.ts
 * (ZERO comparator drift); tolerate: timestamp keys only; generated ids
 * normalized by the role-labelled maps on BOTH sides (the 113 run-002 law).
 *
 * ADJUDICATION WIRING (disclosed in the receipt): the band's fix-1 (the
 * perPointDecisions classifier branch) is IN; the band's fix-2 (the detail
 * projection SELECT drop) was REVERTED after the first-hand core re-capture
 * (t114_capture_core.py + t114_confirm_fixtures.py: 5/5 fixture-matched) —
 * the core renders latestHumanMark.perPointDecisions AS STORED (leg-35 map /
 * leg-37 null), so v2's pre-band hydrate behavior is the law of record.
 * Probe displayNames are registered with the fixture literals
 * (r7a-t113-*) for byte-comparability (disclosed).
 */
import app from "/home/z/my-project/ws/syllabai-v2/apps/api/src/index.ts";
import { deepEqualTolerant } from "/home/z/my-project/ws/syllabai-v2/golden/runner.ts";
import { readFileSync, readdirSync } from "node:fs";
import postgres from "postgres";

const CAP = "/home/z/my-project/ws/syllabai-v2/golden-captures/t-mig-113";
const PORT = 8091;
const BASE = "http://127.0.0.1:" + PORT;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, connect_timeout: 30 });

// ── ZERO-KEY boot law ──
const FORBIDDEN = Object.keys(process.env).filter((k) =>
  /^(GROQ|OPENROUTER|GEMINI).*API_KEY|SYLLABAI_(GROQ|GEMINI|OPENROUTER)_API_KEY$/i.test(k),
);
if (FORBIDDEN.length) { console.error("harness: ZERO-KEY law violated:", FORBIDDEN); process.exit(4); }
console.log("harness: ZERO-KEY boot law asserted");

Bun.serve({ port: PORT, idleTimeout: 60, fetch: app.fetch });
let up = false;
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(BASE + "/actuator/health"); if (r.ok) { up = true; break; } } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
if (!up) { console.error("harness: api never came up"); process.exit(3); }
console.log(`harness: serving api on :${PORT}`);

const Q = "45000000-0000-0000-0000-000000000001";
const PA = "45200000-0000-0000-0000-000000000001";
const PB = "45200000-0000-0000-0000-000000000002";
const P1 = "45990000-0000-0000-0000-000000000001";
const P2 = "45990000-0000-0000-0000-000000000002";

function http(method: string, path: string, token: string | null, body: unknown) {
  const headers: Record<string, string> = { accept: "application/json" };
  let data: string | undefined;
  if (body !== undefined && body !== null) {
    data = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(BASE + path, { method, headers, body: data });
}

const rnd = Math.random().toString(16).slice(2, 10);
const T_EMAIL = `r0-t114-verify-teacher-${rnd}@example.invalid`;
const S_EMAIL = `r0-t114-verify-student-${rnd}@example.invalid`;
const JOIN = process.env.SYLLABAI_TEACHER_JOIN_CODE!;

async function register(email: string, displayName: string, extra: object = {}) {
  const r = await http("POST", "/api/v1/auth/register", null, { email, password: "Xx9" + rnd + "YyZz", displayName, ...extra });
  const b = await r.json() as any;
  if (r.status !== 201 && r.status !== 200) { console.error(`register ${email} -> ${r.status}`, JSON.stringify(b).slice(0, 200)); process.exit(2); }
  return b;
}
const tReg = await register(T_EMAIL, "r7a-t113-teacher", { role: "TEACHER", joinCode: JOIN });
const sReg = await register(S_EMAIL, "r7a-t113-student");
async function login(email: string, password: string) {
  const r = await http("POST", "/api/v1/auth/login", null, { email, password });
  const b = await r.json() as any;
  if (!b.token && !b.accessToken) { console.error("login failed", r.status, JSON.stringify(b).slice(0, 160)); process.exit(2); }
  return b.token ?? b.accessToken;
}
const TOK_T = await login(T_EMAIL, "Xx9" + rnd + "YyZz");
const TOK_S = await login(S_EMAIL, "Xx9" + rnd + "YyZz");
console.log("probes registered + bearers in-memory");

// structured submit -> attempt + answers (state creation, not a law leg)
const sub = await http("POST", "/api/v1/attempts/structured", TOK_S, {
  questionId: Q, responseTimeMs: 45000,
  partAnswers: [
    { partId: PA, answerText: "probe answer part a \u2014 rig fixture" },
    { partId: PB, answerText: "probe answer part b \u2014 rig fixture" },
  ],
});
const subBody = await sub.json() as any;
if (sub.status !== 201) { console.error("structured submit ->", sub.status, JSON.stringify(subBody).slice(0, 200)); process.exit(2); }
const ATT = subBody.attemptId as string;

const V: Record<string, string> = {
  "TEACHER-ID": (await sql`select id from users where email = ${T_EMAIL}`)[0]!.id,
  "STUDENT-ID": (await sql`select id from users where email = ${S_EMAIL}`)[0]!.id,
  "ATTEMPT-ID": ATT,
  "ANSWER-A": (await sql`select id from answers where attempt_id = ${ATT} and question_part_id = ${PA}`)[0]!.id,
  "ANSWER-B": (await sql`select id from answers where attempt_id = ${ATT} and question_part_id = ${PB}`)[0]!.id,
};
const LABELS = ["TEACHER-ID", "STUDENT-ID", "ATTEMPT-ID", "ANSWER-A", "ANSWER-B", "HUMANMARK-1", "HUMANMARK-2"];
async function resolveHumanMarks() {
  const rows = await sql`select id, answer_id from human_marks order by created_at asc, id asc`;
  const mine = rows.filter((r: any) => String(r.answer_id).toLowerCase() === V["ANSWER-A"]!.toLowerCase());
  console.log(`   [resolve] human_marks rows=${rows.length} mine=${mine.length}`);
  if (mine[0]) V["HUMANMARK-1"] = String(mine[0]!.id);
  if (mine[1]) V["HUMANMARK-2"] = String(mine[1]!.id);
}

function subRequest(v: unknown): unknown {
  if (typeof v === "string") {
    if (v === "(4001 x's)") return "x".repeat(4001); // the run-004 amendment law: the true 4001-char body
    let out = v;
    for (const l of LABELS) if (out.includes(l)) out = out.split(l).join(V[l] ?? l);
    if (/^45990000-[0-9a-f-]+ \(fake\)$/.test(out.trim())) return out.replace(" (fake)", "");
    if (/^[0-9a-f-]{36}$/.test(out.toLowerCase())) {
      const hit = LABELS.find((l) => V[l]?.toLowerCase() === out.toLowerCase());
      if (hit) return hit;
    }
    return out;
  }
  if (Array.isArray(v)) return v.map(subRequest);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === "(51 entries p0..p50)") {
        for (let i = 0; i <= 50; i++) o[`p${i}`] = x;
        continue;
      }
      // the capture request redaction: "45990000-...-000N (fake)" -> the full synthetic point fake
      const m = /^([0-9a-f]{8})-\.\.\.-([0-9a-f]{4}) \(fake\)$/.exec(k);
      const key = m ? `${m[1]}-0000-0000-0000-00000000${m[2]}` : k.endsWith(" (fake)") ? k.replace(" (fake)", "") : k;
      o[key] = subRequest(x);
    }
    return o;
  }
  return v;
}

function fakeActual(v: unknown): unknown {
  if (typeof v === "string") {
    const low = v.toLowerCase();
    if (/^[0-9a-f-]{36}$/.test(low)) {
      const hit = LABELS.find((l) => V[l]?.toLowerCase() === low);
      if (hit) return hit;
      return low;
    }
    if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(v))
      return v.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (m) => {
        const hit = LABELS.find((l) => V[l]?.toLowerCase() === m.toLowerCase());
        return hit ?? m.toLowerCase();
      });
    return v;
  }
  if (Array.isArray(v)) return v.map(fakeActual);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, fakeActual(x)]));
  return v;
}

const TOLERATE = ["timestamp", "createdAt", "submittedAt", "computedAt", "oldestPendingAt"];
function diffPaths(a: unknown, b: unknown, p = "", out: string[] = []): string[] {
  if (typeof a === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(a) && typeof b === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(b)) return out;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${p || "<root>"}: exp=${JSON.stringify(a)?.slice(0, 90)} act=${JSON.stringify(b)?.slice(0, 90)}`);
    return out;
  }
  const A: any = a, B: any = b;
  if (Array.isArray(A) !== Array.isArray(B)) { out.push(`${p}: array-vs-object`); return out; }
  if (Array.isArray(A)) {
    if (A.length !== B.length) out.push(`${p}: len ${A.length} vs ${B.length}`);
    for (let i = 0; i < Math.min(A.length, B.length); i++) diffPaths(A[i], B[i], `${p}[${i}]`, out);
    return out;
  }
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (!(k in A)) out.push(`${p}.${k}: missing-in-expected`);
    else if (!(k in B)) out.push(`${p}.${k}: missing-in-actual`);
    else diffPaths(A[k], B[k], `${p}.${k}`, out);
  }
  return out;
}
const legs = readdirSync(CAP).filter((f) => /^leg-\d+-.*\.json$/.test(f))
  .sort((a, b) => Number(a.match(/^leg-(\d+)/)![1]) - Number(b.match(/^leg-(\d+)/)![1]));

const RESULTS: any[] = [];
let idx = 0;
for (const f of legs) {
  idx++;
  const cap = JSON.parse(readFileSync(`${CAP}/${f}`, "utf8"));
  const token = cap.auth === "teacher" ? TOK_T : cap.auth === "student" ? TOK_S : null;
  const path = String(cap.path);
  const subbed = subRequest(path) as string;
  const body = cap.request_body === undefined || cap.request_body === null ? undefined : subRequest(cap.request_body);
  const res = await http(cap.method ?? "GET", subbed, token, body);
  const text = await res.text();
  let actual: any; try { actual = JSON.parse(text); } catch { actual = { __unparsed: text.slice(0, 200) }; }
  if (String(cap.leg) === "34" || String(cap.leg) === "36") await resolveHumanMarks();
  const faked = fakeActual(actual);
  const statusOk = res.status === cap.status;
  const bodyOk = deepEqualTolerant(cap.response_body, faked, TOLERATE);
  RESULTS.push({ leg: cap.leg, name: cap.name, status: res.status, expected: cap.status, statusOk, bodyOk });
  console.log(`leg-${String(cap.leg).padStart(2, "0")} ${res.status}/${cap.status} ${statusOk ? "OK " : "MISMATCH"} | body ${bodyOk ? "DEEP-EQUAL" : "DIFF"} ${cap.name}`);
  if (!bodyOk || !statusOk) {
    console.log("   expected:", JSON.stringify(cap.response_body).slice(0, 260));
    console.log("   actual  :", JSON.stringify(faked).slice(0, 260));
    for (const d of diffPaths(cap.response_body, faked).slice(0, 6)) console.log("   diff:", d);
  }
}

const pass = RESULTS.filter((r) => r.statusOk && r.bodyOk).length;
console.log(`RE-VERIFY: ${pass}/${RESULTS.length} ${pass === RESULTS.length ? "PASS" : "FAIL"}`);
await Bun.write("/home/z/my-project/scripts/t114-reverify-results.json",
  JSON.stringify({ verdict: pass === RESULTS.length ? "PASS" : "FAIL", passed: pass, total: RESULTS.length, results: RESULTS }, null, 1));
process.exit(pass === RESULTS.length ? 0 : 1);
