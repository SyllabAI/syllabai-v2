#!/usr/bin/env python3
"""run-008 preregistration builder — emits:
  run008-payload.json   (the pre-registered census gate + wave plan + discipline)
  run008-census.json    (the full machine-readable census of record)
Inputs: run008_census_result.json, run008_official_flat_candidates.json
Deterministic; pinned lists are the eyeball-adjudicated subsets."""
import json, re, hashlib
from collections import Counter, defaultdict

S = '/home/z/my-project/scripts'
census = json.load(open(f'{S}/run008_census_result.json'))
cands = json.load(open(f'{S}/run008_official_flat_candidates.json'))

FALSE_POS = {  # adjudicated: flattened figures / mark-scheme prose, NOT tables
    'offp_2022-06_2p_1-b',    # flattened DIAGRAM labels ("Toaster = 1068 W"); Q asks to DRAW a table
    'offp_2019-06_2p_2-b-ii', # mark-scheme prose referencing a table
    'offp_2023-06_2pr_6-b-v', # mark-scheme prose referencing a table
    'offp_2022-06_1p_11-b-i', # flattened GRAPH (axis values); "Table height" is an axis label
    'offp_2021-01_1pr_5-a',   # flattened GRAPH (velocity-time axis values); "table" = furniture
}
real_flat = [h for h in cands if h['pid'] not in FALSE_POS]

# ---- SME classes ----
sme_recs = census['sme_records']
def has_cls(r, c):
    return any(x.get('class') == c for x in r.get('defects', []))
onecol = []
corrupt = []
for r in sme_recs:
    for x in r.get('defects', []):
        if x.get('class') == '1COL_DEGENERATE':
            onecol.append({'set': r['set'], 'partId': r['partId'], 'field': x['field'],
                           'first': x.get('first', '')[:120]})
        elif x.get('class') == 'CORRUPT_HEADER':
            corrupt.append({'set': r['set'], 'partId': r['partId'], 'field': x['field'],
                            'header': x.get('header', '')[:120], 'cols': x.get('cols')})
per_set_1col = Counter(x['set'] for x in onecol)

rollup = census['rollup']
# ---- official per-paper distribution ----
by_paper = defaultdict(list)
for h in real_flat:
    by_paper[h['set']].append(h['pid'])
papers_clean = 55 - len(by_paper)

