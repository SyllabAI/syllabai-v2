/**
 * T-TEACHGENIE-005 · run-001 · scripts/t-teachgenie5-apply-0028.ts
 *
 * The teach-tables DML grants driver — the environment-plane fix the LIVE
 * pilot (T-TEACHGENIE-003 run-002, receipt on main, PR #799) demanded:
 * every write path that issues an UPDATE on teach_sessions 500s generically
 * on production (sub-floor nudge, BOTH judged turns post-writes, end-session)
 * while INSERT/SELECT succeed and the fixture suite passes 22/22 on the same
 * code. Root cause of record: the app role (syllabai_v2_app_w2r2) holds
 * INSERT/SELECT but NOT UPDATE on teach_sessions — the F5-S7 grants class
 * (the teach tables were created 2026-11-01 by the 0020/0021 band BEFORE the
 * driver-grants law existed, so the app-role DML grants were never completed;
 * the T-TIER1 lane later granted its OWN six tables and proved the prod
 * secret owner-capable).
 *
 * GRANTS-ONLY driver (no DDL, no drizzle bookkeeping — grants are not schema;
 * the F5-S7 law applies them in-driver, the t-tier1-apply precedent):
 *   - preflight: public.users present (the syllabai schema marker); all SIX
 *     teach tables present with a full per-table census (owner, columns, PK,
 *     FKs, indexes, CHECKs, current app-role grants) — any missing table
 *     fails CLOSED (the operator decides, the driver never guesses).
 *   - ownership gate (the 0025 run-005 law, keyed on public.users' owner):
 *     if the connected role is not the owner, SET ROLE on the membership
 *     path; no membership → fail-closed with both roles named, zero SQL.
 *     Per-table owners are recorded honestly (a differently-owned teach
 *     table would fail the GRANT inside the transaction → full rollback,
 *     honest red receipt).
 *   - apply: ONE transaction, lock_timeout=5s, statement_timeout=60s;
 *     GRANT SELECT,INSERT,UPDATE,DELETE ON the six teach tables TO the app
 *     role. Idempotent re-grant by nature (GRANT is a no-op when present).
 *     PKs are uuid everywhere — no sequence grants exist to make.
 *   - post-verify: role_table_grants census (4 verbs × 6 tables) AND the
 *     has_table_privilege wire proof (4 DML verbs × 6 tables, read from the
 *     grantor side, NO impersonation — the t-tier1 run-001 COW catch law).
 *     Any miss = honest red receipt.
 *   - a receipt JSON is ALWAYS written (even on failure). Credentials never
 *     enter the receipt: only the endpoint host is recorded.
 *   - REVERSIBILITY of record (disclosed in the receipt): the exact rollback
 *     is REVOKE UPDATE, DELETE ON the six tables FROM the app role (the
 *     append-only law on teach_objective_coverages lives in its trigger and
 *     survives any grant state).
 *
 * CLI:
 *   bun scripts/t-teachgenie5-apply-0028.ts --db file:/tmp/uri.file \
 *     --receipt receipt.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";

// ── CLI ──────────────────────────────────────────────────────────────────────
function arg(name: string): string {
        const i = process.argv.indexOf(`--${name}`);
        if (i === -1 || i + 1 >= process.argv.length) {
                console.error(`missing --${name}`);
                process.exit(2);
        }
        return process.argv[i + 1]!;
}

const dbArg = arg("db");
const receiptPath = arg("receipt");

/** The of-record app role (F5-S7 production-ddl-snapshot-20261020 grant law). */
const APP_ROLE = "syllabai_v2_app_w2r2";

/** The six teach_* tables of record (migrations 0020 + 0021 + 0025). */
const TABLES = [
        "teach_sessions",
        "teach_objectives",
        "teach_objective_coverages",
        "teach_misconception_candidates",
        "teach_messages",
        "teach_review_cards",
] as const;

const VERBS = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;

// ── URI handling (never logged) ──────────────────────────────────────────────
let uri = dbArg.startsWith("file:") ? readFileSync(dbArg.slice(5), "utf8").trim() : dbArg;
uri = uri.trim();
if (!uri.includes("sslmode=")) uri += (uri.includes("?") ? "&" : "?") + "sslmode=require";
const uriHost = new URL(uri).host; // host is safe to record; credentials are not

