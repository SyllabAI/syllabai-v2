# T-HUBWIRE-1 — the hub↔api wire of record

**Status:** branch `t-hubwire-1/run-001` — proposed, not merged. The merge and
every operator action in §5 remain the operator's fire order.
**Author:** Super Z `<agent@syllabai.local>` (zai session, discord DM trace
`0fe7185bf054341114f7c562bba814cd`, 2026-11-06).

---

## 1. The failure class of record

The hub serves its API calls **browser-direct** (ADR-029 posture):
`NEXT_PUBLIC_API_BASE_URL` is inlined into the client bundle at build time and
derived into the CSP `connect-src`. If the hostname that env names is not
attached to the api's Vercel project, the request never reaches the v2 api —
Vercel's edge answers with its generic `text/plain` **NOT_FOUND** page. The
hub keeps rendering (it is a static shell for every API surface), and
`/api/health` keeps reporting `coreConfigured:true`, because
`isCoreApiConfigured()` (`apps/hub/src/lib/data/mode.ts`) checks **env
presence, never reachability**. Nothing in the repo could have caught this —
until this run.

## 2. The 2026-11-05/06 chronology (all receipts below are live-probe records)

| Time (UTC) | Event | Receipt |
|---|---|---|
| 2026-11-05 (earlier) | The original Vercel team hits its usage wall. `syllabai-hub-v2` project: last 3 deploys **CANCELED**; account user is `limited:true`. | read-only Vercel API enumeration, 2026-11-06T12:14Z |
| 2026-11-06T~06:35 | PR **#815** (`t-wirefix-1/run-001`) merged — the missing prod migrations lane (0017/0018/0019/0027) behind the tier1 COW guard, `workflow_dispatch`-only, **inert until the operator dispatches**. | main `0e685a8c` |
| 2026-11-06T12:00:11Z | Hub of record is LIVE at a **new** account: `https://www.syllab-ai.com` serving `apps/hub` (font fingerprint kodchasan/bricolage/fraunces/instrument-sans + `public/aignite-2026-badge.png` all match this repo's tree). `/api/health` → `{"service":"syllabai-hub","dataMode":"core-api","coreConfigured":true}`. Client chunks inline `"https://api.syllab-ai.com"` as the browser-direct origin; live CSP `connect-src` contains it. **But** `https://api.syllab-ai.com/` served Vercel `NOT_FOUND` (404, text/plain) — the hostname was **not attached** to any project. Old of-record URLs `syllabai-v2.vercel.app` / `syllabai-hub-v2.vercel.app` serve **402 DEPLOYMENT_DISABLED**. | curl receipts, audit trace `0fe7185bf…` |
| 2026-11-06T12:11:57Z | Every `/api/v1/*` surface (GET + POST, e.g. `/api/v1/auth/login`, `/api/v1/curriculum/subjects`) 404s at the edge — the production hub's learner surfaces were **dead at the wire**. | curl receipts |
| 2026-11-06T~11:58Z | Prod Neon (`ep-ancient-cake-a52e4kfd`, us-east-2) receives writes; census at 12:05Z shows **0017/0018/0019 artifacts PRESENT** (`mark_point_rects`, `mark_awards`, `mark_working_blocks`, `learner_pdf_drawings` exist) — the migrations lane moving. **0027 still ABSENT** (`attempts.attempt_class`, `attempts.cache_hash`: 0 of 2 columns). | read-only psycopg2 census |
| 2026-11-06T12:13:43Z | PR **#817** merges (T-TEACHGENIE-007). | main `be8668e9` |
| 2026-11-06T12:24:23Z | **The operator attaches `api.syllab-ai.com` to the api project mid-audit.** `scripts/t-hubwire-1-wire-proof.ts` (this branch) now returns **ALL-GREEN**: the same host that served edge NOT_FOUND at 12:11:57Z answers `401 application/json {"timestamp":…,"status":401,"error":"Unauthorized","path":"/api/v1/auth/me"}` — the v2 api JSON envelope class. | driver receipts, exit 0 |

The two states inside one hour are exactly the class this run makes
self-reporting: the wire flipped from broken to green **with no repo-side
receipt either time**.

## 3. The topology of record (2026-11-06T12:24Z)

- **hub-of-record:** `https://www.syllab-ai.com` (apex 308s → www) — this
  repo's `apps/hub`, deployed from the new Vercel account.
- **api-of-record:** `https://api.syllab-ai.com` — **as of 2026-11-06T12:24Z
  attached and serving**; `https://syllabai-v2-six.vercel.app` remains the
  bare deployment origin T-WIREFIX-1 wire-probed against.
- **RETIRED 2026-11-05:** `syllabai-v2.vercel.app` and
  `syllabai-hub-v2.vercel.app` (402 `DEPLOYMENT_DISABLED` — the original
  team's usage wall). The root README and `.env.example` still named them
  of-record as of `be8668e9`; this branch syncs them.
- **DB of record:** Neon `ep-ancient-cake-a52e4kfd` (us-east-2) — 99 public
  tables, full corpus (mark_points 70,105 / documents 1,689 / exam_papers
  338), newest write 2026-11-06T11:58Z. `ep-calm-queen-az36lppq`
  (ap-southeast-1) is the sparse dev/sandbox env (10 tables, zero recency) —
  the same env T-WIREFIX-1 used as its fail-closed preflight target.

## 4. Ship list (this branch)

1. **`scripts/t-hubwire-1-wire-proof.ts`** — the wire-proof driver of record
   (stdlib-only, bun/node ≥18, no secrets). Probes hub health, extracts the
   deployed build's browser-direct origins from the live CSP, classifies the
   api origin (`v2-api` JSON envelope vs `edge-not-found` vs other), and
   **fails closed**: exit 0 ALL-GREEN / exit 2 WIRE-BROKEN / exit 3
   PROBE-ENV. Validated live on 2026-11-06T12:24:20Z — receipts in §2.
2. **`apps/hub/src/app/api/health/route.ts`** — additive reachability receipt
   (`coreReachable` / `coreProbeOrigin` / `coreProbeDetail`): an
   unauthenticated 2.5s probe of the resolved core origin, cached 60s per
   isolate. `coreConfigured` keeps its exact meaning (env presence); the
   receipt adds the reachability half so the incident class is visible in
   health itself, not only in the driver.
3. **`apps/hub/.env.example`** — the attach law: a custom-domain
   `NEXT_PUBLIC_API_BASE_URL` must be attached to the api project **before**
   the hub build ships, with the verify command.
4. **`README.md`** — of-record URL sync (§3), retiring the two dead
   `*.vercel.app` URLs with dates and reasons.

## 5. Operator actions pending (each is a fire order — none is mine)

1. **Dispatch** `.github/workflows/t-wirefix-db-apply-0017-0018-0019-0027.yml`
   (or land 0027 by its own lane): prod census 2026-11-06T12:19Z shows
   `attempts.attempt_class` + `attempts.cache_hash` still **absent** (0 of 2)
   on `ep-ancient-cake-a52e4kfd`.
2. **Rebuild the hub** once so `/api/health` ships the reachability receipt
   (this branch's additive fields) — the currently deployed build predates it
   (`coreReachable=undefined` in the 12:24:20Z probe).
3. **Re-run** `bun scripts/t-hubwire-1-wire-proof.ts` after any env/host
   change; expect exit 0. A WIRE-BROKEN exit is the tripwire for the §1 class.

## 6. What this run deliberately does NOT do

- No domain/DNS/Vercel operations from a PAT — the domain attach that closed
  the wire was (and must always be) an operator act in the Vercel console.
- No env values changed or read: the new account's `NEXT_PUBLIC_API_BASE_URL`
  / `SYLLABAI_CORE_BASE_URL` values were not observable with the credentials
  held (the old team's token exposes names only); everything above is derived
  from public wire artifacts (CSP, chunk inlining, envelope shapes).
- No merge. The branch does not self-merge; main stays untouched.
