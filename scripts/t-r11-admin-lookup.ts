/**
 * T-TEACHME-001 vercel-activation leg — read-only lookup of enabled ADMIN
 * accounts in the PRODUCTION database. Used to mint a single-use, 5-minute
 * operator JWT for GET /api/v1/admin/llm/chain-health verification.
 * NO writes. NO credentials printed.
 *
 * Run: PROD_DATABASE_URL=postgres://... bun run scripts/t-r11-admin-lookup.ts
 */
import { neon } from "@neondatabase/serverless";

const uri = process.env.PROD_DATABASE_URL;
if (!uri || !uri.startsWith("postgres")) {
  console.error("PROD_DATABASE_URL missing");
  process.exit(2);
}

const sql = neon(uri);

const rows = (await sql`
  select u.id, u.email, u.enabled, u.token_version,
         coalesce(array_agg(r.role) filter (where r.role is not null), '{}') as roles
  from users u
  left join user_roles r on r.user_id = u.id
  group by u.id, u.email, u.enabled, u.token_version
  having u.enabled = true
     and 'ADMIN' = any(coalesce(array_agg(r.role) filter (where r.role is not null), '{}'))
  order by u.created_at asc
  limit 5
`) as Array<{ id: string; email: string; enabled: boolean; token_version: string; roles: string[] }>;

console.log(JSON.stringify({
  enabledAdminCount: rows.length,
  admins: rows.map((r) => ({
    id: r.id,
    email: r.email.replace(/^(.).*(@.*)$/, "$1***$2"),
    tokenVersion: Number(r.token_version),
    roles: r.roles,
  })),
}, null, 2));
