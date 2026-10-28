#!/usr/bin/env python3
"""run-016 receipt emitter (json.dump law) + playbook + repo worklog appends."""
import json, hashlib

ROOT = "/home/z/my-project/repos/syllabai-v2"
receipt = {
    "card": "T-OEQ-MATHSB-SERVE-1",
    "run": "run-016 (SPARE-GRID fused-line problemMd rebuild wave — 53 parts)",
    "date": "2026-10-28",
    "operatorOrder": "run-016 (trace 1a180c961abffa3d) — per run-015 receipt disposition: 53 SPARE-GRID-INSTR fused problemMd blocks are eyes-on surgical rebuilds (2019-06 02 4-e precedent class)",
    "planeState.before": "eabd5ca8b643f93f (run-015 merged, main 0c00c123 lineage; pre-apply byte-verified)",
    "planeState.after": "5fc8abdba88325e8",
    "planeState.census": "66 sets / 1281 questions / 2443 parts / marks 6600==6600 EXACT (no marks fields touched)",
    "scopeOfRecord": {
        "parts": 53,
        "strips": 39,
        "rebuilds": 14,
        "fieldEdits": "problemMd ONLY (zero solutionMd / markPoints contact — the class lives in problemMd; mirror law not applicable this wave, disclosed)",
        "cropRequired": 4,
        "cropRequiredDetail": "2020-06 8-d (p21 kite grid), 2020-11 8-d (p21 kite grid), 2024-11 11-e (p33 triangle grid; third footer variant 'Turn to page N for a spare grid'), 2023-11 8-d (p17 blank curve grid REPLACING the run-011 sliver mis-crop asset_8_8-d.png 281x832 — link replaced, orphan asset disclosed, not deleted)",
        "formulaBoxes": "8 parts rebuilt as KaTeX per the run-014 4-e format law: INV box x5 (2018-06 7-f, 2021-11 5-d, 2021-01 02R 7-e, 2024-06 4-e, 2024-11 11-e [print has no 'The']), DET box x3 (2022-06 9-e, 2023-06 10-d, 2025-06 12-d-ii, plus 2023-11 7-d = 4 DET total)",
        "evidencedTextRestorations": [
            "2021-01 9-f: 'matrix N2' -> 'matrix N\u00b2' (p18 print: superscript)",
            "2023-11 8-d: lost tail restored 'of the gradient of the curve $y = x^2 - 4x - 4$ at the point where $x = -1$' (p16 print; the '= -1' had been eaten into the flatten)",
            "2025-06 02R 11-g: stray '2a' stripped (fragment of the printed quadratic-formula box fused into the stem; p32) + 'x = 1.5.' period restored per print",
            "2018-06 7-f: 'M\u20131' flatten -> 'M\u207b\u00b9' (p18 print superscript)"
        ]
    },
    "evidenceProtocol": {
        "pageFind": "29 mirror QP PDFs fetched (pastpapers mirror, HEAD-200); token+qnum page-find; 109 top-2 renders 150dpi",
        "textLayerVerify": "53/53 parts: stem snippet + both caption classes + tick-run verbatim match against the paper text layer (37 PASS straight; 16 REVIEW = formula-box/interleave classes)",
        "visionReads": "18 pages READ by the agent (all 16 REVIEW parts + 3 zero-link/crop decisions + odd-shape samples incl. 2023-11 7-d/8-d, 2025-06 02R 11-g, 2021-01 9-f, 2024-06 4-e, 2024-11 p31/p33 grid pages, 2020-06/2020-11 p20+p21)",
        "siblingBoundaryCheck": "13 sibling parts dumped to enforce the part-boundary convention: lead-in rows printed between sub-parts live on the PRECEDING part's tail (e.g. 2023-11 7-c carries the M/N definitions; 2024-11 11-d carries the full N^-1 given-row; 2020-06/2020-11 8-c carry the 'Given that area = k' row) — prevents duplicate-stem rebuilds",
        "cropMeasurement": "grid rects measured from pdftotext -bbox outermost axis tick labels (per-paper minus-glyph policy U+2212/U+2013), 200dpi renders, pads l16/t12/r18/b4 pt, header fragment white-out (2024-11), all 4 crops VIEWED pre-push",
        "footerVariantsConfirmed": ["Turn over for a spare grid ... (2020-06/2020-11 p21, 2023-11 p17)", "Turn to page 35 for a spare grid ... (2024-11 p33)", "Only use this grid ... (spare-grid pages)", "A spare grid is on the next page ... (2022-01 02 3-c, text-layer)"]
    },
    "gates": {
        "applyBattery": "fail-closed (zero writes until all green): G1 census 66/1281/2443/6600 EXACT; G2 diff scope EXACTLY 53 problemMd fields; G3 edited fields free of captions/tick-runs/PUA/FFFD/total-footers; G4 all marks fields byte-untouched; G5 PAPER-level mark-code union conserved; G6 unescaped-$ parity even per field; G7 strip stems preserved as prefixes; G9 whole-plane PUA/FFFD 0->0; G10 all 53 edited olds carried the fused class (no empty edits)",
        "katexGate": "117 segments scanned post-apply (101 run-015 baseline + 16 new box/8-d segments), 0 failures (katex 0.16.21 throwOnError)",
        "urlGate": "56/56 unique links in edited parts HEAD-200 AFTER the 4-crop resources push (URL-gate-before-attach law; 4 new raw URLs 200 pre-attach)",
        "resourcesPush": "4 PNGs via Contents API (main): 1b79e25e / 21cfccec / 826ac7a8 / 4b0e9dac — collision-check 404 x4 before push"
    },
    "disclosures": [
        "problemMd-only wave: the markPoints mirror law (run-013 law 8) is scoped to solutionMd/problemMd RENDER-COUPLED fields; markPoints[0].textMd mirrors SOLUTION text, not problem text — problemMd edits do not require mirror sync (run-015 touched solutionMd so it synced). Zero solutionMd edits this wave.",
        "2023-11 8-d: the old asset_8_8-d.png (281x832 sliver mis-crop) remains in resources as an orphan (deletion out of scope); the plane now links the measured asset_8_d_grid.png crop",
        "2020-01 02R 11-e keeps its legacy asset_11_a_table link ('same figure as 11(a)') — the part's own grid figure lives on sibling 11-b; link modernization out of wave scope, queued as lead",
        "dup-link dedupe (same-URL graph+grid twins) applied on 12 parts — keep-first policy; parts with two DIFFERENT link targets (2024-06 9-d, 2022-01 02R 8-e, 2025-06 02R 11-g) keep both",
        "flattened math inside preserved stems (e.g. '4x3 \u2013 21x2', '2x 3 \u2013 3x + 4 > 5x') is the pre-existing Tier-D flatten class — out of this wave's scope, untouched, still carried as leads"
    ],
    "scriptsOfRecord": [
        ".syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-016/scripts/run016_classify.py",
        "run016_pages.py", "run016_audit_pages.py", "run016_textverify.py",
        "run016_crops.py (v1, superseded)", "run016_crops_v2.py (bbox-measured)",
        "run016_resources_push.sh (aborted: 5.4GB clone timeout)",
        "run016_resources_push_api.py (Contents API, landed)",
        "run016_apply.py (fail-closed battery)"
    ],
    "artifactsOfRecord": [
        "sparegrid_classification.json", "page_manifest.json", "page_audit.json",
        "textlayer_verdicts.json", "urls_to_gate.json", "new_urls.json",
        "crops/ (4 measured PNGs)", "evidence/ (109 renders + 4 lead-page renders)",
        "plane.before.json backup (download/t-oeq-mathsb/run016/)"
    ],
    "newLeadsQueued": [
        "run-017: 2021-06 02 q2 solution misalignment (F4-class full MS rebuild, true MS starts 'dy/dx = 3x^2+2ax+b' MS p8)",
        "run-017: 2024-06 02R q2-a problemMd tail junk 'BAL ABC CDE DEL 125 deg BCD ALE ALK y' (garbled polygon-label interleave; needs QP page evidence + figure crop decision)",
        "run-017: displaced-sentence-head orphan census after run-015 header strips (rare; 2022-01 01 25 known instance)",
        "carried: 213 run-011 machine-staged crops review:true verdict passes",
        "carried: 2020-01 02R 11-e legacy table-link modernization (grid lives on sibling 11-b)",
        "operator-queued: SME/DB re-ingest lane + maths-b plane /0.2 provenance migration",
        "PAT rotation STILL PENDING (both exposed tokens: GitHub ...JU4 / Vercel vcp_...aoT3)"
    ],
    "credentialDiscipline": "PAT env-only via GIT_ASKPASS helper (v2 push) and direct env bearer (resources Contents API); zero credential writes to config/files; helper script deleted after use",
    "verdict": "RUN-016 SPARE-GRID WAVE CLOSED END-TO-END: 53/53 fused problemMd blocks rebuilt/stripped with printed-page evidence (18 vision reads + 53/53 text-layer verifies), 4 crop-required grids measured+pushed+gated+attached, formula boxes KaTeX-rebuilt per format law, all invariants held"
}
path = f"{ROOT}/.syllabai/receipts/T-OEQ-MATHSB-SERVE-1/run-016-spare-grid-rebuilds.json"
with open(path, "w") as f:
    json.dump(receipt, f, ensure_ascii=False, indent=1)
