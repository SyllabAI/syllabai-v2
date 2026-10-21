# SyllabAI — Interactive Books: Feature Plan & 4CH1 Pilot Blueprint

**Version:** v1.1 (post-audit revision) · **Trace:** 1a15bcd0c92adbb1 · **Date:** 2026-10-21 (Asia/Dhaka)
**Status:** supersedes v1.0 (trace 1a15b764e85feee9). v1.0 was written on prior-session context with repo access blocked; v1.1 incorporates a **live PAT repo audit** (T-BOOK-000 executed) plus fresh Kognity feature research.

**Changelog v1.0 → v1.1 (what the audit changed):**
1. The repo audit found **T-MIG-133 already built the Student Books wire end-to-end** (contracts → ingestion → `book_chapters` → VALIDATED-gated shelf → page-exact PDF slices → hub viewer → tutor citation targets). The pilot is therefore an **interactive layer over the existing book spine**, not a from-scratch authored book — the v1.0 "30 authored lessons" is replaced by "29 chapter rail packs bound to the spine".
2. The **4CH1 asset base is confirmed and rich**: parse of record `chunks_v3` (1,234 Docling chunks, 17 content types, 29 chapters ≈ spec sub-sections 1:1), both student-book PDFs hosted, spec PDF hosted, `canonicalKG.edexcel-chemistry-4ch1.json`, full `igcse-chemistry-19` course bundle, past papers `1C/1CR/2C/2CR` in the index, SME/PMT corpus trees.
3. Kognity feature check answered: **their science books carry videos/animations/3D models/interactive glossary/practical-text — no true simulations** (IB Chem assignment bank: 1,300+ Qs). This makes our widget layer + PhET embeds a leapfrog, not parity work.
4. All v1.0 `[VERIFY]` items (V1–V10) are resolved; the task batch is rewritten around the found infrastructure.

---

## 1. Mission & Strategic Frame

**Task:** add Interactive Textbooks as a first-class SyllabAI feature; pilot = **Pearson Edexcel International GCSE Chemistry (4CH1)**, whose Student Book is already ingested, spec-joined, and served chapter-by-chapter.

**Thesis (validated by the audit):**

> **An interactive book in SyllabAI is the interactive layer over the spec graph, question bank, learner model, and tutor — and, as of T-MIG-133, over an already-ingested licensed Student Book spine. We never build a parallel content body.**

The Kognity frame stands: their moat is institutional (endorsement, IB co-publishing, LMS distribution, compliance); their product gaps (no past papers, exact-answer marking, heatmap analytics, no learner model, no student-facing AI, **no simulations**) map onto our four layers. The 4CH1 book spine gives us a fourth asset they can't copy cheaply: the real Pearson student book, page-true, chapter-joined to the spec, with the operator's hosting-rights assertion of record (2026-10-18 package intake).

**Why 4CH1 remains the right pilot:** spec content stable since 2019 (Issue 3, Sept 2024, administrative-only amendments); the book's 29 chapters map 1:1 onto the spec's 29 sub-sections; the P2/"chemistry only" chapters (metallic bonding, electrolysis, extraction, alcohols, carboxylic acids, esters) give us a built-in Paper-2-route axis; and the known mark-leak areas (mole calculations, half-equations, titration procedure, examiner vocabulary) are exactly where interactive blocks and mark-scheme callouts pay off.

## 2. What We Have — Verified Inventory (T-BOOK-000, this session)

### 2.1 Platform (syllabai-v2 @ main, audited today)

