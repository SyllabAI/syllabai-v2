# Interactive Books — START HERE (agent entry point)

> You are an agent (or human) asked to build, extend, or QA an **interactive
> book** in SyllabAI. Read this file completely, then the reading order in §3,
> before touching anything. This pack is **binding**: if you cannot follow it,
> stop and report instead of improvising (same doctrine as
> `docs/AGENT_COORDINATION.md`).
>
> Established 2026-10-21 · Task T-BOOK-015 · Basis: plan of record
> `docs/books/PLAN-4CH1-v1.1.md` (T-BOOK-000 audit, trace 1a15bcd0c92adbb1).

## 1. The thesis (memorize this)

> **An interactive book in SyllabAI is an interactive RAIL mounted beside an
> already-ingested, page-true Student Book spine that is itself joined to the
> spec graph, question bank, learner model, and tutor. We never build a
> parallel content body.**

Practical consequences: we do not reflow the book into HTML; we do not rewrite
the publisher's prose; we do not re-serve the book's own printed questions
interactively; we author a thin **rail pack** per chapter (~300–600 words +
widgets) that augments the mounted PDF pages.

## 2. Where the book lives — the three-layer storage model

A "book" exists in three places at once. Know which layer you are touching.

| Layer | Location | Mutability | What it holds |
|---|---|---|---|
| **L1 Corpus** | `SyllabAI/syllabai-resources` (separate repo, 5GB+) | **Append-only. Never hand-edit.** | The PDF of record, the parse of record (`parsed/*_chunks_v3.jsonl` class artifacts), OCR runbook, spec PDFs, `LICENSE-DATA.md`, census reports |
| **L2 Authoring** | this repo, `books/<qual-code>/` | Agent-writable **via PR only**, schema-validated | Rail packs (`packs/cNN-*/`), glossary YAML, per-book config (`meta/book.yaml`), findings ledger (`qa/`) |
| **L3 Runtime** | Neon Postgres | Machine-written **by ingest scripts only** — never hand-edit | `documents`/`document_chunks`/`book_chapters` (T-MIG-133) + `book_blocks`, `book_glossary_terms`, `chapter_progress` (T-BOOK-002) |

Laws that follow from the model:

1. **No binaries in this repo.** No PDF/PNG >1MB may enter `syllabai-v2`.
   Reference L1 paths + sha256 instead. The PDF the student reads is streamed
   from the resources archive as page-exact slices (133c law).
2. **L1 is provenance, L2 is product.** A pack block that cannot say which
   chapter (`chapter_key`) and which page anchor it belongs to does not exist.
3. **L3 has one writer.** Packs flow L2 → L3 through a pack-ingest script with
   a receipt. Hand-writing DB rows is an instant review rejection.
4. **Serving is gated.** Rail content serves only when the parent book is
   VALIDATED (T-C20 no-state-leak law) and the pack's own review state passes.
   Absent pack = honest-empty = the plain 133c viewer.

## 3. Reading order (do not skip)

| # | Doc | Why |
|---|---|---|
| 1 | This file | Storage model + hard laws |
| 2 | `docs/books/BOOK-BUILD-PLAYBOOK.md` | The pipeline you will execute (stages 0–4, gates G1–G4) |
| 3 | `docs/books/BOOK-PACK-SPEC.md` | The exact pack/glossary/block formats you must produce |
| 4 | `docs/books/BOOK-SELF-IMPROVEMENT.md` | How defects are recorded and how the pipeline itself must change (**mandatory, not optional**) |
| 5 | `docs/AGENT_COORDINATION.md` | Repo-wide agent law: claim protocol, file fences, receipts, worklog |
| 6 | `books/<qual>/README.md` + `books/<qual>/meta/book.yaml` | Subject-specific spine, allowlist, phase plan |
| 7 | `docs/books/PLAN-4CH1-v1.1.md` | The pilot blueprint (4CH1) — the worked example of all of the above |
| 8 | `packages/contracts/src/books.ts` | The zod grammar that is the schema law (REUSE, never redeclare) |

Competitive background (why the rail looks like this): `docs/books/research/KOGNITY-DOSSIER-2026-10-20.md`.

## 4. Hard laws (violation = PR rejected, no debate)

1. **Spine law.** Blocks bind to `chapter_key` on the existing `book_chapters`
   spine. There is no parallel lesson/chapter taxonomy, ever.
2. **Page-true law.** Never duplicate or paraphrase book prose. Blocks
   *reference* pages (`pdf_page_anchor`); they do not replace them.
3. **Bank law.** Check-yourself items come from the existing question bank via
   `checkRefs`. The book's own printed questions are page-jump links only,
   never re-served interactively (licensing posture, plan §4).
4. **Licensing law.** Packs serve only under a VALIDATED parent book. No
   reflow republication. Third-party embeds: PhET only (CC-BY 4.0, attribution
   in-card, sandboxed iframe). `LICENSE-DATA.md` compliance is a release gate.
5. **Frozen vocabulary.** 11 block types for the pilot (see PACK-SPEC). Adding
   a 12th type or changing a payload shape requires an ADR first.
6. **Schema law.** Every block validates against `book.block/1` zod
   (contracts). Never widen a schema to make a lint pass.
7. **Honest-empty law.** No filler content, no placeholder blocks, no fake
   data. A missing thing renders as absent, clearly.
8. **No generative text in packs.** Packs are static, gate-reviewed artifacts.
   The scoped KA-RAG tutor is the only generative surface, and it must cite.
9. **Receipts law.** Every pack ships with a machine receipt (JSON) covering
   stages, gates, prompt versions, and coverage stats. No receipts = didn't
   happen (repo-wide culture).
10. **Findings law.** Every defect at severity ≥ S2 found by you — in gates,
    spot-checks, or live — goes into `books/<qual>/qa/findings.jsonl` in the
    same PR that fixes it. A defect fixed only in content is a temporary fix;
    see SELF-IMPROVEMENT.

## 5. Definition of done — one rail pack PR

- [ ] `pack.yaml` + all blocks validate against `book.block/1` (CI lint green)
- [ ] G1–G4 gate receipts attached under `.syllabai/receipts/T-BOOK-xxx/`
- [ ] Every block: `chapter_key` resolves, `specRefs` ⊆ chapter join set,
      `checkRefs` resolve in the bank, `glossaryRefs` resolve, page anchors
      monotonic
- [ ] Subject-fact pass (G3) signed by an agent that did NOT author the pack
- [ ] Examiner-voice pass (G4) for callouts and check wording
- [ ] Pack receipt with coverage stats (spec points covered / chapter LO box)
- [ ] Findings ledger updated if anything ≥ S2 was found or fixed
- [ ] Worklog appended (`.syllabai/worklog.md`, append-only template)
- [ ] PR title starts with the task id, e.g. `T-BOOK-010: pack c05 …`

## 6. Claiming work

Books work runs in the `T-BOOK-xxx` band under the standard claim protocol
(`AGENT_COORDINATION.md` §2): claim the yaml in `.syllabai/tasks/`, branch
`t-book-xxx/<role>`, stay inside `scope.allowed`, receipts + worklog, PR —
never push `main`. The open queue and the phase plan live in
`books/<qual>/README.md` and `docs/books/PLAN-4CH1-v1.1.md` §8.
