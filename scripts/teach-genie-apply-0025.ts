/**
 * T-TEACHGENIE-001 — migration 0025 apply driver (the teach_objectives
 * ordinal CHECK relax 1–4 → 1–8 that In-Depth "Objective 1/6" requires).
 *
 * House regime of record (t-teachme-1-db-apply-0020-0021 + apply-0024
 * precedents, the 0007 disclosure law):
 *   - RAW SQL from packages/db/drizzle/0025_teach-genie-objectives.sql, ONE
 *     transaction, lock_timeout=5s, statement_timeout=60s. NO drizzle
 *     bookkeeping is created; flyway_schema_history is untouched.
 *   - preflight BEFORE any DDL: teach_objectives present; the of-record
 *     ordinal CHECK is semantically 1–4 (BETWEEN spelling or the catalog's
 *     canonical >=/<= pair — run-002 fix; fail-closed on any other bounds);
 *     census of columns/FKs/indexes/triggers + row counts.
 *     IDEMPOTENT: if the CHECK is already semantically 1–8 the driver
 *     honestly no-ops (already_applied=true, exit 0, zero DDL).
 *   - post-verify AFTER the DDL: the CHECK is semantically 1–8 and the
 *     census is unchanged apart from that one constraint (columns, FKs,
 *     indexes and the ADR-040 D1 append-only trigger all still present).
 *   - a receipt JSON is ALWAYS written (even on failure) — honest red.
 *     Credentials never enter the receipt: only the endpoint host is recorded.
 *
 * CLI:
 *   bun scripts/teach-genie-apply-0025.ts --db file:/tmp/uri.file \
 *     --receipt receipt.json
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
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

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const MIG_0025 = path.join(REPO_ROOT, "packages/db/drizzle/0025_teach-genie-objectives.sql");

const sqlText = readFileSync(MIG_0025, "utf8");
const migration = {
        file: path.relative(REPO_ROOT, MIG_0025),
        sha256: createHash("sha256").update(sqlText).digest("hex"),
        statements: sqlText
                .split(/-->\s*statement-breakpoint/g)
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
};

// ── URI handling (never logged) ──────────────────────────────────────────────
let uri = dbArg.startsWith("file:") ? readFileSync(dbArg.slice(5), "utf8").trim() : dbArg;
uri = uri.trim();
if (!uri.includes("sslmode=")) uri += (uri.includes("?") ? "&" : "?") + "sslmode=require";
const uriHost = new URL(uri).host; // host is safe to record; credentials are not

// ── receipt plumbing (honest red on any path) ────────────────────────────────
const receipt: Record<string, unknown> = {
        card: "T-TEACHGENIE-001",
        driver: "scripts/teach-genie-apply-0025.ts",
        migration: migration.file,
        migration_sha256: migration.sha256,
        db_host: uriHost,
        mode: "apply-0025",
        started_at: new Date().toISOString(),
};
const writeReceipt = (ok: boolean) => {
        receipt.finished_at = new Date().toISOString();
        receipt.ok = ok;
        writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
};

const sql = postgres(uri, { max: 1, prepare: false, connect_timeout: 15 });

type CenusRow = { kind: string; name: string };
async function census(): Promise<{ columns: CenusRow[]; fks: CenusRow[]; indexes: CenusRow[]; triggers: CenusRow[]; objectiveRows: number; sessionRows: number }> {
        const columns = await sql`SELECT 'column' AS kind, column_name AS name FROM information_schema.columns WHERE table_schema='public' AND table_name='teach_objectives' ORDER BY column_name`;
        const fks = await sql`SELECT 'fk' AS kind, conname AS name FROM pg_constraint WHERE conrelid='public.teach_objectives'::regclass AND contype='f' ORDER BY conname`;
        const indexes = await sql`SELECT 'index' AS kind, indexname AS name FROM pg_indexes WHERE schemaname='public' AND tablename='teach_objectives' ORDER BY indexname`;
        const triggers = await sql`SELECT 'trigger' AS kind, tgname AS name FROM pg_trigger WHERE tgrelid='public.teach_objectives'::regclass AND NOT tgisinternal ORDER BY tgname`;
        const counts = await sql`SELECT (SELECT count(*) FROM public.teach_objectives)::int AS objectives, (SELECT count(*) FROM public.teach_sessions)::int AS sessions`;
        return {
                columns: columns.map((r) => ({ kind: r.kind as string, name: r.name as string })),
                fks: fks.map((r) => ({ kind: r.kind as string, name: r.name as string })),
                indexes: indexes.map((r) => ({ kind: r.kind as string, name: r.name as string })),
                triggers: triggers.map((r) => ({ kind: r.kind as string, name: r.name as string })),
                objectiveRows: counts[0]!.objectives as number,
                sessionRows: counts[0]!.sessions as number,
        };
}

async function ordinalCheckDef(): Promise<string | null> {
        const rows = await sql`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='public.teach_objectives'::regclass AND conname='teach_objectives_ordinal_check'`;
        return rows.length ? (rows[0]!.def as string) : null;
}

/**
 * SEMANTIC shape matching (run-002 fix): pg_get_constraintdef renders the
 * stored CHECK in the CATALOG's canonical form — `CHECK (((ordinal >= 1) AND
 * (ordinal <= 4)))` — not the drizzle-authoring `ordinal BETWEEN 1 AND 4`
 * (the migration's own ADD CONSTRAINT text is normalized on storage the same
 * way). Match the BOUNDS, not the spelling: BETWEEN form or >=/<= pair,
 * whitespace/prefix tolerant, so the fail-closed gate judges semantics
 * (1..4 may be relaxed; 1..8 is the applied end-state; anything else refuses).
 */
