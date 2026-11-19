# NEON-PAUSE-001 — the w3r3 cutover EXECUTED: prod rides the F5-S7 app role (2026-11-19 ~18:38Z)

**Card:** the corrected operator action of record (the erratum's Vercel `DATABASE_URL` flip) executed under the operator-handed Vercel PAT — the F5-S7 least-privilege law is IN FORCE on production as of this receipt.

## The execution of record

1. **Pre-flip state (measured):** the prod `DATABASE_URL` env (entry `mSWz9WQTBJ5ZJ5wR`, targets production+preview+development on the Vercel project `syllabai-v2`) is a Vercel **encrypted envelope** (SENSITIVE — not token-decryptable; the API read returned ciphertext only, disclosed: the ciphertext alone is in this session's transcript, never the plaintext). The ROLE evidence was therefore the live measurement: `pg_stat_activity` showed the app pool authenticating as **`neondb_owner`** (the incident posture since the emergency cutover).
2. **The gate:** a smoke connect AS `syllabai_v2_app_w3r3` from the staged DSN (`.creds/neon.ep-bitter-wave.w3r3.dsn`): connected AS the role, users 743, receipts UPDATE denied — green, flip permitted.
3. **The flip:** PATCH the env entry ← the staged app-role pooled DSN (all three targets — the entry's existing set; value never printed, never logged).
4. **The redeploy:** the project is NOT git-linked, so the exact-source mechanism of record is the `deploymentId` redeploy — same immutable build outputs, new env — from the latest READY production deployment (`syllabai-v2-mzgjtomr9-syllabainoreply-4440.vercel.app`). Result: **`dpl_4LVvbT9jPT5toFXQYAqbY1UVRhJt` READY** at ~18:38:52Z (the pool's first w3r3 `backend_start` matches to the second).

## The post-cutover battery (ALL GREEN)

| proof | result |
| --- | --- |
| live pool role | `syllabai_v2_app_w3r3`: 2 conns (pgbouncer) — the app rides the law role |
| health | `api.syllab-ai.com/actuator/health` → 200 |
| unauth `/api/v1/editor/me` | 401 (correct: unauthenticated) |
| authed grant-less `/api/v1/editor/me` | **403 — the fail-closed law under the app role** |
| write path | **register → 201 ×2** (`probe.w3r3-cutover@syllabai-test.dev` 18:44:36Z, `probe.w3r3-cutover-2@` 18:44:51Z; users 743 → **745**) — the app writes through the app role end-to-end |
| receipts plane | untouched (0 rows — the probes never touch the editor planes) |

## The rotation (the SIXTY-SECOND item) — attempted, BLOCKED, now the operator's two clicks

`api.neon.tech` is **NXDOMAIN from this sandbox** (control plane unreachable; the data-plane pooler hosts resolve fine — measured). Per the run-006 precedent (production password resets are the operator's call), the rotation is not forced. **Prod no longer depends on the owner DSN at runtime** (the pool is w3r3-only, measured) — the dependency that made the chat-exposed owner DSN load-bearing is dead. The operator action: Neon console → project patient-frost → Roles → `neondb_owner` → **Reset password**; then stage the new DSN (the old `.creds/neon.ep-bitter-wave.dsn` dies at rotation).

Also disclosed: the OLD `vcp_` Vercel PAT (staged 14:31Z, chat-exposed) is **still alive** (200 on `/v2/user`) — superseded by the operator's new PAT this session; revocation is the operator's call. And cross-referenced: the T-MG-CALC-2 record names "the production deploy BLOCKED at the Vercel account level" — the `deploymentId` redeploy mechanism was NOT blocked by it (this deployment went READY and serves); whether normal deploys are still account-blocked is an operator-side watch item.

## Rollback of record

PATCH the env value back to the owner DSN + redeploy (minutes, zero data risk); the reprovision receipt's REVOKE/DROP rollback is unchanged.

## Disclosures

The sandbox recycle wiped the working clone mid-turn (the merged receipts were safe on GitHub; re-cloned fresh at `6c348ac1`). No secrets printed or staged outside `.creds` (chmod 600). The two probe accounts are one-time probe rows (the house's probe-account pattern).
