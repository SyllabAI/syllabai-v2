# Official past papers in the hub bundle (ADR-037 wiring)

Status: WIRED (content) · 2026-10-21 · source wave: syllabai-resources ADR-037
converter v0.6 (merged `main@de4d8da8`)

## What this adds

`apps/hub/content/igcse-chemistry-19/questions.json` now carries, after the 28
SME sets, **16 official past-paper sets** (`official-4ch1-1c-<series>`,
`topicSlug: "official-past-papers"`, section "Official past papers (4CH1/1C)")
— one per Edexcel 4CH1/1C series from June 2019 to June 2026 (no June 2020:
COVID), 169 questions / 930 parts, extracted **verbatim** from the operator
archive PDFs under the ADR-037 doctrine (the converter extracts; it never
authors).

## Serving fields (the AGENTS.md contract)

Every official part carries the fields the resources repo's
`Official-ExamQuestion/AGENTS.md` documents:

- `problemMd` — verbatim question text; printed figures inline as raw
  GitHub-URL markdown images (`raw.githubusercontent.com/.../Official-ExamQuestion/...`);
  text-only scaffolds carry an honest "figure pending scan" note instead of a
  fabricated image.
- `solutionMd` — the verbatim mark-scheme block; **null on 35 honestly
  unlinked parts** (MS-layout refusals, never guesses).
- `markPoints[]` — awardable `{id, marks, textMd}` with stable ids
  (`2022-06-7-a-i-MP1`); marks ALWAYS sum to the part's marks (converter gate
  G7). 1405 points corpus-wide.
- `assets[]` — `{kind: "crop", path, rawUrl, page, review, shared, refPart}` or
  `{kind: "crop-required"}`; shared refs point at the same PNG as the owning
  part (render `rawUrl`, never a second file). 134 crops / 8 honest stubs.
- `answerStatus` — linked / unlinked / review honesty flag.
- `choices` — keyed MCQ options (58 parts).

## Ingestion behaviour (the shim laws, unchanged)

The bundle passes through `services/sme/bundle-questions.ts` unchanged:

- **topicSlug** — official sets carry `official-past-papers` (the ref
  namespace law).
- **anchor law** — questions with no spec-point codes stay OUT of the learner
  model ingest (unmapped++) but remain fully servable display content: only
  the 2020-11 demo-seeded set (5 anchored questions) ingests today; the rest
  wait for the `pending-llm` spec-tagging wave (resources repo).
- **part-sum law** — the 4 questions excluded as badSum are exactly the
  2019-06 archive-damage questions (rasterized pages, partially lost parts)
  the converter already attributes; nothing is rewritten.
- `markPoints` / `assets` / `answerStatus` ride the bundle JSON **inertly**
  today (the 1.0 package shape maps none of them) — the follow-up is the
  package + ingest extension that persists them (then Smart Mark marks per
  point via the frozen reveal/smartmark services).

## Regenerating

```
python3 scripts/official_examq_export_hub.py <out-stage> <current questions.json>
```
in `SyllabAI/syllabai-resources` (exporter lands with the corpus; manifest
regenerated with `generatedUtc` + `importSource.ref` = the merged corpus SHA).

## v0.7 delta (2026-10-21, PR #249) — the package/ingest extension landed

The follow-up named above ("the package + ingest extension that persists them — then Smart Mark marks per point")
is CLOSED by PR #249 (merged 2026-10-21). Status moves WIRED (content) → **WIRED + PERSISTED**.

- **DTO amendment (additive, the ADR-026 options-amendment precedent):** `SmePart.markPoints`
  (`packages/contracts` schema + the api parse tree) — per-point awardable `{marks, text}`, the converter's
  M1..Mn split. Absent on older packages (parser binds null; hand-built rows leave it absent — `!= null` guards).
- **Frozen ingest branch (validate + replace):** `validate()` refuses any markPoints-bearing part whose points are
  not all-positive and summing EXACTLY to the part's marks (the G7 law, fail-closed like every frozen sum law);
  `saveStructuredBody()` persists ONE `mark_points` row per point (`ref <label>.<n>`); parts without keep the frozen
  whole-block law; the ingest summary counts ROWS (`markPointRowsFor`).
- **Shim ride-through (fail-closed):** `bundle-questions.ts` maps bundle `markPoints[]` → `SmePart.markPoints`,
  refusing any part whose points don't close on its marks (never rewritten).
