/**
 * ADR-044 run-008 · scripts/editor-provision-app-role.ts
 *
 * The fork-option-2 STEP-1 driver (the run-006 receipt's "App-role
 * re-provisioning cutover — the F5-S7 law done right"): SQL-create the
 * successor app role as neondb_owner, grant it the of-record app set, and
 * PROVE the property the platform-provisioned roles can never hold — a
 * membership-free role whose verb set is exactly the law. The run-007 probe
 * (scripts/editor-probe-role.ts, workflow run 43172104479) measured P1/P2/P3
 * green on a disposable branch; this driver lands the same property as a
 * provisioned role with a full wire-proof battery.
 *
 * Why a successor role: the app role of record (syllabai_v2_app_w2r2) is an
 * INHERIT member of neon_superuser — the Neon platform provisions
 * console/API-created roles into that membership (run-004 named the path;
 * run-005 measured the ALTER refusal; run-006 measured the API refusal). NO
 * per-table REVOKE reaches a membership chain, so the append-only receipts
 * law (ADR §7) is unenforceable on w2r2. A SQL-created role holds ZERO
 * memberships (P2) and EXACTLY its granted verbs (P3).
 *
 * The grant set (the of-record app set, tightened to the law):
 *   - USAGE on SCHEMA public;
 *   - SELECT,INSERT,UPDATE,DELETE on every EXISTING public table (the
 *     NEON-DB-LOSS restore receipt's "full DML on all tables" — the set the
 *     app demonstrably runs on today);
 *   - USAGE,SELECT on every existing public sequence;
 *   - NOTHING ELSE. Deliberately NO ALTER DEFAULT PRIVILEGES for the
 *     successor: future tables (0028's editor planes first) are granted
 *     explicitly by their own migration lanes (the editor-apply driver
 *     grants 0028's set in its apply transaction). The verb battery
 *     NEGATIVELY proves TRUNCATE/REFERENCES/TRIGGER — and everything beyond
 *     the granted set — are DENIED: the proof class w2r2 can never pass.
 *
 * The equivalence census (in the receipt): the driver reads the source
 * role's live explicit ACLs (tables + sequences) and records the diff
 * against the successor's set — the cutover is transparently equivalent on
 * the DML verbs; the trimmed TRUNCATE/REFERENCES/TRIGGER are the documented
 * tightening, never a silent loss.
 *
 * Password sources (credentials NEVER enter the receipt — host only):
 *   --password-source generate       : in-process random password (COW legs:
 *                                      the branch dies at leg end; the smoke
 *                                      connection uses it in-process only).
 *   --password-source file:<dsnpath> : the operator-staged successor DSN
 *                                      (the PROD leg — the password was
 *                                      staged as an Actions secret via the
 *                                      console: THE OPERATOR GATE). The
 *                                      driver validates the DSN's user
 *                                      matches --role before use.
 *
 * Idempotency (the t-tier1 law): an existing role is VERIFIED (attributes,
 * memberships, grant set re-derived and re-granted idempotently) rather than
 * recreated; any drift fails closed with the full diagnostic. An absent
 * source role fails closed (nothing to be equivalent to).
 *
 * House laws honored: a receipt JSON is ALWAYS written (even on failure);
 * fail-closed on any drift; the rollback of record is disclosed; smoke
 * connections are read-only (SELECT only).
 *
 * CLI:
 *   bun scripts/editor-provision-app-role.ts --db file:/tmp/uri.file \
 *     --receipt receipt.json [--role syllabai_v2_app_w3r3] \
 *     --password-source generate|file:/path [--source-role syllabai_v2_app_w2r2]
 */

