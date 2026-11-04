# ADR-039: SME selector anchoring — the wired placement chain, the D3 row-link policy, and the disclosed data-edits queue (map-gaps)

| | |
|---|---|
| **Status** | ACCEPTED (operator-ordered: wire the notes-bridge + numbering backfill into `subtopicOfQuestionSet` with the D3 row-link fix; queue the map-gaps as disclosed edits) |
| **Band** | `T-SME-SEL` (exam-questions selector) |
| **Date** | 2026-11-04 |
| **Basis** | SME selector blast-radius audit (81 SME courses / 2,012 sets / 34,940 questions; defect classes D0–D9); `apps/hub/src/lib/spec-tree.ts` (production anchoring); `SME-ExamQuestion` reference manifests (syllabai-resources @ main); ADR-039 principle: **the pipeline improves; provenance discloses** — no silent data surgery |

## 1. Problem

The exam-questions selector anchors every question set to the official
specification tree via `subtopicOfQuestionSet`. Two defect classes remained
after the spec-anchor import:

- **D0 — unanchored sets**: 450 sets / 6,565 questions (22.4% of sets) carry
  no resolvable spec anchors and an SME `topicSlug` that is not a tree code,
  so they render nowhere in the tree.
- **D3 — first-set row links**: a sub-topic row aggregating N sets
  (`hrefs.questions[code] ??= first set`) deep-links to whichever set came
  first in corpus order while counting every set's questions — 233 rows /
  8,345 questions mislinked at the row level (worst: igcse-chemistry-19
  "Chemical formulae, equations and calculations", 45 sets behind one link).

D0 and D3 interact: backfilling topic-level sets onto a topic's FIRST
sub-topic row would fabricate new D3 rows. Hence the two ship together, D3
first.

## 2. The wired placement chain (product-side, shipped here)

`subtopicOfQuestionSet(topic, index, notes?)` resolves, first match wins,
everything corpus-derived:

1. **Corpus-native slug** — `topicSlug` is a tree sub-topic code (unchanged).
2. **Spec-anchor tally** — majority vote over anchored question parts
   (unchanged).
3. **Notes-bridge** (new) — sets key by the SAME SME topic slugs the revision
   notes carry (`1-1-states-of-matter`…). A note with that slug anchors
   corpus-natively, so the set inherits that placement (the existing
   `noteSlugBridge`, memoized per index). Resolves 243 of the 450.
4. **Numbering backfill** (new) — SME slug numbering (`1-2-…`) matching the
   one sme-native sub-topic numbered `SUB1.2`. Resolves 31.
5. **Unique title match** (new) — normalized set name equals exactly one
   non-synthetic sub-topic title. Resolves 23.
6. **Topic-level home** (new) — the section the set was published under,
   matched to exactly ONE official topic by: (a) section number → topic CODE
   number (`…-T6`, immune to corpus-order drift); (b) section number → corpus
   position; (c) stopword-folded token containment, unique only; (d)
   single-topic spine (component courses); (e) the frozen SME section map
   (`src/lib/sme-section-map.ts`, reference-derived — see §3). The set homes
   to that topic's **"General requirements" row** (`<topic>-gen`, the same
   synthetic shape `buildSpecTreeIndex` already uses for orphan spec points,
   created on demand) — **never** the topic's first sub-topic row, which
   would fabricate D3 rows. Resolves 141 further sets (53 fresh gen rows).

### D3 row-link policy (shipped with the chain)

`loadHubCourse` no longer defaults a multi-set row's `hrefs.questions[code]`
to the first set. Single-set rows keep a direct link; multi-set rows become
**expander-only** — the tree row counts every set's questions and the
expander lists every set (`topic-tree.tsx` renders the row without a
navigation target when no single target exists). Active-row highlighting
already resolved 2nd+ sets through `setsBySubtopic`, so no highlight
regression.

### Result (verified end-to-end on the committed corpus,
`bun scripts/verify_sme_wire_r0.ts`)

**2,000 of 2,012 sets placed (99.4%); 12 unplaced** (§4). Teacher surfaces
(question-bank, assemble, validation-queue, class-sim, test-assembly) share
the same chain with `bundle.notes`, so placement is identical everywhere.

## 3. The numbering backfill's frozen table (provenance)

