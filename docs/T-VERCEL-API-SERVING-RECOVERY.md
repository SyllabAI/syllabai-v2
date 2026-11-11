# T-VERCEL-API-SERVING-RECOVERY — how the API serves on Vercel, and why the bake emptied it

**Run:** 2026-11-11, T-VERCEL-API-STAGE run-001 (trace 1a1c92dc3d126229), read-only
archaeology on the old Vercel account (team `syllab-ai`,
`team_ULL54qkhzKBmnKrpO6BD4mYX`, user `syllabai-1403`, plan hobby, usage-blocked).
No secret values were read, printed, or stored; no production writes were
performed by the archaeology run.

---

## 0. The one-line answer

**The `syllabai-v2` project has no Vercel build settings to copy — it never
had any.** Both the old and new accounts carry `framework: null,
buildCommand: null, outputDirectory: null, rootDirectory: null`. Serving
worked because the deployable was a **prebuilt stage**: a directory containing
`vercel.json` (rewrites only) + `api/index.js` (one esbuild-bundled Node
lambda) + the packaged snapshot resources, deployed via `vercel deploy --prod`.
The 2026-11-10 empty-bake incident happened because run-2 uploaded the
**monorepo root** — no `vercel.json`, no `api/` — producing a deployment with
zero routes; api.syllab-ai.com served Vercel's NOT_FOUND on every path for
~19 hours.

## 1. The recipe of record (now committed)

| Piece | Home | What it is |
| --- | --- | --- |
| Lambda adapter | `apps/api/src/vercel.ts` | default-exported Node `(req, res)` handler — the recovered bundle's tail shape verbatim: convert to Web `Request`, call `app.fetch`, stream the `Response` back |
| Node shims | `apps/api/src/vercel-shims.ts` | esbuild `--inject` module: `Bun.CryptoHasher` → `node:crypto`, `Bun.YAML.parse` → `js-yaml` (the source grew Bun-isms AFTER the Nov-4 build — `nba-concept-graph.ts`, `teacher/snapshot.ts` — which crash a Node lambda at boot) |
| Rewrite config | `scripts/api-stage/vercel.json` | byte-verbatim from the serving deployment: `/api/v1/(.*)` and `/actuator/health` → `/api/index` |
| Stage builder | `scripts/api-stage/build.sh` | assembles the stage: esbundle (`--define:import.meta.dir=__dirname`, `--inject` shims), packages the concept-graph yamls INSIDE the lambda, refuses undersized bundles |
| Boot gate | `scripts/api-stage/localgate-server.cjs` | boots the staged bundle on loopback and self-probes `/actuator/health` — GATE GREEN or no deploy |
| The floor | `.github/workflows/t-vercel-api-bake.yml` | build → gate → deploy FROM THE STAGE → post-deploy LIVE serving proof (any `NOT_FOUND` shape = job red) |

`import.meta.dir` note: the SHA-256-pinned snapshot loader
(`nba-concept-graph.ts:196`) readFileSync's from `import.meta.dir` — a Bun
global. The lambda defines it to `__dirname` and the yamls ship inside the
lambda at `api/concept-graph/`; the pins make parser drift fail-closed.

## 2. Evidence trail

| Deployment | Created (UTC) | Notes |
| --- | --- | --- |
| `dpl_7Q3CRpcTWavgD6VMbXvSrpshCVKV` | 2026-11-04T20:35:23Z | ORIGINAL — source of the recovered artifacts (`src/vercel.json` 185 B, `src/api/index.js` 3,798,281 B, `src/localgate-server.cjs` 226 B) |
| `dpl_3N7w1Tdra9sosMzTmCft5iX8jUcY` | 2026-11-04T20:43:19Z | redeploy of the original |
| `dpl_Fbf39dka8vHq3Ztusk94Ux6EeBw1` | 2026-11-05T05:56:18Z | last old-account build (redeploy) |