// ── receipt plumbing (honest red on any path) ────────────────────────────────
const receipt: Record<string, unknown> = {
        card: "T-TEACHGENIE-005",
        driver: "scripts/t-teachgenie5-apply-0028.ts",
        lane: "teach-tables DML grants (the T-TEACHGENIE-003 run-002 LIVE-pilot blocker fix)",
        db_host: uriHost,
        app_role: APP_ROLE,
        mode: "grants-only-0028",
        rollback_of_record: `REVOKE UPDATE, DELETE ON public.teach_sessions, public.teach_objectives, public.teach_objective_coverages, public.teach_misconception_candidates, public.teach_messages, public.teach_review_cards FROM ${APP_ROLE};`,
        started_at: new Date().toISOString(),
};
const writeReceipt = (ok: boolean) => {
        receipt.finished_at = new Date().toISOString();
        receipt.ok = ok;
        writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
};

const sql = postgres(uri, { max: 1, prepare: false, connect_timeout: 15 });

type CensusRow = { kind: string; name: string };

async function tableCensus(table: string) {
        const exists = (await sql`SELECT to_regclass(${`public.${table}`}) AS t`)[0]?.t !== null;
        if (!exists) return { table, exists: false as const };
        const columns = (
                await sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=${table} ORDER BY column_name`
        ).length;
        const pk = await sql`SELECT conname FROM pg_constraint WHERE conrelid=${`public.${table}`}::regclass AND contype='p'`;
        const fks = await sql`SELECT conname, confdeltype FROM pg_constraint WHERE conrelid=${`public.${table}`}::regclass AND contype='f'`;
        const indexes = (
                await sql`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename=${table} ORDER BY indexname`
        ).map((r) => r.indexname as string);
        const checks = (await sql`SELECT conname FROM pg_constraint WHERE conrelid=${`public.${table}`}::regclass AND contype='c'`).length;
        const owner = (await sql`SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename=${table}`)[0]?.tableowner as string | undefined;
        const grants = (
                await sql`SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name=${table} AND grantee=${APP_ROLE} ORDER BY privilege_type`
        ).map((r) => r.privilege_type as string);
        return { table, exists: true as const, owner, columns, pk: pk.map((r) => r.conname as string), fks, indexes, checks, app_role_grants: grants };
}

async function usersFacts() {
        const t = (await sql`SELECT to_regclass('public.users') AS t`)[0]?.t;
        if (t === null) return null;
        const owner = (await sql`SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='users'`)[0]?.tableowner as string | undefined;
        const rows = (await sql`SELECT count(*)::int AS n FROM public.users`)[0]?.n as number;
        return { table: "public.users", owner, rows };
}

async function appRoleExists(): Promise<boolean> {
        return (await sql`SELECT 1 AS ok FROM pg_roles WHERE rolname=${APP_ROLE}`)[0] !== undefined;
}

try {
        // ── preflight ────────────────────────────────────────────────────────────
        const users = await usersFacts();
        if (!users) throw new Error("preflight fail-closed: public.users does not exist (not the syllabai schema?)");
        receipt.preflight = { users };

        const before = await Promise.all(TABLES.map((t) => tableCensus(t)));
        const missing = before.filter((c) => !c.exists).map((c) => c.table);
        if (missing.length > 0) {
                receipt.preflight = { users, teach_tables: before };
                throw new Error(`preflight fail-closed: teach table(s) [${missing.join(", ")}] missing on the target — the 0020/0021 band was never applied here; zero SQL executed`);
        }
        receipt.teach_tables_before = before;

        // ── ownership gate (the 0025 run-005 law, keyed on public.users' owner) ──
        const tableOwner = users.owner;
        const meRow = (await sql`SELECT current_user AS u`)[0]?.u as string | undefined;
        const member =
                tableOwner && meRow ? ((await sql`SELECT pg_has_role(current_user::text, ${tableOwner}, 'member') AS m`)[0]?.m as boolean) : false;
        const ownership: {
                users_owner: string | null;
                connected_as: string | null;
                member_of_owner: boolean;
                set_role_used: string | null;
                teach_table_owners: string[];
        } = {
                users_owner: tableOwner ?? null,
                connected_as: meRow ?? null,
                member_of_owner: member,
                set_role_used: null,
                teach_table_owners: [...new Set(before.flatMap((c) => (c.exists && "owner" in c && typeof c.owner === "string" && c.owner ? [c.owner] : [])))],
        };
        receipt.ownership = ownership;
        if (tableOwner && meRow && tableOwner !== meRow) {
                if (!member) {
                        throw new Error(
                                `fail-closed ownership gate: connected as ${meRow}, users owned by ${tableOwner}, no role membership — GRANT would refuse; zero SQL executed`,
                        );
                }
                await sql.unsafe(`SET ROLE "${tableOwner.replace(/"/g, '""')}"`);
                ownership.set_role_used = tableOwner;
                console.log(`SET ROLE ${tableOwner} (membership path)`);
        }

        const rolePresent = await appRoleExists();
        receipt.app_role_present = rolePresent;
        if (!rolePresent) {
                throw new Error(`fail-closed: app role ${APP_ROLE} does not exist on the target — nothing to grant to; zero SQL executed`);
        }

        // ── apply: ONE transaction, lock/statement timeouts, idempotent re-grant ─
        await sql.begin(async (tx) => {
                await tx.unsafe(`SET LOCAL lock_timeout = '5s'`);
                await tx.unsafe(`SET LOCAL statement_timeout = '60s'`);
                for (const t of TABLES) {
                        await tx.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."${t.replace(/"/g, '""')}" TO ${APP_ROLE}`);
                }
        });
        receipt.applied = `GRANT SELECT, INSERT, UPDATE, DELETE ON the six teach_* tables TO ${APP_ROLE} (one transaction, idempotent re-grant)`;
        console.log("grants applied (6 tables × 4 DML verbs)");

        // ── post-verify: role_table_grants census ────────────────────────────────
        const after = await Promise.all(TABLES.map((t) => tableCensus(t)));
        const grantErrors: string[] = [];
        for (const c of after) {
                if (!c.exists) {
                        grantErrors.push(`table ${c.table} MISSING after apply`);
                        continue;
                }
                const need = VERBS as readonly string[];
                const missingGrants = need.filter((p) => !(c as { app_role_grants: string[] }).app_role_grants.includes(p));
                if (missingGrants.length > 0)
                        grantErrors.push(`${c.table}: app role ${APP_ROLE} missing grants [${missingGrants.join(", ")}] (have [${(c as { app_role_grants: string[] }).app_role_grants.join(", ")}])`);
        }
        receipt.post_verify_census = after;
        if (grantErrors.length > 0) {
                receipt.post_verify = { errors: grantErrors };
                throw new Error(`post-verify fail-closed: ${grantErrors.length} grant miss(es) — first: ${grantErrors[0]}`);
        }

        // ── app-role DML wire proof (the t-tier1 run-001 COW catch law):
        // has_table_privilege reads the same ACLs the planner consults, from the
        // grantor side, with NO impersonation (the owner role is not a MEMBER of
        // the app role, so SET ROLE impersonation is refused even when the grants
        // are correctly in place). THE PROOF OF RECORD the run-002 receipt named. ─
        const denied: string[] = [];
        for (const t of TABLES) {
                for (const p of VERBS) {
                        const ok = (await sql`SELECT has_table_privilege(${APP_ROLE}, ${`public.${t}`}, ${p}) AS ok`)[0]?.ok as boolean;
                        if (!ok) denied.push(`${APP_ROLE} lacks ${p} on public.${t}`);
                }
        }
        if (denied.length > 0) {
                receipt.app_role_privilege_proof = { denied };
                throw new Error(`app-role DML wire proof fail-closed: ${denied.length} denial(s) — first: ${denied[0]}`);
        }
        receipt.app_role_privilege_proof = `all 4 DML verbs × all 6 teach_* tables granted to ${APP_ROLE} (has_table_privilege, no impersonation)`;

        receipt.ok = true;
        writeReceipt(true); // the receipt law: ALWAYS written — even on success
        console.log("0028 grants verified (has_table_privilege 4 verbs × 6 tables)");
} catch (err) {
        receipt.error = err instanceof Error ? err.message : String(err);
        console.error("T-TEACHGENIE-005 apply FAILED:", receipt.error);
        writeReceipt(false);
        process.exitCode = 1;
} finally {
        await sql.end({ timeout: 5 });
}
