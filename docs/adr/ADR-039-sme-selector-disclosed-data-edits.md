# ADR-039: SME selector — disclosed data-edits queue

| | |
|---|---|
| **Status** | Executed (r2 — the §4 queue is empty of record; placement 2,574/2,574 = 100%) |
| **Date** | 2026-11-04 (r1) / 2026-11-04 (r2 execution) |
| **Deciders** | SME selector lane (T-SME-SEL), operator-directed |
| **Basis** | SME selector blast-radius audit (81 SME courses / 2,012 sets / 34,940 questions; defect classes D0–D9); `apps/hub/src/lib/spec-tree.ts` (production anchoring); `SME-ExamQuestion` reference manifests (syllabai-resources @ main); ADR-039 principle: **the pipeline improves; provenance discloses** — no silent data surgery |

## 1. The decision

The SME selector organizes the Learning Hub's exam-questions plane the way
SaveMyExams does (topic tree → sub-topic rows → sets), while every set stays
anchored to the official specification. The blast-radius audit showed 450 sets
(6,565 questions, 37 courses) with NO machine-derivable home under the two
production paths (corpus-native `topicSlug` + spec-anchor tally): D0
unanchored. Two defect classes were product-side fixes; the rest needed data
edits and were QUEUED here, disclosed — never silently worked around:

- **D0 (product fix, this ADR §2)** — unanchored sets: resolved by extending
  the anchoring chain with corpus-derived ladders, NOT by editing the corpus.
- **D3 (product fix, this ADR §2)** — multi-set rows deep-linked to the first
  set in corpus order (first-write-wins), hiding every other set behind a row
  whose count promised all of them (233 rows / 8,345 questions).
- **D1/D4–D9 (data lane)** — mishomed sets, generic rows, rowless sub-topics,
  topic skew, contested anchors, truncated titles, `SUB_` placeholder codes:
  executed as the r2 data lane (§4); the enumerated workbook
  (`download/sme-selector-blast-radius-audit.xlsx`) remains the audit source.

## 2. The wired anchoring chain (product side)

`subtopicOfQuestionSet(topic, index, notes?)` resolves a set's home in a fixed
priority, every rung corpus-derived, first hit wins:

1. importer/backfill-resolved `subtopicCode`, then corpus-native `topicSlug`
2. spec-anchor tally (majority vote over anchored parts)
3. **notes-bridge** — sets key by the SAME SME topic slugs the notes carry
   (`noteSlugBridge`, memoized per index): a note carrying the slug anchors
   corpus-natively, so the set inherits that placement
4. **numbering backfill** — SME slug numbering ("1-2-…") matching the one
   sme-native sub-topic numbered "SUB1.2"
5. **unique title match** — normalized set name == sub-topic title, only
   candidate (the synthetic `-gen` rows never match)
6. **topic-level home** (`topicHomeOfSet`: section number → topic CODE number,
   corpus position, stopword-folded unique token containment, single-topic
   spine, the frozen SME section map `src/lib/sme-section-map.ts`) landing on
   the topic's **"General requirements" row** (`ensureTopicGenRow`, the
   `buildSpecTreeIndex` orphan-spec shape) — NEVER the topic's first sub-topic
   row (that would fabricate D3 rows). Resolves 141 further sets (fresh gen
   rows).
7. **corpus-stamped topic-level code** (r2) — a `<topicCode>-gen`
   `subtopicCode` the D0 tag-backfill wrote into the corpus, honored ONLY
   after every mechanical rung missed: a set that self-anchors keeps its
   precise sub-topic home; the stamp is the last-resort honest home, never a
   demotion.

**2,574 of 2,574 sets placed (100%)** after the r2 data lane (§4): 2,561 by
the r2 wiring on the current corpus, 12 by the lane, and 1 (row 12) by the
gate-parity correction below. Teacher surfaces (question-bank, assemble,
validation-queue, class-sim, test-assembly — and, from r2, class-geography)
share the same chain with `bundle.notes`, so placement is identical
everywhere.

