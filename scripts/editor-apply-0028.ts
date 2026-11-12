/**
 * ADR-044 run-002 · scripts/editor-apply-0028.ts
 *
 * The editor-planes apply driver — 0028_editor-planes.sql (the grant row
 * plane + the §7 proposal/receipt planes). Design of record:
 * docs/ADR-044-EDITOR_ROLE_CONTENT_WORKBENCH.md §3/§7; the Phase 1 EXIT
 * CRITERION of record (ADR §7: "This ADR therefore cards the companion
 * grants run on the t-tier1-apply template verbatim (preflight census
 * fail-closed, ownership gate, one GRANT transaction, has_table_privilege
 * wire proof as the receipt) as a Phase 1 exit criterion, not an
 * afterthought" — the teach_sessions 500 class proved the lesson at
 * production cost).
 *
 * House regime of record (t-tier1-apply-0022-0023-0026 + the
 * teachgenie-0028 grants-only precedents, the 0007 disclosure law):
 *   - RAW SQL from packages/db/drizzle/0028_editor-planes.sql (FROZEN),
 *     ONE transaction, lock_timeout=5s, statement_timeout=60s. NO drizzle
 *     bookkeeping is created; flyway_schema_history is untouched.
 *   - preflight BEFORE any DDL: public.users present (the syllabai schema
 *     marker); per-table census. IDEMPOTENT: a table set that ALL exists
 *     with the expected census is skipped (already_applied); a set that is
 *     ABSENT is applied; a PARTIAL state fails CLOSED — a half-applied
 *     migration is an operator decision, not a driver guess.
 *   - ownership gate (the 0025 run-005 law): DDL runs against the owner of
 *     public.users — if the connected role holds ownership only VIA ROLE
 *     MEMBERSHIP, SET ROLE for the session; no membership → fail-closed
 *     with the full diagnostic, zero DDL.
 *   - grants (the F5-S7 production-grant law): the app role
 *     (syllabai_v2_app_w2r2) does NOT own tables — after the DDL the
 *     driver grants:
 *       editor_grants / editor_edit_proposals: SELECT,INSERT,UPDATE,DELETE
 *         (the Phase 1 read plane + the Phase 2 write planes);
 *       editor_edit_receipts: SELECT,INSERT ONLY — the append-only
 *         application law (ADR §7) is ENFORCED by the grant set, not by
 *         hope: the app role can never UPDATE or DELETE a receipt.
 *     Idempotent re-grant by nature (GRANT is a no-op when present).
 *     run-003 REINFORCEMENT (measured on the run-002 COW): this database
 *     carries ALTER DEFAULT PRIVILEGES granting DML ON TABLES to the app
 *     role (the NEON-DB-LOSS restore posture) — default privileges
 *     materialize into a new table's ACL at CREATE time, so the driver
 *     additionally REVOKEs every verb beyond the invariant set in the same
 *     transaction and the wire proof NEGATIVELY proves the forbidden verbs
 *     are denied (has_table_privilege). run-004: the receipt also carries
 *     the ROLE-TOPOLOGY diagnostics of record (memberships, PUBLIC
 *     privileges, inherit flags, per-table ACL entries) — a has_table_
 *     privilege TRUE with no matching ACL entry means the residual path is
 *     membership or PUBLIC, which NO per-table REVOKE can reach and which
 *     no census view displays; the red receipt must name the path.
 *     run-005 INHERITANCE ENFORCEMENT (the path named by the run-004
 *     receipt): the app role of record is an INHERIT member of
 *     neon_superuser (the NEON-DB-LOSS restore stopgap), so
 *     has_table_privilege sees through the membership chain and NO
 *     per-table REVOKE can ever reach it. The driver now flips the app
 *     role to NOINHERIT (ALTER ROLE — minimal, revertible, one ALTER from
 *     the pre-run posture): direct ACL grants are unaffected, the
 *     membership row is KEPT (the ops SET ROLE path survives), and the
 *     negative wire proof then measures the post-enforcement reality. If
 *     the ALTER is refused, the receipt is an honest red naming the
 *     blocker; zero further SQL.
 *   - post-verify AFTER the DDL: per-table invariant census (columns, PK,
 *     FK→users/proposals with ON DELETE cascade, indexes incl. the
 *     partial-open unique grant index, CHECK constraints, app-role DML
 *     grants) + the has_table_privilege wire proof (the run-001 COW catch
 *     law: read from the grantor side, NO impersonation). Any miss = an
 *     honest red receipt.
 *   - a receipt JSON is ALWAYS written (even on failure). Credentials never
 *     enter the receipt: only the endpoint host is recorded.
 *   - REVERSIBILITY of record (disclosed in the receipt): the exact
 *     rollback is DROP TABLE editor_edit_receipts, editor_edit_proposals,
 *     editor_grants CASCADE (pure additive — no existing table or column
 *     is touched by this migration) + REVOKE the granted verbs FROM the
 *     app role + ALTER ROLE syllabai_v2_app_w2r2 INHERIT (restores the
 *     pre-run inheritance posture; run-005).
 *
 * CLI:
 *   bun scripts/editor-apply-0028.ts --db file:/tmp/uri.file \
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

/** The of-record app role (F5-S7 production-ddl-snapshot-20261020 grant law). */
const APP_ROLE = "syllabai_v2_app_w2r2";

