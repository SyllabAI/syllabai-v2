# ADR-044 run-009 — receipt (Gate 2 executed: the Vercel DATABASE_URL cutover to the successor app role — live-verified green)

- Date: 2026-11-17 · Authority: the operator's standing authorization (the run-008 executed-to-the-wire row's REMAINING items (1)–(3); operator order "why do you have to wait for me?", 2026-11-15) — no fresh operator order this turn; this run executes step 3 of the run-006 receipt's option-2 sequence (run-008's "operator gate 2 — the cutover"). · Design of record: `.syllabai/receipts/ADR-044/run-008-w3r3-provision-lane-r0.md` + ADR §7.

## Preconditions verified (read-only)

- **The exit criterion already closed of record**: run 43663367700's prod receipt `ok:true` — `app_role: syllabai_v2_app_w3r3`, enforcement block `none-needed` (first on production), privilege proof (editor_grants/editor_edit_proposals 4 DML verbs; editor_edit_receipts SELECT+INSERT ONLY), topology `memberships: []` with the PUBLIC plane all-false, append-only proof green. Artifact `editor-0028-prod-receipts` (14140344205) re-pulled and re-read this run (the GitHub run's `failure` conclusion is the receipt's final Vercel wire-proof step going red on the 2026-11-15 402 DEPLOYMENT_DISABLED window — environmental, resolved since; the DB apply itself was green).
- **Workspace recycle recovery**: `gh.pat` + `vercel.pat` restored from the /tmp snapshot of the prior workspace (mode 600, never printed); the Vercel token verified via `GET /v2/user` = `syllabainoreply-4440` (OWNER of the prod deploys — the Task-19 Gate-2 unblock).
- **The cutover target of record**: the HUB project (`prj_idqk5yM3leODE1Rmm2pPNKxy2x6m`) carries NO `DATABASE_URL` (12 production vars, none DB — pure core-api mode). The Neon wire's only Vercel consumer is the **api project `syllabai-v2`** (`prj_vf1MQaCuuGHd83HaTA3uqDxETpb5`, serving `api.syllab-ai.com`): `DATABASE_URL` id `mSWz9WQTBJ5ZJ5wR`, targets [production, preview, development], last updated 2026-11-05 — still the w2r2 DSN. (`api-stage` production env list is empty; no other consumer exists.)
- **Rollback artifact**: the of-record current value read via the single-env GET (the t139 single-env law — the LIST returns encrypted envelopes, the single GET returns the value) and saved to `.creds/database_url.rollback.w2r2` (mode 600, never printed, never logged, never in any receipt). The flip is revertible in minutes.
- **Pre-flight smoke AS the successor** (`scripts/w3r3_cutover_smoke.mjs` in the agent workspace, Bun.sql, the staged secret `SIB_W3R3_DATABASE_URL` passed by env, never printed): **ok:true, reds []** — `current_user = syllabai_v2_app_w3r3`; users = 740 (live traffic since Gate 1's 739); **104 public relations carry the law grant set EXACTLY** (the only non-DML relation = `editor_edit_receipts`, SELECT+INSERT only — BY LAW, the append-only refusal); editor planes INSERT green; negatives TRUNCATE / REFERENCES / `neon_superuser` membership all false; schema USAGE + 2 sequences. The cutover-breaking class (a table created after the w3r3 provision, ungranted) is RULED OUT.

## The cutover (the wire)

- `PATCH /v10/projects/prj_vf1MQaCuuGHd83HaTA3uqDxETpb5/env/mSWz9WQTBJ5ZJ5wR` → **HTTP 200**, `updatedAt 2026-11-17T06:23:46Z`, key `DATABASE_URL`, type encrypted, targets [production, preview, development] (scope unchanged). The staged successor DSN went **verbatim** — the operator's password never crossing any receipt/artifact/log (payload file mode 600, deleted post-call; value never printed).
- Redeploy: `POST /v13/deployments` **deploymentId redeploy** → `dpl_5Qvpms4hYmaL39TnVbYzbJQi3k6w`, pinned to the CURRENT production SHA `f0ec3eb2d9be` — **ZERO code delta, fresh env resolution**. (A `gitSource` commit deploy was refused — v13 `gitSource.type` admits only `github` on this API; the deploymentId redeploy is the of-record path.) **READY < 60 s** (created 06:24:23Z), aliases `api.syllab-ai.com` + `syllabai-v2-six.vercel.app` + `syllabai-v2-syllabainoreply-4440.vercel.app`.

## Live verification (the wire proofs, in order)

1. `GET https://api.syllab-ai.com/actuator/health` → `{"groups":["liveness","readiness"],"status":"UP"}`.
2. `GET https://www.syllab-ai.com/api/health` → HTTP 200, `status=ok`, `dataMode=core-api`, `coreProbeOrigin=https://api.syllab-ai.com`, `coreReachable=true` (the hub→api plane unaffected by the flip).
3. **The DB-touching proof**: `POST /api/v1/auth/login` with the demo student account (credentials read from the hub's env API into shell vars, never printed) → **HTTP 200** AuthResponse (`accessToken`, `tokenType`, `user`) — a full authenticated users-table round-trip ON THE NEW DEPLOYMENT.
4. **The session census of record** (owner vantage, read-only `pg_stat_activity`): before the flip — only the smoke's own idle w3r3 backend (state_change 06:22:32Z) and zero w2r2 sessions; after the login — a `syllabai_v2_app_w3r3` backend **active at 06:26:37Z**, the login's query window: the app's pooled connection is authenticated **AS the successor**. Only the w3r3 credential can open such a backend.
5. **The editor-plane wire proof** (the run-008 executed row's remaining item (3)): `GET /api/v1/editor/me` with the grant-less demo token → **HTTP 403** `{error, path, status, timestamp}` — the fail-closed envelope of record (a grant-less account never reaches the editor plane).

## Rollback of record

- `PATCH DATABASE_URL` back to the saved artifact (`.creds/database_url.rollback.w2r2`) + redeploy the same pinned SHA `f0ec3eb2d9be`. Minutes, zero data risk: a pure-credential flip touches no DB bytes; both roles serve the same production branch/compute.

## What remains (not executed this run)

- **Hygiene, operator-decided** (run-008's step 5): retire the `w2r2`/`w2` surface (REVOKE their default-privilege entries + table grants, or drop) once the app runs clean — it now runs clean AS w3r3, but the retirement is a production privilege change that stays the operator's alone. `t0_readonly` carries the same membership defect for its own lane.

## Disclosures

- The hub project's env was verified DB-free before any change was made; had the flip targeted the hub it would have been a no-op mistake — the run-008 receipt's "flip the app's DATABASE_URL in Vercel" resolves to the api project on today's topology.
- The api's preview and development targets now carry the w3r3 DSN too (the var's pre-existing scope, preserved exactly — no scope decision was made this run).
- Credentials standing reminder (THIRTY-THIRD filing): the GitHub PAT, the Neon API key, both owner DSNs, the Vercel token(s), and the staged w3r3 DSN (in-channel origin) all remain pending rotation.
- The verification scripts persist in the agent workspace only (`scripts/w3r3_cutover_smoke.mjs`, `scripts/pg_activity_census.mjs`) — this PR carries zero src bytes beyond this receipt and the worklog row.
- Agent: Super Z <agent@syllabai.local>