function checkDefBounds(def: string): "old" | "new" | "other" {
        const d = def.replace(/\s+/g, " ");
        if (/BETWEEN 1 AND 4/i.test(d) || (/ordinal >= 1/i.test(d) && /ordinal <= 4/i.test(d))) return "old";
        if (/BETWEEN 1 AND 8/i.test(d) || (/ordinal >= 1/i.test(d) && /ordinal <= 8/i.test(d))) return "new";
        return "other";
}

try {
        // ── preflight ────────────────────────────────────────────────────────────
        const table = await sql`SELECT to_regclass('public.teach_objectives') AS t`;
        if (!table[0] || table[0].t === null) {
                throw new Error("preflight fail-closed: public.teach_objectives does not exist (0020 not applied here?)");
        }
        const before = await census();
        const defBefore = await ordinalCheckDef();
        receipt.preflight = { table_present: true, ordinal_check_before: defBefore, census_before: before };

        if (defBefore !== null && checkDefBounds(defBefore) === "new") {
                receipt.already_applied = true;
                receipt.note = "ordinal CHECK already relaxed to 1–8 — honest no-op, zero DDL executed";
                console.log("0025 already applied on this database — no-op");
                writeReceipt(true);
                process.exit(0);
        }
        if (defBefore === null || checkDefBounds(defBefore) !== "old") {
                throw new Error(`preflight fail-closed: unexpected ordinal CHECK shape (${defBefore ?? "absent"}) — refusing to touch it`);
        }

        // ── apply: ONE transaction, lock/statement timeouts, raw SQL of record ──
        await sql.begin(async (tx) => {
                await tx.unsafe(`SET LOCAL lock_timeout = '5s'`);
                await tx.unsafe(`SET LOCAL statement_timeout = '60s'`);
                for (const stmt of migration.statements) {
                        await tx.unsafe(stmt);
                }
        });
        receipt.applied_statements = migration.statements.length;

        // ── post-verify ──────────────────────────────────────────────────────────
        const defAfter = await ordinalCheckDef();
        const after = await census();
        if (defAfter === null || checkDefBounds(defAfter) !== "new") {
                throw new Error(`post-verify fail-closed: ordinal CHECK after DDL reads (${defAfter ?? "absent"})`);
        }
        const stripConstraint = (c: { columns: CenusRow[]; fks: CenusRow[]; indexes: CenusRow[]; triggers: CenusRow[]; objectiveRows: number; sessionRows: number }) =>
                JSON.stringify({ columns: c.columns.sort(), fks: c.fks.sort(), indexes: c.indexes.sort(), triggers: c.triggers.sort(), objectiveRows: c.objectiveRows, sessionRows: c.sessionRows });
        if (stripConstraint(before) !== stripConstraint(after)) {
                throw new Error("post-verify fail-closed: census drift beyond the ordinal CHECK — aborting receipt as red");
        }
        receipt.post_verify = { ordinal_check_after: defAfter, census_unchanged_apart_from_check: true, census_after: after };
        receipt.ok = true;
        console.log("0025 applied + verified: teach_objectives_ordinal_check now BETWEEN 1 AND 8");
        writeReceipt(true);
} catch (err) {
        receipt.error = err instanceof Error ? err.message : String(err);
        console.error("0025 apply FAILED:", receipt.error);
        writeReceipt(false);
        process.exitCode = 1;
} finally {
        await sql.end({ timeout: 5 });
}
