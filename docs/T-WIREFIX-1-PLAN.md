# T-WIREFIX-1 — the missing prod migrations (0017/0018/0019/0027) and the 500 wall on the live wire

Plan of record. Status: OPEN. Branch: `t-wirefix-1/run-001`.

## 1. The observation (the live wire, wire-probed 2026-11-06)

The syllab-ai.com frontend (the hub of record) is up, but its Past Papers
page and dashboard fire a wall of failing API calls at the production API
(`https://syllabai-v2-six.vercel.app` — the host the site's own CSP pins and
the browser actually calls):

| probe (demo student HNA 269a) | wire result |
| --- | --- |
| `GET /api/v1/paper-marks?documentRefType=paper_asset&documentRefId=<uuid>` | **500 ×90** — one per paper asset, on every Past Papers page load |
| `GET /api/v1/learners/me/progress?course=igcse-chemistry-19` | **500** (401 pre-auth; 500 with the session token) |
| `GET /api/v1/learners/me/plan-projection?course=igcse-chemistry-19` | **500** |
| `GET /api/v1/learner/pdf-drawings?documentRefType=paper_asset&documentRefId=<uuid>` | **500** |
| `GET /api/v1/paper-assets/<uuid>/regions` | 200 today — but only because the rects query sits behind the per-paper extraction flag; any extracted paper would 500 (latent) |

The 500 envelope is the shared `{"status":500,"error":"internal_error"}`
shape — a server-side crash, not a client contract problem. The frontend
itself degrades gracefully (the page renders), so the user-visible symptom
is the missing per-paper mark badges / progress, plus 90 doomed requests
per page view.

## 2. Root cause (read-only prod census, 2026-11-06)

`information_schema` census of the production Neon (ep-ancient-cake, the
95-table v2 prod plane — live attempts land there hourly) against the
committed migration files:

| migration | objects | prod state |
| --- | --- | --- |
| 0017 `mark-point-rects.sql` | `mark_point_rects` | **MISSING** |
| 0018 `mark-awards.sql` | `mark_awards`, `mark_working_blocks` | **MISSING** |
| 0019 `learner-pdf-drawings.sql` | `learner_pdf_drawings` | **MISSING** |
| 0027 `mark-award-delta.sql` | `mark_awards.attempt_class` + `cache_hash` + CHECK | **MISSING** (blocked by 0018) |

The v2 db regime applies migrations per-lane as RAW SQL (the 0007
disclosure law — no drizzle bookkeeping table exists, each lane carries its
own db-apply workflow). The lane workflows that DID run: 0005, 0006+0008,
0009, 0010, 0011, 0012, 0013+0014, 0015+0016, 0020+0021, 0022+0023+0026
(the tier1 lane, 2026-11-05), 0025, 0028. **No lane ever applied
0017/0018/0019/0027 to prod.** Every shipped-but-unapplied migration whose
tables the deployed API queries is a live 500 — the tier1 lane is the same
failure class one migration window earlier ("the schema behind the DEPLOYED
… hub sync hooks, live-probed 500 on production 2026-11-05").

Endpoint → missing object map:

- `GET /paper-marks` (routes/paper-awards → services/paper-awards.ledger)
  queries `mark_awards` ⨝ `mark_working_blocks` → 500
- `GET /learners/me/progress` + `/plan-projection`
  (services/learner/progress-rollup) join `mark_awards` → 500
- `GET /learner/pdf-drawings` (services/learner-pdf-drawings) queries
  `learner_pdf_drawings` → 500
- `GET /paper-assets/:id/regions` (services/paper-regions) reads
  `mark_point_rects` behind the extraction flag → latent 500
- the crop-mark pipeline + `POST /paper-marks/regions/:regionId/awards`
  (services/paper-marking) write `mark_awards`/`mark_working_blocks`/
  `learner_pdf_drawings`/`mark_point_rects` → dead on arrival

## 3. The fix (this lane)

Apply the four files to prod under the tier1 guard protocol verbatim:

1. job 1 (cow-apply): disposable Neon COW branch off production, branch-local
   owner password reset (production roles never touched), frozen driver
   `scripts/t-wirefix-apply-0017-0018-0019-0027.ts` applies the four files
   as RAW SQL (one transaction PER FILE, lock_timeout=5s,
   statement_timeout=60s, idempotent preflight per file, fail-closed on any
   partial state), post-verifies the full per-table invariant census and
   proves the app role's four DML verbs via `has_table_privilege` (the
   non-impersonating proof), then DROPs the COW + 404-verifies even on
   failure.
2. job 2 (prod-apply, needs job 1 green, `mode=cow+prod` default): the same
   frozen driver against `SIB_PROD_DATABASE_URL`, then the LIVE WIRE PROOF:
   mint the demo student token through the production demo contract and
   re-probe the four endpoints that were live-probed 500 (all must be 200;
   a 500 after a green DDL apply = honest red).

Driver specifics beyond the tier1 verbatim shape:

- 0027 is ALTER-only: its per-file decision probes the two added COLUMNS
  (both present → already_applied; both absent → apply; exactly one →
  fail-closed partial). The CREATE files decide on table presence as tier1
  does.
- `mark_awards` post-verify census is the POST-0027 shape (18 columns, 5
  CHECKs); the multi-FK generalization asserts
  `mark_awards_mark_point_id_fkey` is deliberately **NO ACTION** (the 0018
  ledger-preserving law — award rows outlive mark-scheme edits) while the
  other three FKs are `ON DELETE cascade`.
- grants: the F5-S7 law — SELECT/INSERT/UPDATE/DELETE on all four tables to
  the app role `syllabai_v2_app_w2r2`, idempotent re-grant.

Driver validation (run-001 receipts, 2026-11-06):

- REAL-DB fail-closed preflight: the driver run against the sparse second
  Neon env (no `public.users`) refuses with the preflight diagnostic, zero
  DDL, honest-red receipt. (Real PostgreSQL 18 target.)
- Stub harness (5 worlds, 17 checks, all green): fresh apply (statement
  counts 11/12/3/3, invariants + privilege proof green), already-applied
  no-op (zero DDL), partial-table fail-closed, partial-0027-column
  fail-closed, ownership-gate fail-closed.

## 4. What this lane deliberately does NOT do

- No hub code change: the Past Papers page already degrades gracefully
  (renders without the mark badges). The 90-request fan-out is ugly but
  turns healthy the moment the tables exist; batching it is a separate
  hub lane if the operator wants it.
- No touch to the `branches: ain]` literals in ci.yml / census-guard.yml —
  documented T-MIG-076 lore, deliberately kept by the operator.
- No backfill: all four objects are empty on apply (additive law); the
  first award row lands when a learner marks a region.

## 5. Risks

- The four files are the committed, frozen migration files (sha256 recorded
  in the receipt) — the same bytes CI has been testing against all along;
  the apply is a pure additive DDL (no existing table is altered by
  0017/0018/0019; 0027 adds two nullable columns + one CHECK).
- The prod leg takes `lock_timeout=5s`: a long-held lock on `mark_awards`
  is impossible (the table does not exist); on `users`/`mark_points` the
  FK add takes a brief ACCESS EXCLUSIVE on the NEW table only — the ALTERs
  in 0027 target `mark_awards` (also new). No pre-existing table is locked
  by this lane except the瞬时 FK validation reads on `users`/`mark_points`.
- Idempotent: a re-run against a partially-relaxed prod is an honest
  no-op per file or fails closed naming the split — never guesses.
