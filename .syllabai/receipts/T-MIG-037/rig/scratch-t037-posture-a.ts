/**
 * T-MIG-037 (r8-hub) live dual-run harness — POSTURE A.
 * Scratch rig, never committed (T-MIG-035 pattern: the hub's ACTUAL
 * routing code is imported and its constructed URLs are executed live
 * against the branch-booted v2 api).
 *
 * Posture A = DUAL-RUN: NEXT_PUBLIC_API_V2_BASE_URL set (v2 api on the
 * branch boot), NEXT_PUBLIC_API_BASE_URL pointing at the (absent, mocked
 * domain) legacy core — the production-like posture with both bases live.
 */
process.env.NEXT_PUBLIC_API_V2_BASE_URL = "http://127.0.0.1:8090";
process.env.NEXT_PUBLIC_API_BASE_URL = "https://syllabai-core.example";

const { apiPath } = await import("/home/z/my-project/syllabai-v2/apps/hub/src/lib/api.ts");
import postgres from "/home/z/my-project/syllabai-v2/node_modules/postgres/src/index.js";

const V2 = "http://127.0.0.1:8090";
const CORE = "https://syllabai-core.example";
const results: Array<{ n: number; name: string; pass: boolean; detail?: string }> = [];
function check(n: number, name: string, pass: boolean, detail?: string) {
  results.push({ n, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${n} ${name}${detail ? ` — ${detail}` : ""}`);
}

// ---- decision-layer checks (hub's actual apiPath, both bases live) ----
const loginUrl = apiPath("/api/v1/auth/login");
check(1, "hub routes /api/v1/auth/login -> v2 base", loginUrl === `${V2}/api/v1/auth/login`, loginUrl);
check(2, "hub routes /api/v1/auth/register -> v2 base", apiPath("/api/v1/auth/register") === `${V2}/api/v1/auth/register`);
const subjProbe = apiPath("/api/v1/subjects");
check(3, "hub keeps /api/v1/subjects on the legacy core (T-MIG-035 check-3 law)", subjProbe.startsWith(CORE) && !subjProbe.startsWith(V2), subjProbe);
const glmProbe = apiPath("/api/v1/teacher/content/glm-ocr/papers/p-1/findings");
check(4, "hub keeps teacher glm-ocr findings on the core (v2 does not serve it)", glmProbe.startsWith(CORE), glmProbe);
const lmProbe = apiPath("/api/v1/learners/me/agenda");
check(5, "hub keeps non-attempts /learners/me surfaces on the core", lmProbe.startsWith(CORE), lmProbe);
check(6, "hub routes /api/v1/curriculum/subjects -> v2 base", apiPath("/api/v1/curriculum/subjects") === `${V2}/api/v1/curriculum/subjects`);
check(7, "hub routes /api/v1/content/documents -> v2 base", apiPath("/api/v1/content/documents") === `${V2}/api/v1/content/documents`);
check(8, "hub routes /api/v1/learners/me/attempts -> v2 base (narrow prefix)", apiPath("/api/v1/learners/me/attempts?limit=5") === `${V2}/api/v1/learners/me/attempts?limit=5`);

// ---- live flow through the constructed URLs (branch-booted v2 api) ----
const email = "r8-hub-t037-learner@example.invalid";
const reg = await fetch(apiPath("/api/v1/auth/register"), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password: "t037-DualRun!x", displayName: "r8-hub t037 learner" }),
});
const regBody: any = await reg.json().catch(() => ({}));
check(9, "register 201 via hub-constructed URL (honest API path)", reg.status === 201, `status=${reg.status} keys=${Object.keys(regBody).join(",")}`);
const token = regBody?.accessToken as string | undefined;
check(10, "AuthResponse shape {accessToken, tokenType, user} — hub-consumable", reg.status === 201 && typeof token === "string" && regBody?.tokenType === "Bearer" && typeof regBody?.user?.id === "string");

const login = await fetch(apiPath("/api/v1/auth/login"), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password: "t037-DualRun!x" }),
});
const loginBody: any = await login.json().catch(() => ({}));
check(11, "login 200 via hub-constructed URL", login.status === 200 && typeof loginBody?.accessToken === "string", `status=${login.status}`);

const me = await fetch(apiPath("/api/v1/auth/me"), { headers: { authorization: `Bearer ${token}` } });
const meBody: any = await me.json().catch(() => ({}));
check(12, "/me 200 with v2-issued bearer; email round-trips", me.status === 200 && meBody?.email === email, `status=${me.status}`);

const subjects = await fetch(apiPath("/api/v1/curriculum/subjects"), { headers: { authorization: `Bearer ${token}` } });
const subjectsBody: any = await subjects.json().catch(() => null);
check(13, "GET /api/v1/curriculum/subjects 200 (W2 curriculum read through the hub's v2 base)", subjects.status === 200 && Array.isArray(subjectsBody), `status=${subjects.status} isArray=${Array.isArray(subjectsBody)}`);

// Reader implementation-literal probes (zero seed data needed): the reader
// router's parseUuid throws malformed_body (400) — a response ONLY the real
// reader produces (the /api/v1/* fallback emits 401-anon/404 only); the
// bare-list path V2 does not serve must NOT be what the hub calls (it never
// emits it learner-side — citation-map deep-links carry {row}?page=N).
const docMalformed = await fetch(`${V2}/api/v1/content/documents/not-a-uuid`, { headers: { authorization: `Bearer ${token}` } });
const docMalformedBody: any = await docMalformed.json().catch(() => ({}));
check(14, "GET /api/v1/content/documents/{bad-id} 400 malformed_body (reader implementation-literal — parseUuid parity)", docMalformed.status === 400, `status=${docMalformed.status} error=${docMalformedBody?.error ?? "?"}`);
const docAbsent = await fetch(`${V2}/api/v1/content/documents/00000000-0000-0000-0000-000000000000`, { headers: { authorization: `Bearer ${token}` } });
const docAbsentBody: any = await docAbsent.json().catch(() => ({}));
check(17, "GET /api/v1/content/documents/{absent-uuid} 404 (reader NotFound parity — served by the real router)", docAbsent.status === 404, `status=${docAbsent.status} detail=${String(docAbsentBody?.message ?? docAbsentBody?.detail ?? "").slice(0, 60)}`);

const history = await fetch(apiPath("/api/v1/learners/me/attempts?limit=5"), { headers: { authorization: `Bearer ${token}` } });
const historyBody: any = await history.json().catch(() => null);
check(15, "GET /api/v1/learners/me/attempts 200 (W3 history read through the hub's v2 base)", history.status === 200 && historyBody !== null, `status=${history.status} bodyKind=${Array.isArray(historyBody) ? "array" : typeof historyBody}`);

// ---- write-path landed in the ephemeral store (wire-server read-back) ----
const sql = postgres("postgres://pg:pg@127.0.0.1:15432/main", { max: 1, prepare: false });
const users = await sql`select count(*)::int as n from users where email = ${email}`;
check(16, "register write landed in the ephemeral store (wire read-back)", users[0]?.n === 1, `rows=${users[0]?.n}`);
await sql.end();

const fails = results.filter((r) => !r.pass).length;
console.log(`\nPOSTURE A (dual-run): ${results.length - fails}/${results.length} checks pass`);
process.exit(fails === 0 ? 0 : 1);
