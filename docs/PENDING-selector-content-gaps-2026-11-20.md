# PENDING — Selector content gaps: 30 courses / 47 empty selectors

> Recorded 2026-11-20 · status: **TRIAGED (run-002): all 47 are TRUE corpus gaps — zero pipeline dropouts (corpus == live exactly). PENDING content production** · records landed via PR #1163 (48fb28be) · task card: `.syllabai/tasks/T-QA-GAPS-001-selector-content-gaps.yaml` (status OPEN)
> Evidence: `docs/selector-census-2026-11-20.csv` (318 rows, one per course × selector view) · receipts: `run-001.json` (live census) + `run-002.json` (corpus triage)

## What this is

All 106 courses × 3 selector views (Revision Notes / Exam Questions / Flashcards) were swept live in-session — 318 pages. **Every page renders: zero 404s, zero missing headers**, and the notes total (9,151) matches the census of record exactly. 47 selectors across 30 courses render "0 across 0" — empty content behind working pages.

Live of-record totals at census time: **9,151 notes / 4,326 subtopics · 44,502 questions / 2,639 sets · 56,572 cards / 1,912 decks**. Re-verified unchanged on live production after main advanced `0ca81cca → cb0f9c3f` (~2,400 commits).

## The list (grouped by what is missing, in suggested tackle order)

### All three selectors empty — no content at all — 3

| Course | Slug | Missing |
|---|---|---|
| Geography — A-Level | `cie-a-level-geography-21` | Revision Notes + Exam Questions + Flashcards |
| Maths — Pure 2 — A-Level | `cie-a-level-maths-20-pure-2` | Revision Notes + Exam Questions + Flashcards |
| History — IGCSE | `igcse-history-17` | Revision Notes + Exam Questions + Flashcards |

### Exam Questions + Flashcards missing (Revision Notes exist) — 11

| Course | Slug | Missing |
|---|---|---|
| Accounting — A-Level | `cie-a-level-accounting-21` | Exam Questions + Flashcards |
| Economics — A-Level | `cie-a-level-economics-23` | Exam Questions + Flashcards |
| Accounting — AS | `cie-as-accounting-21` | Exam Questions + Flashcards |
| English — AS | `cie-as-english-general-paper-21` | Exam Questions + Flashcards |
| English Language A — Paper 3 (Coursework) — IGCSE | `igcse-english-language-a-16-paper-3-coursework` | Exam Questions + Flashcards |
| Science (Double Award) — Modular 2024, Biology Unit 1 — IGCSE | `igcse-science-double-award-modular-24-biology-unit-1` | Exam Questions + Flashcards |
| Science (Double Award) — Modular 2024, Biology Unit 2 — IGCSE | `igcse-science-double-award-modular-24-biology-unit-2` | Exam Questions + Flashcards |
| Science (Double Award) — Modular 2024, Chemistry Unit 1 — IGCSE | `igcse-science-double-award-modular-24-chemistry-unit-1` | Exam Questions + Flashcards |
| Science (Double Award) — Modular 2024, Chemistry Unit 2 — IGCSE | `igcse-science-double-award-modular-24-chemistry-unit-2` | Exam Questions + Flashcards |
| Science (Double Award) — Modular 2024, Physics Unit 1 — IGCSE | `igcse-science-double-award-modular-24-physics-unit-1` | Exam Questions + Flashcards |
| Science (Double Award) — Modular 2024, Physics Unit 2 — IGCSE | `igcse-science-double-award-modular-24-physics-unit-2` | Exam Questions + Flashcards |

### Flashcards only missing (notes + questions exist) — 15

| Course | Slug | Missing |
|---|---|---|
| Business — A-Level | `cie-a-level-business-23` | Flashcards |
| Business — AS | `cie-as-business-23` | Flashcards |
| Computer Science — AS | `cie-as-computer-science-19` | Flashcards |
| Environmental Management — AS | `cie-as-environmental-management-20` | Flashcards |
| Accounting — 2021 Syllabus — IGCSE | `cie-igcse-accounting-21` | Flashcards |
| Business — IGCSE | `cie-igcse-business-23` | Flashcards |
| English Language — 2020 Syllabus — IGCSE | `cie-igcse-english-language-20` | Flashcards |
| Religious Studies — IGCSE | `cie-igcse-religious-studies-23` | Flashcards |
| Combined Science — Biology — IGCSE | `cie-igcse-science-combined-science-23-biology` | Flashcards |
| Combined Science — Physics — IGCSE | `cie-igcse-science-combined-science-23-physics` | Flashcards |
| Further Maths — Further Pure 1 — IAL | `ial-further-maths-18-further-pure-1` | Flashcards |
| Accounting — IGCSE | `igcse-accounting-17-financial-statements` | Flashcards |
| Accounting — IGCSE | `igcse-accounting-17-introduction-to-bookkeeping-and-accounting` | Flashcards |
| Maths — Foundation, Unit 1 — IGCSE | `igcse-maths-a-modular-24-foundation-unit-1` | Flashcards |
| Maths — Foundation, Unit 2 — IGCSE | `igcse-maths-a-modular-24-foundation-unit-2` | Flashcards |

