/**
 * T-TEACHME-001 — migrations 0020/0021 apply driver + the 4CH1 canon-row
 * gate census/repair (operator fire order, IM chat 97a19c8c "apply 0020/0021
 * + 4CH1 canon rows on a Neon branch", 2026-11-01).
 *
 * House regime of record (T-TEACH-011 apply-0008 precedent, migration 0007
 * disclosure law):
 *   - RAW SQL from packages/db/drizzle/0020_teach-me.sql then 0021_teach-messages.sql
 *     (0021 AFTER 0020 — 0021 re-scopes the partial unique index 0020 creates),
 *     ONE transaction per file, lock_timeout=5s, statement_timeout=60s.
 *   - NO drizzle bookkeeping is created; flyway_schema_history is untouched.
 *   - preflight (referenced tables present, teach targets absent) + census
 *     BEFORE any DDL; post-verify after each file (columns/CHECKs/FKs/indexes/
 *     trigger); the ADR-040 D1 append-only trigger is PROVEN to bite (expected
 *     P0001 on UPDATE and DELETE of a coverage row) inside a transaction that
 *     always ROLLBACKs (zero residue, FK-valid probe rows included).
 *   - the 4CH1 canon leg runs the EXACT G1/G2 loader SQL of the live store
 *     (apps/api/src/teach-me/sql.ts) against ALL 182 bundle-of-record dotted
 *     codes, and repairs ONLY what the census proves missing: per-point
 *     descriptions composed exclusively from of-record repo data (canonicalKG
 *     subtopic labels + the bundle's paper applicability), per-row optimistic
 *     guard, version+1, provenance lineage untouched, branch-write only.
 *   - a receipt JSON is ALWAYS written (even on failure) — honest red.
 *     Credentials never enter the receipt: only the endpoint host is recorded.
 *
 * CLI:
 *   bun scripts/t-teachme-1-db-apply.ts --db /tmp/uri.file --mode preflight|apply \
 *     --receipt receipt.json
 *   (--db accepts a file path containing the URI — chmod 600 — or a raw URI.)
 */

import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
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
const MIG_0020 = path.join(REPO_ROOT, "packages/db/drizzle/0020_teach-me.sql");
const MIG_0021 = path.join(REPO_ROOT, "packages/db/drizzle/0021_teach-messages.sql");
const BUNDLE = path.join(REPO_ROOT, "apps/hub/content/igcse-chemistry-19/curriculum.json");
const KG = path.join(REPO_ROOT, "apps/hub/public/kg/data/canonicalKG.edexcel-chemistry-4ch1.json");

type Migration = { file: string; sql: string; sha256: string; statements: string[] };
function loadMigration(file: string): Migration {
        const sqlText = readFileSync(file, "utf8");
        const statements = sqlText
                .split(/-->\s*statement-breakpoint/g)
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
        return {
                file: path.relative(REPO_ROOT, file),
                sql: sqlText,
                sha256: createHash("sha256").update(sqlText).digest("hex"),
                statements,
        };
}
const m0020 = loadMigration(MIG_0020);
const m0021 = loadMigration(MIG_0021);

// ── URI handling (never logged) ──────────────────────────────────────────────
let uri = dbArg.startsWith("file:") ? readFileSync(dbArg.slice(5), "utf8").trim() : dbArg;
uri = uri.trim();
if (!uri.includes("sslmode=")) uri += (uri.includes("?") ? "&" : "?") + "sslmode=require";
const uriHost = new URL(uri).host; // host is safe to record; credentials are not

// ── the 4CH1 of-record sources (bundle = hub content, KG = canonical spec graph) ──
type BundleNode = {
        code: string;
        family: string;
        title: string;
        description: string | null;
        parents: string[];
        applicability?: { papers?: string[]; double_award_shared?: boolean; rule?: string } | null;
};
const bundle = JSON.parse(readFileSync(BUNDLE, "utf8")) as { nodes: BundleNode[] };
type KgNode = { id: string; type: string; pointId?: string; statement?: string; section?: string; subtopic?: string };
const kg = JSON.parse(readFileSync(KG, "utf8")) as { nodes: KgNode[] };

