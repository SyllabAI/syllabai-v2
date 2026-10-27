# PLAYBOOK — Content Quality Protocol (OEQ planes)

> Self-improving agent playbook. Born from T-OEQ-MATHSB-SERVE-1 run-011 (deep-water
> QA wave on the 4MB1 official-papers plane). Every future content-repair lane MUST
> read this before touching plane JSON. Append new classes/lessons at the end; never
> delete entries (the taxonomy is cumulative).

## 1. The laws (non-negotiable)

1. **NO-GUESS**: every text repair must be evidenced by the printed page of record
   (QP/MS PDF from the `syllabai-pastpapers` mirror, rendered to PNG and READ).
   Unreadable fragment → leave as-is + note. Wrong-but-plausible math is worse than
   raw junk.
2. **MARKS LAW**: `sum(question.totalMarks) == sum(part.marks)` fleet-wide (currently
   6600 == 6600 over 2443 parts). Never change marks.
3. **MARK-CODE LAW**: for solution/markPoints rebuilds, the `after` text must keep
   every mark-code token the `before` text had (M1/A1/B1…). Rebuilds may RESTORE
   codes lost to OCR garbling (each fix cites its printed-page evidence); they must
   never LOSE one. Validator regex must handle glued tokens (`M1ft`, `B1for`,
   `A1oe`): `\b(M[123]|A[123]|B[123])(?=ft|oe|for\b|award|allow|dep|if\b|[^a-z]|$)`.
4. **NEVER-FABRICATE DIAGRAMS**: automatic matrix/figure reconstruction without
   page evidence is forbidden. A wrong pmatrix is worse than flattened text.
5. **FURNITURE**: cover-page blocks, "Turn over", barcodes (P60258A…), dotted-leader
   junk rows, MS-table headers ("Question Working Answer Mark Notes"), page
   footers/copyright lines never belong in question/MS text. Strip on sight.
6. **CURRENCY $**: in OEQ planes `$` in text is ALWAYS money (math is Unicode or
   explicit KaTeX). Escape as `\$` — remark-math pairs two same-line unescaped `$`
   into a fake-math segment (24-part defect class killed in run-011). Genuine LaTeX
   segments stay paired `$…$`.
7. **Single-line compact JSON**: official-papers.json stays minified
   (`separators=(',',':')`, ensure_ascii=False).
8. **Honest flags**: machine-staged (not yet eyes-on-verified) crops carry
   `review: true` in the asset. Eyes-on-verified → `review: false`.

## 2. Defect taxonomy (as observed on 4MB1, October 2026)

| Class | Signature | Remedy |
|---|---|---|
| cover-furniture | stem starts "Please check the examination details…", "Write your name here…", "Answer ALL…" | strip up to and including "You must write down all the stages in your working." |
| OCR word-salad | interleaved two-column text, "Turnover >", barcodes, `cossssus…` dotted-junk, `MUA ACA AAA` tokens | eyes-on rebuild from printed page |
| duplicate stem | whole stem block repeated (two-column OCR capture) | rebuild once from page |
| matrixish flatten | `( −2 4 )` / `(8 3 )` — parens with ≥2 bare number tokens | KaTeX `\begin{pmatrix}` from printed page |
| unit-sup loss | `m2`, `cm3`, `x2` where print shows superscript | Unicode ² ³ (or `$x^{n}$`) from page |
| deg-q degree junk | `32q` for 32° inside figure-label lines | context-gated fix (algebra variables `2q`, `10q+p` are LEGIT — do not touch) |
| currency pairing | two unescaped `$` on one line | escape all non-LaTeX `$` as `\$` |
| c-junk | `©` used as mis-OCR token in MS text | eyes-on from MS page |
| fraction flatten | `114 2 M1 × 4200 oe 360` (stacked fraction linearized) | rebuild inline `a/b` from page |
| crop-required | asset `{kind:'crop-required'}` + "Figure not shown…" note | attach real crop (see §3) |

## 3. Figure crop pipeline (proven run-011)