### Exam Questions only missing (notes + flashcards exist) — 1

| Course | Slug | Missing |
|---|---|---|
| Accounting — 2025 Syllabus — IGCSE | `cie-igcse-accounting-25` | Exam Questions |

## Pattern

The gap clusters around (a) the **CIE business / economics / humanities cluster** (Accounting, Business, Economics, Geography, History, Religious Studies) and (b) **modular / unit-style courses** (Science Double Award units, Maths Foundation units, Accounting units). **Flashcards is by far the thinnest layer** (29 courses missing them, vs 15 missing Exam Questions and 3 missing Revision Notes).

## Suggested tackle order

1. The all-three trio (`cie-a-level-geography-21`, `cie-a-level-maths-20-pure-2`, `igcse-history-17`) — courses a learner can open today with literally nothing inside.
2. The 11 Exam Questions + Flashcards gaps (notes exist — two layers to produce per course).
3. The 15 Flashcards-only gaps (one layer per course; mass-production candidates — same deck format across courses).
4. `cie-igcse-accounting-25` Exam Questions (single view, single course).

Exact prioritization is the operator's call; the grouping above is by learner impact, not effort.

## Triage (run-002, 2026-11-20 — corpus ground truth vs live census)

The live census alone could not distinguish true gaps from pipeline dropouts (content present in the corpus but failing to render). The corpus bundles settle it: **all 47 are true gaps — for every missing layer the corpus bundle is genuinely empty and the live count matches exactly; no course has content in the corpus that fails to render.** The notes and flashcards layers matched corpus==live fleet-wide (zero flags on 106 courses). The sweep's only flags were the triage script's own sets-vs-questions metric mismatch (corpus `questions.json` is a list of SETS; the live header counts QUESTIONS — e.g. maths-b-16 = 65 sets / 1,270 questions).

Layer-by-layer handoff, sharpened:

1. **Flashcards — 26 courses — a generator run, not authoring-from-scratch.** Decks are subtopic-anchored (`deckSlug` mirrors the curriculum row, e.g. `1-1-particles-in-the-atom-and-atomic-radius`), cards carry `specPointCode` (86–100% on sampled contentful courses) and come in 4 fixed types (`question_and_answer`, `true_or_false`, `fill_in_the_blanks`, `keyword_definition`). `sourceNoteId` exists in the schema but is unused (0% on every sampled course). All 16 spot-checked gap courses have 100% of their notes placed (`sectionSlug` non-empty). The upstream deck generator simply hasn't been run/landed for these courses.
2. **Exam Questions — 12 courses — needs QP/MS source material.** `questions.json` holds paper-derived sets with source/curriculum fields; heavier production than flashcards.
3. **The all-three trio — full authoring from scratch.** Their bundles are literally empty lists; the curricula DO exist for all three, so the spine and navigation render — only the content layers are missing.

Side finding: `sourceNoteId` being unused fleet-wide is a schema-cleanup candidate upstream (cosmetic, out of this lane).

## Reproduction

Enter the student demo session, capture the session cookie, then `curl` each `/courses/<slug>/<view>` (in-session) and extract the header counts:

```
([\d,]+) notes across ([\d,]+) subtopics        # revision-notes
([\d,]+) questions across ([\d,]+) sets        # exam-questions
([\d,]+) flashcards across ([\d,]+) decks      # flashcards
```

Zero-count pages literally render "0 notes across 0 subtopics" / "0 flashcards across 0 decks" — verified in raw HTML, not a parsing artifact. No authentication beyond the demo session is needed.

## Related open QA defects (separate lanes — recorded for completeness, not part of this card)

1. `GET /api/v1/learners/me/progress` → 401 for an authenticated demo session while agenda/courses return 200.
2. React #418 hydration mismatch on `/dashboard` (1 per load).
3. `syllabai.com` parked for sale on GoDaddy (old brand domain lapsed).
4. `/sitemap.xml` 404 and no `Sitemap:` in robots.txt.
5. Stale marketing count "94 courses" (actual 103 layered / 106 listed).
6. `GET /api/v1/editor/me` → 403 auto-fired on course pages (gate it client-side).

Full reproduction paths live in the QA session's browser-qa report (outside the repo); each is a one-line repro from the dashboard or DNS.

