# Book Pack Spec — files, blocks, glossary, lint law

> The exact formats an authoring agent must produce. Everything here is
> enforced by CI lint where possible; the rest is review-checkable. Schema
> authority: `packages/contracts/src/books.ts` (zod) — this doc is the
> human-facing projection, the contract is the law.

## 1. Authoring workspace layout (L2, this repo)

```text
books/<qual>/                          # e.g. books/4ch1/
├── README.md                          # book charter: spine table, status, phase plan
├── meta/
│   └── book.yaml                      # machine config (see §2)
├── packs/
│   ├── c01-states-and-solutions/
│   │   ├── pack.yaml                  # S0 output: block plan + metadata
│   │   └── blocks/
│   │       ├── b01-callout-ms-vocab.json
│   │       ├── b02-eq-builder-half-equations.json
│   │       └── ...
│   └── strength-u1/                   # unit-closing Strength Check pack
│       ├── pack.yaml
│       └── blocks/b01-mcq-embed.json
├── glossary/
│   └── bonding.yaml                   # terms per topic cluster
└── qa/
    ├── findings.jsonl                 # append-only defect ledger (SELF-IMPROVEMENT)
    └── metrics.json                   # regenerated per phase by book-publisher
```

Naming: packs `c<NN>-<slug>` matching the spine's chapter order; blocks
`b<NN>-<type>-<slug>.json`; one block per file (diff-clean reviews, stable
receipt anchors).

## 2. `meta/book.yaml` (machine config)

Required keys: `qual`, `board`, `course_slug` (hub course, e.g.
`igcse-chemistry-19`), `book_of_record` (L1 PDF path + sha256), `parse_of_record`
(L1 chunks path + sha256), `spine` (chapter list with `chapter_key`, title,
page range, `paper_route` flags, specCodes count), `block_allowlist` (the
frozen types this book may use), `phases` (chapter → phase mapping),
`lint_pack` (subject lint bundle id), `doctrine_refs`. Copy the shape from
`books/4ch1/meta/book.yaml`. CI lint validates the file exists and its
`block_allowlist` ⊆ contracts' known types.

## 3. Block common fields (`book.block/1`)

Every block, regardless of type, carries:

| Field | Type | Rule |
|---|---|---|
| `id` | string | `<pack>/b<NN>` — unique within book |
| `type` | enum | one of the 11 (see §4) |
| `chapter_key` | string | `u<unit>:c<NN>` — must exist in `book_chapters` |
| `ord` | int | rail order; monotonic within pack |
| `pdf_page_anchor` | int? | page number in the PDF of record; monotonic within pack |
| `specRefs` | string[] | official spec point codes; **must ⊆ the chapter's join set** |
| `glossaryRefs` | string[] | glossary slugs; must resolve in `books/<qual>/glossary/` |
| `checkRefs` | string[]? | question-bank ids (G3/G4 only for `mcq-embed`); must resolve |
| `status` | enum | `draft → reviewed → published` (flip is per-pack, publisher-only) |
| `version` | int | bumped on every content change |

## 4. The 11 block types (frozen for the pilot)

| Type | Payload essence | Notes / binding lint |
|---|---|---|
| `prose` | short authored framing text (≤120 words), never book-prose duplicates | G2 banned-phrase lint applies |
| `figure` | pointer card to a page-true figure region (bbox sidecar at ingest) | anchor must resolve; no re-extracted image files in this repo |
| `callout` | examiner-language note: mark-scheme vocabulary, accept/avoid phrasing | G4 checks command-word fidelity; the flagship type |
| `mcq-embed` | check-yourself: `checkRefs` only — no authored question text | empty `checkRefs` = lint fail |
| `sort-match` | ordering/matching pairs authored against chapter vocabulary | both sides resolve to glossary/specRefs |
| `drag-label` | label-pack diagram labeling (chem: dot-and-cross, apparatus) | label packs subject-specific, lint-owned |
| `table-fill` | fill-in table (chem: test → observation → ion) | cells validated against `ms_accepts` where applicable |
| `num-stepper` | stepwise numeric walkthrough with unit + sig-fig validation (chem: mole ladder, Q=mcΔT) | steps monotonic; units checked |
| `eq-builder` | equation/ionic-equation builder with balance + state + charge validation (chem: half-equations) | chem carrier; validation rules in lint pack |
| `sim-embed` | PhET sim iframe (CC-BY 4.0): sim id, poster, fallback link, attribution in-card | sandboxed; CSP fallback mandatory; only PhET in pilot |
| `media-embed` | poster + link card (video/3D/animation) | ships only if curated assets pass licensing; else honest-empty and hidden |

Adding a 12th type, or changing a payload shape: **ADR first** (ADR-0xx draft
in PLAN-4CH1 §10 is the precedent style).

## 5. Glossary card format (`glossary/<topic>.yaml`)

```yaml
- term: "electrostatic attraction"
  slug: electrostatic-attraction
  definition: "…"            # ≤40 words, examiner-safe wording
  ms_accepts: ["electrostatic(al) attraction between ions and delocalised electrons"]
  ms_avoids: ["free electrons", "sea of electrons (unqualified)"]
  aliases: ["electrostatic forces"]
  source: "seed:chunks_v3#glossary:p417"   # provenance into L1
```

`ms_accepts` / `ms_avoids` are the mark-scheme language layer — the reason the
glossary exists (the book's 21 glossary chunks seed it; the authored accept/
avoid lines are the value-add). Slugs are lint-checked: every `glossaryRefs`
entry in a pack must resolve here.

## 6. Lint law (what CI runs, per pack)

1. **Binding**: chapter_key exists; specRefs ⊆ chapter join set; page anchors
   monotonic; checkRefs resolve in bank; glossary slugs resolve; no orphan
   packs (pack without spine row).
2. **Schema**: `book.block/1` zod, strict.
3. **Language**: per-subject banned-phrase list (chem: "free electrons" in
   bonding prose, imprecise salt/rate phrasing); KaTeX/Unicode residue lint
   (state-symbol `(l)` OCR artifacts, `Aᵣ` subscript loss patterns).
4. **Licensing**: no book-question text re-served; sim-embed only PhET allowlist;
   media-embed requires a licensing row in `meta` or fails.
5. **Honest-empty**: a pack with zero renderable blocks must not exist (delete
   the pack instead; viewer degrades honestly).

Lint bundles live per subject (`lint_pack: chem@1.0.0` in book.yaml); adding a
phrase to a banned list is a normal PR; removing one requires a finding
reference showing why the ban was wrong (SELF-IMPROVEMENT flow).
