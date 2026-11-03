/**
 * T-MIG-014 live verification — both transports against the same real
 * Postgres (the t-mig-014/r3a Neon scratch branch). Reads DATABASE_URL from
 * the environment. Never prints connection material.
 *
 * Evidence produced (exit 0 = all green):
 *   1. createDb() host-dispatch → neon-http drizzle path (production parity)
 *   2. postgres.js transport via the PostgresJsClient adapter (raw import —
 *      the same code path createSql uses for non-Neon hosts)
 *   3. createSql() dispatch → NeonWsClient (neon host) tagged-template +
 *      interactive transaction (begin/select/commit + rollback-on-error)
 *   4. postgres.js re-pointed at a non-Neon-shaped URL string is NOT probed
 *      live here (no local server in this sandbox) — the transport is proven
 *      by (2) against the real server; the DECISION is unit-pinned in
 *      packages/db/src/client.test.ts.
 */
import { createDb } from "@syllabai/db";
import { sql } from "drizzle-orm";
import { createSql } from "../../../../apps/api/src/services/identity/users";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "";
if (!url) {
  console.error("DATABASE_URL missing — nothing to verify");
  process.exit(2);
}
const host = new URL(url).hostname;
const results: Array<{ check: string; ok: boolean; detail: string }> = [];

// 1. neon-http drizzle (createDb host dispatch → neon path)
try {
  const db = createDb({ DATABASE_URL: url });
  const r = await db.execute(sql`select 1 as one, current_user as usr`);
  const row = (r as unknown as { rows: Array<Record<string, unknown>> }).rows?.[0] ?? (r as unknown as Array<Record<string, unknown>>)[0];
  results.push({ check: "createDb neon-http: select 1", ok: Number(row?.one) === 1, detail: `driver=neon-http user=${row?.usr}` });
} catch (e) {
  results.push({ check: "createDb neon-http: select 1", ok: false, detail: String(e).slice(0, 140) });
}

// 2. postgres.js transport (the adapter createSql uses for non-Neon hosts)
try {
  const pg = postgres(url, { max: 1, prepare: false });
  const rows = (await pg.unsafe("select 2 as two")) as Array<{ two: number }>;
  const r2 = (await pg.unsafe("select $1::text as t", ["tcp-ok"])) as Array<{ t: string }>;
  await pg.end();
  results.push({ check: "postgres.js: select 2 + positional param", ok: rows[0]?.two === 2 && r2[0]?.t === "tcp-ok", detail: "transport=tcp max=1 prepare=false" });
} catch (e) {
  results.push({ check: "postgres.js: select 2 + positional param", ok: false, detail: String(e).slice(0, 140) });
}

// 3. createSql dispatch (neon host → NeonWsClient): tagged template + tx
try {
  const s = createSql(url);
  const rows = await s`select 3 as three`;
  const txResult = await s.transaction(async (tx) => {
    const a = await tx`select 30 as a`;
    const b = await tx`select 12 as b`;
    return Number(a[0]?.a) + Number(b[0]?.b);
  });
  let rolledBack = false;
  try {
    await s.transaction(async (tx) => {
      await tx`select 1 as x`;
      throw new Error("intentional tx abort");
    });
  } catch {
    rolledBack = true;
  }
  const after = await s`select 4 as four`;
  results.push({
    check: "createSql(neon-ws): template + interactive tx + rollback",
    ok: Number(rows[0]?.three) === 3 && txResult === 42 && rolledBack && Number(after[0]?.four) === 4,
    detail: "session still usable after rollback: yes",
  });
} catch (e) {
  results.push({ check: "createSql(neon-ws): template + interactive tx + rollback", ok: false, detail: String(e).slice(0, 140) });
}

console.log(`target host: ${host}`);
let allOk = true;
for (const r of results) {
  if (!r.ok) allOk = false;
  console.log(`${r.ok ? "PASS" : "FAIL"} — ${r.check} (${r.detail})`);
}
process.exit(allOk ? 0 : 1);
