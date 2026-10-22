/**
 * T-TEACH-011 — migration 0008 apply driver (FROZEN once green).
 *
 * Applies packages/db/drizzle/0008_teaching_toolkit.sql as RAW SQL under the
 * house regime of record (T-SM-KAPPA-SUBJECT operator-order-r0, migration 0007):
 *   - NO drizzle bookkeeping on the live database (production has none; the
 *     Flyway flyway_schema_history at rank 63+ manages the frozen Java core).
 *   - preflight at apply time (referenced tables present, targets absent),
 *   - backup-first (class_features rows — the one Flyway-era table touched —
 *     plus the teaching-toolkit prompt_versions census) BEFORE any DDL,
 *   - ALL statements in ONE transaction, lock_timeout=5s, statement_timeout=60s,
 *   - full post-verify (columns/CHECKs/FKs/index/defaults/seed rows),
 *   - a receipt JSON is ALWAYS written (even on failure) — honest red.
 *
 * CLI:
 *   bun scripts/t-teach-011-apply-0008.ts --db /tmp/uri.file --mode apply \
 *     --receipt receipt.json
 *   (--db accepts a file path containing the URI, chmod 600, or a raw URI;
 *    --mode preflight runs the preflight + backup only, no DDL.)
 *
 * Secrets never enter the receipt: only the endpoint host is recorded.
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
const mode = arg("mode"); // preflight | apply
const receiptPath = arg("receipt");

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const MIGRATION = path.join(REPO_ROOT, "packages/db/drizzle/0008_teaching_toolkit.sql");

const migrationSql = readFileSync(MIGRATION, "utf8");
const migrationSha = createHash("sha256").update(migrationSql).digest("hex");

// drizzle's own statement separator TOKEN — token-anchored, NOT line-anchored:
// drizzle-kit renders most separators appended right after the statement's ";"
// on the same line (first-hand 0008 census: only 2 of 10 are standalone lines).
const statements = migrationSql
        .split(/-->\s*statement-breakpoint/g)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

// ── URI handling (never logged) ──────────────────────────────────────────────
let uri = dbArg.startsWith("file:") ? readFileSync(dbArg.slice(5), "utf8").trim() : dbArg;
uri = uri.trim();
if (!uri.includes("sslmode=")) {
        uri += (uri.includes("?") ? "&" : "?") + "sslmode=require";
}
const uriHost = new URL(uri).host; // host is safe to record; credentials are not

// ── evidence bag ─────────────────────────────────────────────────────────────
const t0 = Date.now();
const receipt: Record<string, unknown> = {
        task: "T-TEACH-011",
        what: "migration 0008_teaching_toolkit raw-SQL apply (no drizzle bookkeeping)",
        mode,
        target_host: uriHost,
        migration_file: "packages/db/drizzle/0008_teaching_toolkit.sql",
        migration_sha256: migrationSha,
        statement_count: statements.length,
        preflight: null as unknown,
        backup: null as unknown,
        applied: [] as { i: number; head: string; ms: number }[],
        postverify: null as unknown,
        verdict: "PENDING",
        errors: [] as string[],
};

function fail(msg: string): never {
        (receipt.errors as string[]).push(msg);
        receipt.verdict = "FAILED";
        receipt.elapsed_ms = Date.now() - t0;
        writeFileSync(receiptPath, JSON.stringify(receipt, null, 1));
        console.error("FAIL:", msg);
        process.exit(1);
}

const sql = postgres(uri, { max: 1, prepare: false, connect_timeout: 15 });

try {
        // ── connectivity + identity ────────────────────────────────────────────────
        const ident = await sql`select version() as v, current_database() as db`;
        console.log("connected:", ident[0]!.db, "|", String(ident[0]!.v).split(",")[0]);

        // ── preflight ──────────────────────────────────────────────────────────────
        const tableExists = async (t: string) =>
                (await sql`select to_regclass(${"public." + t}) is not null as ok`)[0]!.ok as boolean;

        const preRefs = {} as Record<string, boolean>;
        for (const t of ["users", "classes", "class_features", "prompt_versions"]) {
                preRefs[t] = await tableExists(t);
                if (!preRefs[t]) fail(`preflight: referenced table public.${t} is ABSENT`);
        }
        const preToolkitTables = {
                teaching_toolkit_resources: await tableExists("teaching_toolkit_resources"),
                teaching_toolkit_usage: await tableExists("teaching_toolkit_usage"),
        };
        const classFeaturesCol = (
                await sql`select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='class_features' and column_name='ai_toolkit'`
        )[0]!.n as number;

        const classFeaturesCensus = (
                await sql`select count(*)::int as n from class_features`
        )[0]!.n as number;
        const promptSeedCensus = (
                await sql`select count(*)::int as n from prompt_versions where registry_key like ${"teaching-toolkit/%"}`
        )[0]!.n as number;

        receipt.preflight = {
                referenced_tables_present: preRefs,
                toolkit_tables_absent_expected: preToolkitTables,
                class_features_ai_toolkit_already_present: classFeaturesCol > 0,
                class_features_row_census: classFeaturesCensus,
                prompt_versions_toolkit_rows_pre: promptSeedCensus,
                statements_to_apply: statements.length,
        };

        if (mode === "preflight") {
                receipt.verdict = "PREFLIGHT-OK";
                receipt.elapsed_ms = Date.now() - t0;
                writeFileSync(receiptPath, JSON.stringify(receipt, null, 1));
                await sql.end();
                console.log("preflight OK — no DDL executed");
                process.exit(0);
        }

        // ── backup-first (BEFORE any DDL) ──────────────────────────────────────────
        const classFeaturesRows =
                classFeaturesCensus <= 20000
                        ? await sql`select * from class_features order by 1`
                        : (fail(`class_features larger than the backup cap (${classFeaturesCensus} rows) — manual dump required`), []);
        const promptSeedRows =
                promptSeedCensus > 0
                        ? await sql`select registry_key, version, left(template, 80) as template_head from prompt_versions where registry_key like ${"teaching-toolkit/%"} order by registry_key`
                        : [];
        receipt.backup = {
                law: "backup captured BEFORE any DDL (0007 regime)",
                class_features_rows: classFeaturesRows,
                prompt_versions_toolkit_rows_pre: promptSeedRows,
        };

        // ── apply: ONE transaction, lock_timeout=5s ────────────────────────────────
        await sql.begin(async (tx) => {
                await tx.unsafe("SET LOCAL lock_timeout = '5s'");
                await tx.unsafe("SET LOCAL statement_timeout = '60s'");
                for (let i = 0; i < statements.length; i++) {
                        const st = statements[i]!;
                        const s0 = Date.now();
                        await tx.unsafe(st);
                        (receipt.applied as { i: number; head: string; ms: number }[]).push({
                                i,
                                head: st.replace(/\s+/g, " ").slice(0, 72),
                                ms: Date.now() - s0,
                        });
                        console.log(`stmt ${i + 1}/${statements.length} ok (${Date.now() - s0}ms):`, st.replace(/\s+/g, " ").slice(0, 60));
                }
        });
        console.log("transaction COMMIT — all statements applied in one pass");

        // ── post-verify ────────────────────────────────────────────────────────────
        const checks: Record<string, unknown> = {};

        // 1. tables exist
        for (const t of ["teaching_toolkit_resources", "teaching_toolkit_usage"]) {
                checks[`table_${t}`] = await tableExists(t);
        }

        // 2. exact column sets
        const cols = async (t: string) =>
                (
                        await sql`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name=${t} order by ordinal_position`
                ).map((r) => ({ name: r.column_name, type: r.data_type, nullable: r.is_nullable, default: r.column_default }));

        const resourceCols = await cols("teaching_toolkit_resources");
        const usageCols = await cols("teaching_toolkit_usage");
        const expectedResourceCols = [
                "id", "teacher_id", "class_id", "course_slug", "tool_type", "input_metadata",
                "output", "status", "model", "provider_name", "failure_reason", "elapsed_ms", "created_at",
        ];
        const expectedUsageCols = ["teacher_id", "usage_day", "used"];
        checks.resources_columns = resourceCols.map((c) => c.name);
        checks.resources_columns_exact =
                JSON.stringify(resourceCols.map((c) => c.name)) === JSON.stringify(expectedResourceCols);
        checks.usage_columns_exact =
                JSON.stringify(usageCols.map((c) => c.name)) === JSON.stringify(expectedUsageCols);
        checks.status_default_success = resourceCols.find((c) => c.name === "status")?.default === "'SUCCESS'::character varying";
        checks.used_default_zero = usageCols.find((c) => c.name === "used")?.default === "0";

        // 3. CHECK constraints
        const cks = (
                await sql`select conname from pg_constraint where conrelid = 'public.teaching_toolkit_resources'::regclass and contype='c' order by conname`
        ).map((r) => r.conname);
        checks.check_constraints = cks;
        checks.check_constraints_exact =
                JSON.stringify(cks) === JSON.stringify(["ck_toolkit_resources_status", "ck_toolkit_resources_tool_type"]);

        // 4. FKs (target + delete rule) — pg_constraint.confdeltype mapping:
        //    'a'=NO ACTION (pg default), 'n'=SET NULL, 'c'=CASCADE, 'r'=RESTRICT,
        //    'd'=SET DEFAULT. The migration file says class_id=SET NULL and both
        //    teacher FKs=NO ACTION. (Run-002 evidence: live values n/a/a — the
        //    driver's inverted mapping was the only red, the DB was correct.)
        const fks = (
                await sql`select conname, confdeltype from pg_constraint where conrelid in ('public.teaching_toolkit_resources'::regclass,'public.teaching_toolkit_usage'::regclass) and contype='f' order by conname`
        ).map((r) => ({ name: r.conname, on_delete: r.confdeltype }));
        checks.foreign_keys = fks;
        checks.foreign_keys_exact =
                fks.length === 3 &&
                !!fks.find((f) => f.name === "teaching_toolkit_resources_class_id_fkey" && f.on_delete === "n") &&
                !!fks.find((f) => f.name === "teaching_toolkit_resources_teacher_id_fkey" && f.on_delete === "a") &&
                !!fks.find((f) => f.name === "teaching_toolkit_usage_teacher_id_fkey" && f.on_delete === "a");

        // 5. index
        checks.index_ix_toolkit_resources_teacher = (
                (await sql`select 1 from pg_indexes where schemaname='public' and indexname='ix_toolkit_resources_teacher'`).length === 1
        );

        // 6. class_features.ai_toolkit (the ADR-CLASS-0001 gate column)
        const gate = (
                await sql`select data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='class_features' and column_name='ai_toolkit'`
        )[0];
        checks.class_features_ai_toolkit = gate
                ? { type: gate.data_type, nullable: gate.is_nullable, default: gate.column_default }
                : null;
        checks.class_features_ai_toolkit_ok =
                !!gate && gate.data_type === "boolean" && gate.is_nullable === "NO" && gate.column_default === "true";

        // 7. prompt_versions seed rows (the 4 registry keys, v1.0)
        const seeds = (
                await sql`select registry_key, version, length(template) as template_len from prompt_versions where registry_key like ${"teaching-toolkit/%"} order by registry_key`
        ).map((r) => ({ key: r.registry_key, version: r.version, template_len: r.template_len }));
        const expectedSeeds = ["teaching-toolkit/coach", "teaching-toolkit/lesson-plan", "teaching-toolkit/rubric", "teaching-toolkit/sow"];
        checks.prompt_seed_rows = seeds;
        checks.prompt_seed_rows_exact =
                seeds.length === 4 &&
                JSON.stringify(seeds.map((s) => s.key)) === JSON.stringify(expectedSeeds) &&
                seeds.every((s) => s.version === "1.0" && Number(s.template_len) > 500);

        // 8. inventory census (baseline +2)
        const tableCount = (await sql`select count(*)::int as n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`)[0]!.n;
        checks.public_table_count = tableCount;

        receipt.postverify = checks;
        const hardChecks = [
                checks.table_teaching_toolkit_resources,
                checks.table_teaching_toolkit_usage,
                checks.resources_columns_exact,
                checks.usage_columns_exact,
                checks.status_default_success,
                checks.used_default_zero,
                checks.check_constraints_exact,
                checks.foreign_keys_exact,
                checks.index_ix_toolkit_resources_teacher,
                checks.class_features_ai_toolkit_ok,
                checks.prompt_seed_rows_exact,
        ];
        if (!hardChecks.every(Boolean)) fail(`post-verify hard checks failed: ${JSON.stringify(hardChecks)}`);

        receipt.verdict = "APPLIED-AND-VERIFIED";
        receipt.elapsed_ms = Date.now() - t0;
        writeFileSync(receiptPath, JSON.stringify(receipt, null, 1));
        console.log("POST-VERIFY ALL GREEN —", receiptPath);
        await sql.end();
        process.exit(0);
} catch (e) {
        (receipt.errors as string[]).push(String(e));
        receipt.verdict = "FAILED";
        receipt.elapsed_ms = Date.now() - t0;
        writeFileSync(receiptPath, JSON.stringify(receipt, null, 1));
        console.error("FAIL (exception):", String(e));
        await sql.end().catch(() => {});
        process.exit(1);
}
