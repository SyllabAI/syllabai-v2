# NEW-SUBJECT RUNBOOK — guided lessons on the zero-DB content plane

One page, operator + agent. Distilled from the closed R3-MIXED-CHECK-TYPES program of record — IGCSE Chemistry `igcse-chemistry-19`: stage-A pilot + stage-B waves S-B1..S-B10, manifests v1..v17, ending "STAGE B IS COMPLETE" (worklog of record). Every path, name, law and count below is checked in on `SyllabAI/syllabai-v2` + `SyllabAI/syllabai-resources` and verifiable. This file is standing guidance only — activating a new subject remains a NEW operator-gated contract.

## §0 Bootstrap a new subject (one-time decisions B1..B8)

- **B1 course-id**: `<qual>-<subject>-<year>`, byte-identical on both planes — inventory `SME-RevisionNotes/<course-id>/` (resources: `notes/` + `assets/` + `manifest.json` + `spec_point_resolution.json`) and landing plane `apps/hub/content/<course-id>/` (hub: `curriculum.json`, `guided-lessons/`, `guided-questions/`, `guided-import.json`, ...). Precedent: `igcse-chemistry-19`.
- **B2 sizing law**: 1 note → 1–3 lessons; every lesson carries exactly 9 checks — 5 MCQ + 2 recall + 1 explain-why + 1 application. Chemistry census of record: 112 notes → 239 lessons → 2,151 checks = 1,195 MCQ + 478 recall + 239 explain-why + 239 application; every wave re-derives this census from disk.
- **B3 pilot first**: author ONE pilot note and ride the FULL chain (stage A) before any register wave; the pilot stays out of the wave buckets.
- **B4 buckets**: partition the remaining register into wave buckets at wave open only; the final wave takes the remainder. Never re-bucket mid-program.
- **B5 schema baseline**: source `guided-lesson/0.5` → hub `hub-lesson-import/1.4` → packages `sme-question-package/1.1`; contract of record `packages/contracts/src/sme-question-package.ts` (hub); adapter spec `SME-GuidedLessons/integration/ADAPTER-SPEC-guided-lesson-0.5-to-hub-1.4.md` (resources; the 0.1→0.4 lineage remains for provenance).
- **B6 manifest continuity — the ONE flagged open decision**: chemistry ran a global-continuous v-series (`hub-import-manifest-v1..v17.json`; v1 archived in `records/`, v9 = the S-B2 duplicate-disclosure wave — resources promotion landed, hub import withheld). A new subject MUST decide continue-the-global-series vs per-course series BEFORE wave 1 and record the decision in its stage-A receipt.
- **B7 figures**: reuse the figures generation feeds (dual-FEED law in the runner; figures additive; closure checked both ways at G-D; figures carry no prose — legacy-anchor equality at G-E).
- **B8 zero-DB**: the hub serves checked-in content only; import = byte-exact atomic landing (revision law), never a DB write; zero Vercel API writes — the git-linked auto-bake deploy is a disclosed consequence (churn-only, alias switches only on READY).

## §1 Wave lifecycle (the repeatable 9-step loop)

