# ADR-BOOK-0001: Interactive Rail over the Student-Book Spine — band law, rollout levers, licensing gate

| | |
|---|---|
| **Status** | ACCEPTED (operator directive 2026-10-21: "T-BOOK-001/002 — ADR + migration") |
| **Band** | `T-BOOK-xxx` (interactive books) |
| **Task** | T-BOOK-001 |
| **Date** | 2026-10-21 |
| **Basis** | PLAN-4CH1-v1.1 §10 ADR draft; T-BOOK-000 audit (trace 1a15bcd0c92adbb1); T-BOOK-015 doctrine pack (PR #236, merge 8596358) |
| **Supersedes** | the "ADR-0xx draft" placeholder in `docs/books/PLAN-4CH1-v1.1.md` §10 |

This ADR converts the plan's draft decisions into the books band's law of
record, and closes the two open verification items from T-BOOK-000 (V6 flag
mechanism, V8 ADR numbering).

## Decisions

### 1. Band identity: `T-BOOK-xxx`

Interactive-books work runs as its own feature band, `T-BOOK-xxx` — not
`T-MIG-139+`. Established by usage (T-BOOK-000 audit, T-BOOK-015 doctrine
pack, PR titles) and pinned here. Rationale: the migration band's numbering
is a different workstream with its own wave semantics; books outlives the
migration. Task yamls keep the standard claim protocol
(`docs/AGENT_COORDINATION.md`); nothing about the protocol changes.

### 2. ADR numbering: `ADR-BOOK-000x` for the books band

Three ADR namespaces now coexist by design:
- `ADR-0xx` (numeric, 013–036): the **master pack** (`SyllabAI/syllabai`) —
  referenced by code verbatim (ADR-013 license wall, ADR-021 prerender,
  ADR-029 hub-no-DB, ADR-030 tutor separation, ADR-031 decay). Never
  renumbered, never duplicated — cited as-is.
- `ADR-MIG-000x`: this repo's **migration band**.
- `ADR-BOOK-000x`: the **books band** (this file is 0001).

A books-band decision lands here when it changes the rail/pack/corpus law;
platform decisions that belong to the migration keep `ADR-MIG-000x`.

### 3. Rollout lever (closes V6): three enumerated levers, no flag framework

V6 finding stands: there is no central feature-flag infra in the repo, and we
deliberately do not build one. Rail rollout is governed by three levers that
already have repo precedent:

| Lever | Layer | Mechanism | Precedent |
|---|---|---|---|
| **L-content: book flip** | api | parent `book_chapters`/document `validation_state = VALIDATED` — absent book = honest-empty shelf | T-C20 no-state-leak; the operator's validation flip |
| **L-content: pack flip** | api | `book_blocks.validation_state = VALIDATED` per pack (same 4-state law, `packages/contracts/src/content.ts` `validationStateSchema` — REUSE-not-redeclare; no new lifecycle enum) | book_chapters ck (133a); 20% spot-check before flip (PLAN §6 S4) |
| **L-entry: course entry** | hub | committed per-course set in a hub registry lib decides whether a course's surfaces advertise the rail — one line per course as its packs land | `apps/hub/src/lib/books-registry.ts` `BOOKS_ARCHIVE_COURSES` (133k rollout law: "one line per course") |

**Cohort gating: deferred, not built.** Phase A's pilot cohort (~50 students,
the LICENSE-DATA posture) is the course-level entry set itself; per-class
targeting, if ever needed, follows the `teacher-assignments` class_id
pattern (existing service) — an explicit post-pilot surface (PLAN §4).
Rationale: all three levers are config/DB-state the operator already controls
with existing flip culture; a flag framework adds state without adding a
capability the pilot needs.

Serving law (restated for the query layer, T-BOOK-003/008 implement): the
rail serves a pack only when **parent book is VALIDATED AND the pack is
VALIDATED**; anything else renders the unchanged 133c viewer.

### 4. Licensing release gate + finding F-BOOK-0001