print("wrote", path)

# ---- playbook append ----
pb = f"{ROOT}/.syllabai/docs/PLAYBOOK-CONTENT-QUALITY.md"
addition = """
### run-016 additions (SPARE-GRID fused rebuild wave, October 2026)

**53/53 fused problemMd blocks closed** (receipt `run-016-spare-grid-rebuilds.json`, plane `eabd5ca8b643f93f -> 5fc8abdba88325e8`): 39 strips + 14 evidence-verified rebuilds; 4 crop-required grids measured from the text layer, pushed to resources, URL-gated, attached; 8 formula boxes rebuilt as KaTeX; census 66/1281/2443/6600 EXACT; katex 117/117; URL gate 56/56.

21. **Fused-rebuild law (executes law 20's remedy)**: a fused-block rebuild needs (a) printed-page evidence per part — text-layer verification for ALL parts plus vision reads for every ambiguous class (formula boxes, interleaved labels, zero-link parts, odd footers); (b) **part-boundary law**: lead-in rows printed between sub-part (n) and (n+1) belong to part (n)'s tail in this plane — check the sibling BEFORE restoring anything to (n+1) or the rebuild duplicates stems (13 sibling dumps checked this wave); (c) formula boxes rebuild as KaTeX with literal square brackets matching the print (`[The inverse of matrix $\begin{pmatrix} a & b \\\\ c & d \end{pmatrix}$ is $\frac{1}{ad-bc}\begin{pmatrix} d & -b \\\\ -c & a \end{pmatrix}$]`; `[Determinant of matrix $\begin{pmatrix} a & b \\\\ c & d \end{pmatrix} = ad-bc$]`; 2024-11 prints "Inverse" without "The" — quote the print, not the pattern); (d) strip footer variants wholesale — "Turn over for a spare grid…", "Turn to page N for a spare grid…", "A spare grid is on the next page…", "Only use this grid…" — plus stray fragments of NEIGHBOURING boxes fused into the stem (2025-06 02R 11-g carried "2a" off the quadratic-formula box).
22. **Grid-crop measurement law**: never eyeball crop rects. pdftotext -bbox gives the outermost axis tick-label word rects; grid bbox = their union padded (this wave: l16/t12/r18/b4 pt at 200dpi), with a per-paper minus-glyph policy (U+2212 vs U+2013 both occur across 4MB1 papers) and post-crop white-out for header fragments caught at ROI edges; every crop is VIEWED before push. **Mis-crop repair class**: an existing link whose asset renders as a sliver/fragment (asset_8_8-d.png 281x832 = one grid column) is a BROKEN figure — measure + push a correct crop, replace the link, disclose the orphan (do not delete mid-wave).
23. **Stub-to-crop law**: a `> *Figure not shown…*` stub whose printed figure is ESSENTIAL to the part (transformation/plotting grids are the canonical case) is crop-required — the full 4-leg attach law 7 applies to NEW crops too: crop + resources push + URL gate + inline link + REMOVE the stub note, one edit. The 3 zero-link stubs this wave (2020-06/2020-11 8-d, 2024-11 11-e) were unanswerable without their grids.

**Queue after run-016**: 2021-06 02 q2 solution misalignment (F4-class full MS rebuild); 2024-06 02R q2-a problemMd junk (polygon-label interleave, needs its own crop decision); displaced-sentence-head orphan census; 213 review:true crop verdict passes; 2020-01 02R 11-e legacy link modernization; SME/DB re-ingest + /0.2 provenance migration (operator-queued); PAT rotation STILL PENDING.
"""
with open(pb, "a") as f:
    f.write(addition)
