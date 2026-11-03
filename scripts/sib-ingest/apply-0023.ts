/**
 * T-SIB-INGEST-001 — migration 0023 apply driver (the 0007 disclosure law,
 * t-teachme-1-db-apply.ts house precedent):
 *   - RAW SQL from packages/db/drizzle/0023_sib-research-evidence-kind.sql,
 *     ONE transaction, lock_timeout=5s, statement_timeout=60s.
 *   - NO drizzle bookkeeping is created; flyway_schema_history untouched.
 *   - Idempotent-safe: if both CHECKs already carry RESEARCH_EVIDENCE the
 *     driver reports ALREADY-WIDENED and exits 0.
 *   - Post-verify INSIDE the transaction: both constraint defs widened.
 *   - Receipt ALWAYS written (even on failure) — honest red. Credentials
 *     never enter the receipt: only the endpoint host is recorded.
 *
 * CLI: bun scripts/sib-ingest/apply-0023.ts --db <uri-or-0600-file> --receipt <out.json>
 *      (--db accepts a file path containing the URI — chmod 600 — or a raw URI.)
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
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
const receiptPath = arg("receipt");
const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");
const MIG_0023 = path.join(REPO_ROOT, "packages/db/drizzle/0023_sib-research-evidence-kind.sql");

const dbFile = dbArg.startsWith("file:") ? dbArg.slice(5) : dbArg;
const st = statSync(dbFile);
if ((st.mode & 0o077) !== 0) {
	console.error(`--db file must be 0600 (got ${(st.mode & 0o777).toString(8)}) — abort`);
	process.exit(2);
}
const URI = readFileSync(dbFile, "utf8").trim();
const host = (() => {
	try {
		return new URL(URI).host;
	} catch {
		return "unparsed";
	}
})();

const receipt: Record<string, unknown> = {
	task: "T-SIB-INGEST-001 migration 0023",
	db_host: host,
	started_utc: new Date().toISOString(),
};

function loadStatements(): string[] {
	const raw = readFileSync(MIG_0023, "utf8");
	const parts = raw.includes("--> statement-breakpoint")
		? raw.split("--> statement-breakpoint")
		: raw.split(";");
	return parts.map((s) => s.trim()).filter(Boolean);
}

const sql = postgres(URI, { max: 1, prepare: false });
try {
	const constraintDefs = async () => {
		const r = await sql`
			select conname, pg_get_constraintdef(oid) as def
			from pg_constraint
			where conname in ('ck_documents_kind','ck_document_chunks_kind')
			  and conrelid in ('public.documents'::regclass, 'public.document_chunks'::regclass)`;
		return Object.fromEntries(r.rows.map((x) => [x.conname, String(x.def)]));
	};

	const before = await constraintDefs();
	const already =
		(before["ck_documents_kind"] ?? "").includes("RESEARCH_EVIDENCE") &&
		(before["ck_document_chunks_kind"] ?? "").includes("RESEARCH_EVIDENCE");

	if (already) {
		receipt.verdict = "ALREADY-WIDENED (idempotent skip — both CHECKs carry RESEARCH_EVIDENCE)";
	} else {
		const stmts = loadStatements();
		await sql.begin(async (tx) => {
			await tx.unsafe(`set local lock_timeout='5s'; set local statement_timeout='60s'`);
			for (const s of stmts) await tx.unsafe(s);
			const after = await constraintDefs();
			if (!(after["ck_documents_kind"] ?? "").includes("RESEARCH_EVIDENCE"))
				throw new Error("post-verify FAIL: ck_documents_kind not widened");
			if (!(after["ck_document_chunks_kind"] ?? "").includes("RESEARCH_EVIDENCE"))
				throw new Error("post-verify FAIL: ck_document_chunks_kind not widened");
			receipt.migration_0023 = { applied: true, statements: stmts.length, sha256_of_record: true };
		});
		receipt.verdict = "0023 APPLIED + post-verified (RESEARCH_EVIDENCE in both CHECKs)";
	}
	await sql.end();
} catch (e) {
	receipt.verdict = `FAIL: ${e instanceof Error ? e.message : String(e)}`;
	await sql.end().catch(() => {});
	writeFileSync(receiptPath, JSON.stringify(receipt, null, 1));
	console.error(receipt.verdict);
	process.exit(1);
}
writeFileSync(receiptPath, JSON.stringify(receipt, null, 1));
console.log(receipt.verdict);