1. Mirror: `https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/past-papers/<series>/4MB1-<PAPER>/qp.pdf|ms.pdf` (paper slug UPPERCASE: `02R`, not `02r`).
2. Page find: distinctive-word voting (10 longest normalized words, ≥50% hit), NOT prefix match — OCR interleave breaks prefixes.
3. Question block: margin words (`x0 < 62`) equal to the question number; block = q-num y → next-q-num y.
4. Crop: seed on the largest vector item in-block EXCLUDING page furniture (items with area > 45% of page = the answer-box border; margin ticks x<30 / corner ticks; full-width separators), grow union by 25pt proximity, pad 16pt x / 10pt y, clip to block ±40pt, render zoom 3.
5. Assets live in `syllabai-resources` at `Official-ExamQuestion/igcse-maths-b-16/<series>/4MB1-<paper>/assets/asset_<q>_<mention>[-<occ>].png`, referenced from plane JSON with `rawUrl` on `main`.
6. Reuse first: the SME plane (`questions.json`) carries 743 Tier-B-verified inline images — match by (series, paper, question-number parsed from the asset URL). 72/263 crop-required parts were satisfied by reuse alone.
7. GATE: every crop rawUrl HEAD-200 (562/562 at run-011).

## 4. Fleet protocol (multi-agent repair waves)

- Slice worklists per agent (~20 eyes-on parts each); every slice item carries part id, current text, evidence image paths, reasons.
- Agents write fix-proposal JSON ONLY (part/field/before/after/evidence/note); the main lane applies through the validator (§1 laws) — agents never edit plane JSON.
- **Concurrency lesson (run-011)**: 8 parallel Task agents exceeded the gateway (context deadline exceeded ×3 rounds, even 2× and 1× during the outage). Fallback: main lane executes the priority classes serially with sampled verification, and the slices stay staged for fleet retry. Check fleet health with ONE cheap agent before committing to a wave.
- **Script persistence lesson**: run-010's repair script was lost with its session (only the changelog survived). Every repair script now lives in `/home/z/my-project/scripts/` and is named per run (w1_apply.py, w2_salad_fixes.py, w3_apply.py, evidence_prep.py, deepwater_census.py, katex_gate.js, crop_url_gate.py).

## 5. Gates (run these before any push)

1. `scripts/deepwater_census.py` — structure (marks law), junk/furniture counters, unbalanced-$ census.
2. `scripts/katex_gate.js` — every `$…$` segment parses (standalone katex install OK; hub node_modules may not exist in a fresh clone).
3. `scripts/crop_url_gate.py` — all crop rawUrls 200.
4. W2/W3 validators inside the apply scripts (mark-code law, PUA/FFFD scan).

## 6. Open queue (as of run-011)

- matrixish 78 hits / unit-sup 22 parts / c-junk 2 parts — slices `download/t-oeq-mathsb/deepwater/slices/w2-{A,B,C}.json` staged for fleet retry.
- 64 crop-required parts without a figure yet (list in `worklists/w3-crops.json`, entries with `crop: null`) — auto-crop returned None (figure on adjacent page or raster-only); needs manual region or page-adjacent re-run.
- 213 crop assets carry `review: true` (machine-staged) — consume via fleet verdict passes (`slices/w3-{1..5}.json` pattern: verdict PASS/FAIL + pageHint).
- SME-bundle retirement decision still queued (operator card).

## 7. run-012 additions (fleet-retry wave, October 2026)

### New defect classes

| Class | Signature | Remedy |
|---|---|---|
| part-label leak | `©` starting an MS row; whole foreign MS rows in a part tail ("Total N marks" + "Question Working Answer Mark Notes" + rows of another question) | circled part labels (Ⓒ) OCR to ©; strip leaked rows per printed page; when the rows belong to a sibling part, MOVE them home — mark codes preserved at QUESTION-level union |
| sqrt-loss | bare digit pairs `( 6 5 )`, `( 3 81)`, `60π 15`, `10 3 − 6 5` — the radical/index glyph is what OCR lost, not the layout | rebuild from print: `(6√5)`, `(∛81)⁴`, `60π√15`, `10√3 − 6√5`; ∛ = U+221B, fractional indices in caret form `81^(4/3)` |
| glued-exponent ambiguity | `×102`, `× 107` — reads as ×10² OR integer ×102 | NEVER deterministic; eyes-on only. Tier-D is SPACED exponents only (`× 10 8` has exactly one coherent reading) |

### New laws / lessons (append-only)

