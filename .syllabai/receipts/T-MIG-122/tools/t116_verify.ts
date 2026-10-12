/**
 * T-MIG-116 golden-verify — the SMART-MARK TAILS' keyless laws replayed
 * against the v2 impl of record (the B1 gate law: the 107/113/114 rig
 * capture from the frozen core 6cad6ef local boot + the replay vs the
 * booted v2 — ZERO v2 code changes expected; any divergence = FAIL-NO-FLIP
 * = a filed defect band, never a widening).
 *
 * Substrate: LOCAL PG 17.11 + pgvector @ 127.0.0.1:5544 db syllabai_verify
 * (drizzle push + the V6/V7 seed + the 113-class structured seed
 * 45000000../45100000../45200000.. + the SUGGESTED scheme 45300000.. + the
 * fixed-uuid harness users). The attempt + answers are created THROUGH THE
 * API (the structured submit — the servable-question law rides live) and
 * resolved from the db. ZERO prod contact, ZERO LLM calls (the
 * SCHEME_NOT_VALIDATED refusal fires BEFORE any generator seam).
 */
import app from "/home/z/my-project/repos/syllabai-v2/apps/api/src/index.ts";
import { JwtService } from "/home/z/my-project/repos/syllabai-v2/apps/api/src/services/identity/jwt";
import { deepEqualTolerant } from "/home/z/my-project/repos/syllabai-v2/golden/runner.ts";
import { readFileSync } from "node:fs";
import postgres from "/home/z/my-project/repos/syllabai-v2/node_modules/postgres/src/index.js";

const CAP = "/home/z/my-project/repos/syllabai-v2/golden-captures/t-mig-116";
const PORT = 8927;
const BASE = "http://127.0.0.1:" + PORT;
const sqlo = postgres(process.env.DATABASE_URL!, { max: 1, connect_timeout: 30 });

const FORBIDDEN = Object.keys(process.env).filter((k) =>
  /^(GROQ|OPENROUTER|GEMINI).*API_KEY|SYLLABAI_(GROQ|GEMINI|OPENROUTER)_API_KEY$/i.test(k),
);
if (FORBIDDEN.length) {
  console.error("harness: ZERO-KEY law violated — LLM credentials present in env:", FORBIDDEN);
  process.exit(4);
}
console.log("harness: ZERO-KEY boot law asserted");

Bun.serve({ port: PORT, idleTimeout: 60, fetch: app.fetch });
let up = false;
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(BASE + "/actuator/health"); if (r.ok) { up = true; break; } } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
if (!up) { console.error("harness: api never came up"); process.exit(3); }
console.log(`harness: serving api on :${PORT}`);

const SECRET = process.env.SYLLABAI_JWT_SECRET!;
const jwt = new JwtService(SECRET, "PT15M");
const tok = (id: string, email: string, roles: string[]) =>
  jwt.issueAccessToken({ id, email, tokenVersion: 1, roles });
const TEACHER = tok("11710000-0000-4000-8000-000000000001", "t116-teacher@verify.local", ["TEACHER"]);
const STUDENT = tok("11720000-0000-4000-8000-000000000001", "t116-student@verify.local", ["STUDENT"]);

const MAN = JSON.parse(readFileSync(`${CAP}/capture_manifest.json`, "utf8"));
const ANSWER_MAP: Record<string, string> = {}; // capture real -> verify real
const VER_A = "45100000-0000-0000-0000-000000000001"; // the SAME fixed-uuid both sides (the fake-uuid law)
const UNKNOWN = "11700000-0000-4000-8000-0000000000ff";

function sub(v: unknown): unknown {
  if (typeof v === "string") {
    const lower = v.toLowerCase();
    if (lower === MAN.answer_a?.toLowerCase()) return ANSWER_MAP[lower] ?? v;
    if (lower === MAN.answer_b?.toLowerCase()) return ANSWER_MAP[lower] ?? v;
    if (lower === MAN.version?.toLowerCase()) return VER_A;
    return v;
  }
  if (Array.isArray(v)) return v.map(sub);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, sub(x)]));
  }
  return v;
}

function capture(name: string): { status: number; body: unknown } {
  const raw = readFileSync(`${CAP}/${name}.json`, "utf8");
  let js: unknown;
  try { js = JSON.parse(raw); } catch { js = raw; }
  const map = (v: unknown): unknown => {
    if (typeof v === "string") {
      const lower = v.toLowerCase();
      if (lower === MAN.answer_a?.toLowerCase()) return ANSWER_MAP[lower] ?? "<ANSWER_A>";
      if (lower === MAN.answer_b?.toLowerCase()) return ANSWER_MAP[lower] ?? "<ANSWER_B>";
      if (lower === MAN.version?.toLowerCase()) return VER_A;
      if (/^[0-9a-f-]{36}$/.test(lower)) {
        // the created smart-mark result ids / timestamps are volatile
        return lower === MAN.answer_a?.toLowerCase() || lower === MAN.answer_b?.toLowerCase()
          ? lower : v;
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(map);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => {
        if (k === "id" || k === "createdAt" || k === "timestamp") return [k, "<tol>"];
        return [k, map(x)];
      }));
    }
    return v;
  };
  return { status: (js as { status?: number }).status ?? -1, body: map(js) };
}