payload = {
    "lane": "T-OEQ-PHYS-FORMAT-1",
    "run": "run-008-table-format",
    "title": "the corpus-wide table-format wave — word-bank degenerates rebuilt (R1), corrupt dash-headers rebuilt (R3), the 56 flattened official tables rebuilt from their own content with page-evidence sampling (R2), census pre-registered fail-closed at open",
    "operatorOrder": "go and open run-008 with the census pre-registered from this audit. And there might be more issues like this with the rest of the papers, right?",
    "date": "2026-11-01",
    "anchors": {
        "v2_origin_main_at_recon": "b46d8a3 (run-007 7e5733b in history; plane of record sha unchanged f0945d29)",
        "v2_branch_base_at_open": "64fdb91 (fetch-first caught a concurrent base move b46d8a3->64fdb91 mid-open: PRs #593/#599 teach-me + course-pill content, zero contact with igcse-physics-19; both plane shas re-verified identical at the new tip before the branch was cut)",
        "resources_origin_main_at_open": "5a9d5f4 (integration/physics-stagea-20261101)",
        "questions.json_sha256_before": rollup['files']['questions.json']['sha256'],
        "official-papers.json_sha256_before": rollup['files']['official-papers.json']['sha256']
    },
    "censusOfRecord": {
        "classifier": "single unified pass per md field (problemMd, solutionMd, choices[].textMd, group_stem_md); a run = maximal consecutive pipe-bearing lines (strict |...| rows, or loose rows with internal pipes outside $...$ math, math segments preserved as atoms); a run renders as a table under remark-gfm iff it contains a delimiter row (:?-+:? per cell)",
        "sme_bank": {
            "sets": 24, "parts": 1135,
            "pipe_blocks_total": 151,
            "TABLE_OK_blocks": 119,
            "1COL_DEGENERATE_blocks": 29,
            "1COL_DEGENERATE_parts": 26,
            "CORRUPT_HEADER_blocks": 3,
            "FLATTENED_blocks": 0,
            "TABLE_MISMATCH_blocks": 0,
            "mathPipe_parts": 0,
            "note": "119+29+3 == 151 reconciles the earlier recon's pipe-block arithmetic EXACTLY (the recon's 119 'OK' counted only blocks in defect-free parts)"
        },
        "official": {
            "papers": 55, "parts": 2254,
            "pipe_blocks_total": 0,
            "flattened_table_parts": len(real_flat),
            "flattened_table_problemMd": sum(1 for h in real_flat if h['field'] == 'problemMd'),
            "flattened_table_solutionMd": sum(1 for h in real_flat if h['field'] == 'solutionMd'),
            "papers_affected": len(by_paper),
            "papers_clean": papers_clean,
            "figure_debris_parts_disclosed": 3,
            "note": "the earlier recon's '3 official MCQ parts' and '121 flattened rows / 93 SME parts' are NOT reproducible and are superseded by this census: the flattened-table class is OFFICIAL-side (paragraph-mashed tables, space-joined cells, one per part, content complete), SME-side count is 0; SME tables otherwise render as pipe tables, as images, or resolve via cross-part references"
        },
        "run007_served_gmd": {"items": 421, "table_or_mathpipe_hits": 0},
        "disclosed_representation_classes_OUT_OF_SCOPE": {
            "table_as_image_SME": "98 images / 65 parts — legitimate image representation, renders; transcription is a separate operator decision",
            "table_as_image_official": "122 images / 107 parts — same disposition",
            "sme_cross_part_table_references": "16 fields — all resolve to a table in the same part's other field or a sibling part (verified per-field)",
            "official_figure_debris": ["offp_2022-06_1p_11-b-i (flattened graph)", "offp_2021-01_1pr_5-a (flattened graph)", "offp_2022-06_2p_1-b (flattened diagram)"]
        }
    },
    "scope": {
        "R1_wordbank": {
            "what": "29 one-column degenerate pipe blocks (single cell holding the whole word bank, words flattened with 2+ space separators, bank rows joined by <br><br>) -> rebuild as the true N-column GFM table per the original layout",
            "parts": 26, "blocks": 29,
            "law": "parse bank rows by <br><br>, words by 2+ space runs; column count N and row order taken from page evidence (SME set page / source paper); fail-closed: no page evidence for a block -> abort that block, do not guess",
            "per_set": dict(sorted(per_set_1col.items()))
        },
        "R3_corrupt_header": {
            "what": "3 blocks whose header row carries long dash runs (scrape rule-artifacts: $----\\rightarrow$ arrow debris, -----<br><br>in -----) -> rebuild the header from page evidence",
            "pids": [c['partId'] for c in corrupt]
        },
        "R2_official_flattened": {
            "what": "56 official parts whose tables were flattened INTO prose (space-joined cells on one paragraph; 54 problemMd incl. group_stem_md-served, 2 solutionMd mark-scheme tables) -> rebuild as proper GFM tables",
            "law": "rebuild from the flattened text's own content (cells are all present) with column semantics from the header runs; page-evidence sampling pre-registered: verify the first 8 rebuilds (>= 14%) against the original paper pages (corpus source_page / Edexcel paper) before the class-wide write; any sampled mismatch -> abort the class, re-derive per-part",
            "corpusLocations": "Official-ExamQuestion/igcse-physics-19/<session>/<4PH1-xP>/topic.json: groups[letter].group_stem_md + parts[].problem_md / solution_md; verified example: 2019-06/4PH1-1P groups.b.group_stem_md carries the 6(b)(i) lamp table",
            "pinned_pids": sorted(set(h['pid'] for h in real_flat))
        }
    },
    "wavePlan": [
        "W1 (this commit): census pre-registered fail-closed on the run branch — no corpus/plane bytes touched",
        "W2 resources leg A: SME corpus fixes R3 (3 blocks) + R1 (29 blocks, 13 topic.json files) under SME-ExamQuestion/igcse-physics-19/<section>/<topic>/topic.json; questions.md regen rides the wave (standing statute); mark-schemes.md untouched unless it mirrors a touched field",
        "W3 resources leg B: official R2 rebuild over the 41 topic.json files (56 parts), page-evidence sampling first 8, then the class write",
        "W4 v2 leg: exporter-of-record re-export -> new official-papers.json + questions.json serving planes; manifest importSource re-stamp with lineage preserved verbatim (stamp convention)",
        "W5 closure: G1-G8 + the pre-registered census gate (G9) green; receipt + worklog + evidence in the PRs; squash-merge; branch delete"
    ],
    "gates": {
        "G1_structure_marks": "55 official sets / 540 questions / 2254 parts and 24 SME sets / 489 questions / 1135 parts constant; marks[] untouched",
        "G2_identity_reconstruction": "every changed value reconstructs as exactly its intended field write; every other leaf byte-equal",
        "G3_pua_control": "0 PUA / U+FFFD / C0 in every written value (file-level both sides)",
        "G4_raw_dollar_accounting": "dollar char count conserved per edited value except the documented $----→$ dash-debris removals in the 3 R3 headers (pre-registered exception, per-value accounting in receipt)",
        "G5_katex_gate": "no NEW $...$ math segments introduced by any write (R3 removes debris, R1/R2 write plain cells)",
        "G6_serialization_byte_law": "topic.json json.dumps(indent=1, ensure_ascii=False) no trailing newline; plane emission via the exporter of record; manifest compact single-line",
        "G7_zero_touch": "only the pre-registered fields differ; zero collateral diffs",
        "G8_idempotence": "exporter re-export == the post-fix plane (0 deltas)",
        "G9_census_gate_FAIL_CLOSED": "re-run the census classifier post-fix: SME 1COL_DEGENERATE=0, CORRUPT_HEADER=0, FLATTENED=0, TABLE_OK=151 (119 surviving + 29 R1 + 3 R3 rebuilds), mathPipe=0; official candidate net re-run = 0 hits on the 56 pinned pids; image-table surface counts UNCHANGED (98 SME / 122 official instances); any mismatch aborts the run"
    },
    "discipline": "fetch-first at open (v2 b46d8a3, resources 5a9d5f4); read-only recon before any write; laws pre-registered and fail-closed (no-evidence blocks abort, sampling mismatch aborts the class); zero DB/Neon/prod contact; receipt + worklog + evidence in the same PRs; no force on main; resources-corpus-first edit order; questions.md regen rides the wave",
    "answerToOperator": {
        "question": "there might be more issues like this with the rest of the papers, right?",
        "answer": "YES — quantified: 41 of 55 official papers carry at least one flattened table (56 parts, every session 2019-06 .. 2026-06 incl. june-2026-4ph1-1p itself: offp_2026-06_1p_9-b-i); the SME bank carries 32 defect blocks over 29 parts (29 word-bank blocks in 26 parts + 3 corrupt-header parts); 14 official papers and 1106 of 1135 SME parts are clean"
    },
    "reconciliation_disclosures": [
        "the earlier recon (lost sandbox) is superseded by this census; where both are comparable they reconcile exactly: 151 SME pipe blocks = 119 OK + 29 1COL + 3 CORRUPT",
        "the recon's '121 flattened rows / 93 SME parts + 3 official parts' is NOT reproducible: fresh pass finds SME flattened-pipe count 0 (SME tables are pipe tables, images, or resolvable cross-references) and the real flattened class is official-side, paragraph-mashed, 56 parts across 41 papers",
        "the recon's '3 corrupt dash-header parts' == this census's 3 CORRUPT_HEADER parts exactly (dBYF72XhxKfCG3qM, RnTnmqsKgsPg5bPV, dtqBs72bCBHhzmPW)",
        "the recon's june-2026-4ph1-1p single-paper inspection (earlier directive) is subsumed: the paper carries exactly 1 flattened table (offp_2026-06_1p_9-b-i, 2-col distance/speed table) and zero other table defects; its run-007 group stems serve clean"
    ]
}