**Gate-parity correction (r2, disclosed):** the r0/r1 verification gate built
its index WITHOUT the `generalTopics` option, so it was stricter than the
production chain: the 93 corpus-stamped `-gen` sets (r0 tag-backfill) resolve
at production rung 1 (their gen rows are pre-created by
`generalTopicsOfQuestionTopics` — this is what the merged wiring's spot-checks
verified: gen rows 93/71/47/47 on maths-25-extended), while the old gate
re-derived them via anchors or counted them unplaced. The gate now mirrors
`courses.ts` exactly; the r1 "13 unplaced" figure therefore carried one
gate artifact (row 12, already placed in production) — the honest runtime
residual before the lane was 12.

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
counterpart; resolved as SME section rows by the r2 lane, §4 rows 6–8).

## 4. Disclosed data-edits queue — EXECUTED (r2)

The 13 rows the wired chain could not place (12 at the r0 base, +1 on the
current corpus), each with the mechanical reason and THE EDIT OF RECORD that
resolved it. Every edit is additive or a per-set stamp; no existing corpus
byte was altered; every new node is `RULE_DERIVED` with its class named in
the title or code so the UI discloses what it is.

| # | Course | Set (section) | Gap class | Edit of record → home |
|---|--------|---------------|-----------|------------------------|
| 1 | cie-igcse-computer-science-23 | SQL (9. Databases) | parsed spine missing topics T7/T9/T10 (0478) — set's section number has no topic | spine restored: official topics T7 "Algorithm design and problem solving", T9 "Databases", T10 "Boolean logic" added (structure-level; spec-point parse for the three topics queued separately) → `…-T9-gen` via rule (a) |
| 2 | cie-igcse-english-language-20 | Paper 1: Reading (Paper 1: Reading) | paper-level SME structure vs topic-level spine — needs a paper row | paper rows `…-TP1` "Paper 1: Reading" / `…-TP2` "Paper 2: Writing" (the SME-published labels of the official 0500 components; the TS1–TS14 front-matter parse wreck is pre-existing, disclosed, untouched) → `…-TP1-gen` via rule (c) |
| 3 | cie-igcse-geography-25 | Causes & Impacts of Climate Change (Climate Change) | SME theme sections absent from the 0460 spine (T1–T3 only) | SME section row `…-SME-CLIMATE-CHANGE` "Climate change (SME section)" → `…-gen` via rule (c) |
| 4 | cie-igcse-geography-25 | Fieldwork (Geographical Skills) | same — skills/themes not in spine | SME section row `…-SME-GEOGRAPHICAL-SKILLS` "Geographical skills (SME section)" → `…-gen` via rule (c) |
| 5 | cie-igcse-geography-25 | Images & GIS (Geographical Skills) | same | shares row 4's home (same SME section) |
| 6 | cie-igcse-maths-international-maths-23-core | Investigations (Investigations) | SME-only section — no official counterpart (map row honestly null) | SME section row `…-TC-SME-INVESTIGATIONS` "Investigations (SME section)" → `…-gen` via rule (c) |
| 7 | cie-igcse-maths-international-maths-23-extended | Investigations (Investigations & Modelling) | same | SME section row `…-TE-SME-INVESTIGATIONS-MODELLING` → `…-gen` via rule (c) |
| 8 | cie-igcse-maths-international-maths-23-extended | Modelling (Investigations & Modelling) | same | shares row 7's home (same SME section) |
| 9 | cie-igcse-religious-studies-23 | Christianity & Social Action (Christianity) | spine's variant-structure (T*/TI*/TJ*) vs SME paper structure — Christianity family not addressable | per-set stamp `subtopicCode = …-TC6-gen` (C = Christianity variant, proven by the corpus's own C1.x spec-point codes and the 5 sibling sets' bridge placements; "Social Action" ↔ TC6 "Religion and social action") → rung 7 |
| 10 | cie-igcse-religious-studies-23 | Christianity: Religion & Family Life (Christianity) | same | per-set stamp `…-TC5-gen` ("Family Life" ↔ TC5 "Rites of passage; religion and the family") → rung 7 |
| 11 | cie-igcse-science-combined-science-23-biology | Drugs in Medicine (13. Drugs) | SME global section numbering (full double-award syllabus) vs biology-only spine slice; zero corpus anchors; no drugs content anywhere in the 0653 slice | SME section row `…-SME-DRUGS` "Drugs (SME section 13)" (the global number kept in the title — it IS the SME numbering) → `…-gen` via rule (c) |
| 12 | cie-igcse-science-combined-science-23-biology | Human Impact: Biodiversity, Pollution & Conservation (16. Human Influences on Ecosystems) | SME global section numbering — but the corpus ALREADY stamps `…-TB12-gen` | **no data edit**: r2 gate-parity correction + rung 7 honor the corpus's own stamp → `…-TB12-gen` (was already the production home since the #714 merge) |
| 13 | ial-biology-18 | Synoptic Exam Questions (Section C) (Synoptic Assessment) | SME-only paper-structure section — no official counterpart | SME section row `ial-biology-SME-SYNOPTIC-ASSESSMENT` "Synoptic Assessment (SME section)" → `…-gen` via rule (c) |