const bundlePoints = bundle.nodes.filter((n) => n.family === "SPEC_POINT");
const PICK_CODES = bundlePoints.map((n) => n.code).sort();
const kgByPointId = new Map(
        kg.nodes.filter((n) => n.type === "SpecificationPoint" && n.pointId).map((n) => [n.pointId!, n]),
);

/** of-record description composition: KG subtopic label + bundle paper applicability. */
function composeDescription(code: string): string | null {
        const pointId = code.slice("4CH1-".length);
        const kgNode = kgByPointId.get(pointId);
        const bundleNode = bundlePoints.find((n) => n.code === code);
        if (!kgNode?.subtopic) return null;
        const parts: string[] = [kgNode.subtopic];
        const papers = bundleNode?.applicability?.papers ?? [];
        if (papers.length > 0) parts.push(`assessed on Papers ${papers.join(", ")}`);
        if (bundleNode?.applicability?.double_award_shared) {
                parts.push("shared with Science Double Award 4SD0");
        }
        const out = parts.join(" — ");
        return out.length > 1000 ? out.slice(0, 1000) : out; // knowledge_nodes.description is varchar(1000)
}

// ── evidence bag ─────────────────────────────────────────────────────────────
const t0 = Date.now();
const receipt: Record<string, unknown> = {
        task: "T-TEACHME-001",
        what: "migrations 0020_teach-me.sql + 0021_teach-messages.sql raw-SQL apply, then the 4CH1 G1–G3 canon/corpus census (repair-if-proven-missing, branch-write only)",
        mode,
        target_host: uriHost,
        migrations: [
                { file: m0020.file, sha256: m0020.sha256, statement_count: m0020.statements.length },
                { file: m0021.file, sha256: m0021.sha256, statement_count: m0021.statements.length },
        ],
        change_control_note:
                "0021 carries the RECEIPTED re-scope of teach_candidates_open_idx from the 0020 global (status) form to (session_id) WHERE status='candidate' — per the 0021 header's own disclosure law; post-verify asserts the re-scoped form and the absence of the global form.",
        pick_codes: { count: PICK_CODES.length, first: PICK_CODES[0], last: PICK_CODES[PICK_CODES.length - 1] },
        preflight: null as unknown,
        applied: [] as { mig: string; i: number; head: string; ms: number }[],
        postverify: {} as Record<string, unknown>,
        append_only_probe: null as unknown,
        canon: null as unknown,
        gates: null as unknown,
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

        const tableExists = async (t: string) =>
                (await sql`select to_regclass(${"public." + t}) is not null as ok`)[0]!.ok as boolean;

        // ── preflight ─────────────────────────────────────────────────────────────
        for (const t of ["users", "knowledge_nodes", "revision_note", "question_spec_points"]) {
                if (!(await tableExists(t))) fail(`preflight: referenced table public.${t} is ABSENT`);
        }
        const teachTargets = [
                "teach_sessions",
                "teach_objectives",
                "teach_objective_coverages",
                "teach_misconception_candidates",
                "teach_messages",
                "teach_review_cards",
        ];
        const preTargets = Object.fromEntries(
                await Promise.all(teachTargets.map(async (t) => [t, await tableExists(t)] as const)),
        );
        const already = Object.values(preTargets).filter(Boolean).length;
        if (mode === "apply" && already > 0) fail(`preflight: teach targets already present (${already}/6) — this driver is not idempotent by design`);

        // 4CH1 plane census BEFORE any DDL (the numbers the receipt is judged by)
        const ch1Plane = (
                await sql`select node_type, count(*)::int as n from knowledge_nodes where provenance like ${"spec:4CH1%"} group by node_type order by node_type`
        ).map((r) => ({ node_type: String(r.node_type), n: Number(r.n) }));
        const ch1Points = (
                await sql`select count(*)::int as total,
                        (count(*) filter (where description is null or btrim(description) = ''))::int as undescribed
                        from knowledge_nodes where node_type = 'SPEC_POINT' and code like ${"4CH1-%"}`
        )[0]!;
        const ch1Anchors = (
                await sql`select count(*)::int as n from question_spec_points qsp join knowledge_nodes kn on kn.id = qsp.spec_point_node_id where kn.node_type = 'SPEC_POINT' and kn.code like ${"4CH1-%"}`
        )[0]!.n as number;

        // the EXACT G2 loader shape (sql.ts loadNoteCorpus) over all 182 codes
        const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const g2Pattern = `(^|[^a-z0-9._/-])(${PICK_CODES.map(esc).join("|")})([^a-z0-9._/-]|$)`;
        const ch1Notes = (
                await sql`select count(*)::int as n, count(distinct corpus_version)::int as corpora from revision_note where spec_point_codes ~* ${g2Pattern}`
        )[0]!;

        receipt.preflight = {
                referenced_tables_present: true,
                teach_targets: preTargets,
                fourCH1_plane: ch1Plane,
                fourCH1_spec_points: { total: Number(ch1Points.total), undescribed: Number(ch1Points.undescribed) },
                fourCH1_question_anchors: Number(ch1Anchors),
                revision_note_4ch1: { rows: Number(ch1Notes.n), corpora: Number(ch1Notes.corpora) },
                pick_codes: PICK_CODES.length,
                statements_to_apply: [m0020.statements.length, m0021.statements.length],
        };
        console.log("preflight OK — 4CH1 points:", Number(ch1Points.total), "undescribed:", Number(ch1Points.undescribed), "| notes rows:", Number(ch1Notes.n), "| anchors:", Number(ch1Anchors));

        if (mode === "preflight") {
                receipt.verdict = "PREFLIGHT-OK";
                receipt.elapsed_ms = Date.now() - t0;
                writeFileSync(receiptPath, JSON.stringify(receipt, null, 1));
                await sql.end();
                console.log("preflight OK — no DDL executed");
                process.exit(0);
        }

        // ── apply: ONE transaction per migration file, in order ───────────────────
        for (const mig of [m0020, m0021]) {
                await sql.begin(async (tx) => {
                        await tx.unsafe("SET LOCAL lock_timeout = '5s'");
                        await tx.unsafe("SET LOCAL statement_timeout = '60s'");
                        for (let i = 0; i < mig.statements.length; i++) {
                                const st = mig.statements[i]!;
                                const s0 = Date.now();
                                await tx.unsafe(st);
                                (receipt.applied as { mig: string; i: number; head: string; ms: number }[]).push({
                                        mig: path.basename(mig.file),
                                        i,
                                        head: st.replace(/\s+/g, " ").slice(0, 72),
                                        ms: Date.now() - s0,
                                });
                        }
                });
                console.log(`transaction COMMIT — ${path.basename(mig.file)} (${mig.statements.length} statements)`);
        }

        // ── post-verify ───────────────────────────────────────────────────────────
        const cols = async (t: string) =>
                (
                        await sql`select column_name from information_schema.columns where table_schema='public' and table_name=${t} order by ordinal_position`
                ).map((r) => String(r.column_name));
        const tableNames = async () =>
                (await sql`select table_name from information_schema.tables where table_schema='public' and table_name like 'teach%' order by table_name`).map((r) => String(r.table_name));
        const constraintNames = async (contype: string, table: string) =>
                (
                        await sql`select conname from pg_constraint where conrelid = ${"public." + table}::regclass and contype = ${contype} order by conname`
                ).map((r) => String(r.conname));
        const indexDefs = async (table: string) =>
                (await sql`select indexname, indexdef from pg_indexes where tablename = ${table} order by indexname`).map((r) => ({
                        name: String(r.indexname),
                        def: String(r.indexdef),
                }));

        const expectedCols: Record<string, string[]> = {
                teach_sessions: ["id", "user_id", "course_id", "spec_point_ids", "difficulty", "length", "mode", "status", "message_count", "llm_call_count", "tokens_used", "flags", "created_at", "ended_at"],
                teach_objectives: ["id", "session_id", "ordinal", "text", "spec_point_ids", "status", "created_at"],
                teach_objective_coverages: ["id", "session_id", "objective_id", "message_seq", "covered", "evidence_quote", "verdict", "contradiction_detected", "created_at"],
                teach_misconception_candidates: ["id", "session_id", "spec_point_ids", "statement", "matched_misconception_id", "confidence", "status", "reviewed_by", "reviewed_at", "created_at"],
                teach_messages: ["id", "session_id", "seq", "role", "kind", "text", "created_at"],
                teach_review_cards: ["id", "session_id", "card", "created_at"],
        };
        const expectedChecks: Record<string, string[]> = {
                teach_sessions: ["teach_sessions_spec_points_check", "teach_sessions_difficulty_check", "teach_sessions_length_check", "teach_sessions_mode_check", "teach_sessions_status_check"],
                teach_objectives: ["teach_objectives_ordinal_check", "teach_objectives_status_check"],
                teach_misconception_candidates: ["teach_candidates_confidence_check", "teach_candidates_status_check"],
                teach_messages: ["teach_messages_role_check", "teach_messages_kind_check"],
        };
        const expectedFks = [
                "teach_sessions_user_id_fkey",
                "teach_objectives_session_id_fkey",
                "teach_coverages_session_id_fkey",
                "teach_coverages_objective_id_fkey",
                "teach_candidates_session_id_fkey",
                "teach_messages_session_id_fkey",
                "teach_review_cards_session_id_fkey",
        ];

        const checks: Record<string, unknown> = {};
        checks.teach_tables = await tableNames();
        for (const [t, want] of Object.entries(expectedCols)) {
                const got = await cols(t);
                checks[`cols_${t}_exact`] = JSON.stringify(got) === JSON.stringify(want);
                if (checks[`cols_${t}_exact`] !== true) fail(`post-verify: column mismatch on ${t}: got ${got.join(",")}`);
        }
        for (const [t, want] of Object.entries(expectedChecks)) {
                const got = await constraintNames("c", t);
                const missing = want.filter((c) => !got.includes(c));
                checks[`checks_${t}`] = missing.length === 0;
                if (missing.length > 0) fail(`post-verify: missing CHECKs on ${t}: ${missing.join(",")}`);
        }
        const fkRows = (
                await sql`select conname from pg_constraint where contype = 'f' and conname like ${"teach_%"} order by conname`
        ).map((r) => String(r.conname));
        checks.fks = expectedFks.every((c) => fkRows.includes(c));
        if (!checks.fks) fail(`post-verify: missing FKs; got ${fkRows.join(",")}`);

        const idxSessions = await indexDefs("teach_sessions");
        const idxCandidates = await indexDefs("teach_misconception_candidates");
        const idxMessages = await indexDefs("teach_messages");
        const idxCards = await indexDefs("teach_review_cards");
        const idxCoverages = await indexDefs("teach_objective_coverages");
        const idxObjectives = await indexDefs("teach_objectives");
        const allIdx = [...idxSessions, ...idxCandidates, ...idxMessages, ...idxCards, ...idxCoverages, ...idxObjectives];
        for (const want of [
                "teach_sessions_user_created_idx",
                "teach_sessions_course_created_idx",
                "teach_objectives_session_idx",
                "teach_coverages_objective_idx",
                "teach_coverages_session_seq_idx",
                "teach_candidates_session_idx",
                "teach_messages_session_seq_idx",
                "teach_review_cards_session_idx",
        ]) {
                if (!allIdx.some((x) => x.name === want)) fail(`post-verify: missing index ${want}`);
        }
        const openIdx = idxCandidates.find((x) => x.name === "teach_candidates_open_idx");
        if (!openIdx) fail("post-verify: teach_candidates_open_idx missing");
        const rescoped = openIdx!.def.includes("(session_id)") && openIdx!.def.includes("WHERE") && openIdx!.def.includes("candidate");
        const globalForm = idxCandidates.filter((x) => /\(status\)/.test(x.def));
        checks.teach_candidates_open_idx = { rescoped, global_form_present: globalForm.length > 0, def_shape: openIdx!.def.replace(/ON "public"\."[^"]+"\s*/, "") };
        if (!rescoped || globalForm.length > 0) fail("post-verify: teach_candidates_open_idx is not the receipted (session_id) re-scope, or the global form survives");

        const cardsIdx = idxCards.find((x) => x.name === "teach_review_cards_session_idx");
        const cardsUnique = (
                await sql`select i.indisunique::bool as u from pg_indexes x join pg_class c on c.relname = x.indexname join pg_index i on i.indexrelid = c.oid where x.tablename = 'teach_review_cards' and x.indexname = 'teach_review_cards_session_idx'`
        )[0]!;
        checks.teach_review_cards_unique = cardsUnique.u === true && !!cardsIdx;
        if (!checks.teach_review_cards_unique) fail("post-verify: teach_review_cards_session_idx missing or not UNIQUE");

        const trigger = (
                await sql`select tgname from pg_trigger where tgrelid = 'public.teach_objective_coverages'::regclass and not tgisinternal order by tgname`
        ).map((r) => String(r.tgname));
        checks.append_only_trigger_present = trigger.includes("teach_coverages_append_only");
        if (!checks.append_only_trigger_present) fail("post-verify: teach_coverages_append_only trigger missing");
        const func = (
                await sql`select count(*)::int as n from pg_proc where proname = 'teach_forbid_mutation'`
        )[0]!.n as number;
        checks.forbid_mutation_fn = func === 1;
        if (func !== 1) fail("post-verify: teach_forbid_mutation() missing");
        (receipt.postverify as Record<string, unknown>).ddl = checks;

        // ── ADR-040 D1 append-only bite probe (inside a ROLLBACK-ed txn) ──────────
        const rs = sql.reserve();
        try {
                await rs.unsafe("BEGIN");
                await rs.unsafe("SET LOCAL lock_timeout = '5s'");
                const uid = randomUUID();
                const sid = randomUUID();
                const oid = randomUUID();
                const cid = randomUUID();
                await rs.unsafe(
                        `insert into users (id, email, password_hash, display_name, enabled, created_at, token_version) values ($1, $2, $3, $4, true, now(), 1)`,
                        [uid, `teach-me-apply-probe+${uid}@invalid.syllabai.local`, "probe-not-a-password", "T-TEACHME-001 apply probe"],
                );
                await rs.unsafe(
                        `insert into teach_sessions (id, user_id, course_id, spec_point_ids, difficulty, length, mode, status, message_count, llm_call_count, tokens_used, flags, created_at) values ($1,$2,$3,$4::jsonb,'easy','quick','chat','active',0,0,0,'{}'::jsonb, now())`,
                        [sid, uid, "igcse-chemistry-19", JSON.stringify([PICK_CODES[0]])],
                );
                await rs.unsafe(
                        `insert into teach_objectives (id, session_id, ordinal, text, spec_point_ids, status, created_at) values ($1,$2,1,$3,$4::jsonb,'not_started', now())`,
                        [oid, sid, "probe objective", JSON.stringify([PICK_CODES[0]])],
                );
                await rs.unsafe(
                        `insert into teach_objective_coverages (id, session_id, objective_id, message_seq, covered, evidence_quote, verdict, contradiction_detected, created_at) values ($1,$2,$3,1,true,'probe','covered',false, now())`,
                        [cid, sid, oid],
                );
                const bites: Record<string, unknown> = {};
                await rs.unsafe("SAVEPOINT bite1");
                let updateBit = false;
                try {
                        await rs.unsafe(`update teach_objective_coverages set covered = false where id = $1`, [cid]);
                } catch (e) {
                        const err = e as { code?: string; message?: string };
                        updateBit = err.code === "P0001" && String(err.message ?? "").includes("append-only");
                }
                await rs.unsafe("ROLLBACK TO SAVEPOINT bite1");
                await rs.unsafe("SAVEPOINT bite2");
                let deleteBit = false;
                try {
                        await rs.unsafe(`delete from teach_objective_coverages where id = $1`, [cid]);
                } catch (e) {
                        const err = e as { code?: string; message?: string };
                        deleteBit = err.code === "P0001" && String(err.message ?? "").includes("append-only");
                }
                await rs.unsafe("ROLLBACK TO SAVEPOINT bite2");
                let sessionUpdateOk = false;
                try {
                        await rs.unsafe(`update teach_sessions set message_count = 1 where id = $1`, [sid]);
                        sessionUpdateOk = true; // the trigger is scoped to the LEDGER only — sessions stay mutable
                } catch {
                        sessionUpdateOk = false;
                }
                bites.update_blocked = updateBit;
                bites.delete_blocked = deleteBit;
                bites.session_row_still_mutable = sessionUpdateOk;
                receipt.append_only_probe = { ...bites, rolled_back: true };
                if (!updateBit || !deleteBit) fail(`append-only probe: trigger did NOT bite (update=${updateBit} delete=${deleteBit})`);
                if (!sessionUpdateOk) fail("append-only probe: teach_sessions row unexpectedly immutable — trigger scope drifted");
        } finally {
                await rs.unsafe("ROLLBACK").catch(() => {});
                rs.release();
        }
        console.log("append-only probe: UPDATE blocked, DELETE blocked, sessions mutable — rolled back");

        // ── 4CH1 canon leg: the EXACT G1 loader SQL over all 182 of-record codes ──
        const canonRows = (
                await sql`select id, code, title, description from knowledge_nodes where node_type = 'SPEC_POINT' and code = any(${PICK_CODES}::text[])`
        ).map((r) => ({ id: String(r.id), code: String(r.code), title: r.title == null ? null : String(r.title), description: r.description == null ? null : String(r.description) }));
        const foundByCode = new Map(canonRows.map((r) => [r.code, r]));
        const missingCodes = PICK_CODES.filter((c) => !foundByCode.has(c));
        const undescribedCodes = PICK_CODES.filter((c) => {
                const row = foundByCode.get(c);
                return !row || row.description == null || row.description.trim() === "";
        });
        const bundleTitleByCode = new Map(bundlePoints.map((n) => [n.code, n.title]));
        const titlesAligned = PICK_CODES.filter((c) => (foundByCode.get(c)?.title ?? "") === (bundleTitleByCode.get(c) ?? ""));

        // ── repair: ONLY what the census proves missing (branch-write, guarded) ───
        let repair: Record<string, unknown> = { needed: undescribedCodes.length > 0 || missingCodes.length > 0, missing: missingCodes.length, undescribed: undescribedCodes.length, applied: 0, rows: [] as unknown[] };
        if (missingCodes.length > 0) {
                // missing canon rows are a STRUCTURAL absence — never fabricated here
                fail(`canon: ${missingCodes.length} of-record codes ABSENT from knowledge_nodes (first: ${missingCodes.slice(0, 5).join(", ")}) — structural repair out of scope for this apply`);
        }
        if (undescribedCodes.length > 0) {
                const rows: { code: string; description: string; id: string; oldVersion: number }[] = [];
                for (const code of undescribedCodes) {
                        const row = foundByCode.get(code)!;
                        const description = composeDescription(code);
                        if (description == null || description.trim() === "") fail(`canon: no of-record composition for ${code} (KG subtopic missing) — refusing to invent`);
                        rows.push({ code, description, id: row.id, oldVersion: -1 });
                }
                const versions = await sql`select id, version from knowledge_nodes where id = any(${rows.map((r) => r.id)}::uuid[])`;
                const vById = new Map(versions.map((v) => [String(v.id), Number(v.version)]));
                await sql.begin(async (tx) => {
                        await tx.unsafe("SET LOCAL lock_timeout = '5s'");
                        for (const r of rows) {
                                r.oldVersion = vById.get(r.id)!;
                                const res = await tx.unsafe(
                                        `update knowledge_nodes set description = $2, version = version + 1
                                         where id = $1 and code = $3 and version = $4 and (description is null or btrim(description) = '') returning code`,
                                        [r.id, r.description, r.code, r.oldVersion],
                                );
                                if (res.length !== 1) throw new Error(`optimistic guard failed for ${r.code}`);
                                (repair.rows as unknown[]).push({ code: r.code, description: r.description, version_was: r.oldVersion });
                        }
                });
                repair = { ...repair, applied: rows.length };
        }
        const ch1After = (
                await sql`select (count(*) filter (where description is null or btrim(description) = ''))::int as undescribed from knowledge_nodes where node_type = 'SPEC_POINT' and code = any(${PICK_CODES}::text[])`
        )[0]!;
        receipt.canon = {
                g1_loader_rows: canonRows.length,
                missing_codes: missingCodes,
                undescribed_before: undescribedCodes.length,
                titles_aligned_with_bundle: titlesAligned.length,
                provenance_law: "lineage untouched (spec:4CH1-2017); description composition = canonicalKG subtopic + bundle paper applicability, per-row guarded, version+1",
                repair,
                undescribed_after: Number(ch1After.undescribed),
        };

        // ── G1–G3 gate probes (the live create() law, verbatim shapes) ───────────
        const g1Canon = (
                await sql`select code, description from knowledge_nodes where node_type = 'SPEC_POINT' and code = any(${PICK_CODES}::text[])`
        ).map((r) => ({ code: String(r.code), description: r.description == null ? null : String(r.description) }));
        const g1Undescribed = g1Canon.filter((r) => r.description == null || r.description.trim() === "");
        const g1Green = g1Canon.length === PICK_CODES.length && g1Undescribed.length === 0;

        const g2Notes = (
                await sql`select note_id, title, body_md, spec_point_codes from revision_note where spec_point_codes ~* ${g2Pattern} limit 24`
        ).map((r) => String(r.note_id));
        const g2Count = (
                await sql`select count(*)::int as n from revision_note where spec_point_codes ~* ${g2Pattern}`
        )[0]!.n as number;
        const g2Green = g2Count > 0;

        const g3Anchors = Number(ch1Anchors);
        const g3Green = g3Anchors > 0;

        receipt.gates = {
                G1_canon_described: { green: g1Green, rows: g1Canon.length, undescribed: g1Undescribed.length, law: "service.ts createSession: missing/undescribed → COURSE_NOT_ELIGIBLE fail-closed" },
                G2_note_corpus: { green: g2Green, pattern_rows: g2Count, sampled: g2Notes.length, law: "service.ts createSession: zero notes → overlap detector fails open (forbidden) → COURSE_NOT_ELIGIBLE fail-closed" },
                G3_serving_links: { green: g3Green, question_anchors_4ch1: g3Anchors, law: "plan §1 G3: question-bank sets + notes linked in the serving corpus (Suggested Practice must link real resources)" },
                all_green: g1Green && g2Green && g3Green,
        };

        const allGreen = g1Green && g2Green && g3Green;
        receipt.verdict = allGreen ? "APPLIED_GATES_GREEN" : "APPLIED_GATES_RED";
        receipt.elapsed_ms = Date.now() - t0;

        // scrub-assert: credentials never enter the receipt (the T-DB-REAPPLY list)
        const receiptJson = JSON.stringify(receipt);
        const scrubbed = ["postgres://", "postgresql://", "neon.tech", "napi_", "ghp_", "vcp_"].every(
                (s) => !receiptJson.includes(s),
        );
        if (!scrubbed) throw new Error("scrub-assert FAILED");

        writeFileSync(receiptPath, JSON.stringify(receipt, null, 1));
        console.log("verdict:", receipt.verdict, "| gates:", JSON.stringify((receipt.gates as { all_green: boolean }).all_green));
        if (!allGreen) {
                await sql.end({ timeout: 1 }).catch(() => {});
                process.exit(3);
        }
} catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        fail(msg.slice(0, 400));
} finally {
        // ensure the pool is closed on the success path too (fail() exits the process)
        await sql.end({ timeout: 1 }).catch(() => {});
}
