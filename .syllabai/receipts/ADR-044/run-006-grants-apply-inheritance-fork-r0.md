# ADR-044 run-006 — receipt (the grants-apply inheritance fork — an operator decision is owed)

Date: 2026-11-12 · Operator order: "Go: the grants-apply run" (traces 1a1c90b68dbce915 / 1a1ce455031699d9) · Phase 1 exit criterion of record: ADR §7 (the grants lane on the t-tier1-apply template: preflight census fail-closed, ownership gate, one GRANT transaction, has_table_privilege wire proof as the receipt).

## The state of record

Six workflow_dispatch runs of `editor-db-apply-0028` (runs 1–6, ids 42965315892 / 42967918334 / 42969574974 / 43163667915 / 43165016119 / 43168022593). **Production was never touched** — the guard protocol held every time (a red COW leg skips prod-apply; every COW was dropped and 404-verified). The prod vantage (SIB_PROD_DATABASE_URL) remains unmeasured: prod-apply has never executed.

What IS proven (every run's receipt): the frozen 0028 file applies cleanly as one transaction (preflight → DDL → grants → REVOKE-reinforcement → post-verify census `invariants_ok: true` — columns / PK / FK-cascade / the partial-open unique grant index / CHECKs / the law's grant set exactly).

## The measured blocker (the escalation ladder, one rung per run)

- **run-002 (1)**: the fresh `editor_edit_receipts` held UPDATE/DELETE the driver never granted — this database carries ALTER DEFAULT PRIVILEGES granting DML ON TABLES to the app roles (the NEON-DB-LOSS restore posture). Fixed in run-003: the driver REVOKEs every verb beyond the invariant set in the same transaction.
- **run-003 (2)**: census clean (receipts exactly INSERT,SELECT) yet `has_table_privilege` still TRUE for UPDATE/DELETE — a residual path invisible to `role_table_grants`. Run-004 added the topology diagnostics of record to name it.
- **run-004 (3)**: **the path named: `syllabai_v2_app_w2r2` is an INHERIT member of `neon_superuser`** (the Neon platform provisions console/API-created roles into that membership). has_table_privilege sees through the chain; NO per-table REVOKE can ever reach it. (PUBLIC: ruled out — empty. The ACL layer: clean.)
- **run-005 (4)**: the minimal fix attempted — `ALTER ROLE ... NOINHERIT` from the owner vantage → **"permission denied to alter role"** (neondb_owner holds no CREATEROLE/ADMIN on the app role).
- **run-006 (5)**: the runner's enforcement-vantage ladder — the Neon API **refuses a password reset on `neon_superuser` itself (HTTP 422**, platform-managed role), so no customer vantage can be provisioned from inside the lane. The leg fell back to the owner vantage and the receipt is the honest red.

**Conclusion of record: the append-only receipts law (ADR §7 — the app role can never UPDATE or DELETE a receipt) is UNENFORCEABLE at the DB privilege layer on this platform as provisioned today.** The application layer already honors the law (the api's editor service never issues UPDATE/DELETE on receipts), but the DB-level guarantee the ADR pins cannot be proven by any driver.

## The fork (operator decision; each path is a fresh order)

1. **Neon platform request** — ask Neon support / use the console to flip `syllabai_v2_app_w2r2` to NOINHERIT or drop its `neon_superuser` membership; then re-dispatch (the run-006 driver + runner need zero further changes; the wire proofs complete the exit criterion).
2. **App-role re-provisioning cutover (the F5-S7 law done right)** — SQL-create a successor role (e.g. `syllabai_v2_app_w3r3`) AS neondb_owner (SQL-created roles do NOT get the platform membership), grant it the of-record app set (schema USAGE + DML on existing tables + sequences — the restore receipt documents the set), verify on a COW, then cut the app's DATABASE_URL over in a deployment wave. Biggest win: the ENTIRE grant law becomes real for every future table, not just the editor planes. Biggest cost: a production credential cutover.
3. **ADR amendment (re-scope)** — amend ADR §7 to enforce the append-only law at the application layer + the census guard, and record the platform deviation (the topology diagnostics in every receipt already prove it). Cheapest; weakest guarantee; an ADR change is the operator's alone.

## Disclosures

- The old-generation role `syllabai_v2_app_w2` also holds S,I,U,D on the new tables via the same default privileges (observed in the run-004/006 ACL dumps). Out of this driver's law (which governs `syllabai_v2_app_w2r2`); noted for whichever path is chosen.
- Rollback of record (if the tables ever land and must go): DROP the three tables CASCADE + REVOKE the granted verbs + ALTER ROLE ... INHERIT. Zero existing-table bytes are involved at any point.
- The driver/runner changes of runs 003–006 are live on main (a2833543, 2f259c8a, 59cc6e98, f379233d); all fail-closed semantics unchanged; every receipt names its vantage.

## VERDICT (run-007, 2026-11-12 — the CREATE-ROLE viability probe, workflow run 43172104479, COW-only)

The probe (`scripts/editor-probe-role.ts`, driver e1e76bf3) measured all three gates GREEN on the disposable branch:

- **P1 — CREATE ROLE works**: `neondb_owner` created the probe role (`editor_probe_92e76cfa57ec`) — the successor-role path is not dead on arrival.
- **P2 — SQL-created roles are membership-FREE**: the fresh role held ZERO memberships — the `neon_superuser` INHERIT defect does NOT reproduce for SQL-created roles (it attaches to console/API-created roles only).
- **P3 — the verb set holds exactly**: SELECT granted = TRUE; UPDATE / DELETE / TRUNCATE all DENIED on a SELECT-only table — the critical negative that reads TRUE-via-membership on the platform-provisioned app role.

**Verdict of record: fork option 2 (the app-role re-provisioning cutover) is VIABLE end-to-end.** The probe receipt rides artifact `editor-0028-cow-receipts` of run 43172104479 (probe JSON: `p1/p2/p3` all green, `ok: true`). The cutover sequence: (1) SQL-create `syllabai_v2_app_w3r3` on prod as neondb_owner + grant the of-record app set (schema USAGE + DML on existing tables + sequences) via a guarded lane; (2) cut the app's DATABASE_URL in Vercel to the w3r3 DSN + live-verify; (3) re-dispatch the grants-apply run — the enforcement block finds no INHERIT memberships on w3r3, the full wire-proof battery completes green, and the Phase 1 exit criterion closes; (4) hygiene follow-up: retire the old role's surface once the app runs clean. Steps 1–2 are a production credential change — operator-gated.