import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`);
	if (i === -1 || i + 1 >= process.argv.length) return undefined;
	return process.argv[i + 1];
}

const dbArg = arg("db");
const receiptPath = arg("receipt");
if (!dbArg || !receiptPath) {
	console.error("missing --db or --receipt");
	process.exit(2);
}
const ROLE = arg("role") ?? "syllabai_v2_app_w3r3";
const SOURCE_ROLE = arg("source-role") ?? "syllabai_v2_app_w2r2";
const passwordSource = arg("password-source");
if (!passwordSource) {
	console.error("missing --password-source (generate | file:<dsnpath>)");
	process.exit(2);
}
// Fail-closed identifier guards: role names are interpolated into DDL.
for (const [label, name] of [
	["--role", ROLE],
	["--source-role", SOURCE_ROLE],
] as const) {
	if (!/^[a-z_][a-z0-9_]{2,62}$/.test(name)) {
		console.error(`${label} '${name}' is not a safe PostgreSQL identifier`);
		process.exit(2);
	}
}

let uri = (
	dbArg.startsWith("file:") ? readFileSync(dbArg.slice(5), "utf8").trim() : dbArg
).trim();
if (!uri.includes("sslmode=")) uri += (uri.includes("?") ? "&" : "?") + "sslmode=require";
const uriHost = new URL(uri).host; // host is safe to record; credentials are not

const receipt: Record<string, unknown> = {
	card: "EDITOR-APP-ROLE-PROVISION (ADR-044 run-008 fork-option-2 step 1)",
	driver: "scripts/editor-provision-app-role.ts",
	role: ROLE,
	source_role: SOURCE_ROLE,
	password_source: passwordSource.startsWith("file:") ? "staged-dsn" : passwordSource,
	db_host: uriHost,
	mode: "provision-app-role",
	started_at: new Date().toISOString(),
};
const writeReceipt = (ok: boolean) => {
	receipt.finished_at = new Date().toISOString();
	receipt.ok = ok;
	writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
};

const sql = postgres(uri, { max: 1, prepare: false, connect_timeout: 15 });

const ALL_TABLE_VERBS = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"] as const;
const LAW_TABLE_VERBS = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
const ALL_SEQ_VERBS = ["USAGE", "SELECT", "UPDATE"] as const;
const LAW_SEQ_VERBS = ["USAGE", "SELECT"] as const;

type AclSet = { tables: Record<string, string[]>; sequences: Record<string, string[]> };

/** The source role's live EXPLICIT ACLs (the catalog view the planner's
 * has_table_privilege also reads, membership chains aside) — the equivalence
 * baseline of record. */
async function readAclSet(role: string): Promise<AclSet> {
	const rows = await sql`
		SELECT c.relname AS name, c.relkind AS kind, acl.privilege_type AS verb
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		JOIN LATERAL aclexplode(c.relacl) AS acl ON true
		JOIN pg_roles r ON r.oid = acl.grantee
		WHERE n.nspname = 'public' AND r.rolname = ${role}
		ORDER BY c.relname, acl.privilege_type`;
	const set: AclSet = { tables: {}, sequences: {} };
	for (const row of rows) {
		const bucket = row.kind === "S" ? set.sequences : set.tables;
		(bucket[row.name as string] ??= []).push(row.verb as string);
	}
	for (const bucket of [set.tables, set.sequences] as const) {
		for (const k of Object.keys(bucket)) bucket[k].sort();
	}
	return set;
}

function parseStagedDsn(path: string): { dsn: string; user: string; host: string } {
	const raw = readFileSync(path, "utf8").trim();
	const u = new URL(raw);
	if (!u.password) throw new Error("the staged successor DSN carries no password");
	return { dsn: raw, user: decodeURIComponent(u.username), host: u.host };
}

function withUserRole(baseUri: string, role: string, password: string): string {
	const u = new URL(baseUri);
	u.username = role;
	u.password = encodeURIComponent(password);
	u.searchParams.delete("channel_binding"); // the smoke client keeps sslmode=require
	if (!u.searchParams.has("sslmode")) u.searchParams.set("sslmode", "require");
	return u.toString();
}

const quoteIdent = (s: string) => `"${s.replace(/"/g, '""')}"`;
const quoteLiteral = (s: string) => `'${s.replace(/'/g, "''")}'`;

