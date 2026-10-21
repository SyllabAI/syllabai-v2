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
