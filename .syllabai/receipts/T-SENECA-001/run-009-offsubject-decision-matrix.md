# run-009 addendum — Tier-1 classification & operator decision matrix

*2026-10-25T19:45:00.344762+00:00 — criterion: normalized family subject vs slug subject (run-008 rule)*

- **VARIANT (benign): 1225 rows** — naming conventions only; NOT deletion candidates.
- **OFF-SUBJECT: 1662 rows across 13 (slug, family) groups / 11 slugs** — deletion candidates PENDING operator approval.

| slug | family | norm subject | rows |
|---|---|---|---|
| igcse-biology-19 | Chemistry: Cambridge International GCSE Supplement | Chemistry | 550 |
| igcse-biology-modular-24-unit-1 | Chemistry: Cambridge International GCSE Supplement | Chemistry | 550 |
| igcse-biology-modular-24-unit-2 | Chemistry: Cambridge International GCSE Supplement | Chemistry | 550 |
| cie-igcse-physics-23 | Chemistry: Cambridge International GCSE Supplement | Chemistry | 3 |
| cie-a-level-chemistry-25 | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 1 |
| cie-a-level-chemistry-25 | Biology: AQA A Level | Biology | 1 |
| cie-igcse-geography-20 | Biology: AQA A Level | Biology | 1 |
| cie-igcse-geography-25 | Biology: AQA A Level | Biology | 1 |
| cie-igcse-physics-23 | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 1 |
| igcse-geography-19 | Biology: AQA A Level | Biology | 1 |
| igcse-science-double-award-17-physics | Combined Science Chemistry: Edexcel GCSE Higher | Chemistry | 1 |
| igcse-science-double-award-modular-24-physics-unit-1 | Combined Science Chemistry: Edexcel GCSE Higher | Chemistry | 1 |
| igcse-science-double-award-modular-24-physics-unit-2 | Combined Science Chemistry: Edexcel GCSE Higher | Chemistry | 1 |

## Observations

- The dominant finding: 3 x 550-row blocks of `Chemistry: Cambridge International GCSE Supplement` paired into igcse-biology-19 and igcse-biology-modular-24-unit-1/2 — identical count suggests one systematic pairing bug, not random noise.
- The run-008 pattern (Biology: AQA A Level / Applied Science: BTEC singletons) recurs in cie-a-level-chemistry-25, cie-igcse-physics-23 and three geography slugs.
- Whether the 3 geography Biology rows and the chemistry-25 Biology row are the SAME resource id as each other (cross-served) is visible in run009_offsubject_ids.json.
- Combined-Science-Chemistry rows inside physics slugs (3 rows) are cross-science; included in OFF-SUBJECT per the subject-level rule — operator may downgrade to keep.
- Full id manifests: probe-results/run009_offsubject_ids.json (pair-scoped deletion targets only; resources themselves serve their own subject slugs and are never touched).