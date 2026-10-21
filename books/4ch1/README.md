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
| A (MVS) | c01–c10 (+ strength-u1) | planned — platform lanes T-BOOK-002..009, content T-BOOK-010; first demo gate c01–c05 |
| B | c11–c21 (+ strength-u2) | planned — T-BOOK-011, sim-embeds ×2–3 |
| C | c22–c29 (+ strength-u3/u4) | planned — T-BOOK-013, past-paper deep links on flip |

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