1. **Lost-census law**: never re-derive a dead census regex exactly. Recalibrate SLIGHTLY BROADER from the taxonomy, publish your law, let fleet verdicts disposition. Receipt numbers are anchors, not laws.
2. **Tier law**: deterministic lanes require syntactically unambiguous signatures only. A `\s*` where `\s+` belongs turned run-012's first Tier-D pass into an overreach (glued exponents converted) — caught by re-census diff, plane rebuilt from backup. When in doubt: eyes-on.
3. **In-repo persistence law** (upgrades §4 lesson): scripts/slices/manifests live in `.syllabai/lane-artifacts/<card>/<run>/` INSIDE the repo. `/home/z/my-project/scripts/` dies with workspace wipes (run-010 AND run-011 losses).
4. **MS page-find recipe**: distinctive-word voting on solutionMd mis-lands (q17 → p3, q12 → p16). Reliable recipe: (a) direct search for a unique string from the part text; (b) token+qnum scoring (2pts/token hit, +1 qnum present), render TOP-2 candidates; (c) always verify the question number row is on the rendered page before reading fixes off it.
5. **Adjacent-page crop law** (extends §3): when the voted page yields no vector seed, scan p+1, p+2, p−1, p−2 (whole-page vector census when the margin block find fails); sliver guard: grown union < 50×25pt ⇒ block-raster fallback of the question block; occurrence-indexed asset names for multi-asset parts.
6. **URL-gate-before-attach**: crops produced without the resources push in the same run stay UNATTACHED — stage PNGs + push script, attach at the PAT-gated landing so §3.7's gate passes before the plane references them.

### run-012 open queue (supersedes §6 partially)

- matrixish remainder (~33 raw hits: 2022-06 01 q18/q23/q24/q26-a, 2023-01 01 q26-a/b, 2023-01 02 q2/q3, 2023-06 02R q11-a, 2025-06 02 q4-b, 2025-10 01 q15, 2025-11 02 q10) — slices persisted in-repo `lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-012/slices/`
- glued-×10N unit-sup 16 parts — eyes-on queue
- 64 run-012 crops staged (push+attach pending); 213 run-011 machine-staged crops review:true — verdict passes still queued

### run-012 spot-check additions (live-player verification, October 2026)

**Live-player verification of run-012** (receipt `run-012-spotcheck.json`): deployment currency proven (live /corpus plane byte-exact vs tip `d56a2fb95a1e617f`); all 43 text fixes render (19/19 presence probes, 5 pages browser-verified incl. KaTeX pmatrix product rendering as real bracketed matrices). Two actionable residuals found:

7. **Attach render-completeness law**: a crop attach is complete only when ALL FOUR hold — (a) `assets[]` metadata updated (crop-required → crop + rawUrl), (b) inline `![…](rawUrl)` link injected into `problemMd`, (c) the `> *Figure not shown…*` note removed, (d) URL gate passed before all three. The player renders figures ONLY from inline problemMd links — `assets[]` is never rendered. run-012's attach (6ba0c467) did (a)+(d) only ⇒ **58/64 crops render-invisible** (the "Figure not shown" callout still shows).
8. **markPoints mirror law**: every `solutionMd`/`problemMd` edit must mirror into `markPoints[].textMd` in the SAME edit. The player renders the mark-scheme block whenever `solutionMd ≠ markPoints[0].textMd` — so an unmirrored fix UN-HIDES the stale OCR beside the fixed answer (and keeps leak rows alive: the 17-b © row and the q19 furniture+Q20 rows render in the markPoints block on both the 2020-06 and 2020-11 twins; 25 stale mirrors censused).
9. **Spot-check attribution law**: page-wide absence probes over-collect from sibling planes riding the same RSC payload (SME `questions.json` copy, markPoints mirrors, corpus blueprint data). Triage every stale hit to its source plane (official field vs markPoints vs SME copy) before judging a fix failed. The SME plane staleness is by-design for official-plane waves (exam-questions tree + DB re-ingest are separate lanes).
10. **Furniture census gap**: truncated header variants (`Question Working Answer Notes Ma`, header-only fragments) render live but fall outside the 8 boilerplate classes — extend the census to header-prefix matching; new defect leads: 2024-06 02R q2-a/2-b foreign %-profit/chairs solution rows; 2019-06 02 4-e problemMd inverse-matrix junk.

**run-012 spot-check open queue deltas**: + mirror-sync wave (25 markPoints mirrors), + inline-link injection wave (58 crops), + F4/F5 eyes-on leads; PAT rotation still pending.

### run-013 additions (mirror-sync + inline-link waves, October 2026)