Related spine defects found while re-deriving — reviewed in r2, LEFT in
place, still queued (each is placement-neutral today; fixing titles is
cosmetic tree surgery with its own matching risk, so it waits for a
dedicated spine-cosmetics pass):

- **RS-23 18-topic spine**: three paper variants (T*/TI*/TJ*) each repeat
  Worship…Religion and social action — titles not disambiguated per variant.
  (r2: the two unplaced Christianity sets resolved via variant stamps; the
  title disambiguation itself remains queued.)
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
- After wiring (r1): 450 → 12 unplaced sets at the r0 base (2,012 sets),
  re-derived on the current corpus (post wave-9 / maths-tranche landing,
  2,574 sets) as 13 unplaced — the one addition being ial-biology-18's
  Synoptic section, same SME-only-no-counterpart class.
- After the r2 lane (this ADR): **0 unplaced** — 12 resolved by the edits
  above, 1 (row 12) by the gate-parity correction. The per-set row list
  above remains the inventory of record for what was edited and why.

## 5. Verification gates

- `bun x tsc --noEmit` clean; `eslint` clean on touched files (r2: spec-tree
  rung 7, class-geography parity, verify-gate parity).
- `bun scripts/verify_sme_wire_r0.ts`: **2,574/2,574 placed (100%);
  residual 0** — §4 empty of record. Gen-row home count shifts 48 → 34 as a
  COUNTING artifact of the same parity fix (the 93 stamped sets' gen rows
  are now pre-created at index build, so they are no longer counted as
  on-demand creations; placements unchanged).
- Prebuild corpus validators unchanged-green: `verify_corpus_23a` (pollution
  + dangling refs), `verify_flashcard_sync_courses`, `validate_cie_bundles`,
  `validate_gradeb_bundle` — the lane's edits are additive nodes/edges and
  two per-set stamps; no existing byte altered.
- Production spot-check of record (2026-11-04, agent-browser, against the
  #714 production deployment): maths-25-extended — topic-level backfills land
  on "General requirements" rows with exact arithmetic (TE1-gen 93 =
  38+10+20+25; TE2-gen 71; TE3-gen 47; TE4-gen 47), multi-set rows open the
  grouped `?subtopic=` view holding every set (48+49=97); chemistry-19 —
  the audit's worst D3 row (45 sets / 426q behind one link) is gone: 28 sets
  / 524q, every row a single honest target, counts sum exactly. (The r2
  lane's own post-deploy spot-check: see the worklog receipt of record.)
