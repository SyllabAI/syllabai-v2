# LESSON — the Kognity-style HTML book (T-BOOK-030 plan of record)

> **AMENDMENT (T-BOOK-031, trace 1a16138fde2c155d, operator directive):** lesson
> authoring now lives in **`CourseLessons/` in syllabai-resources** — a
> self-improving, any-agent authoring home organized by board → qualification →
> subject, with its own doctrine pack (START-HERE / FEATURE-SPEC /
> BUILD-PLAYBOOK / VALIDATION / SELF-IMPROVEMENT / TRACKER), `lessonctl.py`
> pipeline CLI, and findings ledger. The L1 lessons built there emit
> `lessonPackV1` JSON (contracts below) into the platform. This doc remains the
> platform-side plan of record (contracts, renderer, serving); the
> corpus-side authoring laws live in CourseLessons.

**Version:** v1 · **Trace:** 1a161271845ba415 · **Date:** 2026-10-22 (Asia/Dhaka)
**Operator directive chain:** "both" (trace 1a1611a346d9725d) → "past papers + mark schemes + parsed book = best resource on the internet" (trace 1a161271845ba415).
**Supersedes:** nothing — this EXTENDS PLAN-4CH1-v1.1 §5 (rail doctrine). The rail stays; the PDF stays untouched.

## 1. What Lesson is (one paragraph)

Lesson is the **primary year-round learning surface**: a Kognity-style, prose-first HTML rendering of each chapter, built from the **same substrate** the rail already serves (29/29 VALIDATED chapters, 177 blocks, spec joins, glossary, TutorCard). One substrate, two renderers:

| Renderer | Role | Shape |
|---|---|---|
| **Rail** (live) | page-true companion while reading the licensed PDF | PDF left + interactive rail right |
| **Lesson** (new) | **the way students learn daily** | scrollable HTML sections, widgets inline, cross-links to every other surface |

The PDF of record is never altered. Lesson renders SB-derived prose under the **same operator hosting-rights assertion** as the existing page-exact PDF slices (2026-10-18 package intake) — same content, different renderer.

## 2. Asset → capability map (verified this session)

| Asset (verified) | Feeds Lesson |
|---|---|
| Parse of record `chunks_v3`: 1,234 Docling chunks, 4 units / 29 chapters / ~490 sections, 17 content types (body 493, key_point 140, table_data 113, exam_hint 113, answers 83, LO 81, glossary 21, safety 44…) | Lesson prose + section spine + exam-hint/safety/key-point callouts |
| VALIDATED blocks: 177 across 29 chapters (MCQ 29, callout 30, sort-match 20, table-fill 17, figure 15, eq-builder 13, drag-label 11, num-stepper 8, sim-embed 5, prose 29) | Inline interactivity, no new authoring required for v1 |
| Past papers index: **17 sessions (2019-06 → 2026-06 + specimen), 56 papers — every paper has QP *and* MS** (1C/1CR/2C/2CR) | Per-spec-point exam drill; "where this shows up in real papers" cards |
| Mark schemes (MS bytes in index; `4CH1/2C JUN 2019` corpus of record parsed in DB) | accept/avoid vocabulary layer; worked-example marking lines |
| Question bank (spec-coded, difficulty-banded, 1,192+ refs laws) | Check-yourself per section; timed chapter checks (already live) |
| Glossary: 112 term chips (subject=4ch1) | Inline term chips with ms_accepts/ms_avoids cards |
| Spine joins: 29 chapters ↔ 182 spec points; notes join 28/29 chapters ≥1 note (books-notes.ts law); flashcards bridge; tutor book-arm | The cross-mapping spine (§4) — **derived, never authored** |
| `practicals.yaml`, canonicalKG, PhET sim-embeds (5 live) | Practical callouts; concept-graph drill-in; simulations (the Kognity leapfrog) |

**Why this beats Kognity at its own game:** they have no past-paper/MS layer, no learner model, no tutor, no simulations, no heatmap analytics. We have all five already built — Lesson is the surface that finally exposes them in one reading flow.

## 3. Feature list — Lesson v1 (complete)