print("playbook appended")

# ---- repo worklog append ----
wl = f"{ROOT}/.syllabai/worklog.md"
entry = """
---
Task ID: T-OEQ-MATHSB-SERVE-1 run-016
Agent: R7a main lane (operator session chat 1f3003b6, trace 1a180c961abffa3d, order "run-016")
Task: run-016 per the run-015 receipt disposition — the 53 SPARE-GRID-INSTR fused problemMd blocks (eyes-on surgical rebuild, 2019-06 02 4-e precedent class).

Work Log:
- State recovery: fetch-first (local clone stale at 4008e6ce -> ff to 0c00c123); runs 011-015 confirmed landed of record (PRs #404/#407/#411/#414/#417); local plane sha16 eabd5ca8b643f93f == run-015 receipt byte-exact.
- Evidence: 29 mirror QP PDFs fetched; token+qnum page-find (109 renders); 53/53 text-layer verification (37 PASS + 16 REVIEW); 18 vision reads covering every formula-box part, all 3 zero-link stubs, the odd-shape parts (2023-11 7-d/8-d, 2025-06 02R 11-g stray '2a', 2021-01 9-f 'N2'), and both grid-decision page pairs; footer variants of record pinned (Turn over / Turn to page N / next page / Only use this grid).
- Sibling part-boundary law established from 13 sibling dumps (lead-ins live on the PRECEDING part) — prevented 8 duplicate-stem rebuilds.
- Crops: 4 crop-required grids measured via pdftotext -bbox tick-label union (minus-glyph policy), rendered 200dpi, VIEWED, pushed to resources main via Contents API (1b79e25e/21cfccec/826ac7a8/4b0e9dac; 404 collision-check first; raw 200 x4 verified); 2023-11 asset_8_8-d sliver mis-crop link REPLACED (orphan disclosed).
- Apply (fail-closed run016_apply.py): 39 strips (marker-anchored stems preserved) + 14 rebuilds (8 KaTeX boxes, 3 evidenced text restorations, 4 crop attaches with stub-note removal); G1-G10 ALL GREEN first run after table assembly (assert fixes: 39+14 census); plane eabd5ca8b643f93f -> 5fc8abdba88325e8 (3710608 B).
- Post gates: katex 117/117; URL gate 56/56 (incl. 4 new); census/mark-union/PUA/FFFD/$-parity exact.
- Bookkeeping: receipt run-016-spare-grid-rebuilds.json (json.dump law) + playbook laws 21-23 + lane artifacts in-repo + evidence under download/t-oeq-mathsb/run016.

Stage Summary:
- run-016 CLOSED of record: the last F5 deferred class (53 fused spare-grid blocks) rebuilt from print, 4 grids restored to answerability, all 23 playbook invariants held.
- Queue after run-016 (in receipt): 2021-06 02 q2 MS rebuild; 2024-06 02R q2-a junk (needs polygon crop); orphan census; 213 crop review passes; 11-e legacy link; SME/DB + /0.2 (operator); PAT rotation STILL PENDING.
"""
with open(wl, "a") as f:
    f.write(entry)
print("repo worklog appended")

for p in (path, pb, wl):
    print(hashlib.sha256(open(p, "rb").read()).hexdigest()[:12], p)