/** The one additive migration of record. The file is FROZEN. */
const MIGRATIONS = [
	{
		id: "0028",
		file: "packages/db/drizzle/0028_editor-planes.sql",
		tables: ["editor_grants", "editor_edit_proposals", "editor_edit_receipts"],
	},
] as const;

/** The full table-privilege verb universe (REVOKE candidates beyond an invariant set). */
const ALL_TABLE_VERBS = [
	"SELECT",
	"INSERT",
	"UPDATE",
	"DELETE",
	"TRUNCATE",
	"REFERENCES",
	"TRIGGER",
] as const;

/** Per-table post-verify invariants (the committed migration file's census). */
const INVARIANTS: Record<
	string,
	{ columns: number; fkey: string; indexes: string[]; checks: number; verbs: string[] }
> = {
	editor_grants: {
		columns: 6,
		fkey: "editor_grants_user_id_fkey",
		indexes: ["uq_editor_grants_active_user"],
		checks: 0,
		verbs: ["SELECT", "INSERT", "UPDATE", "DELETE"],
	},
	editor_edit_proposals: {
		columns: 12,
		fkey: "editor_edit_proposals_user_id_fkey",
		indexes: ["idx_editor_edit_proposals_user", "idx_editor_edit_proposals_state"],
		checks: 4,
		verbs: ["SELECT", "INSERT", "UPDATE", "DELETE"],
	},
	editor_edit_receipts: {
		columns: 9,
		fkey: "editor_edit_receipts_proposal_id_fkey",
		indexes: ["idx_editor_edit_receipts_proposal"],
		checks: 1,
		// the append-only law: the app role can never UPDATE or DELETE a receipt
		verbs: ["SELECT", "INSERT"],
	},
};

// ── URI handling (never logged) ──────────────────────────────────────────────
let uri = dbArg.startsWith("file:") ? readFileSync(dbArg.slice(5), "utf8").trim() : dbArg;
uri = uri.trim();
if (!uri.includes("sslmode=")) uri += (uri.includes("?") ? "&" : "?") + "sslmode=require";
const uriHost = new URL(uri).host; // host is safe to record; credentials are not

// ── receipt plumbing (honest red on any path) ────────────────────────────────
const receipt: Record<string, unknown> = {
	card: "EDITOR-DB-APPLY (ADR-044 run-002 Phase 1 exit criterion)",
	driver: "scripts/editor-apply-0028.ts",
	migrations: MIGRATIONS.map((m) => m.file),
	db_host: uriHost,
	app_role: APP_ROLE,
	mode: "apply-0028",
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
	const checks = (
		await sql`SELECT conname FROM pg_constraint WHERE conrelid=${`public.${table}`}::regclass AND contype='c'`
	).length;
	const grants = (
		await sql`SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name=${table} AND grantee=${APP_ROLE} ORDER BY privilege_type`
	).map((r) => r.privilege_type as string);
	return {
		table,
		exists: true as const,
		columns,
		pk: pk.map((r) => r.conname as string),
		fks,
		indexes,
		checks,
		app_role_grants: grants,
	};
}

async function usersFacts() {
	const t = (await sql`SELECT to_regclass('public.users') AS t`)[0]?.t;
	if (t === null) return null;
	const owner = (
		await sql`SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='users'`
	)[0]?.tableowner as string | undefined;
	const rows = (await sql`SELECT count(*)::int AS n FROM public.users`)[0]?.n as number;
	return { table: "public.users", owner, rows };
}

