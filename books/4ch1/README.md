# books/4ch1 — Interactive Book workspace (Edexcel IGCSE Chemistry 4CH1)

> Authoring workspace (storage layer L2). The book itself (PDF + parse) lives
> in `SyllabAI/syllabai-resources` (L1); serving state lives in Neon (L3).
> Doctrine: `docs/books/BOOKS-START-HERE.md` — read before touching anything.

| What | Where |
|---|---|
| Book of record | `syllabai-resources`: `edexcel-international-gcse-9-1-chemistry-student-book-pdf-free.pdf` (54MB, 383pp) |
| Parse of record | `syllabai-resources`: `parsed/edexcel_igcse_chemistry_chunks_v3.jsonl` (1,234 Docling chunks, 17 content types) |
| Spec of record | 4CH1 Issue 3 (Sept 2024), 182 points / 4 sections / 29 sub-sections |
| Spine | `book_chapters` (T-MIG-133a), `chapter_key` `u<unit>:c<NN>`, 29 chapters ≈ spec sub-sections 1:1 |
| Hub course | `igcse-chemistry-19` (manifest, spine JSON, canonicalKG all in `apps/hub/content|public/kg`) |
| Plan of record | `docs/books/PLAN-4CH1-v1.1.md` |
| Lint pack | `chem@<semver>` (banned phrases, state-symbol residues, command-word lexicon) |

## Pack status (29 chapter packs + 4 unit Strength Checks)

| Phase | Packs | State |
|---|---|---|
| A (MVS) | c01–c10 (+ strength-u1) | published — S4 flips of record (T-BOOK-010 golive-r0 demo gate c01–c05, then the c06–c10 wave) |
| B | c11–c21 (+ strength-u2) | published — S4 flips of record (T-BOOK-011/012 waves) |
| C | c22–c29 (+ strength-u3/u4) | published — S4 flips of record (u1+u2+u3 131 VALIDATED, then the T-BOOK-020 u4 fire: 46/46, full book) |
| Strength Checks | strength-u1..u4 | armed — T-BOOK-069: ADR-BOOK-0004 (PROPOSED) + the density-audit vehicle; blocks await the bank-density gate + pooler credential re-hand |
| Media embeds | c01 + c02–c29 widen | c01 b08 pilot (T-BOOK-066) + 27/28 widened 2026-11-02 (T-BOOK-070; c17 honest-empty — no provider video); 205 blocks lint-green; L3 serve after the S4 flip |

Estate census of record 2026-11-01: 29/29 packs published, 178/178 blocks VALIDATED
(book_blocks), glossary 112/112 VALIDATED and serving.

Chemistry-only chapters (Paper-2 route): c09, c10, c15, c21*, c26, c27, c28
(*c21 flagged C in spec 3.19C+). Route flags live per-pack in `pack.yaml`.

## Work queue

Claim via `.syllabai/tasks/T-BOOK-xxx.yaml` (standard protocol,
`docs/AGENT_COORDINATION.md`). Task batch of record: PLAN-4CH1 §8
(T-BOOK-001..040; 000 done, 015 = this doctrine pack).

## Quality ledger

- Findings: `qa/findings.jsonl` (append-only; law: `docs/books/BOOK-SELF-IMPROVEMENT.md`)
- Metrics: `qa/metrics.json` (regenerated per phase by `book-publisher`)
- Retros: `docs/books/retro/` (per phase, mandatory)
