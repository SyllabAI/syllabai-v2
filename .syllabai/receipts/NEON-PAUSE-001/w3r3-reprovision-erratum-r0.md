# NEON-PAUSE-001 erratum — the app env plane of record is VERCEL, not Render

**Erratum to:** `.syllabai/receipts/NEON-PAUSE-001/w3r3-reprovision-new-wire-r0.json` (the `rollback` field) and the w3r3-reprovision worklog row (the "operator gate" bullet). **Supersedes the PR #1128 body's platform claim.**

## The error

Both the receipt's rollback text and the worklog row name "Render's DATABASE_URL" as the env plane the operator must re-point to the staged `syllabai_v2_app_w3r3` pooled DSN. **That is wrong.** The app carrier of record runs on Vercel; nothing in the current deployment record names Render.

## Ground truth (measured first-hand at correction time, 2026-11-19 ~16:55Z)

- The **Vercel project `syllabai-v2`** (`prj_vf1MQaCuuGHd83HaTA3uqDxETpb5`) carries **DATABASE_URL [production, preview, development]** — and it is the ONLY project that does: `syllabai-hub-v2` (the hub, nextjs) and `api-stage` carry no database env at all (Vercel API `/v9/projects/{id}/env`, names only, values never decrypted).
- The project's production domain of record is **`api.syllab-ai.com`** (verified project domain; alternate `syllabai-v2-six.vercel.app`). `/actuator/health` → **HTTP 200 live** at correction time; the newest two production deployments are READY (created 2026-11-19T11:59:22Z and 2026-11-18T18:53:01Z).
- The serving window that opened with the 2026-11-18T18:53:01Z deploy covers the cutover re-point evidence of record: the new wire's live `pg_stat_activity` app pool (4 connections, ~16:13Z), the `v1retest-20261119` user row (07:59:25Z), and the 14:32Z wire proofs (demo mint 200 / `/editor/me` 403 fail-closed).
- Repo cross-check: the worklog's deploy-of-record rows are all Vercel (`vercel deploy --prod`, `dpl_*` ids, "the Vercel function" in the NEON-PAUSE-001 run-004 receipt). **Render appears ONLY in the frozen golden captures** (`golden-captures/t-mig-092/*`: `syllabai-core.onrender.com`, main 6cad6ef94) — the OLD core host from before the Vercel migration.

## Where the error came from (disclosed, not excused)

The reprovision driver's author (the agent) carried the stale golden-capture host name into the receipt's rollback text, the worklog row, and the report, without checking the env plane of record before naming it. The check takes one Vercel API call; it was not made until the operator challenged the claim. Author error, not repo ambiguity.

## Impact on the repair: none

Every leg of the reprovision ran directly against Neon via the owner DSN — create role, grants, the 406+/309− battery, the smoke connect AS the role. None of it touched any deployment platform, and the staged app-role DSN (`.creds/neon.ep-bitter-wave.w3r3.dsn`, chmod 600) is valid wherever it loads. The F5-S7 law restored on the patient-frost wire stands exactly as receipted. The correction touches ONLY the operator-action text.

## The corrected operator action

1. Vercel → project **`syllabai-v2`** → Settings → Environment Variables → **DATABASE_URL** (production) ← the staged app-role pooled DSN → redeploy.
2. Post-cutover wire proofs: a demo mint → 200; `/api/v1/editor/me` → 403 fail-closed for the grant-less; `pg_stat_activity` on the new wire shows `usename = syllabai_v2_app_w3r3`.
3. Rollback: flip the env var back and redeploy (minutes, zero data risk); the receipt's REVOKE/DROP rollback is unchanged.
4. Rotation (unchanged, now unambiguous): rotate the chat-exposed patient-frost OWNER DSN password after the cutover lands — the app then never needs the owner DSN at runtime.