- **Spec-tagged corpus (the unlock):** `apps/hub/content/igcse-chemistry-19/questions.json` regenerated from
  syllabai-resources `main@e4533d7d` (converter v0.7): **169/169 official questions anchor** (was 5) — 927/930 parts
  carry `specPointCodes` (1,180 registry-valid codes; 3 honest pending-llm), 1,405 markPoints (0 sum violations),
  135 crops / 7 honest stubs, 17 review flags remaining (verdicts in the resources repo's CROP-REVIEW.json ledger).
  Manifest bumped (`main@e4533d7d`).
- **Verification:** `bun test apps/api packages` 2398 tests — the ONLY failure is the pre-existing maths-b
  emptied-bundle drift on main (same 1 fail on the pristine base); `bun run typecheck` clean (4 packages); new tests
  pin the ride-through (1.1 → 1.0 through the REAL frozen gates) and the sum-violation refusal.

> **Provenance note (2026-10-21, docs reconciliation pass, operator trace `1a15e714070287a9`):** this file was
> accidentally overwritten at commit `045bcd7040` (PR #249) with the literal 14-byte string "404: Not Found" — a dead
> fetch's error body committed over the document of record. The v0.6-era content above is restored verbatim from
> commit `743b53e5b8` (PR #239), and the v0.7 delta is re-appended from the PR #249 record. No decision content changed.


## v0.8 export delta (2026-10-22, this PR) — the 2C tranche served + full v0.8.1 1C parity

Status: WIRED + PERSISTED · 1C + 2C · corpus `syllabai-resources main@cef8d5e2`
(converter v0.8.1) · exporter now versioned: `syllabai-resources/scripts/official_examq_export_hub.py`
(resources PR #27, rebuilt after the session-local original was lost with its container).

### What this adds

`apps/hub/content/igcse-chemistry-19/questions.json` now carries, after the 28 SME sets and the
16 official 1C sets, **16 official 2C sets** (`official-4ch1-2c-<series>`, section
"Official past papers (4CH1/2C)", same `official-past-papers` topic/sectionSlug) — one per
Edexcel 4CH1/2C series June 2019 → June 2026 (no June 2020: COVID): **110 questions / 607 parts /
1120/1120 marks, 27/27 MCQs keyed, 16/16 slices all-gates PASS** at converter v0.8.0 (the 2C
enablement wave: F34 paper parametrization + F35 MS-marker discipline + F36 sentence-form
positives). The serving-fields contract is unchanged (problemMd verbatim + inline raw-URL figure
markdown; solutionMd / markPoints[] G7-closed; assets with shared-ref dedup; answerStatus honesty).

### The anchor law rides honestly

All 607 2C parts are `pending-llm` (no spec-label wave authored for 2C yet), so all 110 2C
questions carry NO specPointCodes and the frozen shim anchor law EXCLUDES them from the
learner-model ingest (unmapped++) — exactly like the 1C sets at v0.6. They are fully servable
display content the moment the bundle ships; the 2C spec-tagging wave (resources repo) is the
scheduled unlock.

### Full v0.8.1 1C parity (the same export re-bases the whole official block)

The bundle of record was a palimpsest of four sync generations; the v0.8.1 sync had re-exported
only 2020-01's adjudicated Q7(a) parts. This export regenerates ALL 16 1C sets from the v0.8.1
corpus under one law — 44 parts change, every delta in a disclosed class:

- **7 parts unmatched → linked** (F35-era linkage repairs: 2021-11 2(b)(i)/2(b)(ii)/6(b)(ii),
  2022-06 8(b), 2023-11 2(c)(ii), 2024-11 11(a)(iv)/11(b)) — solutions gained, nothing lost.
- **6 solutions repaired**: the old bytes served MS rows smeared from NEIGHBOURING questions
  (marker-row hijack class, F35; e.g. 2022-06 4(b) carried a "Question Answer Notes Marks" table
  header and 2024-11 4(a) carried 4(b)'s moles working); the served blocks now match the corpus
  of record verbatim.
- **14 markPoints/solution refinements**: whole-block MS rows split into the real M1..Mn points
  (e.g. 2020-01 7(c) now serves the six 1-mark chemical-test points instead of one 6-mark blob).
- **21 crop records normalised**: `shared` now emitted on every crop (true/false; the old
  generations emitted it inconsistently), + 2 "(same figure as …)" owner displays resolved to the
  human part number under the v0.8.1 topology.

F37 adjudication pins re-verified post-export: 2020-01 7(a)(ii)=C chlorine, 7(a)(iii)=A astatine.
Manifest: `generatedUtc` 2026-10-22, note rewritten; `importSource.ref` unchanged (same corpus
SHA) and the SME-side counts stay the frozen 28/524/1404/3708 (the four-sync history law).

### Regenerating

```
python3 scripts/official_examq_export_hub.py <out-stage> <current questions.json> --paper 2C
```

in `SyllabAI/syllabai-resources` (topics staged per series as `<series>-<paper>.json`). The
exporter's gates: G-E1 disclosed-delta census vs the of-record, G-E2 part-sum + markPoints-close
+ spec-code shape, G-E3 per-series census vs the v0.8.1 MULTI-SERIES constants, G-E4 SME-prefix
byte-identity, and the F37 key pins — fail-closed, like every gate in this pipeline.