| Asset | Verified detail |
|---|---|
| Monorepo | `apps/api` (Bun service: ~40 service families) + `apps/hub` (Next.js 16, shadcn/ui kit, KaTeX pipeline, Playwright e2e, golden-master harness) + `packages/{contracts,shared,db}` (zod v3 contracts, drizzle + Neon, migrations `0000–0004` incl. `spec_point_constraint`) |
| **Books wire (T-MIG-133, bands a–h)** | `contracts/books.ts`: `bookChunkSchema` (passthrough package grammar; 17 content types censused), `specCodeRefSchema` `{spineCode, officialCode, officialId, tier, score, lineage, method}`, `book-toc-v1` canonical (dual page numberings), `bookChapterSchema` (serving; chapterKey `u<unit>:c<chapter>` generalises to `:s<section>` **without migration**), `bookShelfEntrySchema` (VALIDATED-only, T-C20 no-state-leak), `bookArchiveRefSchema` (corpus-pdf path), `bookCitationTargetSchema` (133d tutor deep-link, F-022 nearest-chapter law) |
| DB | `documents.kind` enum already carries `TEXTBOOK`; chunks ride `document_chunks` (pgvector 768 + tsvector + doc_version); **`book_chapters` table** (133a): course FK, dual page ranges, LO text, **spec joins**, `validation_state` ck, unique identity index |
| Ingestion | `services/ingestion/books/` (canonical-doc, toc, bundle-spine, spine-join) + `scripts/books-ingest*.ts`; spec-join law: the book prints no spec codes — LO box texts are verbatim-class matches of spine `official_wording`; weak/absent joins → REVIEW_REQUIRED, never silent |
| Hub viewer | `/courses/[course]/books/[docId]` (133c/e/g/h laws): **page-exact PDF slice mounts** (not the ~54MB whole book), `?chapter=u1:c1` and `?page=N` citation drill-in, unit exam-practice slices, practice affordances deliberately de-advertised (133h), honest 404 for unvalidated |
| Tutor | KA-RAG hybrid (vector-arm + KG-arm + RRF, spec-boost, subject profiles) with a **book-arm** (`test/tutor/book-arm.test.ts`) and page-true citation targets; stem hygiene, leakage policy |
| Learner model | `services/learner-model` (decay, struggle-inference, model-update, registry, exam-target-reader), `nightly-decay` cron, NBA (`learner-me/nba`), concept graph YAMLs incl. **`practicals.yaml`**; flashcards per ADR-031 (decay computed, not persisted); ADR-029 law: hub never touches DB directly |
| Marking & assessment | Smart Mark / self-mark / teacher-marking; assessment submit+history; answer-input incl. ink pad; test builder; teacher assignments |
| 4CH1 course data | `apps/hub/content/igcse-chemistry-19/` (manifest treeKind `official`, operator-authorized SME corpus license Amendment 2026-09-17, *demo re-use only*), `public/kg/data/canonicalKG.edexcel-chemistry-4ch1.json`, `spines/igcse-chemistry-19.json` |
| Past papers | `pastpapers-index.json` contains **4CH1-1C, 1CR, 2C, 2CR** (56 index mentions); syllabai-pastpapers repo (`pearson-edexcel/` tree); exam-questions topic player in hub; SME bundles + PMT chemistry trees in syllabai-resources |
| Corpus QA in motion | `chem_evidence_fetch/pin/mixed/definitive_apply.py` hub scripts — chemistry corpus QA already an active workstream |

### 2.2 The Student Book (syllabai-resources, audited today)

