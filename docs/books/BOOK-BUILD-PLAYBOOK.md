# Book Build Playbook — the repeatable pipeline (any subject)

> The procedure for producing an interactive book's authoring layer (L2) from
> a corpus (L1). Subject-agnostic by design: subject-specific facts live in
> `books/<qual>/meta/book.yaml` and per-subject lint packs, never here.
> Read `BOOKS-START-HERE.md` first. Binding.

## Pipeline overview

```text
STAGE 0  Corpus intake          (syllabai-resources — only for a NEW book)
STAGE 1  Spine & spec joins     (ingest → book_chapters; 1:1 with spec sub-sections)
STAGE 2  Rail packs S0–S4       (per chapter; gates G1–G4; the daily loop)
STAGE 3  Platform parity        (renderer + widgets land per T-BOOK-003..009)
STAGE 4  Wire, publish, flip    (checkRefs, glossary seed, coverage, cohort gate)
```

Stages 2–4 are parallelizable per chapter and per lane (platform / content /
corpus) under the standard claim protocol. A chapter's pack may pass S0–S3
before the platform lane lands; publish (S4) cannot.

## Stage 0 — Corpus intake (new books only)

Full checklist: `BOOK-NEW-SUBJECT-CHECKLIST.md`. Summary: PDF of record +
parse of record (Docling-class `*_chunks_v3.jsonl`) + census (17 content
types) + OCR runbook + `LICENSE-DATA.md` rows, all appended to
`syllabai-resources` under `books/<qual>/`. **Nothing in this repo yet.**

## Stage 1 — Spine & spec joins

Run the books ingestion (`apps/api/scripts/books-ingest*.ts` pattern) to
produce `book_chapters` rows: chapter spine (`u<unit>:c<NN>`), dual page
ranges, LO text, and spec joins. Join law of record (T-MIG-133): the book
prints no spec codes — LO box texts are verbatim-class matches of the spine's
`official_wording`; weak or absent joins become `REVIEW_REQUIRED`, never
silent. Gate: a chapter census that maps 1:1 onto the spec's sub-sections
(report any orphan chapter or orphan spec sub-section as a finding, severity
S2, kind `spine`).

## Stage 2 — Rail packs (the daily loop)

One chapter = one pack = one unit of work. Five sub-stages, five agent roles,
four gates. Roles are hats, not headcount; S1/S2/S3 must be **different
agents** (adversarial separation).

| Sub-stage | Role hat | Produces | Gate | Gate checks (pass criteria) | Receipt |
|---|---|---|---|---|---|
| S0 outline | `book-architect` | `pack.yaml` block plan from the chapter's chunk census (body/key_point/exam_hint/safety + LO + spec joins) | **G1 binding lint** | chapter_key exists; page anchors monotonic; specRefs ⊆ chapter join set; block budget within plan | `g1-<pack>.json` |
| S1 author | `book-writer` | callouts + block payloads + glossary accept/avoid lines (PACK-SPEC formats) | **G2 schema + language lint** | `book.block/1` valid; banned-phrase list per subject; KaTeX/Unicode residue lint (OCR artifacts); honest-empty | `g2-<pack>.json` |
| S2 accuracy | `<subject>-reviewer` | fact-pass verdict | **G3 fact pass** | domain correctness (chem: equations balanced, state symbols present, ΔH signs, conditions) | `g3-<pack>.json` |
| S3 exam-alignment | `examiner-voice` | terminology verdict | **G4 terminology check** | command-word fidelity (board's lexicon, incl. newly added words), keyword precision, mark-scheme accept/avoid lines | `g4-<pack>.json` |
| S4 publish | `book-publisher` | wired pack + receipt | **flip check** | checkRefs wired from bank; coverage stats; 20% human spot-check sample passed | `pack-<pack>-receipt.json` |

Per-pack authored budget (from the plan): 300–600 words, 2–4 examiner-language
callouts, 2–4 interactive blocks (density follows the chapter's mark-leak
profile), 5–10 check items (bank, via specCodes), 5–15 glossary cards.
Unit-closing Strength Checks (10–15 bank items) are separate packs
(`strength-u<N>`), gated by the bank-density SQL.

### Pipeline versioning (mandatory for self-improvement)

Every pack receipt records:

```json
{
  "pack": "c05",
  "playbook_version": 1,
  "prompt_versions": {"s0_outline": "1.2.0", "s1_author": "1.0.3", "g3_fact": "1.1.0"},
  "lint_pack": "chem@1.0.0",
  "gates": {"G1": "pass", "G2": "pass", "G3": "pass", "G4": "pass"},
  "coverage": {"spec_points": 12, "lo_items": 5, "check_refs": 8, "glossary": 9}
}
```

Stage prompts live in `docs/books/prompts/` with semver + changelog at the top
of each file. Prompt changes are PRs; a pack's receipt is attributable to the
exact prompt versions that produced it. Without this, defects cannot be traced
to their cause — see SELF-IMPROVEMENT.

## Stage 3 — Platform parity

Renderer + widgets land via the platform lane (T-BOOK-003..009 class work).
Content agents never patch the renderer to accept a pack; a pack that cannot
render as-is is a pack defect (finding) or a schema gap (ADR). The rail must
respect: two-pane layout with page-exact PDF slice, mobile accordion,
honest-empty states, a11y keyboard paths, `attempts(surface='book_check')`
feeding the existing BKT/BDT/decay machinery (ADR-031: coverage persisted,
mastery computed).

## Stage 4 — Wire, publish, flip

1. `book-publisher` wires `checkRefs` (bank query keyed by the chapter's
   specCodes), seeds glossary slugs, computes coverage.
2. Pack state flips per chapter after the 20% spot-check sample passes.
3. Serving respects T-C20 (VALIDATED parent) + pack review state at query
   layer; cohort gating per T-BOOK-040 class work.
4. Post-launch instrumentation (T-BOOK-040) feeds the findings ledger:
   citation-miss rate, check drop-off, honest-empty hits.

## Anti-patterns (instant rejection)

- Rewriting book prose into a pack "because it reads better".
- Authoring your own check questions instead of wiring the bank.
- Editing an L1 parse file to make a join work.
- A gate receipt produced after the fact, covering artifacts that don't exist.
- Skipping S2/S3 agent separation ("I reviewed my own pack").
- Silent REVIEW_REQUIRED promotion.
