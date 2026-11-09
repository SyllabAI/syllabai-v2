# ADR-039: SME selector — disclosed data-edits queue

| | |
|---|---|
| **Status** | Executed (r4 — placement 2,574/2,574 = 100%; §4 rows 1–13 executed r2, rows 14–17 executed r3, rows 18–20 executed r4) |
| **Date** | 2026-11-04 (r1) / 2026-11-04 (r2 execution) / 2026-11-05 (r3 check-again pass) / 2026-11-09 (r4 spine-cosmetics lane) |
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

### r3 — the check-again pass (2026-11-05): hub selector vs SME's own pages, re-derived at tip 170f981a

The selector-vs-SME alignment was re-checked from scratch at tip `170f981a`
(1,355 commits after the r2 verification), against the SME-ExamQuestion
reference manifests freshly re-read from syllabai-resources @ main (105
courses; 91 with topic trees + 14 honest-flat) and two live SME selection
pages fetched 2026-11-05 (cie-igcse-ict-21, cie-a-level-chemistry-25 — both
byte-consistent with the manifests: zero upstream drift). Findings:

- **Fidelity holds fleet-wide**: every hub set's (section, sub-topic) slug
  pair exists in the reference manifest (0 phantom homes across 2,574 sets);
  every manifest sub-topic has ≥1 hub set except `igcse-maths-b-16/past-papers`
  (20 session dirs — a content-class boundary: past papers live in the hub's
  separate past-papers plane, not the exam-questions selector).
- **The name-vs-home sweep** (every set with a stamped `:SUB` code, 195 sets,
  set-name vs destination-title token similarity + runtime home probe) found
  two defect families behind 5 low-similarity hits. The rest verified clean
  or belong to already-queued classes: igcse-geography-19's 19 hits are
  positional stamps whose SLOTS match SME's own sub-topic order (the spine's
  row LABELS are the defect — see the queue addition below);
  cie-igcse-biology-23 "Human Diet & Digestion"→SUB7.1 "Diet" and
  cie-igcse-business-23 "1.4 Types of Businesses"→SUB1.4 "Types of business
  organisation" are legitimate SME-vs-official title variance.

Executed edits (rows 14–17; per-set stamps and one node title, nothing else
moves — 5 diff lines across 3 files):

| # | Course | Set / node | Gap class | Edit of record → home |
|---|--------|------------|-----------|------------------------|
| 14 | cie-igcse-ict-21 | Communication (7-communication, 20 q) | truncated-title trap: spine SUB6.1 titled "Communication" (official 0417 heading: "Communication applications") captured the set by title-match into ICT applications | per-set stamp `…-T10-gen`: the questions are email / URLs / internet / spam / search engines = official topic 10 "Communication" (10.1 email, 10.2 internet); set name == the T10 topic title, no single sub-topic fits both → rung 1 |
| 15 | cie-igcse-ict-21 | spine node `…-T6:SUB6.1` | the truncation itself (rows 6.2–6.11 carry full official headings; 6.1 alone was clipped) | title edit → "Communication applications" — executed here as the root-cause guard so rung 5 can never re-capture a "Communication" set into ICT applications (blast radius verified: rung 5 is the only title consumer; no tests reference the node) |
| 16 | cie-igcse-chemistry-23 | Applications of Electrolysis, alternative-to-practical (1 q) | numbering collision: SME dir `4-2-applications-of-electrolysis` maps onto official SUB4.2 "Hydrogen–oxygen fuel cells" via the numbering rung, but the question is electroplating (steel-spoon silver plating) | per-set stamp `…-T4:SUB4.1` — corpus-proven precise home (spec points 4.1.6/4.1.7 are the electroplating points) → rung 1 |
| 17 | cie-igcse-chemistry-23 | Applications of Electrolysis MCQ (18 q) + theory (15 q) | same collision; these sets MIX fuel-cell (6 + 6 questions) and electroplating (10 + 9) content — SME publishes fuel cells as an "application of electrolysis", the official spine splits them across 4.1/4.2, so no single sub-topic home is honest | per-set stamps `…-T4-gen` (topic-level "General requirements" row under T4 Electrochemistry, rule (c) class; an honesty correction — the fuel-cells row was displaying majority-electroplating content) → rung 1 |

Related spine defect added to the queue by the r3 sweep (placement-neutral,
queued with the cosmetics class):