- PDFs at repo root: `edexcel-international-gcse-9-1-chemistry-student-book-pdf-free.pdf` (54MB, **the SB of record**, 383 pages) and `edexcel-chemistry-igcse-book.pdf` (33MB, companion/notes book); plus `international-gcse-chemistry-2017-specification.pdf`.
- **Parse of record:** `parsed/edexcel_igcse_chemistry_chunks_v3.jsonl` — **1,234 IBM-Docling chunks**; v1/v2 (Tesseract) superseded; `full_book_docling.md` (898KB) exists for a future reflow mode. Native Unicode chemistry preserved (`H₂O`, `⇌`); 87 LLM-polished chunks with originals kept.
- **Census (recomputed today from v3):** 4 units / **29 chapters** / ~490 sections; content types: body 493, key_point 140, table_data 113, exam_hint 113, answers 83, learning_objectives 81, chapter_questions 50, safety 44, unit_questions 21, appendix 27, glossary 21, did_you_know 17, front_matter 12, index 11, divider 6, skills 1, activity 1.
- **Chapter spine = the spec's sub-sections:** u1: c01 States of matter → c05/c06 formulae & calculations (part 1/2 — the heavy chapter already split), c07 ionic, c08 covalent, c09 metallic *(chem only)*, c10 electrolysis *(chem only)*; u2: c11–c18 (incl. c15 extraction *(chem only)*); u3: c19 energetics, c20 rates, c21 equilibria; u4: c22–c29 (c26 alcohols, c27 carboxylic acids, c28 esters *(chem only)*). The "(chemistry only)" chapters coincide exactly with the bold-"C" Paper-2-only band.
- **OCR runbook** (`BOOK_OCR_RUNBOOK.md`): Unlimited-OCR (baidu) on rented vLLM GPU is the re-OCR path; pilot verdict STRONG YES; known residual damage ((l)→() state symbols, `Aᵣ` subscript loss, figure placeholders, inline headers) is **lint-owned**, not hand-fixed — figures extract at ingest from page PNGs / bbox sidecar.
- Also present: `graph/igcse-chemistry`, `spec-links/`, `student-book-pilot/`, `Official-Specifications/`, `Official-ExamQuestion/`, `SME-*` trees, `RAG_RETRIEVAL_CORPUS_GUIDANCE.md`, `LICENSE-DATA.md`.

### 2.3 Kognity feature check (the "simulations and stuff" question, answered)

| Kognity feature (exact wording from product pages) | In 4CH1-relevant books? | SyllabAI today | Pilot decision |
|---|---|---|---|
| "Interactive textbooks … questions after each section", "auto-corrected questions" | Yes | exam-questions player + test builder + Smart Mark exist | **Pilot core**: rail "check-yourself" wired from bank via `chapter.specCodes` |
| "Videos and 3D models", "animations" | Yes (IB DP page) | none shipped | `media-embed` block type; curate 2–4 for pilot only if content-ready; parity post-pilot |
| **Simulations / virtual labs** | **Not advertised for IGCSE or IB DP sciences** (NGSS has physical hands-on kits; IB page: videos, 3D models, practicals text, concept boxes) | none | **Leapfrog**: `sim-embed` block type; 3–5 PhET CC-BY chemistry sims mapped to 4CH1 topics (balancing equations, acid-base solutions, concentration/molarity, salts & solubility, isotopes) |
| "integrated reading assistance and an interactive glossary" | Yes | book's 21 glossary chunks; hub `speech-math` lib exists (math TTS groundwork) | Rail glossary cards with mark-scheme accept/avoid lines; TTS/translation post-pilot |
| "Practicals and investigations", "concept boxes, linking questions" | Yes | `practicals.yaml` in concept graph; safety/exam_hint chunks | Practical callouts + `drag-label`/`table-fill` per practical chapter |
| "Practice Centre … battle your friends" (gamified) | Yes | mocks, streaks absent | Skip pilot; backlog |
| "customised, auto-corrected assignments from a bank of over 1300 questions" (IB Chem) | Teacher-side | teacher-assignments + teachermarking services live | Post-pilot surface wiring; our bank is real past papers + SME, not synthetic |
| Insights / "real-time data", flip-the-classroom | Yes | learner model + teacher KG/analytics live | Post-pilot: reading-coverage × mastery view |
| Student-facing AI tutor | **No** (AI only in content production + teacher scoring suggestions) | KA-RAG live with book citations | **Marquee differentiator**: rail tutor scoped to the mounted chapter (133d citation targets) |

### 2.4 v1.0 verification checklist — resolution

V1 (4CH1 map): **exists** (canonicalKG + spine + curriculum bundle) — T-BOOK-009 cancelled. V2 (papers): 1C/1CR/2C/2CR present. V3 (tagging): chapter-level spec joins exist in `book_chapters`; per-spec-point bank density still to verify in Neon (one SQL task in the batch). V4 (schema): confirmed (drizzle, documents/document_chunks/book_chapters). V5 (frontend): shadcn + KaTeX + markdown + pdf-pane; no widget/blocks renderer yet. V6 (flags): no central flag infra found — rollout via cohort gating in hub (to confirm in T-BOOK-001). V7 (auth/roles): identity service + require-auth present. V8 (ADR numbering): ADR-029/ADR-031 referenced in code; `docs/adr/` holds ADR-MIG-000x — **next free number to be pinned in T-BOOK-001**. V9 (ops conventions): AGENT_COORDINATION.md + band/band-law style (133a–h, T-C20, F-022) — new tasks proposed as `T-BOOK-xxx` feature band. V10 (migrations): drizzle + `scripts/neon-sql.ts` runner.