All `READY`, all no-commit-SHA (prebuilt CLI uploads; `type: LAMBDAS`,
`meta.lambdaRuntimeStats = {"nodejs":1}`). The old project's only domain was
`syllabai-v2.vercel.app`; **`api.syllab-ai.com` was never on the old account**
— it belongs to the new account's project (`prj_vf1MQaCuuGHd83HaTA3uqDxETpb5`,
team `syllabainoreply-4440`). The old lane today answers
`402 DEPLOYMENT_DISABLED` (usage-blocked account) — no stopgap exists there.

## 3. Runtime env vars (names of record, 16)

From the old project. `plain` values are readable via the API by an authorized
token; `encrypted` values are NOT readable and must be re-entered/rotated by
the owner. No values were read during this run.

| Name | Type |
| --- | --- |
| `DATABASE_URL` | encrypted — must be present (Neon) |
| `SYLLABAI_JWT_SECRET` | encrypted — must be present (boot fail-fast law) |
| `SYLLABAI_JWT_TTL` | plain |
| `SYLLABAI_CORS_ORIGINS` | plain |
| `CRON_SECRET` | encrypted |
| `SYLLABAI_TEACHER_JOIN_CODE` | encrypted |
| `SYLLABAI_WAREHOUSE_SERVING` | plain |
| `SYLLABAI_WAREHOUSE_URL_SCI_CHEM` | encrypted |
| `SYLLABAI_WAREHOUSE_URL_MATHS_4MA1` | encrypted |
| `SYLLABAI_CONCEPT_GRAPH_DIR` | plain |
| `SYLLABAI_LLM_OPENROUTER_API_KEY` | plain |
| `SYLLABAI_LLM_OPENROUTER_MODEL` | plain |
| `SYLLABAI_LLM_GEMINI_API_KEY` | plain |
| `SYLLABAI_LLM_GROQ_API_KEY` | plain |
| `SYLLABAI_LLM_GROQ_MODEL` | plain |
| `SYLLABAI_EMBEDDING_GEMINI_API_KEY` | plain |

## 4. Validation of the rebuilt recipe (2026-11-11, first-hand)

`bun install --frozen-lockfile --filter=@syllabai/api` on main `a04c0d4`;
esbuild bundle 4,030,336 B (serving lane's class: ~3.8 MB); `node --check`
clean; localgate **GATE GREEN** (boot + `/actuator/health` →
`{"groups":["liveness","readiness"],"status":"UP"}`); held-server probes
**byte-shape parity with the live surface**: `POST /api/v1/auth/login {}` →
`400 {"status":400,"error":"validation_failed","message":"password: must not
be blank"}` (identical wording to the live surface's 05:58Z answer),
`GET /api/v1/courses` anonymous → 401, unknown `/api/v1/*` anonymous → 401
(the anyRequest().authenticated() parity law holds inside the bundle).

## 5. Discrepancy the operator should rule on

The incident header (t-vercel-api-rollback) called the Java core the "real
serving code" (`SyllabAI/syllabai-core`, Spring error shapes). The
archaeology shows this **bun API** was also a serving generation on Vercel,
and the live surface's error shapes after the 06:0xZ restore match this port
byte-for-byte (`validation_failed` wording, actuator shape). The recipe
serves the port; path parity with the frozen core is the port's contract.
If the operator intends the Java core as the engine of record, this recipe is
the wrong floor and should be retired — deliberately, not by drift.

## 6. Known limits of the lambda lane (flagged, not fixed)

- `services/drill/bank.ts:130` resolves hub content via a repo-layout
  relative path (`../../../../hub/content`) — meaningless inside a lambda
  (no hub bytes deployed). Drill-bank routes will need that path parametrized
  before they are served from the lane. Boot and all probed routes are
  unaffected.
- `SYLLABAI_CONCEPT_GRAPH_DIR` (project env) is read by request paths in
  teacher-snapshot contexts; the packaged snapshots under `api/concept-graph/`
  cover the boot-eager loader only. Request-time env semantics are the
  operator's env-set decision, unchanged by this recipe.
