# SME selector D0 corpus-bridge ladders — of record (2026-11-04)

Lane: spec-blast follow-up (`T-SME-D0D3-SELECTOR`). Companion to the 2026-10
cross-course map-vs-resolution blast audit (then: 81 SME courses · 2,012 sets ·
34,940q; D0 = 450 sets / 6,565q with no machine-derivable home).

This change is **product-side only**: zero content surgery, zero DB writes.
Per ADR-039 — the pipeline improves; the provenance discloses what it cannot
yet resolve.

## 0. Upstream composition (found at port time)

origin/main had moved ~1,128 commits since the audit's snapshot, carrying two
lanes this one composes with — both kept verbatim:

- **D0 tag backfill (data-side)**: sets may carry an importer/backfill
  `subtopicCode` stamp (125 SME sets at census; `<topicCode>-gen` for
  topic-level placements, `-gen` rows opt-in via `generalTopicsOfQuestionTopics`).
  The stamp wins placement when it validates against the tree; stale codes
  fail closed into the derivation. The ladders below slot AFTER the stamp —
  they only fire for sets the backfill did not (or could not) stamp.
- **D3 row-link policy (shipped)**: multi-set rows target the grouped bank
  view `?subtopic=<code>` (deterministic in set count, not corpus order) so a
  row's aggregate count is always honoured. A draft default-open expander
  variant of this policy built in-lane was DROPPED in favour of the shipped
  grouped-view law.

## 1. What shipped

### 1.1 D0 corpus-bridge ladders — `subtopicOfQuestionSet` (src/lib/spec-tree.ts)

After the existing paths (stamped `subtopicCode`, `topicSlug`, spec-anchor
tally), unanchored sets resolve through deterministic, corpus-derived ladders —
first hit wins (corpus of record: 90 SME courses · 2,574 sets · 43,232q):

| Rung | Mechanism | Sets | Questions |
| --- | --- | ---: | ---: |
| L3 | notes-bridge: `relatedNoteIds` → the note's anchored sub-topic | 117 | 2,016 |
| L4 | notes-bridge: `topicSlug` via the note-slug bridge | 39 | 127 |
| L8 | section join: SME section ↔ topic title tokens (exact token-set equality, else strictly-unique max overlap) → that topic's first sub-topic row | 87 | 1,137 |
| L8b | section join: SME section ↔ sub-topic title token-set EXACT equality, unique only | 29 | 922 |
| **Σ** | **backfilled** | **272** | **4,202** |

(L5 topicSlug-numbering / L6 name-numbering / L7 title-join are wired and
live but place 0 sets on today's corpus — the upstream stamp backfill already
absorbed exactly those easy cases; the rungs stay as pipeline law for future
imports.)

Design laws:

- Nothing is guessed: every rung joins corpus strings the importer captured
  verbatim (notes linkage, SME numbering, set/section titles) against the
  curriculum map. Uniqueness is mandatory on every join; ties fail closed.
