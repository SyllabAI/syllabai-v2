# ADR040-G4-CIE9609-BIRTH — lane state (2026-10-28)

G-4 mirror: birthing CIE 9609 LEVELS schemes from the G-3 corpus of record.

## Of-record status

- Corpus of record: 105 papers (48 held = pastpapers main; 48 held qp.pdf =
  PR #6 branch `t-sm-rollout/cie-wave1-qppair-r0` @ dd8a21b4; 57 extension =
  PR #8 branch `t-sm-rollout/g3-cie9609-corpus-r0` @ 983a97b8). All bytes
  sha256-verified against the manifests of record (0 mismatches).
- Verbatim drafts of record REGENERATED with the committed parser
  (`adr040-g3-cie9609-corpus-r0.parse.py`, fitz 1.26.7) after the sandbox
  rollback destroyed the lane originals: aggregates reconcile EXACTLY vs the
  of-record summary — 105 papers / 295 entries / 2895 band rows (93
  single-axis + 2802 multi-axis per-axis cells) / 72 band-bearing / grammar
  histogram {C-AO-matrix 212, C1-two-axis 41, E-unlabeled 18, C-multi-axis 12,
  D-prose 12}. The 105 ms.draft.json land in this PR under
  glm-ms-drafts/9609/ (replacing the 48 stale detection-grade files).
- Review tranche: 16 papers reviewRequired (15 parse-error papers of this run
  incl. 9609-M26-QP-22 / 9609-S26-QP-22, plus 9609-W20-QP-33 whose of-record
  flag is carried conservatively though the rerun parsed clean).

## Rulings executed (of record)

1. Ruling A part-binding (PR #388 law) — ONE LEVELS scheme per printed grid,
   part-granular binding, fail-closed.
2. Multi-axis consumption (9609 G-3 receipt F2): per-axis cells stay VERBATIM;
   the single-axis tiling law does not apply. mark_bands holds ONE range per
   level (uq_mark_band_level, no axis dimension) — multi-axis grids (C1 41 +
   C-AO-matrix 212 + C-multi-axis 12 = 265 entries) are therefore HELD from
   the birth with per-entry disclosure, pending the per-axis schema lane.
3. F-form level-less grids: excluded (ruling of 2026-10-28); none exist in
   the corpus parse (levelLabel census: all rows labeled 0..3 + 1a/1b/2a/2b).
4. Verbatim law, fail-closed oracles, seeded-subject FIND path (9609 seeded,
   G-2), printed-session identity, SUGGESTED-only birth, no row flips.

## Birth tranche (built, oracle-green, PROD-BLOCKED)

6 papers (the only CLEAN papers carrying single-axis grids):

- 9609-W21-QP-11/12/13 — D-prose essays: 5(a)[8] 5(b)[12] 7(a)[8] 7(b)[12],
  4 bands each (16/paper)
- 9609-S22-QP-11/12/13 — E-unlabeled: 1(a)[2] 1(b)[3] 2(a)[2] 2(b)[3]
  4(a)[2] 4(b)[3] (15/paper)

TOTAL: 30 LEVELS schemes / 93 verbatim band rows / 6 papers; QP parse
(textlayer-qp-adr040-g4-cie9609-r0) green: sequential questions, all parts
marked, Section A == 20, essays == 20 each, cover total 40 == 20 + one
required 20-mark essay (choice structure disclosed, 80 offered marks carried
verbatim). Ruling-A oracle green: every grid binds its QP part with the SAME
printed marks; ordinals 1..n; bottom 0-or-1; top == grid marks.

## BLOCKED: prod Neon quota

`ERROR: Your account or project has exceeded the quota. Upgrade your plan to
increase limits.` — data plane (ep-ancient-cake-a52e4kfd-pooler) refuses all
connections; control plane (api.neon.tech) unreachable from the sandbox
network. Census, birth, tripwires all blocked. Read-only census baseline
could not be taken.

## Resume procedure (one command per step)

```bash
# 0) creds of record under /home/z/my-project/.creds (github/vercel/neon/db)
# 1) corpus materialize + sha256 verify (idempotent)
python3 scripts/g4m_materialize.py
# 2) regenerate the 105 verbatim drafts of record (committed parser)
python3 repo/.syllabai/receipts/T-SM-ROLLOUT/adr040-g3-cie9609-corpus-r0.parse.py
python3 scripts/g4m_drafts.py            # writes + reconciles vs of-record summary
# 3) QP grammar + pair builder (oracle fail-closed)
python3 scripts/g4m_qp.py && python3 scripts/g4m_pairs.py
# 4) pilot (dry run = full transaction, rolled back)
DATABASE_URL='...' bun apps/api/g4m-birth.ts /home/z/my-project/g3-9609/pairs \
  --only 9609-W21-QP-11 --dry-run
# 5) birth (one transaction per pair, fail-closed stop)
DATABASE_URL='...' bun apps/api/g4m-birth.ts /home/z/my-project/g3-9609/pairs
# 6) post-birth tripwires vs prod_census_before.json + receipt
#    adr040-g4-cie9609-levels-birth-r0 + #276 comment + worklog
```

The birth runner `apps/api/g4m-birth.ts` is UNTRACKED lane tooling (r1
pattern — disclosed, never committed, no credentials). Pair JSONs carry the
full canonical docs; sha256 identity makes every rerun idempotent
(DUPLICATE-safe).