async function req(method: string, path: string, body?: unknown, bearer?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (bearer === "teacher") headers.authorization = `Bearer ${TEACHER}`;
  if (bearer === "student") headers.authorization = `Bearer ${STUDENT}`;
  const res = await fetch(BASE + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(sub(body)),
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; } catch { return { status: res.status, body: text }; }
}

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, act: { status: number; body: unknown }, exp: { status: number; body: unknown }, expStatus: number) {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => {
        if (k === "timestamp" || k === "path" || k === "createdAt") return [k, "<tol>"];
        return [k, strip(x)];
      }));
    }
    return v;
  };
  const ok = act.status === expStatus && deepEqualTolerant(strip(act.body), strip(exp.body), ["id", "createdAt", "timestamp"]);
  if (ok) { pass++; console.log(`  ${name}: PASS (${act.status})`); }
  else {
    fail++; failures.push(name);
    console.log(`  ${name}: FAIL (act ${act.status} vs exp ${expStatus})`);
    console.log(`    act: ${JSON.stringify(strip(act.body))?.slice(0, 320)}`);
    console.log(`    exp: ${JSON.stringify(strip(exp.body))?.slice(0, 320)}`);
  }
}

// ── the attempt + answers THROUGH THE API (the servable law rides live) ──
const sub1 = await req("POST", "/api/v1/attempts/structured", {
  questionId: "45000000-0000-0000-0000-000000000001", responseTimeMs: 45000,
  confidence: 3, selfDoubtFlag: false, timedCondition: false,
  partAnswers: [
    { partId: "45200000-0000-0000-0000-000000000001", answerText: "B1 rig seed answer part a" },
    { partId: "45200000-0000-0000-0000-000000000002", answerText: "B1 rig seed answer part b" },
  ],
}, "student");
if (sub1.status !== 201) { console.error("harness: structured submit failed", sub1.status, JSON.stringify(sub1.body).slice(0, 200)); process.exit(3); }
console.log("harness: structured submit 201 (the servable law live)");
const ATT = (sub1.body as { attemptId: string }).attemptId;
ANSWER_MAP[(MAN.answer_a as string).toLowerCase()] =
  await sqlo`select id from answers where attempt_id=${ATT} and question_part_id='45200000-0000-0000-0000-000000000001'`.then((r: any[]) => r[0].id);
ANSWER_MAP[(MAN.answer_b as string).toLowerCase()] =
  await sqlo`select id from answers where attempt_id=${ATT} and question_part_id='45200000-0000-0000-0000-000000000002'`.then((r: any[]) => r[0].id);
const VA = ANSWER_MAP[(MAN.answer_a as string).toLowerCase()];
const VB = ANSWER_MAP[(MAN.answer_b as string).toLowerCase()];
console.log(`harness: answers resolved A=${VA.slice(0, 8)}.. B=${VB.slice(0, 8)}..`);

// ── band S: the no-scheme legs FIRST (the substrate carries the scheme —
//    drop it, replay, restore; the FK-safe order) ──
await sqlo`delete from smart_mark_results where mark_scheme_id='45300000-0000-0000-0000-000000000001'`;
await sqlo`delete from mark_schemes where id='45300000-0000-0000-0000-000000000001'`;
check("s01-smartmark-unknown-answer",
  await req("POST", `/api/v1/teacher/marking/answers/${UNKNOWN}/smart-mark`, {}, "teacher"),
  capture("s01-smartmark-unknown-answer"), 404);
check("s02b-smartmark-no-scheme-404",
  await req("POST", `/api/v1/teacher/marking/answers/${VA}/smart-mark`, {}, "teacher"),
  capture("s02b-smartmark-no-scheme-404"), 404);
check("s03b-batch-no-scheme-items",
  await req("POST", "/api/v1/teacher/marking/smart-mark-batch", { answerIds: [MAN.answer_a, MAN.answer_b] }, "teacher"),
  capture("s03b-batch-no-scheme-items"), 200);
