# run-011 addendum — Tier-1 corrected classification & decision matrix (262-slug rebuild)

*2026-10-26T12:21:45.063708+00:00 — criterion: run-008/010 subject-level rule with run-009 classifier lessons*

- **VARIANT (benign, reclassified): 1351 rows** — family subject is the slug subject under abbreviation/naming convention (headline fix: 'English Lit' inside english-lit-* slugs, 1,351 rows — sweep's raw flag was a classifier false positive). NOT deletion candidates.
- **SPEC-VARIANT (same subject, spec letter differs): 164 rows** — 'Religious Studies A' families inside religious-studies-b-* slugs. NOT family contamination; operator may prune for spec accuracy later; excluded from the deletion manifest.
- **OFF-SUBJECT (deletion candidates): 650 rows across 76 (slug, family) groups / 39 slugs.**

| slug | family | norm subject | rows |
|---|---|---|---|
| biology-edexcel-igcse | Chemistry: Cambridge International GCSE Supplement | Chemistry | 550 |
| chemistry-aqa-gcse-higher | Biology: AQA GCSE Foundation | Biology | 4 |
| physics-cambridge-international-gcse-supplement | Chemistry: Cambridge International GCSE Supplement | Chemistry | 3 |
| physics-edexcel-gcse-foundation | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 3 |
| physics-edexcel-gcse-higher | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 3 |
| physics-ocr-21st-century-b-gcse-foundation | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 3 |
| physics-ocr-21st-century-b-gcse-higher | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 3 |
| physics-ocr-gateway-a-gcse-foundation | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 3 |
| physics-ocr-gateway-a-gcse-higher | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 3 |
| physics-wjec-gcse-foundation | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 3 |
| physics-wjec-gcse-higher | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 3 |
| physics-aqa-a-level | Maths: AQA A Level Mechanics | Maths | 2 |
| physics-aqa-gcse-foundation | Maths: AQA A Level Mechanics | Maths | 2 |
| physics-aqa-gcse-higher | Maths: AQA A Level Mechanics | Maths | 2 |
| physics-aqa-gcse-higher | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 2 |
| chemistry-aqa-a-level | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 1 |
| chemistry-aqa-gcse-foundation | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 1 |
| chemistry-aqa-gcse-foundation | Biology: AQA GCSE Foundation | Biology | 1 |
| chemistry-aqa-gcse-higher | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 1 |
| chemistry-cambridge-international-a-level | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 1 |
| chemistry-cambridge-international-a-level | Biology: AQA A Level | Biology | 1 |
| chemistry-edexcel-gcse-foundation | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 1 |
| chemistry-edexcel-gcse-higher | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 1 |
| chemistry-ib-diploma-higher-level | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 1 |
| chemistry-ocr-21st-century-b-gcse-foundation | Biology: Edexcel GCSE Foundation | Biology | 1 |
| chemistry-ocr-21st-century-b-gcse-foundation | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 1 |
| chemistry-ocr-21st-century-b-gcse-higher | Biology: Edexcel GCSE Foundation | Biology | 1 |
| chemistry-ocr-21st-century-b-gcse-higher | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 1 |
| chemistry-ocr-a-a-level | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 1 |
| chemistry-ocr-gateway-a-gcse-foundation | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 1 |
| chemistry-ocr-gateway-a-gcse-foundation | Biology: Edexcel GCSE Foundation | Biology | 1 |
| chemistry-ocr-gateway-a-gcse-higher | Biology: Edexcel GCSE Foundation | Biology | 1 |
| chemistry-wjec-gcse-higher | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 1 |
| chemistry-wjec-gcse-higher | Biology: Edexcel GCSE Foundation | Biology | 1 |
| combined-science-physics-aqa-gcse-foundation | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| combined-science-physics-aqa-gcse-higher | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| combined-science-physics-edexcel-gcse-foundation | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| combined-science-physics-edexcel-gcse-higher | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| combined-science-physics-ocr-21st-century-b-gcse-foundation | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| combined-science-physics-ocr-21st-century-b-gcse-higher | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| combined-science-physics-ocr-gateway-a-gcse-foundation | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| design-and-technology-aqa-gcse | Chemistry: AQA GCSE Foundation | Chemistry | 1 |
| geography-cambridge-international-gcse-2027-exams | Biology: AQA A Level | Biology | 1 |
| geography-edexcel-a-gcse | Biology: AQA GCSE Foundation | Biology | 1 |
| geography-ocr-b-gcse | Biology: AQA GCSE Foundation | Biology | 1 |
| physics-aqa-gcse-foundation | Applied Science: BTEC Level 3 National Extended Diploma | Applied Science | 1 |
| physics-aqa-gcse-foundation | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| physics-aqa-gcse-foundation | Chemistry: OCR Gateway (A) GCSE Foundation | Chemistry | 1 |
| physics-aqa-gcse-higher | Chemistry: OCR Gateway (A) GCSE Foundation | Chemistry | 1 |
| physics-aqa-gcse-higher | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| physics-edexcel-gcse-foundation | Chemistry: AQA GCSE Foundation | Chemistry | 1 |
| physics-edexcel-gcse-foundation | Biology: WJEC GCSE Foundation | Biology | 1 |
| physics-edexcel-gcse-foundation | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| physics-edexcel-gcse-foundation | Chemistry: OCR Gateway (A) GCSE Foundation | Chemistry | 1 |
| physics-edexcel-gcse-higher | Chemistry: AQA GCSE Foundation | Chemistry | 1 |
| physics-edexcel-gcse-higher | Chemistry: OCR Gateway (A) GCSE Foundation | Chemistry | 1 |
| physics-edexcel-gcse-higher | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| physics-edexcel-gcse-higher | Biology: WJEC GCSE Foundation | Biology | 1 |
| physics-edexcel-igcse | Combined Science Chemistry: Edexcel GCSE Higher | Chemistry | 1 |
| physics-ocr-21st-century-b-gcse-foundation | Chemistry: OCR Gateway (A) GCSE Foundation | Chemistry | 1 |
| physics-ocr-21st-century-b-gcse-foundation | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| physics-ocr-21st-century-b-gcse-foundation | Biology: WJEC GCSE Foundation | Biology | 1 |
| physics-ocr-21st-century-b-gcse-higher | Chemistry: OCR Gateway (A) GCSE Foundation | Chemistry | 1 |
| physics-ocr-21st-century-b-gcse-higher | Biology: WJEC GCSE Foundation | Biology | 1 |
| physics-ocr-21st-century-b-gcse-higher | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| physics-ocr-gateway-a-gcse-foundation | Biology: WJEC GCSE Foundation | Biology | 1 |
| physics-ocr-gateway-a-gcse-foundation | Chemistry: OCR Gateway (A) GCSE Foundation | Chemistry | 1 |
| physics-ocr-gateway-a-gcse-foundation | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| physics-ocr-gateway-a-gcse-higher | Chemistry: OCR Gateway (A) GCSE Foundation | Chemistry | 1 |
| physics-ocr-gateway-a-gcse-higher | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| physics-ocr-gateway-a-gcse-higher | Biology: WJEC GCSE Foundation | Biology | 1 |
| physics-wjec-gcse-foundation | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| physics-wjec-gcse-foundation | Biology: WJEC GCSE Foundation | Biology | 1 |
| physics-wjec-gcse-higher | Biology: WJEC GCSE Foundation | Biology | 1 |
| physics-wjec-gcse-higher | Combined Science Chemistry: Edexcel GCSE Foundation | Chemistry | 1 |
| science-ks3 | Geography: AQA GCSE | Geography | 1 |

## Overlap with the run-010 purge list

- purged ids of record (run-009 manifest): 558
- biology-edexcel-igcse Chemistry-block ids: 550
- **overlap: 550** — same source rows run-010 purged from the lost import; rebuild re-derived the pairing from the corpus courseIds[] mapping

## Observations

- Headline finding is the run-009 headline's survivor: the 550-row `Chemistry: Cambridge International GCSE Supplement` block inside biology-edexcel-igcse (old import had it in igcse-biology-19 + both modular units). The clean rebuild mapped examQ via Seneca's own courseIds[], so this cross-attachment exists IN THE SOURCE DATA.
- The remaining ~100 off-subject rows are run-008-pattern singletons (Applied Science / Biology / Maths / Geography families inside chemistry/physics slugs, Chemistry inside physics slugs, Combined-Science-Chemistry inside combined-science-physics slugs).
- Cross-slug sharing is otherwise healthy: 22,073 multi-slug ids, only 16 with disjoint subject-set hosts (sweep A5).
- All 262 bundles render in the student Resource hub, so these rows are student-visible wrong-content — recommend a run-012 pair-scoped purge (same discipline as run-008/010) plus a mapping-side subject guard for future re-imports.
- Pair-scoped id manifest: probe-results/run011_offsubject_ids.json (resources also serve their own subject slugs and are never touched).