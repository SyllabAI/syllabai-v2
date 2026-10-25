#!/usr/bin/env python3
"""
import_ugm.py — Underground Mathematics lane bundle importer for the hub.

Mirrors the import_content.py discipline: reads a LOCAL checkout/snapshot of
SyllabAI/syllabai-resources at a pinned ref (never GitHub at runtime), and
emits a versioned, self-describing JSON bundle committed under content/.

Sources of record (course cie-a-level-maths-20-pure-1, eight UGM lanes):
  - lane 1 (quadratics): UGM-Enrichment/...-quadratics.json (#55) +
    UGM-Resources/pure-1-quadratics/ (#58), landed of record main@91eed732
  - lane 2 (functions):  UGM-Enrichment/...-functions.json +
    UGM-Resources/pure-1-functions/ (PR #61, T-UGM-MODE1-2 / T-UGM-IMPORT-2),
    landed of record main@a32c6c0f
  - lane 3 (coordinate geometry): UGM-Enrichment/...-coordinate-geometry.json +
    UGM-Resources/pure-1-coordinate-geometry/ (PR #66, T-UGM-MODE1-3 /
    T-UGM-IMPORT-3), landed of record main@7e11a74c — the FIRST multi-station
    lane (Geometry of Equations + Circles under one spine subtopic; the
    enrichment's stationScope block is the of-record station breakdown)
  - lane 4 (circular measure — the FIRST STRAND lane, no dedicated UGM
    station): UGM-Enrichment/...-circular-measure.json +
    UGM-Resources/pure-1-circular-measure/ (PR #74, T-UGM-MODE1-4 /
    T-UGM-IMPORT-4), landed of record main@1585c4ff — new-text subset only
    (5 resources from four stations' strand sweeps); the circles station's
    strand mappings are cross-lane facts joined against their existing lane-3
    bodies (see the cross-lane join below)
  - lane 5 (trigonometry — the SECOND two-station lane, the lanes 1-3 shape):
    UGM-Enrichment/...-trigonometry.json + UGM-Resources/pure-1-trigonometry/
    (PR #79, T-UGM-MODE1-5 / T-UGM-IMPORT-5), landed of record main@cf79ecd2 —
    the WHOLE two-station substrate as text of record (77 files: 41 mapped
    across Trigonometry: Triangles to Functions + Trigonometry: Compound
    Angles plus two cross-station strays, and 36 recorded non-overlaps
    imported unmapped — the compound-angles station maps mostly to P3 2.3),
    plus two cross-lane fact joins against the existing lane-2 bodies
    (r9924/r8411 → 1.5.4; r9924 flips its lane-2 non-overlap of record,
    r8411 gains a second spec row)
  - lane 6 (series — the THIRD two-station lane, the lanes 1-3 shape):
    UGM-Enrichment/...-series.json + UGM-Resources/pure-1-series/
    (PR #89, T-UGM-MODE1-6 / T-UGM-IMPORT-6), landed of record main@bcc36476 —
    the WHOLE two-station substrate as text of record (99 files: 49 mapped
    across Sequences + Counting & Binomials — 43 substrate + 6 cross-station
    strays — and 50 recorded non-overlaps imported unmapped: the counting
    station is combinatorics/logic-dominated around a binomial core, and the
    general-index binomial questions carry recorded P3 Series non-overlap
    verdicts), plus two cross-lane fact joins against the existing lane-2
    bodies (r7553/r9527 → 1.6.3; both lane-2 aligned of record, one-to-many
    second rows, text untouched under pure-1-functions)
  - lane 7 (differentiation — the FOURTH two-station lane, the lanes 1-3/5/6
    shape): UGM-Enrichment/...-differentiation.json +
    UGM-Resources/pure-1-differentiation/
    (PR #91, T-UGM-MODE1-7 / T-UGM-IMPORT-7, + the T-UGM-MODE1-7 amendment
    PR #92), landed of record main@39e1568abb68c4647cf9ec9cc90a20ba236c0207 —
    the WHOLE two-station calculus substrate as text of record (106 files:
    72 new-text substrate across Introducing Calculus + Calculus of Powers —
    40 mapped + 32 recorded non-overlaps imported unmapped, the honest
    trapezium-rule/kinematics cluster — plus 34 mapped cross-station strays
    from five further calculus stations whose tested skill is 1.7.x), with
    three cross-lane fact joins (r5640 → 1.7.2+1.7.4 one-to-many against the
    lane-6 text; r7115/r8936 → 1.7.4 against the lane-4 text — both lane-4
    non-overlaps of record FLIP to aligned, reasons retained; 86 further
    candidates routed to recorded P3 homes), enriched by T-UGM-MODE1-7
    amendment stationBreakdown alignment (IC nonOverlap 15 of record)
  - lane 8 (integration — the SECOND STRAND lane, the first lane whose pick
    set is entirely cross-lane joined text): UGM-Enrichment/...-integration.json +
    UGM-Resources/pure-1-integration/
    (PR #96, T-UGM-MODE1-8 / T-UGM-IMPORT-8, + the T-UGM-MODE1-8 amendment
    PR #99), landed of record main@8c6339bd115034d2762e6c142256151f9ded3412 —
    the strand-lane shape at its honest end: UGM has no integration station
    and both dedicated calculus stations are already fully of record via
    lane 7, so the new-text universe is the 10 unrecorded calculus-family
    resources whose tested skill is 1.8.x (calculus-meets-functions 7 +
    chain-rule 2 + product-rule 1 — all 10 ship mapped, 0 non-overlaps), and
    every further 1.8 alignment is a cross-lane fact join against
    already-of-record lane-7 bodies (18 joins: 13 of lane 7's 17
    integration-dressed Calculus-of-Powers non-overlaps FLIP to 1.8.x
    alignments with reasons retained; 5 gain one-to-many rows beside standing
    1.7 alignments). The four 1.8 picks (r8716/r7734/r6067/r9357) ride the
    join entirely — the #99 amendment flags them on the crossLaneAligned
    rows, the per-resource pick-flag parity the hub regression law's
    primaryPick-resolution invariant requires
  all under ADR-UGM-0001 (as amended 2026-10-23) + the operator attestation
  of 2026-10-23 ("downloaded text can ship into SyllabAI. We have permission").
  - lane 8a (T-UGM-HUB-CONSUME-8a — the IMAGE PLANE, corpus PR #107 /
    T-UGM-ASSETS-1): UGM-Resources/figures-map.json + UGM-Assets/** (976
    static figures, 37.7 MB, paths mirroring the UGM site) land of record at
    main@404b4ed5ff922509205c4475aca03a7d6b902128 under the operator
    attestation of 2026-10-24 ("I want the syllabai frontend to use those
    images then"). The importer copies the referenced binaries to
    apps/hub/public/ugm-assets/ and injects figure references into the served
    bodyMd at deterministic section positions (end of the figure's section,
    document order, per-section ordinals) — the same index→row transform
    class as the T-UGM-MODE1-8 pick-flag amendment. The corpus text bodies
    stay byte-untouched (the map is the of-record figure knowledge); every
    injected ref must resolve to a copied asset, every map section must
    match a body heading, per-resource counts must equal the map (all
    fail-closed). GeoGebra embeds and PDFs stay excluded.
  - lane 8b (T-UGM-HUB-CONSUME-8b — PROSE FIGURE LOCALIZATION, operator order
    "Localize them" trace 1a16f05ae07006a5): the text-only converter left 282
    inline figure placeholders in the bodies — lines shaped
    `> [figure: <caption> — `https://undergroundmathematics.org/<path>`]`
    `(image not included in the text import; path of record).` — every one of
    them a bare external UGM image link. All 282 resolve to binaries already
    committed under UGM-Assets/ AND already covered by figures-map rows of the
    SAME resource (245 unique paths, 54 resources; verified 2026-10-25). The
    importer now matches each placeholder to its map row (same sec+path first,
    then same path in document order — fail-closed if any placeholder has no
    unmatched row) and renders that row INLINE at the placeholder's
    position-accurate spot (`![alt](/ugm-assets/<path>)`), replacing the
    placeholder construct; map rows without a placeholder twin keep the
    section-end injection. The per-ref count law is unchanged (every map row
    renders exactly once — inline or section-end), the corpus stays
    byte-untouched, and a new fail-closed audit demands ZERO un-localized
    image placeholders across the served bundle.
  - lane 9 (T-UGM-HUB-CONSUME-9 — the FIRST lane on a SECOND course plane,
    corpus PR #114): content/cie-a-level-maths-20-pure-3/ugm-resources.json —
    CIE 9709 Pure 3 subtopic 3.1 Algebra (spec points 3.1.1–3.1.6, the
    repaired spine rows of record per T-SPECS-CIE-PARSE-REPAIR-1), built on
    the lane-8 candidate-model shape: no dedicated UGM 'algebra' station
    exists, so the 35 fresh bodies span 15 corpus stations (polynomials 25 /
    product-rule 3 / thinking-about-functions 2 / power-series 2 /
    chain-rule 2 / hyperbolic-functions 1), 16 non-overlaps ride
    nonOverlapRows with bodyImported=false (by reference, no text), and the
    9 cross-lane rows are CROSS-COURSE joins: their text of record lives
    under pure-1 lane dirs (pure-1-functions ×3, pure-1-series ×4,
    pure-1-differentiation ×1, pure-1-integration ×1), so they join the
    bundle BY REFERENCE (coverage.crossCourse with servedUnder pointers) —
    first-of-record body wins under the pure-1 bundle, nothing is duplicated
    here. Figure plane: the figures-map of record predates lane 9 (no map
    rows for the 35 fresh bodies and no placeholders in them — the rebuilt
    converter renders figcaption text only), so the pure-3 serve ships
    figures=0 honestly pending a T-UGM-ASSETS-2 corpus amendment; the figure
    audits are therefore RUN-SCOPED (a course run is audited against its own
    map rows — the pure-1 run's census is unchanged).
  - lane 10 (T-UGM-HUB-CONSUME-10 — the SECOND lane on the pure-3 course
    plane, corpus PR #119): content/cie-a-level-maths-20-pure-3/
    ugm-resources.json — CIE 9709 Pure 3 subtopic 3.2 Logarithmic and
    exponential functions (spec points 3.2.1–3.2.4, the verbatim spine rows
    of record; no fold fragments), the dedicated-station-plus-strays shape:
    the substrate is UGM's dedicated Exponentials & Logarithms station (31
    fresh of 34 — it held only 2 of-record resources before this lane, both
    now cross-course joins), plus 3 strays whose tested skill is 3.2.x
    (to-the-limit from calculus-trig-log — the e-defining special case — and
    r7077 + powerful-fractions from thinking-about-algebra, both lane-5
    pre-baked "2.2 Logarithmic and exponential functions" routings landing),
    26 non-overlaps ride nonOverlapRows with bodyImported=false (by
    reference, no text), and the 5 cross-lane rows are CROSS-COURSE joins
    against pure-1 bodies (r9824/r7607 pure-1-functions, r6137/r8260
    pure-1-series, r7184 pure-1-trigonometry — all one-to-many additions to
    bodies already of record, no flips; the lane-9 nonOverlapByReference row
    to-log-or-not-to-log flips to aligned WITH a fresh body under 3.2.3).
    Figure plane unchanged: figures=0 honestly (the map of record predates
    the lane; the rebuilt converter renders figcaption text only).
  - lane 11 (T-UGM-HUB-CONSUME-11 — the THIRD lane on the pure-3 course
    plane, corpus PR #126): content/cie-a-level-maths-20-pure-3/
    ugm-resources.json — CIE 9709 Pure 3 subtopic 3.3 Trigonometry (spec
    points 3.3.1–3.3.2, the verbatim spine rows of record; no fold
    fragments), the FIRST MOSTLY-MAPPING lane: the dedicated
    trigonometry-compound-angles station is WHOLE-IMPORTED of record under
    lane 5 (the two-station lane law predating the candidate model), so the
    lane-5 pre-baked 'P3 2.3' pool maps BY REFERENCE — 27 of the 28 aligned
    rows are CROSS-COURSE joins against pure-1-trigonometry bodies (23 flips
    of the lane-5 pool + 4 one-to-many beside standing 1.5.x alignments; the
    lane-9 flip law, no new text), and the lane's only fresh body is the
    3.3.1 pick r7616 (a calculus-trig-log stray — the lane's single new text
    of record). The 42 non-overlaps ride nonOverlapRows with
    bodyImported=false (by reference, no text; 9 disclose textOfRecordUnder
    per the supersede disclosure law — their bodies of record live under
    pure-1-trigonometry); the 3.3.2 pick r6018 rides its reference row
    (fresh-pick convention impossible — disclosed of record). Figure plane
    unchanged: figures=0 honestly (the map of record predates the lane; the
    fresh body carries no map rows and no placeholders).

Output: content/<lane>/ugm-resources.json, schema
"syllabai-demo.ugm-lane-resources/1.1" (multi-lane) — per-spec-point resource
groups with byte-true markdown bodies (UGM's native \\( \\) / \\[ \\] delimiters
are kept; the hub renderer's normalizeCorpusMath already supports them) plus
the declared non-overlaps. Schema 1.0 (single station) is superseded: the
singular `station`/`stationUrl` become `stations[]`, `source.enrichment` /
`source.resourcesDir` become per-lane arrays, each resource gains its `station`
slug (its front-matter UGM station — multi-station lanes carry several under
one lane), and `coverage` gains a per-lane breakdown. Serve-side gating is the
flags.json law (absent=OFF), not this file — the bundle landing alone does not
surface anything.

Usage:
  python3 scripts/import_ugm.py --repo <syllabai-resources-snapshot-dir> \
      [--ref main@bcc36476c3ee207f8e7ea77904e490f6fdbc0cd6] \
      [--lane cie-a-level-maths-20-pure-1]

The script audits before writing (fail-closed, PER LANE): enrichment row
census, blob identity (sha256 vs MANIFEST.json v2 lane block), the
stationScope/stationBreakdown census for multi-station lanes, front-matter ↔
enrichment spec-point set equality per resource, primaryPick uniqueness,
delimiter balance per body — ANY failure aborts with no file written. The
CROSS-LANE JOIN (strand lanes, lane 4+) adds its own fail-closed audits:
joined ugmIds must exist among earlier lanes' bodies, textOfRecordUnder must
name the lane_dir that supplies the body, row codes must exist in the lane's
own perSpecPoint, and no (resource, code) may be double-claimed.
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import sys

try:
    import yaml
except ImportError:
    sys.exit("PyYAML required (same as import_content.py)")

FM_RE = re.compile(r"\A---\n(.*?)\n---\n", re.S)

SCHEMA = "syllabai-demo.ugm-lane-resources/1.1"
ENRICHMENT_SCHEMA = "syllabai.ugm-spec-enrichment/1.0"
# T-UGM-HUB-CONSUME-11: pin advanced past lane 11 (T-UGM-MODE1-11 /
# T-UGM-IMPORT-11, corpus PR #126, merge commit 3c2ecfa4 — the
# pure-3-trigonometry corpus: 1 fresh body, MANIFEST v12, fleet 549).
# Pure-1 inputs AND the lane-9/10 pure-3 inputs are byte-identical
# 2f31fcad → 3c2ecfa4 (the lane-11 PR touches
# UGM-Resources/pure-3-trigonometry/** + its enrichment + shared
# bookkeeping only — verified pin-to-pin: the enrichment README + the
# trigonometry enrichment + MANIFEST.json (strictly additive lane-11
# block) + the resources README + the r7616 body; the earlier lane
# blocks are unchanged).
DEFAULT_REF = "main@3c2ecfa4dc5e106d72d5a8db67bc72a26dc529b6"
DEFAULT_LANE = "cie-a-level-maths-20-pure-1"

# T-UGM-HUB-CONSUME-8a: the figure map + assets of record (corpus PR #107)
FIGURES_MAP = os.path.join("UGM-Resources", "figures-map.json")
ASSETS_DIR = "UGM-Assets"
SERVE_PREFIX = "/ugm-assets/"

# T-UGM-HUB-CONSUME-8b: the converter's inline figure placeholders (the only
# remaining external UGM image references in the served bodies). Shape of
# record (282 occurrences, note text uniform):
#   `> [figure: <caption> — `<url>`] (image not included in the text import;
#   path of record).`  — optionally the leading `> ` (blockquote/table cell),
#   optionally a trailing period.
UGM_URL_RE = re.compile(r"^https?://(?:www\.)?undergroundmathematics\.org/", re.I)
IMG_EXT_RE = re.compile(r"\.(png|jpe?g|gif|svg|webp)$", re.I)
PLACEHOLDER_RE = re.compile(
    r"(?:>\s*)?\[figure:\s*(?P<cap>.*?)\s*—\s*`(?P<url>[^`]+)`\]"
    r"\s*\((?P<note>[^)]*)\)(?P<dot>\.)?"
)

# Per-course UGM lane mapping. Single-station blocks (`station` + `title`)
# mirror one UGM station; multi-station blocks (lane 3+) declare `laneSlug` +
# `laneTitle` + `stations[]` and are audited against the enrichment's
# stationScope of record. STRAND lanes (lane 4+) are multi-station blocks
# whose res_dir carries only the new-text subset — the strand's cross-lane
# mappings ride the enrichment's crossLaneAligned/crossLaneNonOverlap blocks
# and are joined against earlier lanes' bodies. The bundle merges lanes (a
# course's UGM surface is one index).
# expected: {resources, rows, aligned, nonOverlap} — the audited census of record.
LANE_STATIONS = {
    "cie-a-level-maths-20-pure-1": [
        {
            "station": "quadratics",
            "title": "Quadratics",
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-1-quadratics.json",
            "res_dir": "UGM-Resources/pure-1-quadratics",
            "ledger": "LEDGER.md — T-UGM-MODE1-1 (#55) and T-UGM-IMPORT-1 (#58)",
            "expected": {"resources": 59, "rows": 61, "aligned": 56, "nonOverlap": 3},
        },
        {
            "station": "combining-functions",
            "title": "Combining Functions",
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-1-functions.json",
            "res_dir": "UGM-Resources/pure-1-functions",
            "ledger": "LEDGER.md — T-UGM-MODE1-2 and T-UGM-IMPORT-2 (PR #61)",
            "expected": {"resources": 38, "rows": 50, "aligned": 27, "nonOverlap": 11},
        },
        {
            "laneSlug": "coordinate-geometry",
            "laneTitle": "Coordinate Geometry",
            "stations": [
                {"slug": "geometry-of-equations", "title": "Geometry of Equations"},
                {"slug": "circles", "title": "Circles"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-1-coordinate-geometry.json",
            "res_dir": "UGM-Resources/pure-1-coordinate-geometry",
            "ledger": "LEDGER.md — T-UGM-MODE1-3 and T-UGM-IMPORT-3 (PR #66)",
            "expected": {"resources": 85, "rows": 77, "aligned": 61, "nonOverlap": 24},
        },
        {
            "laneSlug": "circular-measure",
            "laneTitle": "Circular Measure",
            "stations": [
                {"slug": "thinking-about-geometry", "title": "Thinking about Geometry"},
                {"slug": "introducing-calculus", "title": "Introducing Calculus"},
                {"slug": "product-rule", "title": "Product Rule & Integration by Parts"},
                {"slug": "chain-rule", "title": "Chain Rule & Integration by Substitution"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-1-circular-measure.json",
            "res_dir": "UGM-Resources/pure-1-circular-measure",
            "ledger": "LEDGER.md — T-UGM-MODE1-4 and T-UGM-IMPORT-4 (PR #74)",
            "expected": {"resources": 5, "rows": 3, "aligned": 3, "nonOverlap": 2},
        },
        {
            "laneSlug": "trigonometry",
            "laneTitle": "Trigonometry",
            "stations": [
                {"slug": "trigonometry-triangles-to-functions",
                 "title": "Trigonometry: Triangles to Functions"},
                {"slug": "trigonometry-compound-angles", "title": "Trigonometry: Compound Angles"},
                {"slug": "introducing-calculus", "title": "Introducing Calculus"},
                {"slug": "exp-and-log", "title": "Exponentials & Logarithms"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-1-trigonometry.json",
            "res_dir": "UGM-Resources/pure-1-trigonometry",
            "ledger": "LEDGER.md — T-UGM-MODE1-5 and T-UGM-IMPORT-5 (PR #79)",
            "expected": {"resources": 77, "rows": 55, "aligned": 39, "nonOverlap": 36},
        },
        {
            "laneSlug": "series",
            "laneTitle": "Series",
            "stations": [
                {"slug": "sequences", "title": "Sequences"},
                {"slug": "counting-and-binomials", "title": "Counting & Binomials"},
                {"slug": "chain-rule", "title": "Chain Rule & Integration by Substitution"},
                {"slug": "thinking-about-algebra", "title": "Thinking about Algebra"},
                {"slug": "divisibility-and-induction", "title": "Divisibility & Induction"},
                {"slug": "exp-and-log", "title": "Exponentials & Logarithms"},
                {"slug": "introducing-calculus", "title": "Introducing Calculus"},
                {"slug": "product-rule", "title": "Product Rule & Integration by Parts"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-1-series.json",
            "res_dir": "UGM-Resources/pure-1-series",
            "ledger": "LEDGER.md — T-UGM-MODE1-6 and T-UGM-IMPORT-6 (PR #89)",
            "expected": {"resources": 99, "rows": 56, "aligned": 43, "nonOverlap": 50},
        },
        {
            "laneSlug": "differentiation",
            "laneTitle": "Differentiation",
            "stations": [
                {"slug": "introducing-calculus", "title": "Introducing Calculus"},
                {"slug": "calculus-of-powers", "title": "Calculus Of Powers"},
                {"slug": "chain-rule", "title": "Chain Rule"},
                {"slug": "calculus-meets-functions", "title": "Calculus Meets Functions"},
                {"slug": "calculus-trig-log", "title": "Calculus Trig Log"},
                {"slug": "product-rule", "title": "Product Rule"},
                {"slug": "power-series", "title": "Power Series"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-1-differentiation.json",
            "res_dir": "UGM-Resources/pure-1-differentiation",
            "ledger": "LEDGER.md — T-UGM-MODE1-7 and T-UGM-IMPORT-7 (PR #91) + the T-UGM-MODE1-7 amendment (PR #92)",
            "expected": {"resources": 106, "rows": 107, "aligned": 40, "nonOverlap": 32},
        },
        {
            "laneSlug": "integration",
            "laneTitle": "Integration",
            "stations": [
                {"slug": "calculus-meets-functions", "title": "Calculus meets Functions"},
                {"slug": "chain-rule", "title": "Chain Rule & Integration by Substitution"},
                {"slug": "product-rule", "title": "Product Rule & Integration by Parts"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-1-integration.json",
            "res_dir": "UGM-Resources/pure-1-integration",
            "ledger": "LEDGER.md — T-UGM-MODE1-8 and T-UGM-IMPORT-8 (PR #96) + the T-UGM-MODE1-8 amendment (PR #99)",
            "expected": {"resources": 10, "rows": 28, "aligned": 28, "nonOverlap": 0},
        },
    ],
    # T-UGM-HUB-CONSUME-9: the pure-3 course plane — CIE 9709 Pure 3, lane 9
    # (subtopic 3.1 Algebra, spec points 3.1.1–3.1.6). Candidate-model lane
    # (lane-8 shape): no dedicated UGM 'algebra' station — the substrate is
    # corpus-wide, so the block declares ALL 15 skill-bearing stations of
    # record (the enrichment's stationScope); only 6 carry fresh bodies.
    # The 9 cross-lane rows of record are CROSS-COURSE joins against pure-1
    # bodies (joined by reference — see the module docstring).
    "cie-a-level-maths-20-pure-3": [
        {
            "laneSlug": "algebra",
            "laneTitle": "Algebra",
            "stations": [
                {"slug": "calculus-trig-log", "title": "Calculus of Trigonometry & Logarithms"},
                {"slug": "chain-rule", "title": "Chain Rule & Integration by Substitution"},
                {"slug": "combining-functions", "title": "Combining Functions"},
                {"slug": "combining-vectors", "title": "Combining Vectors"},
                {"slug": "counting-and-binomials", "title": "Counting & Binomials"},
                {"slug": "divisibility-and-induction", "title": "Divisibility & Induction"},
                {"slug": "exp-and-log", "title": "Exponentials & Logarithms"},
                {"slug": "hyperbolic-functions", "title": "Hyperbolic Functions"},
                {"slug": "polynomials", "title": "Polynomials & Rational Functions"},
                {"slug": "power-series", "title": "Power Series"},
                {"slug": "product-rule", "title": "Product Rule & Integration by Parts"},
                {"slug": "thinking-about-algebra", "title": "Thinking about Algebra"},
                {"slug": "thinking-about-functions", "title": "Thinking about Functions"},
                {"slug": "thinking-about-geometry", "title": "Thinking about Geometry"},
                {"slug": "thinking-about-numbers", "title": "Thinking about Numbers"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-3-algebra.json",
            "res_dir": "UGM-Resources/pure-3-algebra",
            "ledger": "LEDGER.md — T-UGM-MODE1-9 and T-UGM-IMPORT-9 (PR #114)",
            "expected": {"resources": 35, "rows": 47, "aligned": 47, "nonOverlap": 16},
        },
        {
            # T-UGM-HUB-CONSUME-10: the pure-3 plane's second lane — CIE 9709
            # Pure 3 subtopic 3.2 Logarithmic and exponential functions (spec
            # points 3.2.1–3.2.4), the dedicated-station-plus-strays shape
            # (lanes 1-3 shape on the pure-3 plane): the dedicated
            # Exponentials & Logarithms station + two stray stations. The 5
            # cross-lane rows of record are CROSS-COURSE joins against pure-1
            # bodies (joined by reference — see the module docstring); the
            # 26 non-overlaps ride nonOverlapByReference (bodyImported=false).
            "laneSlug": "logarithmic-and-exponential-functions",
            "laneTitle": "Logarithmic and exponential functions",
            "stations": [
                {"slug": "exp-and-log", "title": "Exponentials & Logarithms"},
                {"slug": "calculus-trig-log", "title": "Calculus of Trigonometry & Logarithms"},
                {"slug": "thinking-about-algebra", "title": "Thinking about Algebra"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-3-logarithmic-and-exponential-functions.json",
            "res_dir": "UGM-Resources/pure-3-logarithmic-and-exponential-functions",
            "ledger": "LEDGER.md — T-UGM-MODE1-10 and T-UGM-IMPORT-10 (PR #119)",
            "expected": {"resources": 34, "rows": 39, "aligned": 39, "nonOverlap": 26},
        },
        {
            # T-UGM-HUB-CONSUME-11: the pure-3 plane's third lane — CIE 9709
            # Pure 3 subtopic 3.3 Trigonometry (spec points 3.3.1–3.3.2), the
            # FIRST MOSTLY-MAPPING lane: the dedicated
            # trigonometry-compound-angles station is whole-imported of
            # record under lane 5, so 27 of the 28 aligned rows are
            # CROSS-COURSE joins against pure-1-trigonometry bodies (23
            # flips + 4 one-to-many; joined by reference — see the module
            # docstring) and the only fresh body is the 3.3.1 pick r7616.
            # The 42 non-overlaps ride nonOverlapByReference
            # (bodyImported=false, 9 with textOfRecordUnder disclosures);
            # the 3.3.2 pick r6018 rides its reference row.
            "laneSlug": "trigonometry",
            "laneTitle": "Trigonometry",
            "stations": [
                {"slug": "trigonometry-compound-angles", "title": "Trigonometry: Compound Angles"},
                {"slug": "trigonometry-triangles-to-functions", "title": "Trigonometry: Triangles to Functions"},
                {"slug": "calculus-trig-log", "title": "Calculus of Trigonometry & Logarithms"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-3-trigonometry.json",
            "res_dir": "UGM-Resources/pure-3-trigonometry",
            "ledger": "LEDGER.md — T-UGM-MODE1-11 and T-UGM-IMPORT-11 (PR #126)",
            "expected": {"resources": 1, "rows": 28, "aligned": 28, "nonOverlap": 42},
        },
    ],
}

# T-UGM-HUB-CONSUME-9: res_dir basename → course key, for the cross-course
# join law (a crossLaneAligned row whose textOfRecordUnder names another
# course's lane dir joins BY REFERENCE instead of failing).
COURSE_OF_DIR = {
    os.path.basename(lb["res_dir"]): course
    for course, blocks in LANE_STATIONS.items()
    for lb in blocks
}


def fail(msg):
    print(f"AUDIT FAIL: {msg}")
    sys.exit(1)


def spec_code_key(code):
    parts = re.split(r"\.", str(code))
    return tuple(int(p) if p.isdigit() else p for p in parts)


def import_lane(repo, lane_block, course):
    """Run the full per-lane audit + join; returns the lane's bundle parts.

    Lane blocks come in two shapes: single-station (lanes 1-2: `station` +
    `title`) and multi-station (lane 3+: `laneSlug` + `laneTitle` +
    `stations[]`, audited against the enrichment's stationScope block).
    """
    station = lane_block.get("station") or lane_block["laneSlug"]
    st_slugs = [s["slug"] for s in lane_block.get("stations") or [{"slug": station}]]
    exp = lane_block["expected"]

    # ── 1. enrichment facts of record ────────────────────────────────────
    enr_path = os.path.join(repo, lane_block["enrichment"])
    with open(enr_path, encoding="utf-8") as fh:
        enr = json.load(fh)
    if enr.get("schema") != ENRICHMENT_SCHEMA:
        fail(f"[{station}] enrichment schema {enr.get('schema')!r} != {ENRICHMENT_SCHEMA}")
    if enr.get("review_state", {}).get("state") != "SUGGESTED":
        fail(f"[{station}] enrichment review_state is not SUGGESTED — refuse to import as if it were")
    if enr.get("coverage", {}).get("aligned") != exp["aligned"] or \
       enr.get("coverage", {}).get("nonOverlap") != exp["nonOverlap"]:
        fail(f"[{station}] enrichment coverage {enr.get('coverage', {}).get('aligned')}/"
             f"{enr.get('coverage', {}).get('nonOverlap')} != expected {exp['aligned']}/{exp['nonOverlap']}")

    # ── 1b. multi-station stationScope audit (new shape from lane 3) ────
    ss_by_slug = {}
    if lane_block.get("stations"):
        ss_stations = (enr.get("stationScope") or {}).get("stations")
        if not isinstance(ss_stations, list) or not ss_stations:
            fail(f"[{station}] multi-station lane but enrichment carries no stationScope.stations")
        ss_by_slug = {s.get("slug"): s for s in ss_stations}
        if sorted(ss_by_slug) != sorted(st_slugs):
            fail(f"[{station}] stationScope slugs {sorted(ss_by_slug)} != lane block {sorted(st_slugs)}")
        breakdown = enr.get("coverage", {}).get("stationBreakdown") or {}
        for s in lane_block["stations"]:
            sc = ss_by_slug.get(s["slug"], {})
            if sc.get("title") != s["title"]:
                fail(f"[{station}] stationScope title drift for {s['slug']}: {sc.get('title')!r} != {s['title']!r}")
            bk = breakdown.get(s["slug"])
            if not isinstance(bk, dict):
                fail(f"[{station}] no coverage.stationBreakdown entry for {s['slug']}")
            if any(bk.get(k) != sc.get(k) for k in ("resources", "aligned", "nonOverlap")):
                fail(f"[{station}] stationScope/stationBreakdown census drift for {s['slug']}")

    # ── 2. corpus text of record (blob identity vs MANIFEST.json v2) ────
    res_dir = os.path.join(repo, lane_block["res_dir"])
    with open(os.path.join(repo, "UGM-Resources", "MANIFEST.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    if manifest.get("manifest_version") == 2:
        lane_block_mf = next((b for b in manifest.get("lanes", [])
                              if b.get("lane_dir") == os.path.basename(lane_block["res_dir"])), None)
        if lane_block_mf is None:
            fail(f"[{station}] no MANIFEST v2 lane block for {lane_block['res_dir']}")
        entries = lane_block_mf.get("files", [])
    else:  # v1 single-lane manifest
        entries = manifest.get("files", [])
    by_rel = {}
    for e in entries:
        p = e.get("path") or e.get("file") or e.get("name")
        by_rel[p] = e
    n_expected = exp["resources"]
    files = sorted(f for f in os.listdir(res_dir) if f.endswith(".md"))
    if len(files) != n_expected or len(by_rel) != n_expected:
        fail(f"[{station}] file census {len(files)} md / {len(by_rel)} manifest entries != {n_expected}")
    for f in files:
        rel = f"{os.path.basename(lane_block['res_dir'])}/{f}"
        h = hashlib.sha256(open(os.path.join(res_dir, f), "rb").read()).hexdigest()
        if by_rel.get(rel, {}).get("sha256") != h:
            fail(f"[{station}] sha256 mismatch vs MANIFEST.json: {rel}")

    # ── 3. parse every resource: front-matter + byte-true body ─────────
    parsed = {}
    for f in files:
        text = open(os.path.join(res_dir, f), encoding="utf-8").read()
        m = FM_RE.match(text)
        if not m:
            fail(f"[{station}] no front-matter: {f}")
        fm = yaml.safe_load(m.group(1))
        body = text[m.end():]
        ri = fm.get("resource_identity") or {}
        ugm_id = ri.get("ugm_id")
        if not ugm_id:
            fail(f"[{station}] no ugm_id: {f}")
        if ugm_id in parsed:
            fail(f"[{station}] duplicate ugm_id: {ugm_id}")
        if lane_block.get("stations") and not ri.get("station"):
            fail(f"[{station}] multi-station lane requires front-matter station: {f}")
        fst = ri.get("station") or st_slugs[0]
        if fst not in st_slugs:
            fail(f"[{station}] front-matter station {ri.get('station')!r} not in lane stations {st_slugs}: {f}")
        # the corpus law: delimiters stay balanced per file (build audit law)
        if body.count(r"\(") != body.count(r"\)") or body.count(r"\[") != body.count(r"\]"):
            fail(f"[{station}] delimiter imbalance in {f}")
        if not body.strip():
            fail(f"[{station}] empty body: {f}")
        spec_pts = ((fm.get("spec_map") or {}).get("spec_points")) or []
        parsed[ugm_id] = {
            "ugmId": ugm_id,
            "file": f,
            "station": fst,
            "title": _title_from_fm_or_body(fm, body, ugm_id),
            "url": fm.get("source"),
            "resourceType": _tag_prefix(fm, "type/"),
            "resourceTypeLabel": ri.get("resource_type_label"),
            "level": ri.get("level"),
            "specPointsFromFm": [sp.get("code") for sp in spec_pts],
            "bodyMd": body,
        }
    for p in parsed.values():
        p["resourceType"] = (p["resourceType"] or "").replace("type/", "")

    # ── 4. join facts ↔ text (bodies stored ONCE; spec points reference) ─
    enr_by_slug = {}
    for code, block in enr["perSpecPoint"].items():
        for r in block.get("resources", []):
            slug = r.get("ugmSlug")
            if slug in enr_by_slug and code in enr_by_slug[slug]:
                fail(f"[{station}] enrichment lists {slug} twice under {code}")
            enr_by_slug.setdefault(slug, {})[code] = r

    non_overlap_slugs = [r.get("ugmSlug") for r in enr.get("nonOverlapRows", [])]
    resources, seen_ids = [], set()
    nonoverlap_byref = []  # T-UGM-HUB-CONSUME-9: bodyImported=false rows
    for slug in sorted(parsed):
        p = parsed[slug]
        if slug in non_overlap_slugs:
            continue  # handled after the aligned loop, with its own law
        codes_fm = sorted(p["specPointsFromFm"])
        codes_en = sorted(enr_by_slug.get(slug, {}))
        if codes_fm != codes_en:
            fail(f"[{station}] front-matter/enrichment spec-point drift: {slug} fm={codes_fm} enr={codes_en}")
        if not codes_fm:
            fail(f"[{station}] aligned resource with no spec points: {slug}")
        rows = enr_by_slug[slug]
        sp_rows = []
        for code in p["specPointsFromFm"]:
            r = rows[code]
            sp_rows.append({
                "code": code,
                "confidence": r.get("confidence"),
                "primaryPick": bool(r.get("primaryPick")),
                "note": r.get("note"),
                "modesRecorded": r.get("modesRecorded") or [],
            })
        primaries = [s["code"] for s in sp_rows if s["primaryPick"]]
        # T-UGM-MODE1-9 two-code law (corpus PR #114): a two-code resource may
        # be the primary pick of BOTH its codes (the of-record enrichment
        # flags inequalities under 3.1.1+3.1.2 and r6577 under 3.1.3+3.1.4).
        # Per-code uniqueness is enforced at the spec-point level (one pick
        # slug per perSpecPoint block) — here only a same-code double flag is
        # a defect.
        if len(primaries) != len(set(primaries)):
            fail(f"[{station}] resource claims primaryPick twice under the same code: {slug} {primaries}")
        seen_ids.add(slug)
        resources.append({
            "ugmId": slug,
            "slug": slug,
            "station": p["station"],
            "title": p["title"],
            "url": p["url"],
            "resourceType": p["resourceType"],
            "resourceTypeLabel": p["resourceTypeLabel"],
            "level": p["level"],
            "hasTeacherSupport": any(rows[c].get("hasTeacherSupport") for c in codes_fm),
            "nonOverlap": False,
            "specPoints": sp_rows,
            "bodyMd": p["bodyMd"],
        })

    for r in enr.get("nonOverlapRows", []):
        slug = r.get("ugmSlug")
        # T-UGM-HUB-CONSUME-9 candidate-model law (lane-8/9 shape): rows with
        # bodyImported=false have NO text of record — they ride the bundle's
        # coverage plane by reference only (honest disclosure, never served
        # as bodies).
        if r.get("bodyImported") is False:
            if slug in parsed:
                fail(f"[{station}] non-overlap marked bodyImported=false has a body here: {slug}")
            nonoverlap_byref.append({
                "ugmSlug": slug,
                "station": r.get("station"),
                "title": r.get("title"),
                "url": r.get("url"),
                "reason": r.get("reason"),
            })
            continue
        p = parsed.get(slug)
        if p is None:
            fail(f"[{station}] non-overlap slug not in corpus: {slug}")
        if p["specPointsFromFm"]:
            fail(f"[{station}] non-overlap has front-matter spec points: {slug}")
        if slug in seen_ids:
            fail(f"[{station}] non-overlap also aligned: {slug}")
        seen_ids.add(slug)
        resources.append({
            "ugmId": slug,
            "slug": slug,
            "station": p["station"],
            "title": r.get("title") or p["title"],
            "url": r.get("url") or p["url"],
            "resourceType": p["resourceType"],
            "resourceTypeLabel": p["resourceTypeLabel"],
            "level": p["level"],
            "hasTeacherSupport": False,
            "nonOverlap": True,
            "nonOverlapReason": r.get("reason"),
            "specPoints": [],
            "bodyMd": p["bodyMd"],
        })

    n = exp["resources"]
    if len(seen_ids) != n or len(resources) != n:
        fail(f"[{station}] join coverage {len(seen_ids)}/{len(resources)} != {n} resources")

    # spec-point index (official code order); bodies stay referenced by id.
    # T-UGM-HUB-CONSUME-9 cross-course law: perSpecPoint may carry rows whose
    # text of record lives under ANOTHER course's lane dirs (lane 9's nine
    # cross-course joins vs pure-1 bodies). Those join BY REFERENCE — they
    # enter neither the served resources nor the index ugmIds (the body
    # stays first-of-record under its own course bundle); each must be
    # reconciled 1:1 against crossLaneAligned (fail-closed both directions).
    cla_rows = enr.get("crossLaneAligned") or []
    cla_slugs = {r.get("ugmSlug") for r in cla_rows}
    cla_codes = {}
    for r in cla_rows:
        for c in r.get("codes") or []:
            cla_codes.setdefault(r.get("ugmSlug"), set()).add(c)
    spec_points, cross_rows = [], 0
    for code, block in sorted(enr["perSpecPoint"].items()):
        fresh, cross = [], []
        for r in block.get("resources", []):
            slug = r.get("ugmSlug")
            (fresh if slug in parsed else cross).append(slug)
        for slug in cross:
            if slug not in cla_slugs:
                fail(f"[{station}] {code}: non-body row {slug!r} is not a crossLaneAligned row of record")
            if code not in cla_codes.get(slug, set()):
                fail(f"[{station}] {code}: cross row {slug!r} not claimed for this code in crossLaneAligned")
            cross_rows += 1
        fresh_ids = sorted(set(fresh))
        if len(fresh_ids) != len(fresh):
            fail(f"[{station}] {code}: duplicate slug rows in perSpecPoint")
        # the pick may ride fresh text (lanes 1-3, 9's fresh picks) or a
        # cross row (lane-4's r5534, lane-8's all-cross-lane pick set) — both
        # of record; it must never be absent from both.
        if block.get("primaryPick") not in fresh_ids and block.get("primaryPick") not in cross:
            fail(f"[{station}] {code}: primaryPick {block.get('primaryPick')!r} not among the fresh or cross rows")
        spec_points.append({
            "code": code,
            "officialText": block.get("officialText"),
            "primaryPick": block.get("primaryPick"),
            "resourceCount": len(fresh_ids),
            "ugmIds": fresh_ids,
        })
    # reverse reconciliation: every crossLaneAligned (slug, code) must be
    # claimed in perSpecPoint (the lane-8/9 shape) OR name a same-course
    # lane dir (the lane-4 shape — the in-run join validates the supplier);
    # and no cross slug may ALSO have a body in this lane
    own_course_dirs = {os.path.basename(lb["res_dir"]) for lb in LANE_STATIONS[course]}
    psp_claims = {(code, r.get("ugmSlug"))
                  for code, block in enr["perSpecPoint"].items()
                  for r in block.get("resources", [])}
    for r in cla_rows:
        for c in r.get("codes") or []:
            if (c, r.get("ugmSlug")) in psp_claims:
                continue
            under = os.path.basename(r.get("textOfRecordUnder") or "")
            if under in own_course_dirs:
                continue
            fail(f"[{station}] cross-course: {r.get('ugmSlug')!r} claims {c} in crossLaneAligned but perSpecPoint does not list it and {under!r} is not a same-course lane dir")
    for slug in cla_slugs:
        if slug in parsed:
            fail(f"[{station}] cross-course: {slug!r} is crossLaneAligned AND has a body in this lane (double-claim)")

    total_rows = sum(len(sp["ugmIds"]) for sp in spec_points) + cross_rows
    if total_rows != exp["rows"]:
        fail(f"[{station}] row census {total_rows} (fresh {total_rows - cross_rows} + cross {cross_rows}) != {exp['rows']}")

    cov = enr.get("coverage", {})
    lane_coverage = {
        "station": station,
        "stationTitle": lane_block.get("laneTitle", lane_block.get("title", station)),
        "ugmResourcesConsidered": cov.get("ugmResourcesConsidered"),
        "aligned": cov.get("aligned"),
        "nonOverlap": cov.get("nonOverlap"),
        "alignedShare": cov.get("alignedShare"),
        "candidateRows": total_rows,
    }
    if enr.get("crossLaneAligned") or enr.get("crossLaneNonOverlap"):
        lane_coverage["crossLaneAligned"] = len(enr.get("crossLaneAligned") or [])
        lane_coverage["crossLaneNonOverlap"] = len(enr.get("crossLaneNonOverlap") or [])

    if lane_block.get("stations"):
        stations_ref = [{"slug": s["slug"], "title": s["title"],
                         "url": (ss_by_slug.get(s["slug"]) or {}).get("url")}
                        for s in lane_block["stations"]]
    else:
        stations_ref = [{"slug": station, "title": lane_block["title"],
                         "url": next(iter(enr["perSpecPoint"].values())).get("ugmStationUrl")}]

    return {
        "stations": stations_ref,
        "resources": resources,
        "spec_points": spec_points,
        "coverage": lane_coverage,
        "enr": enr,
        "lb": lane_block,
        "nonoverlap_byref": nonoverlap_byref,
    }


def _fig_alt(caption):
    """Alt text for the injected image line: the map caption, md-attribute safe."""
    t = re.sub(r"\s+", " ", caption or "").strip()
    return t.replace("[", "(").replace("]", ")").replace("\n", " ")


def apply_figures(resources, repo, copied_paths):
    """T-UGM-HUB-CONSUME-8a + 8b: localize every figure of record into the served bodyMd.

    Law of record (T-UGM-ASSETS-1 map + Amendment 2026-10-24; 8b per the
    operator order "Localize them", trace 1a16f05ae07006a5):
      - figures-map.json rows are (sec, ord, path, ref, kind, caption) per
        resource; the corpus text bodies are byte-untouched — the map is the
        of-record figure knowledge;
      - 8a: a map row without a placeholder twin renders as an
        `![alt](/ugm-assets/<path>)` markdown line at the END of its own
        section (immediately before the next `## ` heading or EOF), in
        document order — deterministic, section-anchored;
      - 8b: the converter's inline placeholder constructs
        `> [figure: <caption> — `<url>`] (image not included in the text
        import; path of record).` are the position-accurate occurrence spots.
        Each placeholder is matched 1:1 to an unmatched map row of the SAME
        resource (same sec+path preferred, then same path in document order)
        and that row renders INLINE at the placeholder's spot, replacing the
        construct (the leading `> ` and trailing period are consumed with it).
        The image moves from section-end to its true prose position — no
        double render, the per-ref count law is untouched;
      - fail-closed audits: every map path must exist in UGM-Assets/MANIFEST.json
        (sha256 checked at copy time) and have been copied to the serve dir;
        every map section must match a `##` heading in the body; every
        placeholder asset must be copied; every placeholder must find an
        unmatched map row; per-resource injected counts must equal the map
        rows; the RUN-SCOPED fleet census must equal the map's own rows for
        the run's resources (T-UGM-HUB-CONSUME-9: the map covers the whole
        corpus while a course run imports one plane — the pure-1 run's
        census is unchanged since every mapped resource is a pure-1 body);
        and ZERO un-localized image placeholders may remain across the
        served bundle.
    """
    fmap_path = os.path.join(repo, FIGURES_MAP)
    if not os.path.exists(fmap_path):
        fail(f"figure map of record missing: {FIGURES_MAP}")
    fmap = json.load(open(fmap_path, encoding="utf-8"))
    figures = fmap.get("figures") or {}
    heading_re = re.compile(r"^## (.+)$", re.M)
    injected = 0
    res_with = 0
    inline_total = 0
    # T-UGM-HUB-CONSUME-9: run-scoped census of record — the map covers the
    # whole corpus; this run is audited against ITS OWN map rows only.
    run_rows = [row for r in resources for row in (figures.get(r["ugmId"]) or [])]
    expected_refs = len(run_rows)
    expected_res = sum(1 for r in resources if figures.get(r["ugmId"]))
    expected_assets = len({row["path"] for row in run_rows})
    for r in resources:
        rows = figures.get(r["ugmId"])
        if not rows:
            r["figures"] = 0
            r["figuresInline"] = 0
            continue
        body = r["bodyMd"]
        heads = [(m.group(1).strip(), m.start(), m.end()) for m in heading_re.finditer(body)]
        # insertion points: end of each named section (start of next heading or EOF)
        bounds = []
        for i, (name, s, e) in enumerate(heads):
            end = heads[i + 1][1] if i + 1 < len(heads) else len(body)
            bounds.append((name, end))
        by_sec = {}
        for row in rows:
            if row["sec"] not in {n for n, _ in bounds}:
                fail(f"[figures] {r['ugmId']}: map section {row['sec']!r} not a body heading")
            for p in (row.get("path"),):
                if p not in copied_paths:
                    fail(f"[figures] {r['ugmId']}: asset {p!r} not copied to the serve dir")
            by_sec.setdefault(row["sec"], []).append(row)

        # ── 8b: match inline placeholders to map rows ───────────────────
        def sec_of(pos):
            cur = None
            for name, s, _e in heads:
                if s <= pos:
                    cur = name
                else:
                    break
            return cur

        placeholders = []  # (start, end, path, caption) in document order
        for m in PLACEHOLDER_RE.finditer(body):
            url = m.group("url").split("#")[0].split("?")[0]
            if not (UGM_URL_RE.match(url) and IMG_EXT_RE.search(url)):
                continue  # non-image constructs are not this lane's scope
            placeholders.append((m.start(), m.end(), UGM_URL_RE.sub("", url), m.group("cap")))
        used = set()
        inline = []  # (row, span, caption-fallback)
        for start, end, path, cap in placeholders:
            if path not in copied_paths:
                fail(f"[figures] {r['ugmId']}: placeholder asset {path!r} not copied to the serve dir")
            same_sec = [row for row in by_sec.get(sec_of(start) or "", [])
                        if row["path"] == path and id(row) not in used]
            same_path = [row for row in rows
                         if row["path"] == path and id(row) not in used]
            cand = same_sec or same_path
            if not cand:
                fail(f"[figures] {r['ugmId']}: placeholder {path!r} at offset {start} "
                     f"has no unmatched map row")
            row = cand[0]
            used.add(id(row))
            inline.append((row, (start, end), cap))
        inline_total += len(inline)

        # build ALL edits (inline replacements + section-end inserts), then
        # apply from the LAST position backwards so earlier offsets stay valid
        edits = []
        inline_rows = set()
        for row, (start, end), cap in inline:
            alt = _fig_alt(row.get("caption") or cap)
            edits.append((start, end, f"![{alt}]({row['ref']})"))
            inline_rows.add(id(row))
        for name, rows2 in by_sec.items():
            rows2 = sorted((x for x in rows2 if id(x) not in inline_rows),
                           key=lambda x: x["ord"])
            if not rows2:
                continue
            lines = [f"![{_fig_alt(row.get('caption'))}]({row['ref']})" for row in rows2]
            edits.append((dict(bounds)[name], None, "\n\n" + "\n\n".join(lines) + "\n"))
        for pos, end, text in sorted(edits, key=lambda x: -x[0]):
            if end is None:
                body = body[:pos] + text + body[pos:]
            else:
                body = body[:pos] + text + body[end:]
        r["bodyMd"] = body
        r["figures"] = len(rows)
        r["figuresInline"] = len(inline)
        injected += len(rows)
        res_with += 1
        # post-audit: every ref appears exactly as often as the map rows use it
        # (a file may legitimately serve several occurrences within a resource)
        from collections import Counter as _C
        for ref, n in _C(row["ref"] for row in rows).items():
            if body.count(ref) != n:
                fail(f"[figures] {r['ugmId']}: ref {ref!r} appears {body.count(ref)} != {n} map rows")
    # 8b fail-closed sweep: ZERO un-localized image placeholders may remain
    residue = 0
    for r in resources:
        for m in PLACEHOLDER_RE.finditer(r.get("bodyMd") or ""):
            url = m.group("url").split("#")[0].split("?")[0]
            if UGM_URL_RE.match(url) and IMG_EXT_RE.search(url):
                residue += 1
                if residue <= 3:
                    print(f"    [figures] RESIDUE {r['ugmId']}: {url}")
    if residue:
        fail(f"[figures] {residue} image placeholder(s) left un-localized in served bodies")
    if injected != expected_refs:
        fail(f"[figures] injected {injected} != this run's map rows {expected_refs}")
    if res_with != expected_res:
        fail(f"[figures] resources-with-figures {res_with} != this run's map {expected_res}")
    print(f"    figures: {injected} refs localized across {res_with} resources "
          f"({expected_assets} unique assets in this run; "
          f"{inline_total} inline from placeholders, {injected - inline_total} section-anchored)")
    return {"figureRefs": injected, "resources": res_with,
            "uniqueAssets": expected_assets,
            "inlineRewritten": inline_total}


def copy_assets(repo, public_dir, resource_ids=None):
    """Copy the referenced UGM-Assets binaries into apps/hub/public/ugm-assets/.

    Fail-closed: every map path must exist in the snapshot AND match its
    UGM-Assets/MANIFEST.json sha256 before the copy is accepted.
    T-UGM-HUB-CONSUME-9: the copy set is RUN-SCOPED — the map rows of THIS
    run's resources only (the pure-1 run's set is unchanged since every
    mapped resource is a pure-1 body; a plane whose bodies predate the map
    copies nothing rather than re-shipping the whole corpus binaries).
    """
    am_path = os.path.join(repo, ASSETS_DIR, "MANIFEST.json")
    if not os.path.exists(am_path):
        fail(f"assets manifest missing: {ASSETS_DIR}/MANIFEST.json")
    am = json.load(open(am_path, encoding="utf-8"))
    fmap = json.load(open(os.path.join(repo, FIGURES_MAP), encoding="utf-8"))
    figures = fmap.get("figures") or {}
    if resource_ids is None:
        referenced = {row["path"] for rows in figures.values() for row in rows}
    else:
        referenced = {row["path"] for rid in resource_ids
                      for row in (figures.get(rid) or [])}
    copied = {}
    import hashlib as _h
    for p in referenced:
        meta = (am.get("files") or {}).get(p)
        if meta is None:
            fail(f"[assets] {p!r} not in {ASSETS_DIR}/MANIFEST.json")
        src = os.path.join(repo, ASSETS_DIR, p)
        if not os.path.exists(src):
            fail(f"[assets] {p!r} missing from the snapshot")
        b = open(src, "rb").read()
        if _h.sha256(b).hexdigest() != meta["sha256"]:
            fail(f"[assets] {p!r} sha256 mismatch vs manifest")
        dst = os.path.join(public_dir, p)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        open(dst, "wb").write(b)
        copied[p] = meta["sha256"]
    print(f"    assets: {len(copied)} files copied to {public_dir}")
    return copied


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="syllabai-resources snapshot dir (pinned)")
    ap.add_argument("--ref", default=DEFAULT_REF)
    ap.add_argument("--lane", default=DEFAULT_LANE)
    ap.add_argument("--generated-utc", default=None)
    args = ap.parse_args()

    repo = args.repo.rstrip("/")
    lane = args.lane
    lane_blocks = LANE_STATIONS.get(lane)
    if not lane_blocks:
        fail(f"no UGM lane mapping for course {lane} yet")

    # ── per-lane audits + joins ─────────────────────────────────────────
    parts = [import_lane(repo, lb, lane) for lb in lane_blocks]

    # ── merge into the course bundle (schema 1.1) ───────────────────────
    resources = [r for p in parts for r in p["resources"]]
    spec_points = [sp for p in parts for sp in p["spec_points"]]
    spec_points.sort(key=lambda sp: spec_code_key(sp["code"]))

    ids = [r["ugmId"] for r in resources]
    if len(ids) != len(set(ids)):
        fail("duplicate ugmId across lanes")
    if len(resources) != sum(lb["expected"]["resources"] for lb in lane_blocks):
        fail("merged resource census mismatch")

    # ── cross-lane join (T-UGM-HUB-CONSUME-4, strand lanes) ─────────────
    # A strand lane (lane 4+) may carry crossLaneAligned / crossLaneNonOverlap
    # in its enrichment: mappings for resources whose TEXT of record lives
    # under an EARLIER lane's res_dir (the corpus forbids duplicate ugmIds
    # across lanes). The join merges those mappings into the ALREADY-JOINED
    # resource entries and the spec-point index — no new entries, no body
    # duplication, first-of-record body wins. Fail-closed audits: ugmId must
    # exist among the joined resources; textOfRecordUnder must name the
    # supplier lane_dir; row codes must exist in the lane's own perSpecPoint;
    # no (resource, code) double-claim; <=1 primaryPick per resource after join.
    # T-UGM-HUB-CONSUME-9 adds the CROSS-COURSE law: a row whose
    # textOfRecordUnder names ANOTHER course's lane dir joins BY REFERENCE —
    # counted in crossLaneJoined, detailed in coverage.crossCourse with a
    # servedUnder course pointer; it mutates neither resources nor the index
    # (the body stays first-of-record under its own course's bundle).
    by_id = {}
    part_of = {}
    for p in parts:
        for r in p["resources"]:
            by_id[r["ugmId"]] = r
            part_of[r["ugmId"]] = p
    cross = {"aligned": 0, "nonOverlap": 0}
    crosscourse = []  # T-UGM-HUB-CONSUME-9: by-reference rows served under another course
    for p in parts:
        enr = p.get("enr") or {}
        cla = enr.get("crossLaneAligned") or []
        cno = enr.get("crossLaneNonOverlap") or []
        # T-UGM-HUB-CONSUME-10 multi-lane law: per-part reconciliation counters
        # (the declared crossLaneCoverage is audited against THIS part's
        # in-run + by-reference rows — a course run may span several lanes).
        p["_cc_inrun"] = 0
        p["_cc_cross"] = 0
        if not cla and not cno:
            continue
        own_codes = set(enr["perSpecPoint"].keys())
        sp_by_code = {sp["code"]: sp for sp in p["spec_points"]}
        for row in cla:
            slug = row.get("ugmSlug")
            target = by_id.get(slug)
            if target is None:
                supplier_course = COURSE_OF_DIR.get(
                    os.path.basename(row.get("textOfRecordUnder") or ""))
                if supplier_course and supplier_course != lane:
                    if any(c not in own_codes for c in row.get("codes") or []):
                        fail(f"[cross-course] {slug}: code outside this lane's perSpecPoint")
                    crosscourse.append(dict(row, servedUnder=supplier_course))
                    cross["aligned"] += 1
                    p["_cc_cross"] += 1
                    continue
                fail(f"[cross-lane] {slug}: not among the joined resources")
            supplier = os.path.basename((part_of[slug].get("lb") or {}).get("res_dir", ""))
            if supplier != os.path.basename(row.get("textOfRecordUnder") or ""):
                fail(f"[cross-lane] {slug}: textOfRecordUnder {row.get('textOfRecordUnder')!r} != supplier {supplier!r}")
            for code in row.get("codes") or []:
                if code not in own_codes:
                    fail(f"[cross-lane] {slug}: code {code} not in this lane's perSpecPoint")
                if any(sp["code"] == code for sp in target["specPoints"]):
                    fail(f"[cross-lane] {slug}: double-claim of {code}")
                target["specPoints"].append({
                    "code": code,
                    "confidence": row.get("confidence"),
                    "primaryPick": bool(row.get("primaryPick")),
                    "note": row.get("note"),
                    "modesRecorded": row.get("modesRecorded") or [],
                })
                idx = sp_by_code.get(code)
                if idx is None:
                    fail(f"[cross-lane] {code}: no spec-point index entry in the strand lane")
                if slug not in idx["ugmIds"]:
                    idx["ugmIds"].append(slug)
                cross["aligned"] += 1
            if target["nonOverlap"] and target["specPoints"]:
                target["nonOverlap"] = False  # flip of record: the strand lane mapped it
            p["_cc_inrun"] += 1
        for row in cno:
            slug = row.get("ugmSlug")
            if by_id.get(slug) is None:
                supplier_course = COURSE_OF_DIR.get(
                    os.path.basename(row.get("textOfRecordUnder") or ""))
                if supplier_course and supplier_course != lane:
                    crosscourse.append(dict(row, servedUnder=supplier_course,
                                            nonOverlapRef=True))
                    cross["nonOverlap"] += 1
                    continue
                fail(f"[cross-lane] {slug}: not among the joined resources")
            supplier = os.path.basename((part_of[slug].get("lb") or {}).get("res_dir", ""))
            if supplier != os.path.basename(row.get("textOfRecordUnder") or ""):
                fail(f"[cross-lane] {slug}: textOfRecordUnder mismatch")
            cross["nonOverlap"] += 1
        for r in p["resources"]:
            pk = [s["code"] for s in r["specPoints"] if s.get("primaryPick")]
            if len(pk) != len(set(pk)):
                fail(f"[cross-lane] {r['ugmId']}: primaryPick flagged twice under the same code after join")
        p["coverage"]["crossLaneAligned"] = len(cla)
        p["coverage"]["crossLaneNonOverlap"] = len(cno)

    # spec-index resourceCount is derived (the join may extend ugmIds)
    for sp in spec_points:
        sp["resourceCount"] = len(sp["ugmIds"])

    # the fleet census reflects the MERGED SERVE (after the cross-lane join);
    # per-lane coverage blocks keep the enrichments-of-record censuses.
    # candidateRows counts the ROWS of record: index rows + the cross-course
    # by-reference rows (lane-9's 38 + 9 = 47, the lane-8 convention where
    # the joined rows count too); for a pure-1 run crosscourse is empty and
    # this equals the index sum (459 of record).
    total_rows = sum(len(sp["ugmIds"]) for sp in spec_points) + len(crosscourse)
    aligned_total = sum(1 for r in resources if r["specPoints"])
    considered_total = len(resources)  # the served corpus (strand-lane sweeps count once)
    nonov_total = sum(1 for r in resources if r["nonOverlap"])

    # ── T-UGM-HUB-CONSUME-8a: the image plane (fail-closed, run-scoped) ──
    hub = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    public_ugm = os.path.join(hub, "public", "ugm-assets")
    copied = copy_assets(repo, public_ugm, resource_ids={r["ugmId"] for r in resources})
    fig_census = apply_figures(resources, repo, copied)

    bundle = {
        "schema": SCHEMA,
        "generatedUtc": args.generated_utc
        or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "reviewState": {
            "state": "SUGGESTED",
            "note": "Agent-generated alignment per AGENT.md rule 2 — candidates until the "
                    "review/promotion gate promotes them; no coverage manufactured (rule 3).",
        },
        "lane": lane,
        "stations": [st for p in parts for st in p["stations"]],
        "source": {
            "repo": "SyllabAI/syllabai-resources",
            "ref": args.ref,
            "enrichment": [lb["enrichment"] for lb in lane_blocks],
            "enrichmentSchema": ENRICHMENT_SCHEMA,
            "resourcesDir": [lb["res_dir"] for lb in lane_blocks],
            "ledger": "LEDGER.md — " + "; ".join(lb["ledger"] for lb in lane_blocks),
            "adr": "ADR-UGM-0001 as amended 2026-10-23 (syllabai-experimental)",
            "operatorAttestation": "2026-10-24 — text + static figures may ship into SyllabAI; permission declared",
            "figureMap": FIGURES_MAP.replace(os.sep, "/"),
            "assetsManifest": ASSETS_DIR + "/MANIFEST.json",
        },
        "rights": {
            "holder": "© University of Cambridge (Underground Mathematics); © UCLES / Oxford MAT / "
                      "NRICH for sourced exam questions",
            "license": "LICENSE-DATA.md Amendments 2026-10-23 (text) + 2026-10-24 (static figures) in the "
                       "corpus repo; takedown/correction law unchanged",
            "textOnly": False,
            "note": "Static figures (976 files) are imported and served locally from /ugm-assets/ under "
                    "the operator attestation of 2026-10-24 (T-UGM-ASSETS-1); GeoGebra embeds and PDFs "
                    "remain excluded.",
        },
        "coverage": {
            "ugmResourcesConsidered": considered_total,
            "aligned": aligned_total,
            "nonOverlap": nonov_total,
            "alignedShare": round(aligned_total / considered_total, 3) if considered_total else None,
            "candidateRows": total_rows,
            "crossLaneJoined": cross,
            "specPointsCovered": [sp["code"] for sp in spec_points],
            "figures": fig_census,
            "lanes": [p["coverage"] for p in parts],
        },
        "specPoints": spec_points,
        "resources": resources,
    }

    # T-UGM-HUB-CONSUME-9 honesty planes (additive; only when present):
    #   nonOverlapByReference — the candidate-model rows that have NO text of
    #   record (bodyImported=false); disclosed with their reasons, never
    #   served as bodies;
    #   crossCourse — the by-reference cross-course joins (servedUnder
    #   pointers into the other course's committed bundle).
    # T-UGM-HUB-CONSUME-10 supersede law: a byref row whose ugmSlug IS served
    # by a body in THIS run is stale (the lane-9 of-record example:
    # to-log-or-not-to-log rides lane-9's nonOverlapRows of record, but lane
    # 10 flips it to aligned WITH a fresh body) — the bundle must never
    # declare a resource body-less while serving its body. Dropped rows are
    # counted and printed; the flip itself is of record in the flipping
    # lane's enrichment (its perSpecPoint row + crossLaneCoverage note).
    served_ids = {r["ugmId"] for r in resources}
    stale_byref = [row for row in (r for p in parts for r in p.get("nonoverlap_byref", []))
                   if row.get("ugmSlug") in served_ids]
    byref = [row for p in parts for row in p.get("nonoverlap_byref", [])
             if row.get("ugmSlug") not in served_ids]
    if stale_byref:
        print(f"    byref supersede: {len(stale_byref)} row(s) dropped — slug now served by a "
              f"fresh body in this run: {sorted({r['ugmSlug'] for r in stale_byref})}")
        for row in stale_byref:
            tgt = by_id.get(row["ugmSlug"])
            if tgt is None or not tgt.get("specPoints"):
                fail(f"[byref] stale row {row['ugmSlug']!r} superseded but its served body is not aligned")
    if byref:
        bundle["coverage"]["nonOverlapByReference"] = {
            "count": len(byref),
            "rows": byref,
        }
    if crosscourse:
        by_course = {}
        for row in crosscourse:
            by_course[row["servedUnder"]] = by_course.get(row["servedUnder"], 0) + 1
        # T-UGM-HUB-CONSUME-10 multi-lane law: the declared cross-lane coverage
        # is reconciled PER PART (a course run may span several lanes since
        # lane 10) — each part's declared crossLaneAligned must equal its own
        # in-run reconciled rows plus its cross-course by-reference rows. The
        # #358 single-lane check (parts[0] vs the run-wide total) is the
        # one-lane special case of this law.
        for p in parts:
            clc_p = ((p.get("enr") or {}).get("coverage") or {}).get("crossLaneCoverage") or {}
            declared = clc_p.get("crossLaneAligned")
            if declared is None:
                continue
            accounted = p["_cc_inrun"] + p["_cc_cross"]
            if declared != accounted:
                fail(f"[cross-course] {p['lb'].get('laneSlug')}: enrichment crossLaneCoverage {declared} != reconciled rows {accounted} (in-run {p['_cc_inrun']} + by-reference {p['_cc_cross']})")
        clcs = [((p.get("enr") or {}).get("coverage") or {}).get("crossLaneCoverage") or {} for p in parts]
        clc = clcs[0] if len(clcs) == 1 else {}
        flips = sum(c.get("flips") or 0 for c in clcs)
        one_to_many = sum(c.get("oneToMany") or 0 for c in clcs)
        bundle["coverage"]["crossCourse"] = {
            "aligned": len([r for r in crosscourse if not r.get("nonOverlapRef")]),
            "nonOverlapRef": len([r for r in crosscourse if r.get("nonOverlapRef")]),
            "flips": flips,
            "oneToMany": one_to_many,
            "courses": by_course,
            "note": (clc.get("note") or
                     "cross-course fact joins served by reference — the text of "
                     "record stays first-of-record under the serving course's bundle"),
            "rows": [
                {k: row.get(k) for k in ("ugmSlug", "codes", "title", "url", "station",
                                         "textOfRecordUnder", "servedUnder", "kind",
                                         "confidence", "note", "primaryPick",
                                         "priorAlignmentOfRecord", "nonOverlapRef")
                 if row.get(k) is not None}
                for row in crosscourse
            ],
        }

    # ── emit ─────────────────────────────────────────────────────────────
    hub = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(hub, "content", lane)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "ugm-resources.json")
    tmp = out_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(bundle, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    os.replace(tmp, out_path)
    size = os.path.getsize(out_path)
    print(f"OK  {out_path}  ({size/1024:.0f} KB)")
    lane_keys = [lb.get("station") or lb.get("laneSlug") for lb in lane_blocks]
    n_stations = sum(len(lb.get("stations") or [1]) for lb in lane_blocks)
    print(f"    {len(lane_blocks)} lanes / {n_stations} stations: {lane_keys}")
    print(f"    {len(spec_points)} spec points, {total_rows} candidate rows, "
          f"{nonov_total} non-overlaps, {len(resources)} bodies joined")


def _title_from_fm_or_body(fm, body, ugm_id):
    # front-matter carries no title; the enrichment row does — this fallback
    # is only used if the enrichment row is missing too (audit would fail later)
    m = re.search(r"^# (.+)$", body, re.M)
    return m.group(1).strip() if m else ugm_id


def _tag_prefix(fm, prefix):
    for t in fm.get("tags") or []:
        if isinstance(t, str) and t.startswith(prefix):
            return t
    return None


if __name__ == "__main__":
    main()
