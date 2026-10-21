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

- **topicSlug** — official sets carry their OWN set slug per paper
  (`official-4ch1-1c-2019-06`, ...) — the per-paper ref namespace law
  (run-004 amendment; superseded form below).
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

## Amendment r0 — the per-paper ref namespace (run-004, trace 1a15fc4a3676c085)

**Supersedes the topicSlug law above** (and every earlier "official sets carry
`official-past-papers`" statement in this doc): official sets carry their OWN
set slug as topicSlug (`official-4ch1-1c-2019-06`, ...) — the per-paper ref
namespace.

Why of record: the shared ref law (`packages/shared/src/smeRef.ts`) derives
`sme-eq-<courseSlug>-<topicSlug>-q<order>`; with every official set on the one
`official-past-papers` slug and per-set restarting orders, 12 base refs
collided across sets (35 duplicate emitted forms with `-pK`/`-s` members,
multiplicities up to x16 after the 2C tranche) and the frozen package-global
`seenRefs` gate (`bundle-questions.ts:316-319`) refused the v0.7 bundle at
BUILD — the Stage-B2 blocker of record (run-003, trace 1a15f8cd84de4909,
zero DB statements). The DB lane cannot fix this (the converter extracts; it
never authors); the namespace is a content-plane wiring property.

The fix (content-lane wiring, zero code): each official set's `topicSlug`
field := the set's own canonical slug. Topic-plane sets untouched. Verified
of record (scripts/adr037_path1_ref_verify.py, ALL GREEN): emitted entry
count unchanged (1053); the 28 topic sets' refs byte-identical (the live 602
ground); zero duplicate refs package-wide post-fix; every official ref in the
plain per-paper form (no truncation path); the REAL shim build + the REAL
frozen `parsePackage`/`validate` ACCEPT the full 60-set package (688
questions / 2325 parts / 1136 options, counts = the run-004 census
`adr037_reapply_census_result_60sets_perpaper.json`). The pre-fix 60-set
baseline rides `adr037_reapply_census_result_60sets_prefix.json`.

Downstream wiring unchanged: the hub join (`app/api/core/questions`) derives
refs through the SAME shared law from the SAME bundle field, so both sides
move together; official questions stay unjoined until the DB re-apply lands
(B3, behind green-light).

## Amendment r1 — the v0.9.0 re-export re-break and re-fix (trace 1a15fe1207c34329)

The sibling bundle-sync lane (d6dbebd2, PR #268, "ADR-037 v0.9.0 — 2C spec
labels + F40 figure fixes, 32 sets re-exported from resources
main@89260832") re-exported the same 32 official sets from the resources
pipeline WITHOUT the path-1 wiring: all 32 sets landed back on the shared
`official-past-papers` topicSlug. The export generator upstream of the
bundle does not carry the per-paper slug law, so every re-export re-breaks
the namespace until the generator itself adopts it (owned by the export
lane; flagged, not fixed here — this lane's mandate is the content-plane
wiring of record).

Union-resolve of record: the rebase onto origin/main (b536b2cc) KEPT the
v0.9.0 content advances wholesale (field-by-field proof: 60/60 sets,
exactly 32 `topicSlug` field diffs, `topicSlug == slug` on all, zero other
fields touched) and re-applied the 32-field surgical fix on top
(scripts/adr037_path1_refnamespace_fix.py guard law re-run clean). The
v0.9.0 content advance is material: the 2C tranche gained spec labels
(unmapped 111 -> 1), so the admitted plane grows 688 -> 798 questions and
the Law-2 per-point payload grows 1381 -> 2362 rows (kill-list insert
expectation 2864 -> 3867 mark_point rows; g7 violations still 0, dupOrder
still 0). The bundle-questions pin was re-pinned to the v0.9.0 census
(scripts/adr037_reapply_census_result.json) and the full gate set re-proven:
bundle-questions 25/25, smeRef 14/14, apps/api tsc clean. The namespace
injectivity law is unchanged and re-proven on the v0.9.0 bytes.

## Amendment r2 — the export generator adopts the namespace law (wave 12, resources PRs #32+#35)

Amendment r1 flagged the export lane as the owner of the per-paper slug law ("every re-export
re-breaks the namespace until the generator itself adopts it"). **Closed**: the exporter of
record now carries the law natively (resources `scripts/official_examq_export_hub.py` F44,
merged main@bf8d56c30f):

- `topicSlug := the set's own canonical slug` at the source (export_series), with the
  run-003 provenance in a comment — no post-export surgical fix is needed ever again;
- official-set detection moved to slug-prefix (`is_official`) — the old
  `topicSlug=='official-past-papers'` filters silently selected ZERO sets after this
  amendment's law landed (G-E2 would have been vacuous);
- **G-E1b identity closure**: the 11 set-level identity fields (topicId, slug, name, setName,
  topicSlug, section, sectionSlug, curriculum, source, schema, relatedNoteIds) must be
  byte-equal vs the bundle of record, with NO disclosure path — the part-level census that
  let the r1 re-break ride through cannot see set-level fields; it can no longer happen
  silently. Negative control verified live (a doctored shared-topicSlug bundle is refused).

The wave-12 sync itself (this amendment's companion bundle): resources converter v0.10.0
corpus (2019-06 rasterized pages recovered through the fail-closed F41 OCR layer — G1
110/110 PASS; F42 early-MS bare-marker linkage G5 63/64; F43 MS page-table headers are
furniture — 278 solution blocks cleaned corpus-wide, 10 mis-linked 2019-06 1C blocks
corrected), exported under the frozen wave-12 delta census
(syllabai-resources `scripts/exporter-disclosures/2026-10-22-wave12.json`; G-E3/G-E2/G-E1/
G-E1b/G-E4 all green). Admitted-plane census of record
(`scripts/adr037_wave12_census_result.json` + the re-pinned bundle-questions test):
raw 804 questions / 2952 parts; **badSum 4 -> 0** (the 4 archive-damage 2019-06 1C questions
now close their part-sums), admitted 803 questions / 2950 parts / 1260 options, official
plane 275 -> **280** (+4 repaired + the recovered Q7), unmapped 1 (unchanged), dupOrder 0,
g7 violations 0, emitted refs 1210 -> 1219, mark_point rows 3867 -> 3907. The namespace
injectivity law is unchanged and re-proven on the wave-12 bytes.
