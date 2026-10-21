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