`syllabai-resources` `LICENSE-DATA.md` (sha `dd5d78ade261`, reviewed for this
ADR) covers: SME revision-note + exam-question corpora (operator attestation
2026-09-17, incl. redistribution inside SyllabAI surfaces), the CAIE
extension (2026-10-17), CIE syllabus PDFs (T-SPECS-CIE-1). **It does not yet
carry an amendment for the Pearson Student Book PDF** whose page-true hosting
went live with T-MIG-133 on the operator's in-session rights assertion
(2026-10-18 package intake, trace `1a14f8bf97b983f1`, "I have rights on
hosting" — recorded in the `contracts/books.ts` header).

Decision:
- **Release gate law:** no full-book launch (Phase C flip) until
  `LICENSE-DATA.md` carries a Student-Book amendment (operator follow-up).
  Pearson *examination* material stays ADR-013 license-wall regardless.
- Phase A pilot serving continues under the live T-MIG-133 posture at pilot
  scale, with the pack laws (book questions = page jumps only; no reflow;
  PhET-only embeds) unchanged.
- Gap filed as **F-BOOK-0001** in `books/4ch1/qa/findings.jsonl` (S2,
  kind: licensing, status: open, owner: operator) — the books
  self-improvement ledger's first entry.

### 5–11. The plan's seven draft decisions, ratified

Adopted verbatim in substance from `PLAN-4CH1-v1.1.md` §10, now ADR law:

5. **Rail, not rewrite.** The 133c/e/g/h viewer laws stand; reflow is
   post-pilot and needs its own trust story.
6. **Blocks bind to the spine.** `book_blocks.chapter_key` + composite FK to
   `book_chapters(document_id, doc_version, chapter_key)` via the existing
   `uq_book_chapters_identity` unique index — no-orphan-packs enforced in the
   database, not just lint. Spec refs must resolve within the chapter's join
   set (lint).
7. **Checks come from the bank.** `checkRefs` → bank ids; `attempts`
   discriminator per §12; book-printed questions are page jumps only.
8. **Persist coverage, compute mastery.** `chapter_progress` is the only new
   user-signal table; ADR-031 law intact.
9. **Simulations leapfrog.** `sim-embed` = PhET CC-BY 4.0 only (attribution
   in-card, sandboxed, fallback link); `media-embed` requires a licensing row.
10. **No generative text in packs.** Gates G1–G4 produce static reviewed
    content; KA-RAG (chapter-scoped, citation-mandatory) is the only
    generative surface.
11. **Licensing is a serving law.** VALIDATED-only serving (T-C20 symmetry);
    `LICENSE-DATA.md` compliance is a release gate (§4).

### 12. The attempts discriminator: app-level, no DDL (justified deviation)

PLAN §5 proposed an `attempts.surface` migration adding `'book_check'`.
Reality of record: the `attempts` table (Flyway-owned, line 213 of
`packages/db/src/schema/schema.ts`) has **no `surface` column** — the free
`varchar(40)` discriminator is **`attempts.provenance`**, and the frozen-core
law (AGENT_BRIEFING rule 6: no structural changes to Flyway-owned tables
while the Java core lives) forbids adding a CHECK to it.

Decision: the book-check attempts discriminator is **app-level**
`attempts.provenance = 'BOOK_CHECK'` (the column is a free varchar by
design; contracts export the constant — T-BOOK-002). **Zero DDL on
`attempts`.** Deviation filed as **F-BOOK-0002** (kind: process — the plan
named a column that does not exist; schema-first lesson: contracts read the
DB of record before naming migrations) and an errata note added to the
in-repo plan.

## Consequences

- T-BOOK-002 implements: `book_blocks` (+ composite FK, 4-state ck),
  `book_glossary_terms`, `chapter_progress`, zod `book.block/1` (11 types) —
  and **no attempts DDL**.
- The hub entry lever extends the 133k registry pattern (T-BOOK-003/040).
- The operator holds two flips (book, pack) and one registry line (entry);
  no new infrastructure.
- Findings F-BOOK-0001 (licensing amendment) and F-BOOK-0002 (plan drift)
  enter the ledger with this ADR's landing.

## What this ADR does not decide

Block payload field-level grammar beyond the envelope (evolves with
T-BOOK-004/005 through the versioned lint/contracts lane), renderer
structure (T-BOOK-003), and monetization/gating posture (open item, PLAN §9).
