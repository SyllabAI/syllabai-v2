# T-SPEC-AUDIT-1 r0 — all 106 specification trees audited + render-layer fix

Operator order (trace `1a181a3e7f63f0fd`): "Now go through all of the 'Specification Tree' of all the courses. Check if they render properly and beautifully. Check if they have any parsing or formatting error. Then fix everything."

## Method

- **Data audit** (`scripts/audit_spec_trees.py` + `char_census.py`, run against origin/main `515edc81`): every curriculum.json node (15,832 title/description fields) replicated through `buildSpecTreeIndex` + the specification page render path; structural checks (subject count, family validity, dup codes, broken parents, invisible nodes, badge truth, multi-anchor, applicability sanity, manifest pin law) + text-artifact census.
- **Live audit** (`scripts/audit_spec_live.py`): all 106 `/courses/<slug>/specification` pages fetched (cache-busted), badge count vs computed count, error markers, honest-card presence.

## Results — the trees are structurally SOUND

- **106/106 live pages: HTTP 200, zero error markers, zero real defects.** 49 applicability-bearing courses render the filter card with badge == computed count (4,292 spec points total); 57 applicability-less courses render the honest "not derived yet" card. No dup codes, no broken parents, no invisible nodes, no badge lies, no empty titles, no pin-law violations anywhere in the corpus.
- **Defects found = parse-extraction artifacts surfacing in rendered text** + one header-copy defect. Rendered verbatim, these print as control-char junk and tofu (missing-glyph) boxes.

## Defect census (data plane, all classes evidence-checked)

| Class | n | Courses | Evidence / disposition |
|---|---|---|---|
| U+0007 (BEL) bullet scatter | 1,207 | 21 | pure PDF bullet decoration — stripped at render |
| PUA U+F084 → ≤ | 14 | ial-maths | 14/14 unanimous context ("F ≤ μR", "0 ≤ e ≤ 1", "n ≤ 3") |
| PUA U+F085 → ≥ | 3 | ial-maths | 3/3 context ("px² + qx + r ≥ 0") |
| PUA U+F083 → ≥ | 1 | igcse-maths-a | the >, <, ≥, ≤ symbol quartet |
| PUA U+F061 → ↦ | 3 | igcse-maths | 3/3 context ("f : x ↦ …") |
| PUA U+F8EB–F8F8 → ( ) | 78 | ial-maths/further-maths | Adobe large-paren piece glyphs |
| PUA U+F0FC → ✓ | 22 | igcse-geography-19 | Wingdings tick |
| PUA U+F075/F072 stripped | 20 | ial-maths-20-pure-4 | orphaned vector-arrow decorations (letters already lost to layout scatter; context verified to read correctly) |
| PUA U+F026 → derivative dots | 3 | ial-mechanics-2 | "ṙ / r̈" scatter → combining dot above / double dot |
| U+00AD soft hyphen | 2 | cie-maths pure-1 | line-break hyphenation artifact |
| stray backtick | 1 | cie-further-maths-25 | accent artifact |
| `"| x |"` modulus padding | 24 | 9 maths courses | all 83 corpus pipes are modulus bars; guarded against conditional-probability bars ("P(B \| A)" passes verbatim) |
| multi-space / edge-space / NBSP | scattered | — | extraction spacing scatter |
| **`**` footnote markers** | 2 | igcse-accounting-17 | KEPT — printed footnote reference, verbatim law |
| **unbalanced brackets ~51, chem subscript loss (PC l ← PCl₅), matrix/column scatter** | — | ~23 | **NOT fixed — deep parse class**; requires eyes-on vs printed evidence (the PR #423 4MB1 symbol-loss precedent); text-join fingerprints in resources maps/sidecars forbid blind corpus edits |

## The fix (render-layer, corpus untouched)

Corpus stays **spine-verbatim byte-exact** (importSource pin law; resources-side maps/sidecars join on pool wording verbatim — mass text repair is an operator-gated resources lane). The fix is a presentation pass:

- **NEW `apps/hub/src/lib/spec-text.ts`** — `normalizeSpecText()`: the evidenced mapping table above (idempotent; verified 15,832/15,832 fields artifact-free + idempotent; conditional-probability bars verbatim; modulus pairs compacted).
- **`spec-tree.ts`** — topic/subtopic/subject titles normalized at index build (spec page + sidebar tree).
- **`specification/page.tsx`** — statement text normalized; header copy fixed: "Every N specification statement … exactly as Pearson assesses them" (grammar error, board-wrong for the 56 CIE courses, hollow on the 57 applicability-less courses) → "All N specification statements from the official <board> specification, as printed" + the filter sentence only where applicability exists.

## Verification

- `tsc --noEmit` 0 errors; `verify:corpus` PASS; `verify:flashcard-sync` PASS; `verify:cie` PASS; full `bun run build` GREEN (1637/1637 static, 106 spec pages prerendered).
- Prerendered-HTML probes 10/10: new copy (CIE + Pearson variants), old copy absent, BEL absent, ≤/≥/✓/( )/|x| present, conditional probability verbatim, modulus compact.
- Footprint: 3 source files only (13 insertions, 5 deletions + new module). Zero content/ changes.