1. **Operator ignition** — a trace id + directive of record opens the gate (e.g. "STAGE-B WAVE N"); never self-opened.
2. **Fetch-first re-ground** both repos; defer to remotes; work in isolated worktrees, not the workspace clone; disclose drift.
3. **Read the next register bucket** (laws B2/B4).
4. **Author in the tooling lane** `SME-GuidedLessons/tooling/<lane>-authoring/` + `<lane>-pipeline.js`; audit battery of record **A0/AN/SG/KW/JC/2.1B/NUM** — spec-anchored checks, KP-index provenance; 2.1B = learner-surface law (authored-note phrasing never reaches the learner surface).
5. **RESOURCES chain merges FIRST**: branch `integration/<lane>-<yyyymmdd>` → commit A (source-0.5 authored generation) → commit C "namespace-complete outputs" (`hub-import-1.4/` + `question-packages-1.1/` re-issues + `hub-import-manifest-v(N+1).json` + `records/INT-3-transform-record-<lane>.json` + `records/<PROGRAM>-<lane>-PROMOTION-<date>.json`) → PR → merge (**"merge", never squash**). Additive-only on the stage namespaces; wave-open main resolution + mid-flight races disclosed in the receipt (`stack_of_record`).
6. **HUB chain second**: branch `<lane>-hub-vM` (vM = the manifest version) → add the FEED entry to `apps/hub/scripts/import_guided/run_import.mjs` FEEDS → run `FEED=<lane>-vM HUB_ROOT=<isolated> node …/run_import.mjs` → 34/34 gates GREEN, declared delta EXACT → pin the resources merge sha (promo) → race-guard → PR → merge ("merge").
7. **Bookkeeping**: receipts `.syllabai/receipts/<LANE>/HUB-IMPORT-RUN-<yyyymmdd>-<lane>.json` (+ LIVE-SPOTCHECK / BAKE-PROBE); worklog append; bookkeeping-only `.syllabai/**`.
8. **LIVE SPOT-CHECK** on `https://syllabai-hub-v2.vercel.app/courses/<course-id>/guided-lessons/<noteId>` — bake probe: post-push poll window (~3 min; calibrate on a prior-wave note that must stay unchanged), occurrence-aware counts (`grep -o … | wc -l`), lessons×4 "Your answer", ≥1 authored stem per target note, 2.1B law 0 hits; then agent-browser DOM flow walk: MCQ verdicts, written MISS (0-keyword → model answer) vs GREAT (keyword-hit), empty submit blocked, screenshots to `download/<lane>/dom-walk/`.
9. **Worklog NEXT pointer** — or the line that closes the register.

## §2 Naming conventions

- Lane = `<program>-<lane>` (chemistry: `r3-check-types` = stage A; `r3-stagebN` = stage-B wave N).
- Branches: resources `integration/<lane>-<yyyymmdd>`; hub `<lane>-hub-vM`. FEED: `<lane>-vM`. Manifest: `hub-import-manifest-vM.json` (hub branch vM == manifest vM).
- Receipts: hub `.syllabai/receipts/<LANE>/HUB-IMPORT-RUN-<yyyymmdd>-<lane>.json`; resources `SME-GuidedLessons/integration/records/{INT-3-transform-record-<lane>.json, <PROGRAM>-<lane>-PROMOTION-<date>.json}`; operator-gate ledger `LEDGER.md`.
- PR titles pin the cross-repo chain: `guided(<PROGRAM> <lane>): … @ resources PR #N merge-of-record <sha> …`.

## §3 Gate battery (subject-agnostic; re-run every wave; GREEN at head AND post-merge)

- **Resources side**: the audit battery (§1.4) + the wave pipeline gates, filed as the INT-3 transform record + promotion receipt (`r3-check-types-promotion-receipt/1.0`) — wave census, stack_of_record, merge-order declaration.
- **Hub side — 34 gates of record** (stages; per-stage counts are wave-shaped): P0 promotion preflight; G-A manifest-integrity family (format/version/kinds/counts/conservation/adapter/trace + survivor byte-identity + schemas byte-anchored); G-B fetched-raw @ pinned commit, sha256+bytes exact; G-C ajv draft-07 vs both schemas; G-D derived-ID grammar + checkRefs↔questions bidirectional 1:1 + pinned provenance + figure closure; G-E per-note stream anchors + wave subtotals + grand-stream conservation (sha256) + legacy-anchor equality; G-DELTA declared delta EXACT (exactly the declared files carry new bytes); LAND byte-exact atomic landing; G-V cold re-read + closing identity from disk + idempotence + static-build pickup.
- **Identity arithmetic is a gate**: per lesson 9 = 5+2+1+1; disk-derived totals must equal the manifest exactly; grading law fail-closed (case-insensitive whole-token match, ≥1 hit correct, 0 hits → not-quite + model answer, empty submit blocked, keywords absent → reveal-only, never a silent wrong grade).

## §4 Standing discipline

Fetch-first at open AND pre-push; race-guard (rev-list re-check at push; mid-flight races disclosed with overlap census); merge method "merge", never squash; additive-only on resources stage namespaces; fail-closed everywhere; disclosures over silence; tokens one-shot via env credential helper, never echoed or persisted; zero DB, zero Vercel API writes, read-only hub GETs + anonymous DOM walk; bookkeeping-only `.syllabai/**` for receipt/worklog commits; the hub is git-linked — every push to main auto-bakes production (disclosed, churn-only).