async function appRoleExists(): Promise<boolean> {
	return (await sql`SELECT 1 AS ok FROM pg_roles WHERE rolname=${APP_ROLE}`)[0] !== undefined;
}

type Census = ReturnType<typeof tableCensus>;

function verifyInvariants(census: Census): string[] {
	if (!census.exists) return [`table ${census.table} MISSING after apply`];
	const inv = INVARIANTS[census.table];
	const errors: string[] = [];
	if (census.columns !== inv.columns)
		errors.push(`${census.table}: expected ${inv.columns} columns, found ${census.columns}`);
	if (census.pk.length !== 1)
		errors.push(`${census.table}: expected exactly 1 PK constraint, found [${census.pk.join(", ")}]`);
	const fk = census.fks.find((f) => f.conname === inv.fkey);
	if (!fk) errors.push(`${census.table}: FK ${inv.fkey} missing`);
	else if (fk.confdeltype !== "c")
		errors.push(
			`${census.table}: FK ${inv.fkey} ON DELETE is '${fk.confdeltype}', expected cascade ('c')`,
		);
	for (const idx of inv.indexes) {
		if (!census.indexes.includes(idx))
			errors.push(
				`${census.table}: index ${idx} missing (have [${census.indexes.join(", ")}])`,
			);
	}
	if (census.checks !== inv.checks)
		errors.push(`${census.table}: expected ${inv.checks} CHECK constraints, found ${census.checks}`);
	const missingGrants = inv.verbs.filter((p) => !census.app_role_grants.includes(p));
	if (missingGrants.length > 0)
		errors.push(
			`${census.table}: app role ${APP_ROLE} missing grants [${missingGrants.join(", ")}] (have [${census.app_role_grants.join(", ")}])`,
		);
	const extraVerbs = census.app_role_grants.filter((p) => !inv.verbs.includes(p));
	if (extraVerbs.length > 0)
		errors.push(
			`${census.table}: app role holds verbs beyond the grant law [${extraVerbs.join(", ")}] — the append-only receipts law refuses UPDATE/DELETE on editor_edit_receipts`,
		);
	return errors;
}