---

## 3. Product Definition — The Interactive Book Surface (v1.1)

### 3.1 The reading experience: two-pane, page-true

We do **not** reflow the book into new HTML pages for the pilot. The existing 133c/e/g/h viewer laws are kept intact (they solved real problems: 54MB whole-book mounts, practice-question geometry, citation drill-in). The pilot adds the second plane:

```text
/courses/igcse-chemistry-19/books/[docId]?chapter=u1:c5
┌───────────────────────────────┬──────────────────────────────┐
│  PDF-true chapter slice       │  INTERACTIVE RAIL            │
│  (page-exact mount, existing) │  (new, per-chapter pack)     │
│                               │  ① Spec chips + LO box       │
│  zoom · find · thumbnails     │  ② Examiner-language callout │
│                               │  ③ Interactive blocks        │
│                               │     (widgets / sims)         │
│                               │  ④ Check-yourself (bank)     │
│                               │  ⑤ Glossary cards            │
│                               │  ⑥ "Ask the tutor" (scoped)  │
└───────────────────────────────┴──────────────────────────────┘
         single column on mobile: rail becomes accordion under the pane
```

Rail packs are **bound to the chapter spine** (`chapterKey`), with optional page anchors (`pdf_page`) so a block can say "see p.42" precisely. The book's own prose is never duplicated — the rail *augments* the mounted pages. A future **reflow mode** (docling markdown → typed blocks, `full_book_docling.md` is ready) is explicitly post-pilot: it needs its own trust story for notation fidelity, and the PDF-true mount already carries the publisher's figures which OCR cannot.

### 3.2 Block types — 11 for pilot (frozen)

v1.0's nine types stand (`prose`, `figure`, `callout`, `mcq-embed`, `sort-match`, `drag-label`, `table-fill`, `num-stepper`, `eq-builder`) plus two new, motivated by the Kognity check:

- **`sim-embed`** — sandboxed iframe to **PhET Interactive Simulations (CC-BY 4.0, attribution in-card)**. Mapped to 4CH1: *balancing chemical equations* (c05), *acid-base solutions* (c16), *concentration / molarity* (c05–c06), *salts & solubility* (c01/c17), *isotopes & atomic mass* (c03). No third-party tracking; graceful fallback link when CSP blocks the frame.
- **`media-embed`** — poster + link card (video/3D/animation). Pilot ships it only if 2–4 chemistry assets are curated in time; otherwise empty and hidden (honest-empty law, consistent with the shelf).

Authoring guardrail stays: 11 types, no escape hatch. The chemistry-specific payloads ride the same three carriers as v1.0 (`eq-builder`, `drag-label` label-packs, `num-stepper` unit/sig-fig validation).

### 3.3 Rail pack anatomy per chapter (the "lesson" concept, renamed)

