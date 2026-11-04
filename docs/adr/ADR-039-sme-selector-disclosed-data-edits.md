# ADR-039: SME selector — disclosed data-edits queue

| | |
|---|---|
| **Status** | Accepted (r1 — residual re-derived on the current corpus) |
| **Date** | 2026-11-04 |
| **Deciders** | SME selector lane (T-SME-SEL), operator-directed |
| **Basis** | SME selector blast-radius audit (81 SME courses / 2,012 sets / 34,940 questions; defect classes D0–D9); `apps/hub/src/lib/spec-tree.ts` (production anchoring); `SME-ExamQuestion` reference manifests (syllabai-resources @ main); ADR-039 principle: **the pipeline improves; provenance discloses** — no silent data surgery |

## 1. The decision

The SME selector organizes the Learning Hub's exam-questions plane the way
SaveMyExams does (topic tree → sub-topic rows → sets), while every set stays
anchored to the official specification. The blast-radius audit showed 450 sets
(6,565 questions, 37 courses) with NO machine-derivable home under the two
production paths (corpus-native `topicSlug` + spec-anchor tally): D0
unanchored. Two defect classes were product-side fixes; the rest need data
edits and are QUEUED here, disclosed — never silently worked around:

- **D0 (product fix, this ADR §2)** — unanchored sets: resolved by extending
  the anchoring chain with corpus-derived ladders, NOT by editing the corpus.
- **D3 (product fix, this ADR §2)** — multi-set rows deep-linked to the first
  set in corpus order (first-write-wins), hiding every other set behind a row
  whose count promised all of them (233 rows / 8,345 questions).
- **D1/D4–D9 (data lane, queued)** — mishomed sets, generic rows, rowless
  sub-topics, topic skew, contested anchors, truncated titles, `SUB_`
  placeholder codes: all remain data-side work, enumerated by the audit
  workbook (`download/sme-selector-blast-radius-audit.xlsx`).

## 2. The wired anchoring chain (product side, zero corpus edits)

`subtopicOfQuestionSet(topic, index, notes?)` resolves a set's home in a fixed
priority, every rung corpus-derived, first hit wins:

1. importer/backfill-resolved `subtopicCode`, then corpus-native `topicSlug`
2. spec-anchor tally (majority vote over anchored parts)
3. **notes-bridge** — sets key by the SAME SME topic slugs the notes carry
   (`noteSlugBridge`, memoized per index): a note carrying the slug anchors
   corpus-natively, so the set inherits that placement
4. **numbering backfill** — SME slug numbering ("1-2-…") matching the one
   sme-native sub-topic numbered "SUB1.2" (unique only)
5. **unique title match** — normalized set name == sub-topic title, only
   candidate (the synthetic `-gen` rows never match)
6. **topic-level home** (`topicHomeOfSet`: section number → topic CODE number,
   corpus position, stopword-folded unique token containment, single-topic
   spine, the frozen SME section map `src/lib/sme-section-map.ts`) landing on
   the topic's **"General requirements" row** (`ensureTopicGenRow`, the
   `buildSpecTreeIndex` orphan-spec shape) — NEVER the topic's first sub-topic
   row (that would fabricate D3 rows). Resolves 141 further sets (fresh gen
   rows).

**2,561 of 2,574 sets placed (99.5%); 13 unplaced** (§4; at the r0 base:
2,000/2,012, 12 unplaced — corpus grew, the chain held). Teacher surfaces
(question-bank, assemble, validation-queue, class-sim, test-assembly) share
the same chain with `bundle.notes`, so placement is identical everywhere.

The D3 row-link policy (courses.ts + topic-tree.tsx, shipped on main): a
sub-topic row shows the sub-topic's AGGREGATE question count, so the row's
target must hold every counted question — single-set rows deep-link to their
set, multi-set rows land on the grouped bank view (`?subtopic=`), and the
tree lists every set under the row. The audit's 233 D3 rows stop mislinking.

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

The 13 sets the wired chain still cannot place (12 at the r0 base, +1 on the
current corpus), with the mechanical reason — these need DATA-side fixes and
are queued here, not silently worked around:

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
| 13 | ial-biology-18 | Synoptic Exam Questions (Section C) (Synoptic Assessment) | SME-only paper-structure section — no official counterpart (r0 base 2,012 sets predates this set's landing; re-derived on the current corpus, same gap class as #6–8) |

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
- After wiring (this ADR): 450 → 12 unplaced sets at the r0 base (2,012
  sets), re-derived on the current corpus (post wave-9 / maths-tranche
  landing, 2,574 sets) as 13 unplaced — the one addition being
  ial-biology-18's Synoptic section, same SME-only-no-counterpart class. The
  manual-homes tranche's per-row artifact was lost to a workspace recycle,
  so the enumerated 13-row list above is the re-derived inventory of record:
  per-set rows; the Investigations family and the combined-science numbering
  divergence can each be read as one section-level gap or per set. Any
  future data lane works from THIS list, not from the recalled count.

## 5. Verification gates

- `bun x tsc --noEmit` clean; `eslint` clean on touched files.
- `bun scripts/verify_sme_wire_r0.ts`: 2,561/2,574 placed (99.5%);
  per-course residual matches §4 exactly (13 rows).
- Prebuild corpus validators (`verify_corpus_23a`, flashcard sync, CIE
  bundles) unchanged-green: the chain is read-only over the corpus.
- Preview spot-check of record (2026-11-04, production build, agent-browser;
  re-run against the public preview after deploy): maths-25-extended —
  topic-level backfills land on "General requirements" rows with exact
  arithmetic (TE1-gen 93 = 38+10+20+25; TE2-gen 71; TE3-gen 47), multi-set
  rows open the grouped `?subtopic=` view holding every set (48+49=97);
  chemistry-19 — the audit's worst D3 row (45 sets / 426q behind one link)
  is gone: 28 sets / 524q, every row a single honest target, counts sum
  exactly.
