/**
 * T-TEACH-011 apply chain, step 1 — migration 0006 apply driver (FROZEN once
 * green). Owning task of the migration is T-TEACH-002 (ADR-CLASS-0001); this
 * driver exists because the T-TEACH-011 cow-proof run of record (CI run
 * 39768229860, 2026-10-22) PROVED class_features ABSENT on the production
 * Neon branch — 0006 was authored but never applied there, and 0008 (the
 * Teaching Toolkit migration) FK/ALTER-references class_features. The apply
 * chain of record is therefore: 0006 → seed-course-registry → 0008.
 *
 * House regime (T-SM-KAPPA-SUBJECT operator-order-r0): raw SQL, NO drizzle
 * bookkeeping, preflight, backup-first (class_features/course_registry are
 * CREATE targets — nothing to back up unless a prior partial apply left
 * rows; any such state FAILS the preflight instead), ONE transaction per
 * file, lock_timeout=5s, full post-verify, receipt ALWAYS written.
 *
 * CLI: bun scripts/t-teach-011-apply-0006.ts --db file:/tmp/uri --mode apply \
 *        --receipt receipt-0006.json
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

function arg(name: string): string {
	const i = process.argv.indexOf(`--${name}`);
	if (i === -1 || i + 1 >= process.argv.length) {
		console.error(`missing --${name}`);
		process.exit(2);
	}
	return process.argv[i + 1]!;
}

const dbArg = arg("db");
const mode = arg("mode");
const receiptPath = arg("receipt");

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const MIGRATION = path.join(REPO_ROOT, "packages/db/drizzle/0006_class_feature_toggles.sql");

const migrationSql = readFileSync(MIGRATION, "utf8");
const migrationSha = createHash("sha256").update(migrationSql).digest("hex");

// token-anchored split (drizzle-kit renders separators after the ";", mostly
// same-line — first-hand census on 0008; 0006 renders standalone lines)
const statements = migrationSql
	.split(/-->\s*statement-breakpoint/g)
	.map((s) => s.trim())
	.filter((s) => s.length > 0);

let uri = dbArg.startsWith("file:") ? readFileSync(dbArg.slice(5), "utf8").trim() : dbArg;
uri = uri.trim();
if (!uri.includes("sslmode=")) uri += (uri.includes("?") ? "&" : "?") + "sslmode=require";
const uriHost = new URL(uri).host;

const t0 = Date.now();
const receipt: Record<string, unknown> = {
	task: "T-TEACH-011 apply chain (step 1) — migration 0006_class_feature_toggles (owner T-TEACH-002)",
	mode,
	target_host: uriHost,
	migration_file: "packages/db/drizzle/0006_class_feature_toggles.sql",
	migration_sha256: migrationSha,
	statement_count: statements.length,
	preflight: null as unknown,
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
	const ident = await sql`select current_database() as db, version() as v`;
	console.log("connected:", ident[0]!.db, "|", String(ident[0]!.v).split(",")[0]);

	const tableExists = async (t: string) =>
		(await sql`select to_regclass(${"public." + t}) is not null as ok`)[0]!.ok as boolean;

	// ── preflight: referenced present, targets absent ──────────────────────────
	if (!(await tableExists("classes"))) fail("preflight: public.classes ABSENT (FK target)");
	const pre = {
		classes_present: true,
		class_features_absent: !(await tableExists("class_features")),
		course_registry_absent: !(await tableExists("course_registry")),
	};
	receipt.preflight = pre;
	if (!pre.class_features_absent) fail("preflight: class_features ALREADY EXISTS (partial apply? manual reconcile first)");
	if (!pre.course_registry_absent) fail("preflight: course_registry ALREADY EXISTS (partial apply? manual reconcile first)");

	if (mode === "preflight") {
		receipt.verdict = "PREFLIGHT-OK";
		receipt.elapsed_ms = Date.now() - t0;
		writeFileSync(receiptPath, JSON.stringify(receipt, null, 1));
		await sql.end();
		console.log("preflight OK — no DDL executed");
		process.exit(0);
	}

	// ── apply: ONE transaction ─────────────────────────────────────────────────
	await sql.begin(async (tx) => {
		await tx.unsafe("SET LOCAL lock_timeout = '5s'");
		await tx.unsafe("SET LOCAL statement_timeout = '60s'");
		for (let i = 0; i < statements.length; i++) {
			const st = statements[i]!;
			const s0 = Date.now();
			await tx.unsafe(st);
			(receipt.applied as { i: number; head: string; ms: number }[]).push({
				i, head: st.replace(/\s+/g, " ").slice(0, 72), ms: Date.now() - s0,
			});
			console.log(`stmt ${i + 1}/${statements.length} ok (${Date.now() - s0}ms)`);
		}
	});
	console.log("transaction COMMIT — 0006 applied in one pass");

	// ── post-verify ────────────────────────────────────────────────────────────
	const cols = async (t: string) =>
		(
			await sql`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name=${t} order by ordinal_position`
		).map((r) => ({ name: r.column_name, type: r.data_type, nullable: r.is_nullable, default: r.column_default }));

	const checks: Record<string, unknown> = {};
	const cfCols = await cols("class_features");
	const crCols = await cols("course_registry");
	checks.class_features_columns_exact =
		JSON.stringify(cfCols.map((c) => c.name)) ===
		JSON.stringify(["class_id", "smart_mark", "tutor", "cla", "updated_at", "updated_by"]);
	checks.class_features_defaults_true =
		cfCols.filter((c) => ["smart_mark", "tutor", "cla"].includes(c.name)).every((c) => c.default === "true");
	checks.course_registry_columns_exact =
		JSON.stringify(crCols.map((c) => c.name)) ===
		JSON.stringify(["course_slug", "curriculum_code", "level", "subject", "code", "board", "label", "status", "source", "synced_at"]);

	const fks = (
		await sql`select conname, confdeltype from pg_constraint where conrelid='public.class_features'::regclass and contype='f'`
	).map((r) => ({ name: r.conname, on_delete: r.confdeltype }));
	checks.fk_class_features_class_cascade =
		fks.length === 1 && fks[0]!.name === "fk_class_features_class" && fks[0]!.on_delete === "c";

	checks.index_ix_course_registry_cc =
		(await sql`select 1 from pg_indexes where schemaname='public' and indexname='ix_course_registry_cc'`).length === 1;

	receipt.postverify = checks;
	const hard = [
		checks.class_features_columns_exact, checks.class_features_defaults_true,
		checks.course_registry_columns_exact, checks.fk_class_features_class_cascade,
		checks.index_ix_course_registry_cc,
	];
	if (!hard.every(Boolean)) fail(`post-verify hard checks failed: ${JSON.stringify(hard)}`);

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
