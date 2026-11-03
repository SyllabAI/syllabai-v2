/**
 * T-TEACHME-001 vercel-activation leg — operator chain-health verification
 * against the DEPLOYED production API (https://syllabai-v2.vercel.app).
 *
 * What it does (one-shot, read-only):
 *   1. reads the enabled ADMIN row of record from PROD (id, email, token_version, roles)
 *   2. fetches + decrypts SYLLABAI_JWT_SECRET from the Vercel project env
 *      (PAT already proven to hold Sensitive Environment Access)
 *   3. mints a 300-second operator JWT bound to that row — alg chosen by
 *      key length exactly as apps/api/src/services/identity/jwt.ts
 *   4. GET /api/v1/admin/llm/chain-health with the bearer token
 *   5. prints ONLY the HTTP status and the health report (which is
 *      secret-free by the frozen snapshotsNeverCarrySecrets law)
 *
 * The minted token and the decrypted secret are NEVER printed, logged or
 * written anywhere. They live only in process memory for this run.
 *
 * Run:
 *   PROD_DATABASE_URL=postgres://... \
 *   VERCEL_TOKEN=vcp_... VERCEL_PROJECT_ID=prj_... VERCEL_TEAM_ID=team_... \
 *   bun run scripts/t-r11-chain-health-verify.ts
 */
import { neon } from "@neondatabase/serverless";
import { createHmac } from "node:crypto";

const DB_URL = process.env.PROD_DATABASE_URL ?? "";
const VERCEL_TOKEN = process.env.VERCEL_TOKEN ?? "";
const PROJECT_ID = process.env.VERCEL_PROJECT_ID ?? "prj_FN5XQUMbpqKhZXFXpT80OdsKveJZ";
const TEAM_ID = process.env.VERCEL_TEAM_ID ?? "team_ULL54qkhzKBmnKrpO6BD4mYX";
const API_BASE = process.env.PROD_API_BASE ?? "https://syllabai-v2.vercel.app";

if (!DB_URL.startsWith("postgres") || !VERCEL_TOKEN) {
  console.error("PROD_DATABASE_URL / VERCEL_TOKEN missing");
  process.exit(2);
}

const b64u = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

async function vercel<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!res.ok) throw new Error(`vercel ${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

// ── 1. ADMIN row of record ────────────────────────────────────────────────
const sql = neon(DB_URL);
const admins = (await sql`
  select u.id, u.email, u.enabled, u.token_version,
         array_agg(r.role) as roles
  from users u join user_roles r on r.user_id = u.id
  where u.enabled = true and r.role = 'ADMIN'
  group by u.id, u.email, u.enabled, u.token_version
  order by u.created_at asc limit 1
`) as Array<{ id: string; email: string; token_version: string; roles: string[] }>;
if (admins.length === 0) throw new Error("no enabled ADMIN row in prod");
const admin = admins[0];

// ── 2. JWT secret (decrypted, in-memory only) ─────────────────────────────
const envList = await vercel<{ envs: Array<{ id: string; key: string }> }>(
  `/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`,
);
const jwtEnv = envList.envs.find((e) => e.key === "SYLLABAI_JWT_SECRET");
if (!jwtEnv) throw new Error("SYLLABAI_JWT_SECRET not found on project env");
const jwtSecretRes = await vercel<{ value?: string }>(
  `/v9/projects/${PROJECT_ID}/env/${jwtEnv.id}?decrypt=true&teamId=${TEAM_ID}`,
);
const secret = jwtSecretRes.value ?? "";
if (secret.length < 32) throw new Error("decrypted JWT secret too short — decrypt blocked?");

// ── 3. mint the 300s operator token (JwtService wire parity) ──────────────
const keyBytes = Buffer.byteLength(secret, "utf8");
const alg = keyBytes >= 64 ? "HS512" : keyBytes >= 48 ? "HS384" : "HS256";
const digest = alg === "HS512" ? "sha512" : alg === "HS384" ? "sha384" : "sha256";
const now = Math.floor(Date.now() / 1000);
const header = b64u(JSON.stringify({ alg }));
const payload = b64u(
  JSON.stringify({
    sub: admin.email,
    jti: admin.id,
    uid: admin.id,
    ver: Number(admin.token_version),
    roles: admin.roles,
    iat: now,
    exp: now + 300,
  }),
);
const sig = b64u(Buffer.from(createHmac(digest, Buffer.from(secret, "utf8")).update(`${header}.${payload}`).digest()));
const token = `${header}.${payload}.${sig}`;

// ── 4. chain-health on the deployed API ───────────────────────────────────
const res = await fetch(`${API_BASE}/api/v1/admin/llm/chain-health`, {
  headers: { Authorization: `Bearer ${token}` },
});
const body = await res.text();

// ── 5. print ONLY the outcome (report is secret-free by law) ──────────────
let pretty = body;
try {
  const j = JSON.parse(body) as { chainAvailable?: boolean; providers?: Record<string, unknown> };
  pretty = JSON.stringify(
    {
      chainAvailable: j.chainAvailable,
      providers: Object.fromEntries(
        Object.entries(j.providers ?? {}).map(([k, v]) => {
          const p = v as { configured?: boolean; healthy?: boolean; effectiveModel?: string; coolingDown?: boolean };
          return [k, { configured: p.configured, healthy: p.healthy, coolingDown: p.coolingDown, effectiveModel: p.effectiveModel }];
        }),
      ),
    },
    null,
    2,
  );
} catch {
  // non-JSON (e.g. Boot 401/403 body) — print truncated, it carries no secrets
  pretty = body.slice(0, 300);
}
console.log(`HTTP ${res.status}\n${pretty}`);
console.log(`(operator token: minted HSX alg=${alg} ttl=300s bound to admin row ${admin.id.slice(0, 8)}…, discarded, not stored)`);
