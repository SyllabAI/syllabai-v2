/**
 * r12 probe — RAW response capture for the deployed-API 500 on judged paths.
 * Logs in as the r12 student, creates a fresh session, and prints the RAW
 * status + body of nudge / turn / end so the real error surface is visible.
 * Token in memory only.
 *
 *   PROD_API_BASE=https://syllabai-v2.vercel.app bun run scripts/t-r12-probe-raw.ts
 */
const BASE = process.env.PROD_API_BASE ?? "https://syllabai-v2.vercel.app";
const EMAIL = "smoke.tteachme001.r12-firstreal.u0@smoke.invalid";
const PW = process.env.SMOKE_PW ?? "smoke-r12-Passw0rd-001";
const PICK = ["4CH1-1.1", "4CH1-1.10", "4CH1-1.11"];

async function http(method: "GET" | "POST", path: string, body?: unknown, tok?: string, timeoutMs = 90_000) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const ms = Date.now() - t0;
  const full = await res.text();
  let json: any = null;
  try { json = JSON.parse(full); } catch { /* keep null */ }
  return { status: res.status, json, text: full.slice(0, 700), ms, headers: Object.fromEntries(res.headers) };
}

const log = await http("POST", "/api/v1/auth/login", { email: EMAIL, password: PW });
const token: string | null = log.json?.accessToken ?? null;
if (!token) { console.error("login failed:", log.status, log.text.slice(0, 200)); process.exit(2); }
console.log("login OK");

const created = await http("POST", "/api/v1/learners/me/teach-me/sessions",
  { courseId: "igcse-chemistry-19", specPointIds: PICK, difficulty: "easy", length: "quick", mode: "chat" }, token, 120_000);
const sid = created.json?.session?.id;
console.log(`create: HTTP ${created.status} ${created.ms}ms session=${sid}`);
if (!sid) { console.error("body:", created.text); process.exit(2); }

const nudge = await http("POST", `/api/v1/learners/me/teach-me/sessions/${sid}/message`, { text: "dunno, it just dissolves I guess lol" }, token);
console.log(`nudge : HTTP ${nudge.status} ${nudge.ms}ms\n  body: ${nudge.text}\n  x-vercel headers: ${JSON.stringify(Object.fromEntries(Object.entries(nudge.headers).filter(([k]) => k.includes("vercel") || k.includes("sourcemap") || k.includes("server"))) )}`);

const turn = await http("POST", `/api/v1/learners/me/teach-me/sessions/${sid}/message`,
  { text: "There are three states of matter. In a solid the particles are arranged in a tight, regular pattern — they cannot swap places, they only vibrate on the spot, so a solid keeps its own shape. In a liquid the particles are still close together but the arrangement is random and they can slide past each other, which is why a liquid flows and takes the shape of its container. In a gas the particles are far apart, they move quickly in all directions, and they have the most energy — that is why a gas spreads out to fill all the space it can. Moving from solid to liquid to gas the particles gain energy: heating gives them the energy needed to break one arrangement and form another, like ice melting into water and then boiling into steam." },
  token, 150_000);
console.log(`turn1 : HTTP ${turn.status} ${turn.ms}ms\n  body: ${turn.text}`);

const end = await http("POST", `/api/v1/learners/me/teach-me/sessions/${sid}/end`, undefined, token, 300_000);
console.log(`end   : HTTP ${end.status} ${end.ms}ms\n  body: ${end.text}`);