try {
	// ── preflight ────────────────────────────────────────────────────────────
	const users = await usersFacts();
	if (!users) throw new Error("preflight fail-closed: public.users does not exist (not the syllabai schema?)");
	receipt.preflight = { users };

	// Read the frozen file + sha256 before touching anything.
	const files = MIGRATIONS.map((m) => {
		const full = path.join(REPO_ROOT, m.file);
		const text = readFileSync(full, "utf8");
		return {
			id: m.id,
			file: m.file,
			sha256: createHash("sha256").update(text).digest("hex"),
			tables: [...m.tables],
			statements: text
				.split(/-->\s*statement-breakpoint/g)
				.map((s) => s.trim())
				.filter((s) => s.length > 0),
		};
	});
	receipt.files = files.map(({ id, file, sha256, statements }) => ({
		id,
		file,
		sha256,
		statements: statements.length,
	}));

	// ── ownership gate (the 0025 run-005 law) ────────────────────────────────
	const tableOwner = users.owner;
	const meRow = (await sql`SELECT current_user AS u`)[0]?.u as string | undefined;
	const member =
		tableOwner && meRow
			? ((await sql`SELECT pg_has_role(current_user::text, ${tableOwner}, 'member') AS m`)[0]?.m as boolean)
			: false;
	receipt.ownership = {
		users_owner: tableOwner ?? null,
		connected_as: meRow ?? null,
		member_of_owner: member,
		set_role_used: null as string | null,
	};
	if (tableOwner && meRow && tableOwner !== meRow) {
		if (!member) {
			throw new Error(
				`fail-closed ownership gate: connected as ${meRow}, users owned by ${tableOwner}, no role membership — CREATE TABLE + FK REFERENCES would refuse; zero DDL executed`,
			);
		}
		await sql.unsafe(`SET ROLE "${tableOwner.replace(/"/g, '""')}"`);
		receipt.ownership.set_role_used = tableOwner;
		console.log(`SET ROLE ${tableOwner} (membership path)`);
	}

	const rolePresent = await appRoleExists();
	receipt.app_role_present = rolePresent;
	receipt.environment_note =
		"this database carries ALTER DEFAULT PRIVILEGES granting DML ON TABLES to the app role (the NEON-DB-LOSS restore posture, run-003-restore-method-r0.json) — the driver REVOKEs verbs beyond the invariant grant set in the apply transaction; the append-only receipts law is enforced by the final grant set and proven by the negative has_table_privilege wire proof";

	// ── per-file decision: apply | already_applied | fail-closed partial ─────
	const plan: Array<{ id: string; decision: string; existing: string[]; missing: string[] }> = [];
	const toApply: typeof files = [];
	for (const f of files) {
		const states = await Promise.all(f.tables.map(async (t) => ({ t, c: await tableCensus(t) })));
		const existing = states.filter((s) => s.c.exists).map((s) => s.t);
		const missing = states.filter((s) => !s.c.exists).map((s) => s.t);
		if (missing.length === 0) {
			const invariantErrors = states.flatMap((s) => verifyInvariants(s.c));
			if (invariantErrors.length > 0) {
				throw new Error(
					`fail-closed partial state: ${f.file} tables all exist but census mismatches — ${invariantErrors.join("; ")}`,
				);
			}
			plan.push({ id: f.id, decision: "already_applied", existing, missing });
		} else if (existing.length === 0) {
			plan.push({ id: f.id, decision: "apply", existing, missing });
			toApply.push(f);
		} else {
			throw new Error(
				`fail-closed partial state: ${f.file} has tables [${existing.join(", ")}] present but [${missing.join(", ")}] missing — refusing to guess; zero DDL executed`,
			);
		}
	}
	receipt.plan = plan;
	console.log("plan:", plan.map((p) => `${p.id}=${p.decision}`).join(" "));

	// ── apply: ONE transaction, lock/statement timeouts, raw SQL ─────────────
	const applied: string[] = [];
	for (const f of toApply) {
		await sql.begin(async (tx) => {
			await tx.unsafe(`SET LOCAL lock_timeout = '5s'`);
			await tx.unsafe(`SET LOCAL statement_timeout = '60s'`);
			for (const stmt of f.statements) {
				await tx.unsafe(stmt);
			}
			if (rolePresent) {
				for (const t of f.tables) {
					const verbs = INVARIANTS[t].verbs.join(", ");
					await tx.unsafe(`GRANT ${verbs} ON TABLE public."${t.replace(/"/g, '""')}" TO ${APP_ROLE}`);
					// THE APPEND-ONLY REINFORCEMENT (run-003, measured not guessed): this
					// database carries ALTER DEFAULT PRIVILEGES granting
					// SELECT,INSERT,UPDATE,DELETE ON TABLES to the app role (the
					// NEON-DB-LOSS restore posture, disclosed in
					// .syllabai/receipts/NEON-DB-LOSS/run-003-restore-method-r0.json —
					// "full DML on all tables + sequences + ALTER DEFAULT PRIVILEGES").
					// Default privileges materialize INTO the new table's ACL at CREATE
					// time, so a grants-only enforcement of the receipts append-only law
					// is DEFEATED before the first GRANT runs (measured on the run-002
					// COW, workflow run 42965315892: the fresh editor_edit_receipts held
					// UPDATE/DELETE the driver never granted). REVOKE every verb beyond
					// the invariant set, per table, in the SAME transaction, so the final
					// grant set IS the law regardless of the default ACL.
					const extraVerbs = ALL_TABLE_VERBS.filter(
						(v) => !INVARIANTS[t].verbs.includes(v as never),
					);
					if (extraVerbs.length > 0) {
						await tx.unsafe(
							`REVOKE ${extraVerbs.join(", ")} ON TABLE public."${t.replace(/"/g, '""')}" FROM ${APP_ROLE}`,
						);
					}
				}
			}
		});
		applied.push(f.id);
		console.log(`applied ${f.id} (${f.file}, ${f.statements.length} statements)`);
	}
	receipt.applied_files = applied;

	// ── post-verify: per-table invariant census ──────────────────────────────
	const after = await Promise.all(files.flatMap((f) => f.tables).map((t) => tableCensus(t)));
	const invariantErrors = after.flatMap((c) => verifyInvariants(c));
	if (invariantErrors.length > 0) {
		receipt.post_verify = { census: after, errors: invariantErrors };
		throw new Error(
			`post-verify fail-closed: ${invariantErrors.length} invariant miss(es) — first: ${invariantErrors[0]}`,
		);
	}
	receipt.post_verify = { census: after, invariants_ok: true };

	// ── app-role DML wire proof (the t-tier1 run-001 COW catch law): the
	// privilege system is checked DIRECTLY (has_table_privilege, from the
	// grantor side, NO impersonation) — the receipts table's proof covers
	// exactly the append-only verb set. ─────────────────────────────────────
	if (rolePresent) {
		const denied: string[] = [];
		for (const t of files.flatMap((f) => f.tables)) {
			for (const p of INVARIANTS[t].verbs) {
				const ok = (await sql`SELECT has_table_privilege(${APP_ROLE}, ${`public.${t}`}, ${p}) AS ok`)[0]
					?.ok as boolean;
				if (!ok) denied.push(`${APP_ROLE} lacks ${p} on public.${t}`);
			}
		}
		if (denied.length > 0) {
			receipt.app_role_privilege_proof = { denied };
			throw new Error(`app-role DML wire proof fail-closed: ${denied.length} denial(s) — first: ${denied[0]}`);
		}
		receipt.app_role_privilege_proof = `grants verified via has_table_privilege (no impersonation): editor_grants/editor_edit_proposals carry 4 DML verbs; editor_edit_receipts carries SELECT,INSERT ONLY (the append-only law)`;

		// ── THE INHERITANCE ENFORCEMENT (run-005): the run-004 receipt named the
		// residual path — the app role is an INHERIT member of neon_superuser (the
		// NEON-DB-LOSS restore stopgap), so has_table_privilege sees through the
		// membership chain and NO per-table REVOKE can ever reach it. Flip the app
		// role to NOINHERIT: direct ACL grants are unaffected, the membership row is
		// KEPT (ops SET ROLE preserved), one ALTER restores the pre-run posture. The
		// negative wire proof below then measures the post-enforcement reality — if
		// NOINHERIT does not flip the verdict on this PG build, the receipt is an
		// honest red and the escalation (REVOKE the membership, operator console) is
		// the next decision, not a silent law-weakening. Fail-closed: an ALTER
		// refusal aborts the run before the negative proof.
		const preMemberships = await sql`SELECT r.rolname AS member, g.rolname AS granted_role, m.admin_option, r.rolinherit AS member_inherits FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member JOIN pg_roles g ON g.oid = m.roleid WHERE r.rolname = ${APP_ROLE} ORDER BY g.rolname`;
		const inheritMemberships = preMemberships.filter((m) => m.member_inherits);
		if (inheritMemberships.length > 0) {
			try {
				const before = (await sql`SELECT rolinherit FROM pg_roles WHERE rolname = ${APP_ROLE}`)[0]?.rolinherit as boolean;
				await sql.unsafe(`ALTER ROLE ${APP_ROLE} NOINHERIT`);
				const after = (await sql`SELECT rolinherit FROM pg_roles WHERE rolname = ${APP_ROLE}`)[0]?.rolinherit as boolean;
				if (after !== false)
					throw new Error("NOINHERIT did not take (pg_roles.rolinherit still true)");
				receipt.app_role_inheritance_enforcement = {
					detected: inheritMemberships,
					action: `ALTER ROLE ${APP_ROLE} NOINHERIT`,
					before_rolinherit: before,
					after_rolinherit: after,
					note: "membership rows KEPT (ops SET ROLE path preserved); direct ACL grants unaffected; cluster-wide role attribute; revert: ALTER ROLE ... INHERIT",
				};
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				receipt.app_role_inheritance_enforcement = {
					detected: inheritMemberships,
					action: `ALTER ROLE ${APP_ROLE} NOINHERIT`,
					error: msg,
				};
				throw new Error(
					`inheritance enforcement fail-closed: the app role holds INHERIT memberships [${inheritMemberships.map((m) => m.granted_role).join(", ")}] — NO per-table REVOKE reaches them and the append-only law is unenforceable; ALTER ROLE NOINHERIT refused: ${msg}`,
				);
			}
		} else {
			receipt.app_role_inheritance_enforcement = {
				detected: [],
				action: "none-needed",
			};
		}

		// ── the append-only NEGATIVE wire proof (run-003): has_table_privilege
		// reads the ACLs the planner consults (incl. anything default
		// privileges materialized), so proving the FORBIDDEN verbs are DENIED
		// is the honest end-to-end receipt of the append-only law. ────────────
		const violated: string[] = [];
		for (const t of files.flatMap((f) => f.tables)) {
			for (const p of ALL_TABLE_VERBS) {
				if (INVARIANTS[t].verbs.includes(p)) continue;
				const holds = (await sql`SELECT has_table_privilege(${APP_ROLE}, ${`public.${t}`}, ${p}) AS ok`)[0]
					?.ok as boolean;
				if (holds) violated.push(`${APP_ROLE} still holds ${p} on public.${t}`);
			}
		}
		// ── ROLE-TOPOLOGY DIAGNOSTICS OF RECORD (run-004, read-only catalog
		// reads): has_table_privilege TRUE with no matching ACL entry means the
		// residual path is ROLE MEMBERSHIP or PUBLIC — paths no per-table
		// REVOKE can reach and no role_table_grants census displays. A red
		// receipt must NAME the path; a green receipt should record that the
		// topology was checked and clean. ───────────────────────────────────
		const memberships = await sql`SELECT r.rolname AS member, g.rolname AS granted_role, m.admin_option, r.rolinherit AS member_inherits FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member JOIN pg_roles g ON g.oid = m.roleid WHERE r.rolname = ${APP_ROLE} ORDER BY g.rolname`;
		const publicRolePrivileges: Record<string, boolean> = {};
		for (const t of files.flatMap((f) => f.tables)) {
			for (const p of ALL_TABLE_VERBS) {
				publicRolePrivileges[`${t}.${p}`] = (await sql`SELECT has_table_privilege('public', ${`public.${t}`}, ${p}) AS ok`)[0]?.ok as boolean;
			}
		}
		const tableAcls: Record<string, Array<{ grantee: string; privilege_type: string }>> = {};
		for (const t of files.flatMap((f) => f.tables)) {
			tableAcls[t] = (await sql`SELECT pg_get_userbyid(acl.grantee) AS grantee, acl.privilege_type FROM aclexplode((SELECT relacl FROM pg_class WHERE oid = ${`public.${t}`}::regclass)) AS acl ORDER BY grantee, privilege_type`).map((r) => ({ grantee: r.grantee as string, privilege_type: r.privilege_type as string }));
		}
		const appMemberOfOwner = tableOwner
			? ((await sql`SELECT pg_has_role(${APP_ROLE}, ${tableOwner}, 'member') AS m`)[0]?.m as boolean)
			: null;
		receipt.app_role_topology = {
			memberships,
			public_role_privileges: publicRolePrivileges,
			table_acls: tableAcls,
			app_member_of_table_owner: appMemberOfOwner,
			note: "has_table_privilege consults ACLs + PUBLIC + the membership inherit chain; role_table_grants displays ONLY explicit ACL entries — a disagreement between the two is the signature of a membership/PUBLIC residual path",
		};
		if (violated.length > 0) {
			receipt.app_role_append_only_proof = { violated };
			throw new Error(
				`append-only wire proof fail-closed: ${violated.length} violation(s) — first: ${violated[0]}`,
			);
		}
		receipt.app_role_append_only_proof = `verified via has_table_privilege (no impersonation): the app role holds NO verb beyond the invariant grant set on any editor table (editor_edit_receipts: no UPDATE/DELETE — the append-only receipts law holds under the production default-privileges posture)`;
	}

	receipt.rollback = "DROP TABLE IF EXISTS editor_edit_receipts, editor_edit_proposals, editor_grants CASCADE; REVOKE the granted verbs FROM the app role; ALTER ROLE syllabai_v2_app_w2r2 INHERIT (restores the pre-run inheritance posture, run-005) (pure additive migration — no existing table or column touched)";
	receipt.ok = true;
	writeReceipt(true);
	console.log("0028 applied + verified (idempotent; app-role grants verified; receipts append-only by grant set)");
} catch (err) {
	receipt.error = err instanceof Error ? err.message : String(err);
	console.error("EDITOR-0028 apply FAILED:", receipt.error);
	writeReceipt(false);
	process.exitCode = 1;
} finally {
	await sql.end({ timeout: 5 });
}
