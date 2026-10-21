# New Subject Checklist — onboarding interactive book #2, #3, …

> The repeatable path from "we picked a qualification" to "Phase A packs
> shipping". 4CH1 (chemistry) is the worked example; this checklist is what
> makes the second book cheaper than the first. Prereq reading:
> `BOOKS-START-HERE.md`. Tick items into the book's own README as you go.

## Phase 0 — Decision inputs (operator)

- [ ] Qualification + exam board + spec issue pinned (e.g. `4PH1`, Edexcel, Issue 3)
- [ ] Hosting-rights posture for the Student Book PDF confirmed and recorded
      in `syllabai-resources` `LICENSE-DATA.md` **before any derived work**
- [ ] Course slug reserved in hub (`apps/hub/content/<course-slug>/`)

## Phase 1 — Corpus intake (L1: `SyllabAI/syllabai-resources`, append-only)

- [ ] Create `books/<qual>/` tree in syllabai-resources: PDF of record +
      companion PDFs, with sha256s in a manifest
- [ ] Parse run per `BOOK_OCR_RUNBOOK.md` pattern → `*_chunks_v3.jsonl`-class
      parse of record + `parse_report.json` + census (17 content types)
- [ ] OCR residual damage list captured (lint-owned, never hand-fixed)
- [ ] Spec PDF of record + parse (`syllabai-parser` extractors) → spec-point
      inventory with paper-route flags (multi-paper quals: which points are
      paper-2-only?)
- [ ] `LICENSE-DATA.md` rows complete (book, spec, any embed sources)

## Phase 2 — Spine & joins (L3)

- [ ] Course bundle + `canonicalKG.<board>-<subject>-<qual>.json` +
      `spines/<course-slug>.json` land in this repo (`apps/hub/content/…`,
      `public/kg/data/…`)
- [ ] Books ingestion run → `book_chapters` (spine, page ranges, LO text,
      spec joins); weak joins land as REVIEW_REQUIRED — triaged, never silent
- [ ] Spine QC: chapter census maps 1:1 onto spec sub-sections; orphans are
      findings (`kind: spine`, S2)

## Phase 3 — Authoring workspace (L2, this repo)

- [ ] `books/<qual>/` scaffolded: README charter + `meta/book.yaml` (copy the
      4ch1 shape; set `block_allowlist` — subject-specific payload needs are
      an ADR question, raised here, not after drafting starts)
- [ ] Subject lint pack registered (`lint_pack: <subject>@0.1.0`): banned
      phrases, notation/Unicode residues, command-word lexicon source
- [ ] `qa/findings.jsonl` created (empty is fine)
- [ ] glossary seeded from the book's glossary chunks (S1 will add accept/avoid)

## Phase 4 — Pilot unit through the pipeline

- [ ] Pick the pilot unit (same criteria as 4CH1: mark-leak density, route
      flags, bank coverage)
- [ ] Run packs S0–S4 per `BOOK-BUILD-PLAYBOOK.md`; receipts per pack;
      findings ledger live from day one
- [ ] Bank-density SQL audit before check wiring (T-BOOK-020 pattern)
- [ ] 20% human spot-check; flip per chapter

## Phase 5 — Platform & launch

- [ ] Platform deltas filed (usually none — the rail is subject-agnostic;
      widgets carry subject payloads via lint packs)
- [ ] Cohort gating + instrumentation (T-BOOK-040 pattern)
- [ ] Phase retro written; playbook/lint/prompt PRs landed before Phase B

## Notes from the 4CH1 pilot (read before Phase 1)

- **Reuse the spine, don't re-derive it.** The T-MIG-133 wire
  (contracts → ingestion → `book_chapters` → VALIDATED shelf → page-exact
  slices → tutor citation targets) is subject-agnostic; a new book is mostly
  data, not code.
- **Candidate #2 on file: 4PH1 (Edexcel IGCSE Physics).** wph11 QP/MS already
  flow through the parser corpus and pastpapers index; the physics Student
  Book intake is the missing piece. Double-award variants (4SD0 class) are a
  chapter-filter on the same spine, not a new build.
- **The first book pays the doctrine tax; the second collects the dividend.**
  If you find yourself redoing something 4CH1-specific by hand, that's a
  finding (`kind: process`) — the checklist above should have absorbed it.