**Reading core**
1. Chapter lesson page: LO header (verbatim from `book_chapters`), ~17 scrollable sections from the chunks_v3 spine, SB page anchor per section ("see p.42" → PDF slice drill-in).
2. Prose rendered from the parse of record (chunkRefs provenance; OCR lint law applies).
3. Inline widgets: all 11 block types interleaved by page proximity (MCQ, sort-match, table-fill, eq-builder, drag-label, num-stepper, sim-embed, figure, callout, table, prose framing).
4. Key-point / exam-hint / safety callouts from the book's own chunks (140/113/44 available).
5. Glossary chips inline (112 terms) → hover cards with ms_accepts/ms_avoids.
6. Paper-route badges: "(chemistry only)" chapters marked **Paper 2 route**.
7. Practicals callouts from `practicals.yaml` mapped to their sections.

**Practice layer (mapped, not duplicated)**
8. Check-yourself per section — bank questions filtered by the section's specRefs.
9. Timed chapter check (live already) — linked from lesson footer.
10. Exam-questions drill per section — topic player filtered by specRefs.
11. **Past-paper anchor cards** — "this spec point appeared in: 4CH1/1C JUN2023 Q4(b)" style, QP+MS links (56 papers).
12. Flashcards: deck per subtopic, decay-aware due badges (ADR-031 law).
13. Worked examples with mark-scheme accept/avoid lines (MS vocabulary layer).

**Loop closure (the four-layer differentiator)**
14. Revision-notes panel per chapter — the books-notes.ts exact spineCode join (honest absent when 0).
15. Tutor integration — TutorCard anchored to chapter spec codes; page-true citations.
16. Per-section completion → learner model (decay, struggle inference, NBA, strengths).
17. Progress persistence (chapter_progress law; silent skip when logged out).
18. Section heatmap analytics hooks (checkRefs/specPointRefs) — teacher view post-pilot.
19. TOC sidebar + glossary search.
20. TTS/read-aloud — post-pilot (speech-math groundwork exists).

**Honest-absent law carries over:** a section with no notes/past-paper/flashcard mapping renders NO panel — never a fabricated link.

## 4. Pipeline (stages + laws)

```text
L0 section-map   chunks_v3 (~490 sections) × chapter spine × block pages → per-chapter section spine
L1 lesson pack   books/<qual>/packs/<packId>/lesson.yaml — sections, chunkRefs, blockIds,
                 glossarySlugs, specRefs (schema: contracts/books-lesson.ts, lessonPackV1)
L2 lint          lessonPack zod strict + binding law (specRefs ⊆ chapter join set; page anchors
                 monotonic; blockIds resolve; glossary slugs resolve; honest-empty)
L3 ingest        packs land SUGGESTED ("draft"); operator VALIDATE flip → "published" (per-pack)
L4 serve         hub /courses/[course]/books/[docId]/lesson — SSR renderer; cross-links DERIVED
                 server-side via books-notes.ts / flashcard-bridge / spec joins (never authored)
```

**Laws inherited (unchanged):** fetch-first (inline-URL PAT); contracts-first; zero new DDL for v1 (lesson shelf serves from packs + existing registry, not new tables); ingest = SUGGESTED only; VALIDATED flip = explicit operator command; no main push (PR lane); binaries stay in L1 (chunkRefs are pointers).

## 5. Task batch

| Task | Deliverable |
|---|---|
| T-BOOK-030 (this commit) | `contracts/books-lesson.ts` (lessonPackV1 + shelf shape) + this plan |
| T-BOOK-031 | L0 section-map builder script (fetch-first chunks_v3 recipe; emits section spines for all 29 chapters, SUGGESTED) |
| T-BOOK-032 | L1 lesson packs c01–c05 (demo gate, mirrors rail Phase A) |
| T-BOOK-033 | L4 hub Lesson renderer + lesson shelf entry point (tab on the reader: **Rail / Lesson**) |
| T-BOOK-034 | Past-paper anchor cards (spec point → paper/question index from exam_papers + MS corpus) |
| T-BOOK-035 | localgate + golden needles + battery for the Lesson surface |

## 6. Open decisions (operator)

1. Lesson shelf visibility: same cohort gating as rail Phase A, or open?
2. MS vocabulary depth for v1 worked examples: 112-term glossary layer only, or curated per-chapter accept/avoid sets?
3. Past-paper anchor cards: link out to QP/MS PDFs (fast) vs. parsed question-level mapping (richer, needs corpus lane)?