// restore the scheme (the band-T substrate)
await sqlo`insert into mark_schemes (id, question_version_id, validation_state, created_at) values ('45300000-0000-0000-0000-000000000001', ${VER_A}, 'SUGGESTED', now())`;
await sqlo`insert into mark_points (id, mark_scheme_id, question_part_id, ref, ordering, text, marks, created_at) values
  ('45400000-0000-0000-0000-000000000001', '45300000-0000-0000-0000-000000000001', '45200000-0000-0000-0000-000000000001', 'P1', 1, 'seed point a1', 1, now()),
  ('45400000-0000-0000-0000-000000000002', '45300000-0000-0000-0000-000000000001', '45200000-0000-0000-0000-000000000001', 'P2', 2, 'seed point a2', 1, now()),
  ('45400000-0000-0000-0000-000000000003', '45300000-0000-0000-0000-000000000001', '45200000-0000-0000-0000-000000000002', 'P3', 3, 'seed point b1', 1, now())`;
console.log("  scheme restored (the band-T substrate)");

// ── the batch validation laws (verbatim; no state) ──
check("s04-batch-empty",
  await req("POST", "/api/v1/teacher/marking/smart-mark-batch", { answerIds: [] }, "teacher"),
  capture("s04-batch-empty"), 400);
// s05 the ABSENT-body law — the core's OWN draw is JVM-run-nondeterministic:
// @NotNull AND @NotEmpty BOTH fire on null and the handler serves findFirst()
// over a Set of annotation-proxy violations (identity hashes differ per boot).
// First-hand: two clean boots of the same 6cad6ef jar drew BOTH strings ("must
// not be null" at 12:16Z, "must not be empty" at 12:24Z) — the of-record
// run-001 receipt's dual-string list is the same fact. v2 is deterministic:
// invalid_type(undefined) -> "answerIds: must not be null" (the classifier's
// @NotNull branch). The leg pins the LAW SET, not one draw (disclosed in the
// T-MIG-122 receipts; every other leg stays byte-tight).
{
  const s05 = await req("POST", "/api/v1/teacher/marking/smart-mark-batch", {}, "teacher");
  const b = s05.body as { error?: string; message?: string };
  const DRAW_SET = ["answerIds: must not be null", "answerIds: must not be empty"];
  const ok = s05.status === 400 && b.error === "validation_failed" && DRAW_SET.includes(b.message ?? "");
  if (ok) { pass++; console.log("  s05-batch-absent: PASS (400, the two-draw law set)"); }
  else { fail++; failures.push("s05-batch-absent"); console.log(`  s05-batch-absent: FAIL (act ${s05.status}) ${JSON.stringify(b)}`); }
}
check("s06-batch-51",
  await req("POST", "/api/v1/teacher/marking/smart-mark-batch", { answerIds: Array(51).fill(MAN.answer_a) }, "teacher"),
  capture("s06-batch-51"), 400);
check("s08-batch-wrong-type",
  await req("POST", "/api/v1/teacher/marking/smart-mark-batch", { answerIds: "not-a-list" }, "teacher"),
  capture("s08-batch-wrong-type"), 400);
check("s09-batch-bad-uuid",
  await req("POST", "/api/v1/teacher/marking/smart-mark-batch", { answerIds: ["not-a-uuid"] }, "teacher"),
  capture("s09-batch-bad-uuid"), 400);
check("s10-detail-unknown",
  await req("GET", `/api/v1/teacher/marking/answers/${UNKNOWN}`, undefined, "teacher"),
  capture("s10-detail-unknown"), 404);

// ── band T: the SCHEME_NOT_VALIDATED refusal laws ──
check("t01-smartmark-scheme-not-validated",
  await req("POST", `/api/v1/teacher/marking/answers/${VA}/smart-mark`, {}, "teacher"),
  capture("t01-smartmark-scheme-not-validated"), 200);
check("t02-batch-scheme-not-validated",
  await req("POST", "/api/v1/teacher/marking/smart-mark-batch", { answerIds: [MAN.answer_a, MAN.answer_b] }, "teacher"),
  capture("t02-batch-scheme-not-validated"), 200);
// s07 the dedup law: 3 entries with A twice -> requested 2 (order-preserving)
const s07 = await req("POST", "/api/v1/teacher/marking/smart-mark-batch",
  { answerIds: [MAN.answer_a, MAN.answer_a, MAN.answer_b] }, "teacher");
const s07ok = s07.status === 200 && (s07.body as { requested: number }).requested === 2;
if (s07ok) { pass++; console.log("  s07-batch-dedup: PASS (requested=2)"); }
else { fail++; failures.push("s07-batch-dedup"); console.log(`  s07-batch-dedup: FAIL ${JSON.stringify(s07.body).slice(0, 200)}`); }

console.log(`\nB1 GOLDEN-VERIFY VERDICT: ${pass}/${pass + fail} legs PASS; failures: ${failures.join(",") || "none"}`);
process.exit(fail === 0 ? 0 : 1);