- L8b is exact-equality-only on purpose: max-overlap scoring at sub-topic
  level MIS-HOMES ("Compression" → "Manage files effectively"; "Audience &
  Purpose" → "Communication … email"). An inexact section names no sub-topic —
  that is a map gap (§3), not a ladder case.
- Token folding: the conjunction "and" is folded so SME's "&" matches the
  map's "and" ("Forces & Equilibrium" ↔ "Forces and equilibrium"); the
  section's number prefix ("2.") is stripped because SME's site numbering does
  not align with the map import's numbering.
- Memoized per index (WeakMap) — build-time cost is O(course), cached.
- Signature stays backward-compatible (`notes?` optional); all six call sites
  (hub aggregation, resourceCounts, assemble, validation-queue, question-bank
  ×2, class-sim, test-assembly) now pass the course's notes so every surface
  agrees on a set's home.

### 1.2 Numbers of record (corpus @ origin/main 74099915)

- Pre-ladder unanchored (no stamp, no topicSlug, no spec anchors):
  **319 sets / 4,993q**.
- Ladders place **272 sets / 4,202q** → every one lands on a real sub-topic
  row of the canonical spec tree.
- Residual: **47 sets / 791q = 1.83% of SME questions** (was 450 / 6,565 =
  18.8% at the audit snapshot; the corpus itself grew +562 sets in between).

## 2. Verification of record

- Parity gate: `bun run apps/hub/scripts/verify_sme_d0_parity.ts` — the REAL
  TS placement over all 90 SME course bundles vs the python derivation of
  record: **per-set home equality on 2,574/2,574 sets**; placed 2,527 /
  42,441q; residual 47 / 791q; every home resolves to a tree row; 0
  violations. (The gate caught and corrected two mirror defects: python's
  unordered per-question set iteration scrambles spec-tally tie-breaks vs the
  TS insertion-ordered Set — production truth is the TS; and one upstream
  duplicate slug, CS-19 "algorithms" ×2 under one slug, needs per-occurrence
  expectation rows.)
- `tsc --noEmit` (apps/hub): 0 errors from the lane (one pre-existing
  upstream-local `jsdom` resolution error in a pastpapers harness file
  reproduces on the clean base — environmental, unrelated).
- eslint: 0 errors on all touched files.
- Full build green: corpus-static (1,437 entries) + `next build` + standalone
  assembly, exit 0 (run stepwise — the sandbox's 10-min command ceiling kills
  the single script; every step exits 0).

## 3. ADR-039 register — the 10 map-gaps queued as data-side disclosed edits

The 47 sets / 791q the ladders cannot place are not forced. Each class is a
gap between SME's site structure and the committed curriculum map; the fix is
a data-side edit (map import / sidecar), queued — not scheduled — under
ADR-039's disclose-while-improving posture.

| # | Gap (root cause) | Sets | Q | Disclosed edit |
| --- | --- | ---: | ---: | --- |
| 1 | A-Level + AS maths component lanes (pure-1/2/3, P1, P2): SME paper sections sit BETWEEN the map's single topic and its sub-topics ("Algebra & Functions" spans Quadratics+Functions; "Logarithms & Exponentials", "Numerical Methods", "Data Presentation & Interpretation", "Statistical Distributions", "Statistical Sampling & Estimation" have no token-matching sub-topic) | 22 | 619 | per-component SME-section → sub-topic sidecar at map import |
| 2 | Non-spec toolkit/skills/synoptic units with no official-spec home: Mechanics Toolkit ("Quantities, Units & Modelling" ×2 lanes), Investigations/Modelling (intl. maths 23), Geographical Skills (Fieldwork, Images & GIS), ial-biology-18 "Synoptic Assessment" | 8 | 99 | synthetic "general/tools" row per map, or explicit no-home disclosure |
| 3 | igcse-computer-science-23: map lacks SME sections 7 (Algorithm design & problem-solving) and 9 (Databases) | 3 | 12 | map re-import with the missing topics |
| 4 | igcse-english-language-25 (2027): map import is placeholder-grade — `SUB_` codes and truncated titles ("specimen papers)", "Level Marks Description"); the course's rows ride placeholder codes | (0 — resolved rows are placeholder-grade) | — | map re-import before any deeper wiring |
| 5 | igcse-english-language-20 (2017): paper-structured; map lacks paper topics (EL-25's map has them) | 1 | 4 | map: paper-structure topics |
| 6 | igcse-english-literature-21: set names are literary texts ("I'm the King of the Castle", "Pride and Prejudice", …) under assessment sections (Poetry & Prose / Drama / Unseen) the map doesn't carry | 5 | 26 | map: assessment-structure topics or text sidecar |
| 7 | igcse-geography-25 (2027): SME "Climate Change" unit beyond the 2026 map | 1 | 15 | map refresh to the 2027 syllabus |
| 8 | igcse-ict-21: skill-area sections (Managing files & compression, Working with documents, Presentations) beyond the topic-numbered map | 3 | 9 | map: skill-area cross-reference sidecar |
| 9 | igcse-religious-studies-23: SME's religion selector (Christianity / Islam / Judaism) sits above the map's per-religion strand structure (TC/TI/TJ); section "Christianity" names no single topic | 2 | 4 | map: strand aliases (section ↔ strand prefix) |
| 10 | igcse-combined-science-23: SME section titles diverge from map topic titles ("Chemical Energetics" vs "Energy changes in chemical reactions"; "Drugs" numbering) | 2 | 3 | map title alignment at import |

**Unplaced total: 47 sets / 791q.** Corpus-quality note (adjacent, not a map
gap): cie-a-level-computer-science-19 carries one duplicate set slug
("algorithms--exam-questions" ×2 — a re-scrape residue; the placement law
handles it deterministically, the parity gate keys per-occurrence).