A **rail pack** replaces v1.0's authored lesson: ~300–600 authored words total per chapter — never a rewrite of the book. Components: 2–4 examiner-language callouts (mark-scheme vocabulary: *lattice*, *electrostatic attraction*, state symbols), 2–4 interactive blocks (highest density in c05/c06 moles, c10 half-equations, c16/c17 titrations), 5–10 check-yourself items pulled from the bank by the chapter's spec codes, 5–15 glossary cards (seeded from the book's 21 glossary chunks + authored accept/avoid lines), practical callouts where `practicals.yaml`/safety chunks apply, and a unit-closing Strength Check (10–15 bank items per unit).

### 3.4 Non-goals for the pilot (updated)

No reflow mode; no in-PDF annotation layer; no teacher assignments UI; no book-level analytics dashboards; no gamified practice centre; no TTS/translation surfaces (data model carries slots); no editing UI (packs are pipeline artifacts); no generative AI in packs — the scoped tutor remains the only generative surface.

## 4. The Learning Loop — Book × Learner Model × Smart Mark × Tutor

Unchanged from v1.0 in shape, re-anchored to the spine:

```text
READ (chapter slice mounted) ─► chapter_progress (the only new persisted signal)
  └► rail interactions ─► embedded checks ─► attempts(surface='book_check')
        └► existing BKT/BDT/decay update (one mastery currency; ADR-031 philosophy intact)
              └► recommendations (NBA service): re-read anchor → practice 6 tagged Qs → ask tutor
                    └► Smart Mark on extended/calc items → method-mark feedback
```

Rules that keep the loop honest: reading coverage is a *coverage* fact, not a memory model; checks are served from the existing bank (SME + past-paper tagged items) **keyed by `book_chapters.specCodes`** — no new tagging sprint for MVP (per-point density audit runs as a SQL check and gates Strength Checks); the book's own 50 chapter_questions / 21 unit_questions chunks are **page-reference jumps only, never re-served interactively** (licensing posture: the operator's rights assertion covers hosting the PDF; republishing Pearson question text in an interactive frame is a different risk class we deliberately avoid); the tutor rail call passes documentId + chapterKey + spec codes + opened glossary terms, and answers must cite the book (133d target shape) or linked corpus/spec material.

## 5. Content Architecture & Data Model (delta from v1.0)

Existing tables do the heavy lifting (`documents` TEXTBOOK + `document_chunks` + `book_chapters` with spec joins and validation state). Additive migration only:

| New | Purpose | Notes |
|---|---|---|
| `book_blocks` | rail pack blocks: `id, document_id, chapter_key, ord, type (11), pdf_page_anchor?, content jsonb, glossary_refs, spec_point_refs, status, version` | `book.block/1` zod schema, server-validated; `chapter_key` grammar already generalises to `:s<section>` without migration |
| `book_glossary_terms` | `subject_code, term, slug, definition, ms_accepts, ms_avoids, aliases, audio_url?, translations?` | seeded from 21 book glossary chunks + authored layer |
| `chapter_progress` | `user_id, chapter_key, rail_scrolled_pct, last_ord, updated_at` | the only new user-signal table |
| `attempts.surface` | add `'book_check'` discriminator | no new mastery tables |

