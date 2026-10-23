/**
 * T-BOOK-OPS f-0011 — migration 0005 (book-rail tables) apply driver
 * (FROZEN once green; protocol-identical to t-teach-011-apply-0008.ts —
 * the 0007 house regime: raw SQL, NO drizzle bookkeeping, backup-first,
 * ONE transaction, lock_timeout=5s, statement_timeout=60s, full
 * post-verify, receipt ALWAYS written even on failure — honest red).
 *
 * WHY THIS LANE EXISTS (f-0011 of record, CourseLessons findings): the
 * production books reader leg 500s at the first DB query — the T-C20
 * discriminator receipt (2026-10-23) proved the route alive (400
 * validation_failed with no courseId) while every DB-touching call 500s.
 * The T-TEACH-011 run-001 COW preflight already proved production LAGS
 * migrations (0006 absent there until applied), so the leading break
 * class is: 0005_book-rail-tables (and possibly parts of the books data
 * leg) never applied to the production branch. The census mode of the
 * t-book-ops-f0011.yml runner pins the class of record BEFORE this
 * driver is dispatched — the apply is the operator's explicit fire order.
 *
 * Applies packages/db/drizzle/0005_book-rail-tables.sql as RAW SQL:
 *   - targets ABSENT required: book_blocks, book_glossary_terms,
 *     chapter_progress (idempotence = refusal, never a blind re-run),
 *   - referenced tables PRESENT required: documents, users, book_chapters,
 *   - backup-first: read-only pre-census of the referenced tables
 *     (documents TEXTBOOK census + book_chapters census) — the targets do
 *     not exist, so there is nothing else to back up,
 *   - ALL 7 statements in ONE transaction,
 *   - post-verify: exact column sets ×3, CHECK constraint names, FK names
 *     + delete rules, the 4 indexes, the SUGGESTED/0/1 defaults,
 *   - receipt JSON (endpoint host recorded; credentials never).
 *
 * CLI:
 *   bun scripts/t-book-ops-apply-0005.ts --db /tmp/uri.file --mode apply \
 *     --receipt receipt.json
 *   (--db accepts a file path containing the URI, chmod 600, or a raw URI;
 *    --mode preflight runs connectivity + preflight + backup only, no DDL.)
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
const MIGRATION = path.join(REPO_ROOT, "packages/db/drizzle/0005_book-rail-tables.sql");

const migrationSql = readFileSync(MIGRATION, "utf8");
const migrationSha = createHash("sha256").update(migrationSql).digest("hex");

// drizzle's own statement separator TOKEN — token-anchored, NOT line-anchored.
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
	task: "T-BOOK-OPS-F0011",
	what: "migration 0005_book-rail-tables raw-SQL apply (no drizzle bookkeeping)",
	mode,
	target_host: uriHost,
	migration_file: "packages/db/drizzle/0005_book-rail-tables.sql",
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
	for (const t of ["documents", "users", "book_chapters"]) {
		preRefs[t] = await tableExists(t);
		if (!preRefs[t]) fail(`preflight: referenced table public.${t} is ABSENT`);
	}
	const preTargets = {
		book_blocks: await tableExists("book_blocks"),
		book_glossary_terms: await tableExists("book_glossary_terms"),
		chapter_progress: await tableExists("chapter_progress"),
	};
	if (Object.values(preTargets).some(Boolean)) {
		fail(`preflight: target table(s) ALREADY PRESENT ${JSON.stringify(preTargets)} — 0005 already applied or drifted; refusing blind re-run`);
	}

	// read-only pre-census of the referenced tables (the backup leg)
	const textbookCensus = (
		await sql`select validation_state::text as state, count(*)::int as n from documents where kind = 'TEXTBOOK' group by 1 order by 1`
	).map((r) => ({ state: r.state, n: r.n }));
	const bookChaptersCensus = (
		await sql`select count(*)::int as rows, count(distinct document_id)::int as docs from book_chapters`
	)[0]!;

	receipt.preflight = {
		referenced_tables_present: preRefs,
		target_tables_absent_expected: preTargets,
		documents_textbook_census: textbookCensus,
		book_chapters_census: bookChaptersCensus,
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

	// ── backup-first (BEFORE any DDL; targets absent ⇒ census IS the backup) ──
	receipt.backup = {
		law: "backup captured BEFORE any DDL (0007 regime); targets do not exist — the referenced-table censuses are the recoverable state of record",
		documents_textbook_census: textbookCensus,
		book_chapters_census: bookChaptersCensus,
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
	for (const t of ["book_blocks", "book_glossary_terms", "chapter_progress"]) {
		checks[`table_${t}`] = await tableExists(t);
	}

	// 2. exact column sets (per 0005_book-rail-tables.sql, ordinal order)
	const cols = async (t: string) =>
		(
			await sql`select column_name from information_schema.columns where table_schema='public' and table_name=${t} order by ordinal_position`
		).map((r) => r.column_name as string);

	checks.book_blocks_columns = await cols("book_blocks");
	checks.book_blocks_columns_exact =
		JSON.stringify(checks.book_blocks_columns) ===
		JSON.stringify([
			"id", "document_id", "doc_version", "chapter_key", "ord", "type", "pdf_page_anchor",
			"content", "check_refs", "glossary_refs", "spec_point_refs", "validation_state",
			"version", "created_at", "updated_at",
		]);
	checks.book_glossary_columns = await cols("book_glossary_terms");
	checks.book_glossary_columns_exact =
		JSON.stringify(checks.book_glossary_columns) ===
		JSON.stringify([
			"id", "subject_code", "term", "slug", "definition", "ms_accepts", "ms_avoids",
			"aliases", "audio_url", "translations", "validation_state", "created_at", "updated_at",
		]);
	checks.chapter_progress_columns = await cols("chapter_progress");
	checks.chapter_progress_columns_exact =
		JSON.stringify(checks.chapter_progress_columns) ===
		JSON.stringify(["id", "user_id", "document_id", "chapter_key", "rail_scrolled_pct", "last_ord", "updated_at"]);

	// 3. defaults that carry the serving semantics
	const def = async (t: string, c: string) =>
		(
			await sql`select column_default from information_schema.columns where table_schema='public' and table_name=${t} and column_name=${c}`
		)[0]?.column_default ?? null;
	checks.book_blocks_validation_default = await def("book_blocks", "validation_state");
	checks.book_blocks_validation_default_ok =
		checks.book_blocks_validation_default === "'SUGGESTED'::character varying";
	checks.chapter_progress_scrolled_default = await def("chapter_progress", "rail_scrolled_pct");
	checks.chapter_progress_scrolled_default_ok = checks.chapter_progress_scrolled_default === "0";

	// 4. CHECK constraints (names of record)
	const cks = (t: string) =>
		sql`select conname from pg_constraint where conrelid = ${"public." + t}::regclass and contype='c' order by conname`.map((r) => r.conname as string);
	const bbCks = await cks("book_blocks");
	const bgCks = await cks("book_glossary_terms");
	const cpCks = await cks("chapter_progress");
	checks.check_constraints_exact =
		JSON.stringify(bbCks) === JSON.stringify(["ck_book_blocks_doc_version", "ck_book_blocks_ord", "ck_book_blocks_type", "ck_book_blocks_validation_state"]) &&
		JSON.stringify(bgCks) === JSON.stringify(["ck_book_glossary_slug", "ck_book_glossary_validation_state"]) &&
		JSON.stringify(cpCks) === JSON.stringify(["ck_chapter_progress_scrolled_pct"]);

	// 5. FKs (target + delete rule; confdeltype 'a'=NO ACTION, 'c'=CASCADE)
	const fks = (
		await sql`select conname, confdeltype from pg_constraint where conrelid in ('public.book_blocks'::regclass,'public.book_glossary_terms'::regclass,'public.chapter_progress'::regclass) and contype='f' order by conname`
	).map((r) => ({ name: r.conname as string, on_delete: r.confdeltype as string }));
	checks.foreign_keys = fks;
	checks.foreign_keys_exact =
		fks.length === 3 &&
		!!fks.find((f) => f.name === "book_blocks_document_fkey" && f.on_delete === "a") &&
		!!fks.find((f) => f.name === "book_blocks_chapter_fkey" && f.on_delete === "a") &&
		!!fks.find((f) => f.name === "chapter_progress_user_id_fkey" && f.on_delete === "c");

	// 6. the 4 indexes of record
	for (const ix of ["uq_book_blocks_identity", "ix_book_blocks_chapter", "uq_book_glossary_identity", "uq_chapter_progress_identity"]) {
		checks[`index_${ix}`] = (await sql`select 1 from pg_indexes where schemaname='public' and indexname=${ix}`).length === 1;
	}

	// 7. targets still empty (a pure DDL apply — zero rows written)
	const bbRows = (await sql`select count(*)::int as n from book_blocks`)[0]!.n as number;
	const bgRows = (await sql`select count(*)::int as n from book_glossary_terms`)[0]!.n as number;
	const cpRows = (await sql`select count(*)::int as n from chapter_progress`)[0]!.n as number;
	checks.rows_written = { book_blocks: bbRows, book_glossary_terms: bgRows, chapter_progress: cpRows };
	checks.rows_written_zero = bbRows === 0 && bgRows === 0 && cpRows === 0;

	receipt.postverify = checks;
	const hardChecks = [
		checks.table_book_blocks,
		checks.table_book_glossary_terms,
		checks.table_chapter_progress,
		checks.book_blocks_columns_exact,
		checks.book_glossary_columns_exact,
		checks.chapter_progress_columns_exact,
		checks.book_blocks_validation_default_ok,
		checks.chapter_progress_scrolled_default_ok,
		checks.check_constraints_exact,
		checks.foreign_keys_exact,
		checks.index_uq_book_blocks_identity,
		checks.index_ix_book_blocks_chapter,
		checks.index_uq_book_glossary_identity,
		checks.index_uq_chapter_progress_identity,
		checks.rows_written_zero,
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