census_artifact = {
    "lane": payload['lane'], "run": payload['run'],
    "date": payload['date'],
    "anchors": payload['anchors'],
    "sme_bank": {
        **rollup['sme_bank'],
        "1COL_blocks": onecol,
        "CORRUPT_blocks": corrupt,
    },
    "official": {
        "flattened_real": real_flat,
        "adjudicated_false_positives": [
            {**h, "verdict": "flattened figure / mark-scheme prose, NOT a table"} for h in cands if h['pid'] in FALSE_POS
        ],
        "per_paper": {k: sorted(v) for k, v in sorted(by_paper.items())},
        "detector": "scripts/run008_official_flat.py (candidate net: table-mention + >=6 bare numeric tokens in one paragraph, or ';;;;;' debris; every candidate eyeball-adjudicated)",
    },
    "gmd_scan": rollup['run007_gmd_scan'],
}

with open(f'{S}/run008-payload.json', 'w') as f:
    json.dump(payload, f, indent=1, ensure_ascii=False)
with open(f'{S}/run008-census.json', 'w') as f:
    json.dump(census_artifact, f, indent=1, ensure_ascii=False)
print('payload bytes:', len(json.dumps(payload)))
print('census bytes:', len(json.dumps(census_artifact)))
print('R1 blocks:', len(onecol), '| R3 parts:', len(corrupt), '| R2 parts:', len(real_flat))
print('pinned official pids:', len(set(h['pid'] for h in real_flat)))
