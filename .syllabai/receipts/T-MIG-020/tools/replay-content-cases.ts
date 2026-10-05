/**
 * T-MIG-020 golden replay driver — the honest parity gate for the 26
 * content cases. Boots nothing itself: expects the v2 api already running
 * at TARGET (default http://localhost:8080) against the reset scratch
 * branch. Re-implements the runner's diff engine (tolerate rules wired —
 * the T-MIG-010 precedent) and re-mints REAL per-role tokens via the
 * honest /api/v1/auth path (register → login), because the committed
 * fixtures carry scrubbed-fixed-dummy bearers (T-MIG-003 convention; the
 * capture description mandates per-target re-minting).
 *
 * Token selection per case name:
 *   *-unauthed-401 / health   → the committed dummy bearer (invalid → 401)
 *   *-student-*               → the synthetic STUDENT's live token
 *   *-teacher-* / teacher-empty → the synthetic TEACHER's live token
 *
 * Verdicts: TOLERANT-PASS | GENUINE-FAIL (a real port divergence — must be
 * fixed or escalated per AGENT_COORDINATION §6.2; never weakened).
 */
import postgres from "postgres";

const TARGET = process.env.TARGET ?? "http://localhost:8080";
const BRANCH_URL = process.env.DATABASE_URL ?? "";
const JOIN_CODE = process.env.SYLLABAI_TEACHER_JOIN_CODE ?? "";
const DUMMY = "scrubbed-fixed-dummy-jwt-token";

if (!BRANCH_URL) {
  console.error("DATABASE_URL missing (needed only to clean synthetic rows at start)");
}

interface GoldenCase {
  name: string;
  method: string;
  path: string;
  request?: { headers?: Record<string, string>; body?: unknown };
  expect: { status: number; body: unknown };
  tolerate?: string[];
}

const cases: GoldenCase[] = [
  ...readdirJson(new URL("../../../../golden/cases/", import.meta.url)),
].filter((k) =>
  /^(content-|question-assets-|teacher-content-|health)/.test(k.name),
);

function readdirJson(dir: URL): GoldenCase[] {
  // Bun's GlobScanner is overkill; readdirSync keeps the case set explicit
  const out: GoldenCase[] = [];
  for (const f of Array.from(new Bun.Glob("*.json").scanSync({ cwd: dir.pathname })).sort()) {
    out.push(JSON.parse(readFileSync(`${dir.pathname}/${f}`, "utf8")));
  }
  return out;
}

import { readFileSync } from "node:fs";

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

// ── mint real tokens via the honest API path ──────────────────────────────
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
    throw new Error(`register ${email} failed: ${reg.status} ${await reg.text()}`);
  }
  const login = await fetch(new URL("/api/v1/auth/login", TARGET), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200) throw new Error(`login ${email} failed: ${login.status}`);
  const body = (await login.json()) as { accessToken: string };
  return body.accessToken;
}

const PASSWORD = "Replay-Only-2026-x7k2";
let teacherToken = "";
let studentToken = "";
if (process.env.SKIP_MINT !== "1") {
  teacherToken = await ensureUser(
    "user_20@example.invalid",
    PASSWORD,
    "User 20",
    "TEACHER",
  );
  studentToken = await ensureUser(
    "user_21@example.invalid",
    PASSWORD,
    "User 21",
    "STUDENT",
  );
  console.log("tokens minted (teacher+student) via /api/v1/auth");
}

// ── replay ────────────────────────────────────────────────────────────────
let pass = 0;
const fails: string[] = [];
for (const kase of cases) {
  // Role selection by ROUTE RULE (SecurityConfig.java:66-91), not by name:
  //   unauthed cases  → the committed dummy bearer (invalid → anonymous → 401)
  //   /api/v1/teacher → TEACHER token (hasAnyRole TEACHER/ADMIN)
  //   everything else → STUDENT token (anyRequest().authenticated())
  let bearer: string;
  if (kase.name.includes("unauthed")) {
    bearer = DUMMY;
  } else if (kase.name.includes("student")) {
    bearer = studentToken; // 403-parity probes: STUDENT token on a teacher route
  } else if (kase.path.includes("/api/v1/teacher/")) {
    bearer = teacherToken;
  } else {
    bearer = studentToken;
  }
  const res = await fetch(new URL(kase.path, TARGET), {
    method: kase.method,
    headers: {
      "content-type": "application/json",
      ...(kase.request?.headers ?? {}),
      Authorization: `Bearer ${bearer}`,
    },
    body: kase.request?.body != null ? JSON.stringify(kase.request.body) : undefined,
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = "<non-json>";
  }
  const tolerate = new Set(kase.tolerate ?? []);
  const expectNonJson = JSON.stringify(kase.expect.body) === '"<non-json:0 bytes>"';
  // Bun fetch quirk (recorded for R6): res.json() returns null (not a throw)
  // for 0-byte bodies with content-length: 0 — the wire is truly empty
  // (curl-verified), so parsed null normalizes to the <non-json> sentinel.
  if (expectNonJson && body === null) body = "<non-json>";
  const statusOk = res.status === kase.expect.status;
  const bodyOk =
    statusOk &&
    (expectNonJson
      ? body === "<non-json>"
      : eq(kase.expect.body, body, tolerate));
  if (statusOk && bodyOk) {
    pass++;
    console.log(`PASS ${kase.name}`);
  } else {
    fails.push(kase.name);
    console.log(
      `FAIL ${kase.name}: status ${res.status} vs ${kase.expect.status}; body ${JSON.stringify(body).slice(0, 220)} vs ${JSON.stringify(kase.expect.body).slice(0, 220)}`,
    );
  }
}
console.log(`\n${pass}/${cases.length} golden cases pass against ${TARGET}`);
if (fails.length > 0) process.exit(1);

// cleanup connection (not used unless post-run DB checks are requested)
if (BRANCH_URL && process.env.CHECK_DB === "1") {
  const sql = postgres(BRANCH_URL, { max: 1, prepare: false });
  await sql.end();
}