- **igcse-geography-19 (4GE1) spine sub-topic titles are sentence
  fragments** ("Description", "Physical processes", "Distinctive", "Some
  places are", "Countries"…) and T3 mis-parents a `SUB1.4` node — the
  Edexcel front-matter parse wreck, same family as the english-language
  TS1–TS14 wreck. The 19 sets' positional stamps sit in the CORRECT slots
  (they match SME's own sub-topic order `1-1`/`1-2`… from the manifest), so
  placement stands; the row labels are the queued defect.

### r4 — the spine-cosmetics lane (2026-11-09): chemistry T8/T19 titles + the synoptic setName

Wave 1's receipt queued the pre-existing chemistry cosmetics with this class; executed here (T-SME-SEL-COSM-1 run-001). Evidence of record: the official spec PDF itself, committed in the corpus — `Official-Specifications/ial-chemistry/International-A-Level-Chemistry-Spec.pdf` (Pearson Edexcel IAL Chemistry, Issue 1, September 2017) @ pin 1a5c37bc. All 20 official topic titles diffed against the spine: T8/T19 are the ONLY truncations, both cut exactly at the PDF's line wrap (the import kept the first printed line of each wrapped title).

| # | Course | Node / row | Defect | Edit of record |
|---|--------|-----------|--------|----------------|
| 18 | ial-chemistry-17 | spine `…-T8` TOPIC + `…-T8:SUB_` SUBTOPIC | title truncated: "Redox Chemistry and Groups 1, 2 and" (dropped " 7") | title edit → "Redox Chemistry and Groups 1, 2 and 7" (spec extraction line 1267; also the printed Unit 2 topic list, line 403) |
| 19 | ial-chemistry-17 | spine `…-T19` TOPIC + `…-T19:SUB_` SUBTOPIC | title truncated at the PDF line wrap: "Organic Nitrogen Compounds: Amines, Amides," | title edit → "Organic Nitrogen Compounds: Amines, Amides, Amino Acids and Proteins" (spec extraction lines 2616–2617) |
| 20 | ial-chemistry-17 | set `synoptic-exam-questions-section-c--exam-questions` | `setName` null — the only row of 72 without a kind label | `setName` → "Exam Questions" (the row's slug suffix `--exam-questions`; the 71-row kind law: "Multiple-Choice Questions" ×35 / "Structured Questions" ×36; SME's own per-topic set naming) |

- Edits are byte-disciplined (round-trip identity asserted, deep-diff exactly the 5 leaves, +54/+12 bytes); r3 row-15 precedent followed — the serving curriculum is the fix surface, the committed derivation-vintage spine `apps/hub/spines/ial-chemistry-17.json` stays byte-carried (disclosed).
- Derived-data reconcile (disclosed): `public/kg/data/ial-chemistry-17.json` was stale at its 2026-11-05 vintage — truncated labels AND the wave-1 SME picker layer never re-exported after 48540486 (wave-1's inventory missed the kg plane). Regenerated (kg_export.py v1.6); verified surgical: 344 AI concept-web pre edges byte-identical, prereqValidated untouched, exactly 4 shared nodes changed (label-only), +47 nodes = exactly the wave-1 SME layer, points/pointSubtopics/subPointCounts byte-identical. Queued (product question, own lane): whether the kg exporter should EXCLUDE selector-navigation rows from the spec graph.
- Receipt-of-record correction: wave 1's "T8 empty spec container" does NOT reproduce — `T8:SUB_` carries 28 spec points (8.1–8.28) and no chemistry container has zero (the 20 containers sum to 319 exact); the truncated-title half was real and is fixed above.

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
- r3 gates (2026-11-05, tip 170f981a + the three data files): `bun
  scripts/verify_sme_wire_r0.ts` — 2,574/2,574 placed, residual 0, gen-row
  homes 31 (unchanged by law: the r3 homes are rung-1 stamps with
  pre-created rows, and the gate counts only on-demand creations — the r2
  counting law); runtime home probes confirm the three r3 destinations
  (T10-gen / SUB4.1 / T4-gen); `verify_corpus_23a` and
  `validate_cie_bundles` PASS; tsc untouched (data-only edits — the
  sandbox's missing node_modules makes tsc vacuous here, disclosed).
- r4 gates (2026-11-09, tip edfd1e76 + two serving files + one derived
  file): NEW `apps/hub/scripts/verify_sme_cosmetics1.ts` PASS (the four
  restored titles == the official spec strings; no truncated title survives
  the serving corpus; spine 20/319 + the 7-row SME layer intact; the
  synoptic setName + the 3-value kind law across all 72 sets; the kg data
  carries the full titles, zero truncated labels and the 344-edge concept
  web). Regression: `verify_sme_wave1` PASS, `verify_sme_wave2` PASS,
  `verify_sme_wire_r0` PASS (2,574/2,574 placed, 0 unplaced, gen-row homes
  29 — unchanged: the title edits touch zero placement rungs, verified by
  the repo-wide grep showing no set name or note title equals the old
  truncated strings); `tsc --noEmit` clean; eslint clean (scripts/
  ignore-listed per config).