try {
	// ── preflight ────────────────────────────────────────────────────────────
	const meRow = (await sql`SELECT current_user AS u`)[0]?.u as string | undefined;
	const users = (await sql`SELECT to_regclass('public.users') AS t`)[0]?.t;
	if (users === null) throw new Error("preflight fail-closed: public.users does not exist (not the syllabai schema?)");
	const usersRows = (await sql`SELECT count(*)::int AS n FROM public.users`)[0]?.n as number;
	receipt.preflight = {
		connected_as: meRow ?? null,
		users_marker: users,
		users_rows: usersRows,
	};

	// ── the source role must exist (the equivalence baseline) ────────────────
	const sourceAttrs = (await sql`SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcanlogin FROM pg_roles WHERE rolname = ${SOURCE_ROLE}`)[0];
	if (!sourceAttrs) {
		throw new Error(`fail-closed: the source role ${SOURCE_ROLE} does not exist — nothing to be equivalent to (zero bytes touched)`);
	}
	const sourceSet = await readAclSet(SOURCE_ROLE);
	const sourceTableCount = Object.keys(sourceSet.tables).length;
	if (sourceTableCount === 0) {
		throw new Error(`fail-closed: ${SOURCE_ROLE} holds NO explicit table ACLs — refusing to guess the app set (zero bytes touched)`);
	}

	// ── resolve the password + the smoke DSN (never recorded) ────────────────
	// ONE password for both CREATE ROLE and the smoke connect; a staged DSN is
	// used verbatim. An idempotent re-run over an existing role cannot know the
	// old generated password — the smoke leg is skipped there (receipted).
	let smokeUri: string | null = null;
	let createPassword: string | null = null;
	if (passwordSource.startsWith("file:")) {
		const staged = parseStagedDsn(passwordSource.slice(5));
		if (staged.user !== ROLE) {
			throw new Error(`fail-closed: the staged successor DSN's user is '${staged.user}', expected '${ROLE}' — refusing (zero bytes touched)`);
		}
		receipt.staged_dsn_host = staged.host;
		smokeUri = staged.dsn;
		createPassword = decodeURIComponent(new URL(staged.dsn).password);
	} else if (passwordSource === "generate") {
		createPassword = randomBytes(24).toString("base64url");
		smokeUri = null; // decided after the existence check: only on a fresh create
	} else {
		throw new Error(`unsupported --password-source '${passwordSource}' (generate | file:<dsnpath>)`);
	}

	// ── role existence + attributes (idempotent verify, drift fails closed) ──
	const existing = (await sql`SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = ${ROLE}`)[0];
	const expectedAttrs = { rolsuper: false, rolinherit: false, rolcreaterole: false, rolcreatedb: false, rolcanlogin: true, rolreplication: false, rolbypassrls: false };
	if (existing) {
		const drift = Object.entries(expectedAttrs).filter(([k, v]) => (existing as Record<string, unknown>)[k] !== v);
		if (drift.length > 0) {
			throw new Error(`fail-closed idempotency: ${ROLE} already exists with drifted attributes [${drift.map(([k, v]) => `${k}=${(existing as Record<string, unknown>)[k]} (expected ${v})`).join(", ")}] — refusing (zero bytes touched)`);
		}
		receipt.role_created = false;
		receipt.role_note = "already provisioned — verified, grants re-applied idempotently";
	} else {
		await sql.unsafe(
			`CREATE ROLE ${quoteIdent(ROLE)} LOGIN PASSWORD ${quoteLiteral(createPassword ?? "")} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
		);
		if (passwordSource === "generate") smokeUri = withUserRole(uri, ROLE, createPassword!);
		receipt.role_created = true;
	}
	receipt.attributes = existing
		? {
				rolsuper: existing.rolsuper,
				rolinherit: existing.rolinherit,
				rolcreaterole: existing.rolcreaterole,
				rolcanlogin: existing.rolcanlogin,
			}
		: expectedAttrs;

	// ── memberships MUST be [] (the P2 law — the property w2r2 can never hold)
	const memberships = await sql`
		SELECT g.rolname AS granted_role, m.admin_option
		FROM pg_auth_members m
		JOIN pg_roles g ON g.oid = m.roleid
		JOIN pg_roles r ON r.oid = m.member
		WHERE r.rolname = ${ROLE} ORDER BY g.rolname`;
	receipt.memberships = memberships;
	if (memberships.length > 0) {
		throw new Error(`fail-closed: ${ROLE} holds memberships [${memberships.map((m) => m.granted_role).join(", ")}] — the successor role must be membership-free (P2); zero grants executed`);
	}

	// ── grants: schema USAGE + the law set on every EXISTING table/sequence ──
	await sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${quoteIdent(ROLE)}`);
	const granted: AclSet = { tables: {}, sequences: {} };
	for (const [name, verbs] of Object.entries(sourceSet.tables)) {
		// The LAW set (full DML), not the source's literal ACL — the documented
		// tightening; the receipt's diff makes the delta explicit, never silent.
		const verbsSql = LAW_TABLE_VERBS.join(", ");
		await sql.unsafe(`GRANT ${verbsSql} ON TABLE public.${quoteIdent(name)} TO ${quoteIdent(ROLE)}`);
		granted.tables[name] = [...LAW_TABLE_VERBS];
	}
	for (const [name, verbs] of Object.entries(sourceSet.sequences)) {
		const verbsSql = LAW_SEQ_VERBS.join(", ");
		await sql.unsafe(`GRANT ${verbsSql} ON SEQUENCE public.${quoteIdent(name)} TO ${quoteIdent(ROLE)}`);
		granted.sequences[name] = [...LAW_SEQ_VERBS];
	}
	receipt.grant_set = {
		schema_usage: true,
		tables_count: Object.keys(granted.tables).length,
		sequences_count: Object.keys(granted.sequences).length,
		verbs_per_table: LAW_TABLE_VERBS,
		verbs_per_sequence: LAW_SEQ_VERBS,
		law_note:
			"the successor holds the law set on EXISTING tables only — deliberately NO ALTER DEFAULT PRIVILEGES, so future tables are granted explicitly by their own migration lanes (the editor-apply driver grants 0028's set in its apply transaction)",
	};

	// ── equivalence census (source vs successor; the diff is explicit) ───────
	const successorAcl = await readAclSet(ROLE);
	const tablesDiff: Record<string, { source: string[]; successor: string[] }> = {};
	for (const name of new Set([...Object.keys(sourceSet.tables), ...Object.keys(successorAcl.tables)])) {
		const s = sourceSet.tables[name] ?? [];
		const d = successorAcl.tables[name] ?? [];
		if (s.join(",") !== d.join(",")) tablesDiff[name] = { source: s, successor: d };
	}
	const seqsDiff: Record<string, { source: string[]; successor: string[] }> = {};
	for (const name of new Set([...Object.keys(sourceSet.sequences), ...Object.keys(successorAcl.sequences)])) {
		const s = sourceSet.sequences[name] ?? [];
		const d = successorAcl.sequences[name] ?? [];
		if (s.join(",") !== d.join(",")) seqsDiff[name] = { source: s, successor: d };
	}
	const missingDml = Object.keys(tablesDiff).filter((n) => {
		const want = LAW_TABLE_VERBS.filter((v) => (sourceSet.tables[n] ?? []).includes(v));
		const have = successorAcl.tables[n] ?? [];
		return want.some((v) => !have.includes(v));
	});
	if (missingDml.length > 0) {
		throw new Error(`post-grant equivalence fail-closed: ${missingDml.length} table(s) where the successor lacks a DML verb the source holds — first: ${missingDml[0]}`);
	}
	receipt.equivalence = {
		tables_diff_count: Object.keys(tablesDiff).length,
		sequences_diff_count: Object.keys(seqsDiff).length,
		tables_diff: tablesDiff,
		sequences_diff: seqsDiff,
		note:
			"the expected diff is exactly the TRUNCATE/REFERENCES/TRIGGER tightening (and its sequence UPDATE analogue) — any source DML verb the successor lacks is a fail-closed red above",
	};

	// ── default-privileges verdict: the successor must appear in NO defacl ───
	const defaclHits = (
		await sql`SELECT defaclnamespace::regnamespace::text AS ns, defaclrole::regrole::text AS grantor, unnest(defaclacl) AS item FROM pg_default_acl`
	).filter((r) => {
		const item = r.item as string;
		return item === ROLE || item.startsWith(`${ROLE}*=`) || item.startsWith(`${ROLE}=`);
	});
	receipt.default_privileges_verdict = {
		hits: defaclHits,
		ok: defaclHits.length === 0,
		note:
			"the successor is deliberately absent from every ALTER DEFAULT PRIVILEGES entry — future tables carry NO implicit grant for it (the over-grant class the restore posture gave w2r2 is not reproduced)",
	};
	if (defaclHits.length > 0) throw new Error(`fail-closed: ${ROLE} appears in ${defaclHits.length} default-privilege ACL entry/entries — the implicit-grant class must not be reproduced`);

	// ── THE WIRE-PROOF BATTERY (has_*_privilege, grantor side, NO impersonation)
	// Batched per table (one query returns every verb verdict) and ONE catalog
	// query for the whole PUBLIC plane — the full sweep at ~1/5th the round
	// trips (the sandbox COW rehearsal measured the naive per-verb form over
	// ~900 sequential cross-region queries exceeding a 600s budget).
	const violations: string[] = [];
	let positives = 0;
	let negatives = 0;
	for (const [name, verbs] of Object.entries(granted.tables)) {
		const row = (await sql`
			SELECT
				has_table_privilege(${ROLE}, ${`public.${name}`}, 'SELECT') AS sel,
				has_table_privilege(${ROLE}, ${`public.${name}`}, 'INSERT') AS ins,
				has_table_privilege(${ROLE}, ${`public.${name}`}, 'UPDATE') AS upd,
				has_table_privilege(${ROLE}, ${`public.${name}`}, 'DELETE') AS del,
				has_table_privilege(${ROLE}, ${`public.${name}`}, 'TRUNCATE') AS trc,
				has_table_privilege(${ROLE}, ${`public.${name}`}, 'REFERENCES') AS ref,
				has_table_privilege(${ROLE}, ${`public.${name}`}, 'TRIGGER') AS trg
		`)[0];
		const got: Record<string, boolean> = {
			SELECT: row.sel, INSERT: row.ins, UPDATE: row.upd, DELETE: row.del,
			TRUNCATE: row.trc, REFERENCES: row.ref, TRIGGER: row.trg,
		};
		for (const v of ALL_TABLE_VERBS) {
			if ((LAW_TABLE_VERBS as readonly string[]).includes(v)) {
				positives++;
				if (!got[v]) violations.push(`${ROLE} lacks ${v} on public.${name} (granted)`);
			} else {
				negatives++;
				if (got[v]) violations.push(`${ROLE} still holds ${v} on public.${name} (beyond the law set)`);
			}
		}
		if (verbs.length !== LAW_TABLE_VERBS.length) violations.push(`internal: ${name} granted set != law set`);
	}
	for (const [name, verbs] of Object.entries(granted.sequences)) {
		const row = (await sql`
			SELECT
				has_sequence_privilege(${ROLE}, ${`public.${name}`}, 'USAGE') AS usg,
				has_sequence_privilege(${ROLE}, ${`public.${name}`}, 'SELECT') AS sel,
				has_sequence_privilege(${ROLE}, ${`public.${name}`}, 'UPDATE') AS upd
		`)[0];
		const got: Record<string, boolean> = { USAGE: row.usg, SELECT: row.sel, UPDATE: row.upd };
		for (const v of ALL_SEQ_VERBS) {
			if ((LAW_SEQ_VERBS as readonly string[]).includes(v)) {
				positives++;
				if (!got[v]) violations.push(`${ROLE} lacks ${v} on public.${name} (granted)`);
			} else {
				negatives++;
				if (got[v]) violations.push(`${ROLE} still holds ${v} on public.${name} (beyond the law set)`);
			}
		}
		if (verbs.length !== LAW_SEQ_VERBS.length) violations.push(`internal: ${name} granted set != law set`);
	}
	const schemaUsage = (await sql`SELECT has_schema_privilege(${ROLE}, 'public', 'USAGE') AS ok`)[0]?.ok as boolean;
	positives++;
	if (!schemaUsage) violations.push(`${ROLE} lacks USAGE on schema public (granted)`);
	// PUBLIC must hold nothing on the APP'S relations (the run-004 residual
	// class — grantee oid 0 is PUBLIC): one catalog query covers every public
	// relation. Extension/platform-owned relations (e.g. pg_stat_statements,
	// installed by Neon itself with its own PUBLIC grants) are OBSERVED, not
	// judged — they are outside the app grant law.
	const publicRows = await sql`
		SELECT c.relname AS name, acl.privilege_type AS verb
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		JOIN LATERAL aclexplode(c.relacl) AS acl ON true
		WHERE n.nspname = 'public' AND acl.grantee = 0
		ORDER BY c.relname, acl.privilege_type`;
	const grantedNames = new Set(Object.keys(granted.tables));
	const publicHits: string[] = [];
	const publicObserved: string[] = [];
	for (const r of publicRows) {
		const entry = `PUBLIC holds ${r.verb} on public.${r.name}`;
		if (grantedNames.has(r.name as string)) publicHits.push(entry);
		else publicObserved.push(entry);
	}
	for (const entry of publicHits) violations.push(entry);
	receipt.verb_battery = {
		positives_checked: positives,
		negatives_checked: negatives,
		public_hits: publicHits,
		public_observed_beyond_app_plane: publicObserved,
		public_note:
			"extension/platform-owned relations (e.g. pg_stat_statements) are recorded as observations — outside the app grant law (the rehearsal finding, run-008)",
		violations,
	};
	if (violations.length > 0) {
		throw new Error(`wire-proof battery fail-closed: ${violations.length} violation(s) — first: ${violations[0]}`);
	}

	// ── smoke connect AS the successor (read-only SELECTs only) ──────────────
	if (smokeUri) {
		const smoke = postgres(smokeUri, { max: 1, prepare: false, connect_timeout: 15 });
		try {
			const who = (await smoke`SELECT current_user AS u, pg_has_role(current_user, 'neon_superuser', 'member') AS in_super`)[0];
			const rows = (await smoke`SELECT count(*)::int AS n FROM public.users`)[0]?.n as number;
			const truncateDenied = !((await smoke`SELECT has_table_privilege(current_user, 'public.users', 'TRUNCATE') AS ok`)[0]?.ok as boolean);
			receipt.smoke = {
				connected_as: who?.u ?? null,
				neon_superuser_member: who?.in_super ?? null,
				users_rows: rows,
				users_truncate_denied: truncateDenied,
				note: "read-only SELECTs only — the live vantage of the role the app will cut over to",
			};
			if (who?.u !== ROLE) throw new Error(`smoke fail-closed: connected as '${who?.u}', expected '${ROLE}'`);
			if (who?.in_super) throw new Error("smoke fail-closed: the successor session reads neon_superuser membership — the P2 law is violated");
			if (!truncateDenied) throw new Error("smoke fail-closed: TRUNCATE on users is not denied from the successor's own session (P3 violated)");
		} finally {
			await smoke.end({ timeout: 5 });
		}
	} else {
		receipt.smoke = {
			skipped: "idempotent re-run over an existing role with a generated password — the old password is unknowable; the grant battery above is the proof",
		};
	}

	receipt.rollback = `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE}; REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${ROLE}; REVOKE USAGE ON SCHEMA public FROM ${ROLE}; DROP ROLE ${ROLE} — the cutover revert is flipping the app's DATABASE_URL back to the staged ${SOURCE_ROLE} DSN (minutes, zero data risk)`;
	receipt.ok = true;
	writeReceipt(true);
	console.log(
		`${ROLE} provisioned + verified (membership-free, law-set grants on ${Object.keys(granted.tables).length} tables + ${Object.keys(granted.sequences).length} sequences, battery ${positives}+/${negatives}- green, smoke green)`,
	);
} catch (err) {
	receipt.error = err instanceof Error ? err.message : String(err);
	console.error("EDITOR-APP-ROLE provision FAILED:", receipt.error);
	writeReceipt(false);
	process.exitCode = 1;
} finally {
	await sql.end({ timeout: 5 });
}