Serving laws carried over: rail packs are served **only** when the parent book is VALIDATED (T-C20 no-state-leak; the operator's validation flip remains the lever) and the pack itself passes its own review state; honest-empty when absent — a chapter with no pack renders the unchanged 133c viewer. Blocks referencing check items carry `checkRefs` (question-bank ids); a lint fails the pack build on dangling refs, unresolved glossary slugs, or spec refs outside the chapter's join set.

## 6. Content Production Pipeline (Multi-Agent, Lighter than v1.0)

The heavy lifting (OCR, chunking, TOC, spec joins) already ran in T-MIG-133. The pipeline now produces **rail packs** only, one chapter = one unit of work with a JSON receipt, gates G1–G4:

| Stage | Agent | Gate |
|---|---|---|
| S0 pack outline | `book-architect`: block plan from the chapter's chunks (body/key_point/exam_hint/safety census + LO text + spec joins) | G1 schema + binding lint (chapter keys, page anchors monotonic, spec refs ⊆ join set) |
| S1 author | `book-writer`: callouts + block payloads + glossary accept/avoid lines | G2 schema validation, banned-phrase lint ("free electrons" in bonding prose, imprecise salt/rate phrasing), KaTeX/Unicode lint (state symbols `(l)` residue patterns from the runbook) |
| S2 accuracy | `chem-reviewer` (independent): equations balanced, states present, ΔH signs, conditions | G3 fact pass |
| S3 exam-alignment | `examiner-voice`: command-word fidelity (incl. Issue-3 `Which`), keyword precision | G4 terminology check |
| S4 publish | `book-publisher`: wire `checkRefs` from bank, receipts, coverage stats | pack flip per chapter after sample spot-check (20% for pilot) |

Volume (4CH1 whole book): 29 packs · ~12–17k authored words total (callouts, steppers, misconceptions — *not* book prose) · ~50–70 widget instances · ~120–180 check-yourself items wired from the bank · ~100 glossary cards · 4 unit Strength Check sets. Roughly one content sprint per unit at the current agent count.

---

## 7. Pilot Scope — 4CH1 (v1.1)

The unit-level plan of record: **the book's own 29 chapters**, with rail-pack emphasis and flags per chapter. (Spec-point ↔ chapter equivalence verified today; "chem only" = P2 route.)

| Unit | Chapters (rail packs) | Emphasis / flags |
|---|---|---|
| **1 Principles** | c01 states & solutions · c02 elements/compounds/mixtures · c03 atomic structure · c04 periodic table · **c05 formulae & calculations pt1** · **c06 pt2** · c07 ionic bonding · c08 covalent bonding · c09 metallic *(chem only)* · c10 electrolysis *(chem only)* | Highest investment: c05/c06 `num-stepper` mole walk-throughs; c10 `eq-builder` half-equations with charge-balance; c07/c08 dot-and-cross `drag-label`; sim-embeds ×2 (balancing, isotopes) |
| **2 Inorganic** | c11 alkali metals · c12 halogens · c13 gases in atmosphere · c14 reactivity series · c15 extraction *(chem only)* · c16 acids/alkalis/titrations · c17 salt preparations · c18 chemical tests | c16/c17 procedural `sort-match` (titration detail is a known mark leak); c18 `table-fill` test→observation→ion; sim-embed ×1 (acid-base) |
| **3 Physical** | c19 energetics · c20 rates · c21 equilibria *(chem only, spec 3.19C+)* | c19 `num-stepper` Q=mcΔT; c20 graph-reading `figure`s; sim-embed ×1 (salts & solubility or rates) |
| **4 Organic** | c22 intro · c23 crude oil · c24 alkanes · c25 alkenes · c26 alcohols *(chem only)* · c27 carboxylic acids *(chem only)* · c28 esters *(chem only)* · c29 synthetic polymers | Lightest packs; displayed-formula `drag-label`; polymers repeat-unit `table-fill` |

**Phasing.** *Phase A (MVS):* c01–c10 (Unit 1) packs + rail shell + 9 generic widgets + eq-builder + glossary v1 (~80 cards) + check-yourself wiring + chapter_progress + scoped tutor. First internal demo gate at **c01–c05** (proves the whole loop incl. citations). *Phase B:* c11–c21 + glossary ~180 + Strength Checks Units 1–2 + sim-embed. *Phase C:* c22–c29 + all Strength Checks + "practice in past papers" deep links + full-book launch on the flip.

**Why this beats v1.0's plan:** zero duplicated prose (the Pearson book is the reading), spec joins already computed, figures already page-true, and every interactive hour goes to the things Kognity cannot do (method-mark interactives, examiner-language, scoped AI, real past-paper checks).

## 8. Engineering & Delivery Plan (revised task batch)

Feature band `T-BOOK-xxx` (maps onto the repo's band-law style; if the operator prefers strict T-MIG continuity, these read as T-MIG-139+ bands — one decision in T-BOOK-001).

| Task | Title | Est (agent-days) | Depends | Lane |
|---|---|---|---|---|
| T-BOOK-000 | Repo audit + census (V1–V10) | **done** (this session) | — | platform |
| T-BOOK-001 | ADR + band-ID decision + flag mechanism pin-down (V6/V8) | 0.5 | 000 | platform |
| T-BOOK-002 | Drizzle migration: book_blocks, book_glossary_terms, chapter_progress, attempts.surface | 1 | 001 | platform |
| T-BOOK-003 | Rail shell: two-pane layout on existing viewer, mobile accordion, honest-empty states | 2 | 002 | platform |
| T-BOOK-004 | Block renderer + 9 generic widgets (a11y keyboard paths) | 3 | 002 | platform |
| T-BOOK-005 | eq-builder (balance/state/charge) + chemistry label-packs + num-stepper validation | 2 | 004 | platform |
| T-BOOK-006 | sim-embed (PhET CC-BY) + media-embed cards | 1 | 004 | platform |
| T-BOOK-007 | Glossary infra: popover cards, slug lint, seeding script from 21 glossary chunks | 1.5 | 002 | platform |
| T-BOOK-008 | Check wiring: specCodes→bank query, check-yourself player, attempts surface='book_check' | 2 | 002, bank-density SQL | platform |
| T-BOOK-009 | Tutor rail: scoped KA-RAG call w/ 133d citation target + glossary context | 1 | 003 | platform |
| T-BOOK-010 | Unit 1 rail packs (c01–c10) through S0–S4 | 3 | 003–007 | content |
| T-BOOK-011 | Unit 2 packs (c11–c18) | 2.5 | 010 proven | content |
| T-BOOK-012 | Unit 3 packs (c19–c21) | 1.5 | 010 proven | content |
| T-BOOK-013 | Unit 4 packs (c22–c29) | 2 | 010 proven | content |
| T-BOOK-014 | Glossary to ~100 cards + accept/avoid layer | 1.5 | 007 | content |
| T-BOOK-020 | Bank density audit SQL + unit Strength Check assembly | 1 | 008 | corpus |
| T-BOOK-030 | QA: a11y, mobile perf (slice mounts stay lazy), KaTeX/Unicode sweep, Playwright e2e for rail | 1 | 005/006/010 | platform |
| T-BOOK-040 | Cohort gating + validation-flip staging + feedback instrumentation | 1 | all Phase A | platform |

**Lanes & timeline.** Platform (000→001→002→{003,004,007}→{005,006,008,009}) parallel to content (010→{011,012,013}) and corpus (020). At the current 6–9 agent count: **Phase A ≈ 7–9 calendar days**, full 29-chapter book ≈ 3 weeks. Acceptance for MVS: c01–c10 packs live behind gating on a VALIDATED book, one full loop demonstrated end-to-end (read → check → mastery delta visible → scoped tutor citation).

### Sample task YAML (T-BOOK-002)

```yaml
id: T-BOOK-002
title: "Interactive rail: additive migration (book_blocks, book_glossary_terms, chapter_progress, attempts.surface)"
lane: platform
depends_on: [T-BOOK-001]
briefing_ref: AGENT_COORDINATION.md  # repo law of record for agent ops
context_refs:
  - packages/db/src/schema/schema.ts          # book_chapters precedent (133a)
  - packages/contracts/src/books.ts           # REUSE-not-redeclare law
deliverables:
  - drizzle migration + schema exports (books band)
  - zod schema book.block/1 (11 types) in contracts
acceptance:
  - migration applies clean on staging snapshot; rollback documented
  - book_blocks.chapter_key validated against book_chapters rows (no orphan packs)
  - rail serving respects T-C20 (VALIDATED-only) — enforced at query layer
receipts: json
worklog: append per template
```

## 9. Risks, Open Questions & Watch Items (v1.1)

| Risk / question | Sev | Mitigation / posture |
|---|---|---|
| **Licensing**: operator-asserted hosting rights for the SB PDF (2026-10-18 intake); SME demo bundle marked "demo re-use only" | **High (legal)** | pilot: book stays page-true hosted (as today); book's own questions = jumps only; production check serving uses bank items with verified licensing (LICENSE-DATA.md review as a T-BOOK-001 sub-item); no reflow republication |
| OCR residual damage ((l)→(), `Aᵣ` loss, figure placeholders) | Med | runbook lint is owned; blocks never re-quote book text — they reference pages; KaTeX/Unicode sweep in QA |
| PhET iframe: CSP, offline, performance | Med | sandboxed frame + poster fallback + lazy mount; attribution card |
| Bank density per spec point (for checks) unknown in Neon | Med | T-BOOK-020 SQL audit gates Strength Checks; check-yourself degrades to chapter-level picks |
| Rail distraction / small screens | Med | accordion pattern, rail collapsed by default on mobile, no auto-open |
| Scope creep toward reflow/editor/assignments | Med | 11 block types frozen; reflow explicitly post-pilot |
| Spec drift | Very low | content unchanged since 2019; Issue 3 administrative |
| 4XCH1 modular (first assessment June 2025) & 4SD0 Double Award | Low | same spine; modular = alternative unit packaging later; 4SD0 = "chemistry only" filter on c09/c10/c15/c26–c28 |
| Gating/monetization (book bundled vs add-on) | Open | recommend bundled for pilot cohort; decide with pricing review |
| Teacher surfaces (assignments from book, reading-coverage insights) | Open | explicitly post-pilot; services already exist to wire |

## 10. ADR Draft (v1.1) + Source Log

### ADR-0xx: Interactive Rail over the Student-Book Spine

1. **Rail, not rewrite.** The interactive layer mounts beside the page-true chapter slices; the 133c/e/g/h viewer laws are preserved unchanged; reflow is post-pilot.
2. **Blocks bind to the spine.** `book_blocks.chapter_key` + page anchors; no parallel lesson taxonomy; spec refs must resolve within the chapter's `book_chapters.specCodes` join set.
3. **Checks come from the bank.** `checkRefs` → existing question-bank items; `attempts.surface='book_check'`; one mastery currency. Book-printed questions are page-jumps only, never re-served.
4. **Persist coverage, compute mastery.** `chapter_progress` is the only new persisted user signal; decay/mastery stay computed (ADR-031 law intact).
5. **Simulations leapfrog.** `sim-embed` (PhET, CC-BY, attribution, sandboxed) + `media-embed` cards; 11 block types frozen for pilot; Kognity parity items (TTS/translation/videos) ride the data-model slots later.
6. **No generative text in packs.** Gates G1–G4 produce static reviewed content; KA-RAG is the only generative surface, chapter-scoped with mandatory citations (133d shape).
7. **Licensing is a serving law.** Rail packs serve only under a VALIDATED parent book (T-C20); interactive republishing of third-party question text is forbidden; LICENSE-DATA.md compliance is a release gate.

### Source log

| # | Source | Used for |
|---|---|---|
| 1 | Repo audit `syllabai-v2@main` (this session, PAT): `contracts/books.ts`, `services/books.ts`, `routes/books.ts`, `ingestion/books/*`, `db/schema.ts`, hub `lib/books.ts`, viewer page, tests, scripts | §2.1 inventory, architecture, task batch |
| 2 | `syllabai-resources@main`: repo root, `parsed/chunks_v3.jsonl` (full census recomputed), `parse_report_v3.json`, `BOOK_OCR_RUNBOOK.md`, `books/`, `spec-links/`, `graph/` trees | §2.2 book spine, chapter table |
| 3 | `syllabai-pastpapers@main` + hub `pastpapers-index.json` | 4CH1 1C/1CR/2C/2CR coverage |
| 4 | Kognity product pages: **Cambridge IGCSE** (features fetch) and **IB DP Chemistry** (features fetch) | §2.3 parity matrix, simulations verdict (videos/3D/animations/glossary/practicals; no virtual labs; 1,300+ IB Chem assignment bank) |
| 5 | chem-bio.info 4CH1 checklist + Pearson spec PDF + Tutopiya command-word pages (v1.0 session, carried over) | spec structure, assessment model, command words |
| 6 | Kognity research dossier 2026-10-20 (internal) | competitive frame |

**Limitations.** Chapter-level spec joins are trusted from the contract's documented join law (LO-box verbatim-class matching); per-point bank density in Neon is asserted, not queried, from this sandbox (T-BOOK-020 closes it). PhET sim availability per topic is from the public PhET catalog's chemistry suite and should be pinned per-sim in T-BOOK-006. ADR next-number and flag mechanism were bounded but not pinned (T-BOOK-001). The PAT used for this audit was chat-provided: treat as exposed; rotate after the batch.