Four CIE maths courses (0580 core/extended, 0607 core/extended) publish sets
under SME sections that are RENAMES of official topics with no section
number in the corpus ("Algebra & Sequences" = official topic 2, "Algebra and
graphs"; "Lengths, Areas & Volumes" = official topic 5, "Mensuration"; …).
The correspondence is derived once from the SME-ExamQuestion reference
manifests (per-section topic lists, token overlap scored against each
official topic's sub-topic titles, argmax — `scripts/sme_section_map_derive.py`
in the workspace; every row verified) and frozen in
`src/lib/sme-section-map.ts`, keyed by the tree's topic-code prefix
(including the TC/TE core/extended tier letters). It is a PLACEMENT table
only: no corpus content is edited, no set is relabeled. 34 rows map; 2 are
honestly null (Investigations / Investigations & Modelling — no official
counterpart).

## 4. Disclosed data-edits queue (the map-gaps)

The 12 sets the wired chain still cannot place, with the mechanical reason —
these need DATA-side fixes and are queued here, not silently worked around:

| # | Course | Set (section) | Gap class |
|---|--------|---------------|-----------|
| 1 | cie-igcse-computer-science-23 | SQL (9. Databases) | parsed spine missing topics T7/T9/T10 (0478) — set's section number has no topic |
| 2 | cie-igcse-english-language-20 | Paper 1: Reading (Paper 1: Reading) | paper-level SME structure vs topic-level spine — needs a paper row |
| 3 | cie-igcse-geography-25 | Causes & Impacts of Climate Change (Climate Change) | SME theme sections absent from the 0460 spine (T1–T3 only) |
| 4 | cie-igcse-geography-25 | Fieldwork (Geographical Skills) | same — skills/themes not in spine |
| 5 | cie-igcse-geography-25 | Images & GIS (Geographical Skills) | same |
| 6 | cie-igcse-maths-international-maths-23-core | Investigations (Investigations) | SME-only section — no official counterpart (map row honestly null) |
| 7 | cie-igcse-maths-international-maths-23-extended | Investigations (Investigations & Modelling) | same |
| 8 | cie-igcse-maths-international-maths-23-extended | Modelling (Investigations & Modelling) | same |
| 9 | cie-igcse-religious-studies-23 | Christianity & Social Action (Christianity) | spine's variant-structure (T*/TI*/TJ*) vs SME paper structure — Christianity family not addressable |
| 10 | cie-igcse-religious-studies-23 | Christianity: Religion & Family Life (Christianity) | same |
| 11 | cie-igcse-science-combined-science-23-biology | Drugs in Medicine (13. Drugs) | SME global section numbering (full double-award syllabus) vs biology-only spine slice |
| 12 | cie-igcse-science-combined-science-23-biology | Human Impact: Biodiversity, Pollution & Conservation (16. Human Influences on Ecosystems) | same |

Related spine defects found while re-deriving (queue for the data lane, not
pipeline work):

- **RS-23 18-topic spine**: three paper variants (T*/TI*/TJ*) each repeat
  Worship…Religion and social action — titles not disambiguated per variant.
- **business-25 spine missing T1** ("Understanding business activity") —
  positions shifted; rescued at runtime by the code-number rule (a), but the
  spine gap stands.
- **mechanics / stats-1 topic titles off-by-one** (T4 titled "Pure
  Mathematics" should be "Mechanics"; T5 titled "Mechanics" should be
  "Probability & Statistics 1") — sub-topic content is correct; title-only
  defect. Sets still home topic-level via the single-topic-spine rule (d).

### Count reconciliation

- Workbook (pre-notes-bridge joins): 101 high + 144 medium + 205 manual = 450.
- Operator口径 of the manual-homes tranche: 228 manual (includes the
  join-rule double-count disclosed at the time); its residual was reported
  as "10 map-gaps".
- After wiring (this ADR): 450 → 12 unplaced sets across 6 courses and 9
  distinct gap sections. The manual-homes tranche's per-row artifact was
  lost to a workspace recycle, so the enumerated 12-row list above is the
  re-derived inventory of record: per-set rows; the Investigations family
  and the combined-science numbering divergence can each be read as one
  section-level gap or per set (9 sections / 12 sets). Any future data
  lane works from THIS list, not from the recalled count.

## 5. Verification gates

- `bun x tsc --noEmit` clean; `eslint` clean on touched files.
- `bun scripts/verify_sme_wire_r0.ts`: 2,000/2,012 placed; per-course
  residual matches §4 exactly.
- Prebuild corpus validators (`verify_corpus_23a`, flashcard sync, CIE
  bundles) unchanged-green: the chain is read-only over the corpus.
- Preview spot-check: multi-set rows render expander-only and list every
  set; a notes-bridge-backfilled course shows sets under their sub-topics.