**Both queued waves executed** (receipt `run-013-mirror-sync-inline-link.json`, PR #411 merged `7b0073e5`, plane `d56a2fb95a1e617f → 3bf89d920d1b6bb0`, live-verified same day):

11. **Wave-census law (hits ≠ parts)**: a spot-check's stale-probe HITS page-wide are NOT the fix population. Derive the fix census from the diff (e.g. `solutionMd` changed in the wave AND `markPoints[0].textMd` untouched ⇒ mirror-sync part), then reconcile hits→parts explicitly in the receipt. run-013: 25 hits over 10 probed pids → rigorous 23-part census (16 byte-exact stale mirrors + 7 pre-existing divergences the wave re-exposed). Fixes: `textMd := solutionMd` byte-exact (mirror slot [0] only).
12. **Flight-duplication probe law**: RSC page payloads embed the corpus plane data a CONSTANT 4× per page. Count probes must compare against 4× the plane count; a constant multiplier is duplication (mechanical), a VARIABLE one is leakage. Corollaries: flight strings escape `\n`/`\"` and chunk-split mid-string (strip chunk-boundary noise + backslashes before needle matching; for short mirrors `staleHit=False` on the pid window is the discriminating proof; for chunk-split long strings the `/corpus` byte-match carries the data-presence proof).

**Queue after run-013**: mirror-sync wave DONE (23), inline-link wave DONE (58 crops / 56 parts, URL-gated, identical-byte twins deduped). Remaining: F4/F5 eyes-on leads; 213 run-011 machine-staged crops `review:true` verdict passes; PAT rotation still pending.

### run-014 additions (F4/F5 eyes-on wave, October 2026)

**F4 cluster (2024-06 02R q1/q2/q3) + F5 named leads closed** (receipt `run-014-f4-f5-eyes-on.json`, plane `3bf89d920d1b6bb0 -> f7f4add5161576a9`):

13. **Misalignment-cluster law (upgrades §7 part-label leak)**: when leaked MS rows are found in a part, eyes-on the WHOLE cluster before editing — the leak's source part is usually a victim too (run-014: q1(a)/(b) rows bled into q2-a/2-b heads while q1-b/c/d served "not captured" placeholders, q1-a was truncated, q2-a had lost its printed M2 note row, q2-b its first main row, and q3's lead-in note had leaked into 2-b's tail). Fix = strip foreign + move home + complete truncations, ALL from the printed page. Placeholder parts ("official mark scheme line … not captured") adjacent to a leak are prime move-home victims — grep for the placeholder string when a cluster is suspected.
14. **Paper-level code-union law (widens law 3's domain for move-home edits)**: when rows MOVE between sibling questions of the same paper, mark codes legitimately change question — the conservation gate is the PAPER-level union (codes move, never disappear). Same-question rebuilds keep the question-level gate (run-012 law).
15. **Printed-shorthand law**: examiner shorthand that LOOKS like OCR junk may be genuinely printed ("cas 2.25 A1 oe", "cas for each part" — 2023-06/2024-06 MS print these in the Working column; eyes-on confirmed p18/p9). Never strip a token without page evidence just because it looks like garbage; conversely a fragment whose owner row exists elsewhere ("dy" = first token of the NEXT question's "dy/dx" row) is a leak, not shorthand — disposition: strip the fragment, queue the misaligned owner, never inject a lone fragment into a wrong solution.
16. **Fleet furniture law (law 10 confirmed fleet-wide)**: the header-prefix census re-framed F5 from 8 named leads to 2230 hits / 641 parts / 58 papers (1149 table headers, 1027 "Total N marks" footers, 54 spare-grid instructions). MS page-bottom furniture is dropped AT SOURCE by converter v0.18.0 for converter-extracted planes (ADR-039 lineage, wave-25); hand-maintained planes need the deterministic strip wave with sampled page-evidence validation per paper (tier law) — worklist staged at `lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-014/f5-fleet-worklist.json` (run-015).
17. **Disk-pressure law (lane operations)**: the sandbox overlay rootfs is ~9.9G with the base image consuming ~8G; lane artifacts (evidence renders, mirror PDFs, fetched pack corpora) silently fill it (two waves lost to ENOSPC mid-run). Working pattern: mirror PDFs are re-fetchable — delete bulk pdfs/ after page renders; git object stores can live on the PolarFS scratch via `.git/objects/info/alternates` (disclose in the worklog; session-scoped); never symlink (blocked by sandbox); stale build scratch (JDK tarballs, downloaded books) is the first thing to go.

**Queue after run-014**: F5 fleet strip wave (2209 staged hits); 2021-06 02 q2 solution misalignment (new F4-class lead); 2024-06 02R q2-a problemMd tail junk; 213 review:true crop verdict passes; SME/DB re-ingest (F3, may fold ADR-039 §7.2 provenance regeneration); maths-b plane /0.2 provenance migration (operator-queued); PAT rotation STILL PENDING.
