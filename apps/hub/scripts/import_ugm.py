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
  - lane 12 (T-UGM-HUB-CONSUME-12 — the FOURTH lane on the pure-3 course
    plane, corpus PR #134 + the two T-UGM-MODE1-12 amendments of record:
    r0 7a5c1c5f the stationScope.resources numbers, r1 bb78ae37 the r8931
    cross-course row completion; the #136 merge clobbered the lane-12
    corpus mid-flow and the restore of record bfd9a8f2 returned main to
    byte-identical state): content/cie-a-level-maths-20-pure-3/ugm-resources.json —
    CIE 9709 Pure 3 subtopic 3.4 Differentiation (spec points 3.4.1–3.4.3,
    the verbatim spine rows of record; parse artifacts carried), the
    LARGEST FRESH-TEXT LANE SINCE LANE 9 and the inverse of the lane-11
    shape: the differentiation substrate concentrates on the chain-rule and
    product-rule stations, NEITHER whole-imported of record (only 7
    chain-rule + 2 product-rule resources carry lane-7 alignments), so 40
    fresh bodies land (13×3.4.1 / 12×3.4.2 / 15×3.4.3) across the ten
    scoped stations (chain-rule 21 aligned + product-rule 13 +
    calculus-trig-log 6 strays + calculus-of-powers 1; six further stations
    carry non-overlaps only), with the single cross-course flip r8931
    riding its lane-7 body under pure-1-differentiation (3.4.2, by
    reference — the lane-9 flip law). The 29 non-overlaps ride
    nonOverlapRows with bodyImported=false (by reference, no text; 3 of
    them are honest re-routings of lane-10 bearings: r6620 and r8134 → 3.5
    Integration, differentiating-exponentials → no extractable text).
    Picks r6938/r6530/r8620 — all fresh. Figure plane unchanged: figures=0
    honestly (the map of record predates the lane; the rebuilt converter
    renders figcaption text only).
  - lane 13 (T-UGM-HUB-CONSUME-13 — the FIFTH lane on the pure-3 course
    plane, corpus PR #140 + the T-UGM-MODE1-13 amendment r0 of record caught
    by the operator eyeball pre-merge: the MANIFEST version_note now carries
    its v14 prepend per the lane-10+ convention and the LEDGER restore join
    byte sits exactly in the e75ba613 of-record sequence): content/
    cie-a-level-maths-20-pure-3/ugm-resources.json — CIE 9709 Pure 3
    subtopic 3.5 Integration (spec points 3.5.1–3.5.6, the verbatim spine
    rows of record; parse artifacts carried), the FIRST LANE OF RECORD WITH
    AN HONEST EMPTY SPEC POINT: 3.5.4 (the f'(x)/f(x) integration row)
    carries ZERO rows corpus-wide — no such resource exists in the
    25-station corpus (rule 3, no coverage manufactured). The integration
    substrate concentrates on the calculus-trig-log (7 fresh), chain-rule
    (5) and product-rule (4) stations — 16 fresh bodies land (10×3.5.1 /
    7×3.5.2 / 3×3.5.3 / 0×3.5.4 / 6×3.5.5 / 9×3.5.6 rows across the fifteen
    scoped stations) — and lane 13 INVERTS lane 12: the lane-10/11/12
    pre-baked 'P3 3.5 Integration' bearing pool is PROMOTED with fresh text
    (15) rather than re-routed. 23 aligned rows = 16 fresh + 1 cross-course
    flip (circular-slice → 3.5.6/3.5.2, its lane-4 body under
    pure-1-circular-measure, by reference) + 6 one-to-many joins beside
    standing alignments (r7616 → its lane-11 3.3.1 body, r8774 → lane-12
    3.4.2, r9312 → lane-6 1.6.4, r9701/r8694/r5126 → lane-8/9 bodies — the
    partial-fraction INTEGRATION rows). The 11 non-overlaps ride
    nonOverlapRows with bodyImported=false (5 superseding stale lane-10/11/
    12 bearings, 5 P1-1.8-domain routes, 1 no-text teacher-support page);
    68 candidates stand rejected on prior alignments of record.
    Picks r8679 / r9297 / r5126 (rides its lane-9 body — the lane-11 r6018
    convention, disclosed) / NONE at 3.5.4 (the honest gap) / r8134 /
    r8890. Figure plane unchanged: figures=0 honestly (the map of record
    predates the lane; the fresh bodies carry no map rows and no
    placeholders).
  - lane 14 (T-UGM-HUB-CONSUME-14 — the SIXTH lane on the pure-3 course
    plane, corpus PR #145 of record, trace 1a17502182be9d05): content/
    cie-a-level-maths-20-pure-3/ugm-resources.json — CIE 9709 Pure 3
    subtopic 3.6 Numerical solution of equations (spec points 3.6.1–3.6.3,
    the verbatim spine rows of record; parse artifacts carried). NO honest
    gap this lane — every spec point carries rows (8/3/4). The iteration
    substrate is scattered by design: 3 fresh bodies (r8711 under
    polynomials — the purest sign-change search in the corpus; r8013 under
    exp-and-log — graphical solution of 3^x=3x+2 read to 2 d.p.;
    staircase-sequences under thinking-about-numbers — the x = 1 + 1/x
    fixed point of x²−x−1=0) and NO pre-baked bearing pool (no prior lane
    ever routed rows to 'P3 3.6' — the lane INVERTS lane 13's bearing-pool
    promotion the way lane 13 inverted lane 12). 11 aligned rows = 3 fresh
    + 1 cross-course flip (r8404 → 3.6.2/3.6.3 — the corpus's
    rearrangement-method showcase, 'the x = g(x) iteration, or the
    rearrangement method' verbatim, riding its unmapped-by-design lane-6
    body under pure-1-series whose spec_points were []: the circular-slice
    precedent and the FIRST flip of record whose prior body carried no
    spec assertion) + 7 one-to-many joins beside standing alignments
    (r8231 → 3.6.1/3.6.3 Newton-Raphson + trial-and-improvement riding
    pure-1-differentiation; r8679 → 3.6.2/3.6.3 the numerical-canon
    survey on the lane-13 pick body; r7549/r5948 → 3.6.1
    pure-1-coordinate-geometry; to-log-or-not-to-log + see-the-power →
    3.6.1 riding pure-3-log-and-exp; r9082 → 3.6.1 riding
    pure-1-differentiation — the body-of-record map corrected a
    pure-3-algebra guess). The 1 non-overlap rides nonOverlapRows with
    bodyImported=false (staircase-sequences-revisited — the companion
    disclosure: convergents ARE approximations, representation is the
    aim). 48 candidates closed exactly (36 rejected with reasons — the
    Newton's-LAWS noise class disposed by name and the counting-vs-
    locating line: r6653/r9754 count solutions then solve exactly, while
    3.6.1 requires locating approximately).
    Picks r8711 (3.6.1, fresh) / r8404 (3.6.2, rides its lane-6 body —
    the r6018 fresh-pick-impossible convention, disclosed) / r8231
    (3.6.3, rides its lane-3 body — disclosed). Figure plane unchanged:
    figures=0 honestly (the map of record predates the lane; the fresh
    bodies carry no map rows and no placeholders).
  - lane 15 (T-UGM-HUB-CONSUME-15 — the SEVENTH lane on the pure-3
    course plane, corpus PR #149 of record, trace 1a17527331af8cdd):
    content/cie-a-level-maths-20-pure-3/ugm-resources.json — CIE 9709
    Pure 3 subtopic 3.7 Vectors (spec points 3.7.1–3.7.7, the verbatim
    spine rows of record; parse artifacts carried). THE DESIGNED HONEST
    GAP: 3.7.7 is the spec's own exclusion row ('Knowledge of the vector
    product is not required.') and carries zero rows by rule — the
    second honest gap of record after 3.5.4, this time by design. THE
    FIRST ZERO-JOIN/ZERO-FLIP LANE of record: 20 aligned rows ALL FRESH
    BODIES (vector-geometry 15 + combining-vectors 5 — the stations the
    spec names are the stations the corpus serves from; CIE pure-1
    carries no vectors, so 3.7 is their first claimant) with NO
    pre-baked bearing pool (no prior lane ever routed rows to 'P3 3.7').
    psp rows 29 = 2/11/5/3/4/4. 6 non-overlap companion disclosures ride
    nonOverlapRows with bodyImported=false (the plane class
    is-it-a-plane/r6006/r9794/r7187 — P3 3.7 is a lines-only syllabus;
    r5089, the corpus's vector-product showcase, rejected BY the 3.7.7
    exclusion note — first candidate of record rejected by an exclusion
    row; r8828, the common perpendicular the 3.7.5 row excludes). 110
    candidates rejected with reasons (the coordinate-method line
    r5202/r9702/r8449 — the example words match, the scalar-product
    METHOD is the served skill; the mechanics class make-it-equal/
    where-did-it-land/r7982 + the four prior-row stands; Euclidean/trig
    noise). PROMOTION of record: r8456 (the λ/μ position-vector
    intersection + OM·ON angle exam question) supersedes its stale
    lane-3-algebra non-overlap row (the r8013 precedent). Picks
    hit-the-spot (3.7.1) / r8215 (3.7.2) / r9575 (3.7.3) /
    lots-of-vector-lines (3.7.4) / three-lines (3.7.5) / r6493 (3.7.6) —
    all riding fresh bodies. Figure plane unchanged: figures=0 honestly
    (the map of record predates the lane; the fresh bodies carry no map
    rows and no placeholders).
  - lane 18 (T-UGM-HUB-CONSUME-P2 — the FIRST lane on a THIRD course
    plane, corpus PR #226 merged of record at 3b2ce8da): content/
    cie-a-level-maths-20-pure-2/ugm-resources.json — CIE 9709 Pure 2 in
    FULL (spec points 2.1.1–2.6.3, 17 codes, the 2023-2025 syllabus PDF
    of record sha1 997e5a9f), the COURSE-PLANE SERVE LAW's debut shape:
    the T-UGM-P2-1 corpus lane is byref-only (no capture dirs, MANIFEST
    untouched — the #55 sibling law), so the plane serves ZERO fresh
    bodies and EVERY aligned row is a cross-course twin join whose text
    of record lives under an earlier plane's capture dir (pure-1/pure-3),
    named by the row's textOfRecordUnder. The lane-9 law is evolved for
    the plane: a cross-course row joins BY REFERENCE when the OWNING
    course already serves the body under shared spec facts — but the P2
    twin codes (2.x.y) are facts NO other bundle carries, so the plane
    SERVES the of-record bodies under pure-2: the byte-true text is read
    from the capture dir of record (sha256 vs MANIFEST v2 audited),
    embedded with textOfRecordUnder + servedFromCourse provenance, and
    indexed at the P2 codes. Zero corpus text moves; 166 rows = 161
    one_to_many twin joins (incl. the 2.1.2 three-bullet merge delivering
    27 bodies and the two standing-home trapezium joins r6592/r7912 whose
    station-less rows resolve to their front-matter UGM station,
    introducing-calculus — the corpus's "?" sweep bucket, disclosed) + 5
    trapezium flips (approximating-areas/r5642/r7903/r8140/
    underneath-the-arches — beyond-spec of record under P1/P3, realized
    by the P2-unique 2.5.3); 178 index claims across 17 codes; the ONE
    byref companion disclosure rides nonOverlapByReference (r5324, the
    capture-gap companion — bodyImported=false of record, never forced);
    the depth-guard hold (integral-chasing-2 @ 2.5.1, by parts) stays
    corpus-side of record. Fresh-only psp counting (the lane-16 law):
    every psp block ships resources [] with primaryPick resolving to its
    served row (the r6018 pick law, every pick now riding a SERVED body).
    Figure plane: run-scoped — 33 of the served bodies carry figures-map
    rows (147 refs / 123 assets, all already committed under
    public/ugm-assets by the P1/P3 runs; the copy re-verifies sha256).
    stationScope of record is a STRING list (the lane-17 list-shape law
    grows a string form) with the integration lane's "?" sweep bucket
    dropped loudly (it holds exactly the two station-less standing-home
    rows, whose stations resolve via front-matter).

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

# 1.2 (T-UGM-HUB-CONSUME-13): primaryPick is nullable — the honest-gap
# law. A spec point whose corpus-wide sweep closed with ZERO rows (rule 3 —
# no coverage manufactured; lane 13's 3.5.4 the first of record) carries
# primaryPick=null with an empty ugmIds list while still carrying its
# verbatim spine row. 1.1 bundles never carry null picks and still parse.
SCHEMA = "syllabai-demo.ugm-lane-resources/1.2"
ENRICHMENT_SCHEMA = "syllabai.ugm-spec-enrichment/1.0"
# T-UGM-HUB-CONSUME-17: pin advanced past lane 17 (T-UGM-MODE1-17 /
# T-UGM-IMPORT-17, corpus PR #168, merge c0d12159325de18c549a32842ebd72e13f057f53 —
# the CORPUS-BOUNDARY lane and the FIRST ZERO-ALIGNED LANE of record: the UGM
# site never published its complex-numbers substrate — the dedicated stations
# complex-numbers-faces (id 8) / complex-numbers-plane (id 9) are post-freeze
# AcademicReview shells with ZERO public resources, re-verified live this lane
# with the populated-station control (vector-geometry id 27 → 27) and the
# never-captured controls (matrices id 17 / differential-equations id 11 → 0);
# the 855-resource / 25-station corpus of record is FINAL, raw-parity 855/855).
# 43 candidates of record closed exactly = 0 aligned + 1 non-overlap companion
# disclosure (absurder, bodyImported=false — the lane-9 row stands) + 37
# prior-home/row closures + 5 fresh rejections; all eight spec points
# 3.9.1-3.9.8 are honest-empty blocks (the lane-13 honest-gap law applied
# lane-wide for the first time); MANIFEST v18, ZERO fresh bodies, file_count
# 628 UNCHANGED. The corpus of record was reviewed ALL GREEN before merge
# (trace 1a178f86724ff209): merge-base file set exactly 5, CI sync success,
# mergeable=True, lanes 1-16 byte-identical, pure-3 spine export complete of
# record (43 rows, 3.1-3.9) at syllabai-experimental 9c3cf084. Pure-1 inputs
# AND the lanes 9-16 pure-3 inputs are byte-identical c8b80c6a → c0d12159 (the
# lane-17 PR touches the new enrichment + the shared MANIFEST lane-17 block +
# both READMEs + LEDGER only — verified pin-to-pin; the strictly-additive law
# holds; the prior lane-16 pin 51630517 → c8b80c6a is superseded).
# T-UGM-HUB-CONSUME-P2: pin advanced past lane 18 (T-UGM-P2-1, corpus
# PR #226, merge 3b2ce8da700b80f51700fb34fc721c90d6654d6b — the Pure 2
# COURSE-PLANE lane of record): 6 enrichment files (algebra 31 / logs-exp 39 /
# trigonometry 28 / differentiation 41 / integration 20 + 1 byref companion /
# numerical 7 rows), 166 cross-course twin-join rows over the pure-1/pure-3
# capture dirs (161 one_to_many + 5 trapezium flips), 17/17 spec points
# covered, zero corpus files added (MANIFEST untouched — the #55 sibling
# law; the capture lanes 1-17 keep byte-identical MANIFEST v2 blocks, so the
# served bodies still audit against their owning lanes' blob identities).
# reviewed ALL GREEN of record: PR #226 CI sync 1/1 green at head 71868db1,
# mergeable clean, merged under the operator order trace 1a189581eea41f79
# ("Merge -> T-UGM-HUB-CONSUME-P2") at 3b2ce8da with first-parent ancestry
# 0b201a74 + 71868db1 verified; the strictly-additive law holds (the merge
# diff is exactly the lane's 8 files +4112).
DEFAULT_REF = "main@3b2ce8da700b80f51700fb34fc721c90d6654d6b"
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
                {"slug": "calculus-of-powers", "title": "Calculus of Powers"},
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
        {
            # T-UGM-HUB-CONSUME-12: the pure-3 plane's fourth lane — CIE 9709
            # Pure 3 subtopic 3.4 Differentiation (spec points 3.4.1–3.4.3,
            # the verbatim spine rows of record; parse artifacts carried),
            # the LARGEST FRESH-TEXT LANE SINCE LANE 9 and the inverse of the
            # lane-11 shape: neither chain-rule nor product-rule is
            # whole-imported of record, so 40 fresh bodies land (13×3.4.1 /
            # 12×3.4.2 / 15×3.4.3) across the ten scoped stations; the single
            # cross-course flip r8931 rides its lane-7 body under
            # pure-1-differentiation (by reference); the 29 non-overlaps ride
            # nonOverlapByReference (3 honest re-routings of lane-10
            # bearings: r6620, r8134 → 3.5; differentiating-exponentials →
            # no extractable text). Picks r6938/r6530/r8620 — all fresh.
            "laneSlug": "differentiation",
            "laneTitle": "Differentiation",
            "stations": [
                {"slug": "calculus-meets-functions", "title": "Calculus meets Functions"},
                {"slug": "calculus-of-powers", "title": "Calculus of Powers"},
                {"slug": "calculus-trig-log", "title": "Calculus of Trigonometry & Logarithms"},
                {"slug": "chain-rule", "title": "Chain Rule & Integration by Substitution"},
                {"slug": "hyperbolic-functions", "title": "Hyperbolic Functions"},
                {"slug": "polynomials", "title": "Polynomials & Rational Functions"},
                {"slug": "product-rule", "title": "Product Rule & Integration by Parts"},
                {"slug": "thinking-about-functions", "title": "Thinking about Functions"},
                {"slug": "thinking-about-geometry", "title": "Thinking about Geometry"},
                {"slug": "vector-geometry", "title": "Vector Geometry"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-3-differentiation.json",
            "res_dir": "UGM-Resources/pure-3-differentiation",
            "ledger": "LEDGER.md — T-UGM-MODE1-12 and T-UGM-IMPORT-12 (PR #134)",
            "expected": {"resources": 40, "rows": 41, "aligned": 41, "nonOverlap": 29},
        },
        {
            # T-UGM-HUB-CONSUME-13: the pure-3 plane's fifth lane — CIE 9709
            # Pure 3 subtopic 3.5 Integration (spec points 3.5.1–3.5.6, the
            # verbatim spine rows of record; parse artifacts carried), the
            # FIRST LANE OF RECORD WITH AN HONEST EMPTY SPEC POINT (3.5.4,
            # the f'(x)/f(x) row — zero rows corpus-wide, rule 3). The
            # substrate concentrates on the calculus-trig-log / chain-rule /
            # product-rule stations (10 of 16 fresh) with calculus-meets-
            # functions and calculus-of-powers strays; the lane-10/11/12
            # pre-baked bearing pool is PROMOTED with fresh text (15) rather
            # than re-routed — the inverse of the lane-12 shape. 23 aligned
            # rows = 16 fresh + 1 cross-course flip (circular-slice, its
            # lane-4 body) + 6 one-to-many joins by reference; the 11
            # non-overlaps ride nonOverlapByReference (5 superseding stale
            # lane-10/11/12 bearings, 5 P1-1.8-domain routes, 1 no-text).
            # Picks r8679/r9297/r5126(lane-9 body, r6018 convention)/
            # none(3.5.4)/r8134/r8890.
            "laneSlug": "integration",
            "laneTitle": "Integration",
            "stations": [
                {"slug": "calculus-meets-functions", "title": "Calculus meets Functions"},
                {"slug": "calculus-of-powers", "title": "Calculus of Powers"},
                {"slug": "calculus-trig-log", "title": "Calculus of Trigonometry & Logarithms"},
                {"slug": "chain-rule", "title": "Chain Rule & Integration by Substitution"},
                {"slug": "circles", "title": "Circles"},
                {"slug": "combining-functions", "title": "Combining Functions"},
                {"slug": "counting-and-binomials", "title": "Counting & Binomials"},
                {"slug": "divisibility-and-induction", "title": "Divisibility & Induction"},
                {"slug": "geometry-of-equations", "title": "Geometry of Equations"},
                {"slug": "hyperbolic-functions", "title": "Hyperbolic Functions"},
                {"slug": "introducing-calculus", "title": "Introducing Calculus"},
                {"slug": "polynomials", "title": "Polynomials & Rational Functions"},
                {"slug": "product-rule", "title": "Product Rule & Integration by Parts"},
                {"slug": "sequences", "title": "Sequences"},
                {"slug": "thinking-about-functions", "title": "Thinking about Functions"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-3-integration.json",
            "res_dir": "UGM-Resources/pure-3-integration",
            "ledger": "LEDGER.md — T-UGM-MODE1-13 and T-UGM-IMPORT-13 (PR #140) + the T-UGM-MODE1-13 amendment r0 (this PR)",
            "expected": {"resources": 16, "rows": 35, "aligned": 23, "nonOverlap": 11},
        },
        {
            # T-UGM-HUB-CONSUME-14: the pure-3 plane's sixth lane — CIE 9709
            # Pure 3 subtopic 3.6 Numerical solution of equations (spec
            # points 3.6.1–3.6.3, the verbatim spine rows of record; parse
            # artifacts carried). NO honest gap this lane (8/3/4 rows). The
            # iteration substrate is scattered by design — 3 fresh bodies
            # (r8711 polynomials / r8013 exp-and-log / staircase-sequences
            # thinking-about-numbers) with NO pre-baked bearing pool (the
            # inverse of the lane-13 shape). 11 aligned rows = 3 fresh + 1
            # cross-course flip (r8404, its unmapped-by-design lane-6 body,
            # the circular-slice precedent) + 7 one-to-many joins by
            # reference; the 1 non-overlap rides nonOverlapByReference
            # (staircase-sequences-revisited, the companion disclosure).
            # Picks r8711/r8404(lane-6 body, the r6018 convention)/r8231
            # (lane-3 body, disclosed).
            "laneSlug": "iteration",
            "laneTitle": "Numerical solution of equations",
            "stations": [
                {"slug": "calculus-meets-functions", "title": "Calculus meets Functions"},
                {"slug": "calculus-of-powers", "title": "Calculus of Powers"},
                {"slug": "calculus-trig-log", "title": "Calculus of Trigonometry & Logarithms"},
                {"slug": "chain-rule", "title": "Chain Rule & Integration by Substitution"},
                {"slug": "circles", "title": "Circles"},
                {"slug": "combining-functions", "title": "Combining Functions"},
                {"slug": "counting-and-binomials", "title": "Counting & Binomials"},
                {"slug": "exp-and-log", "title": "Exponentials & Logarithms"},
                {"slug": "geometry-of-equations", "title": "Geometry of Equations"},
                {"slug": "hyperbolic-functions", "title": "Hyperbolic Functions"},
                {"slug": "introducing-calculus", "title": "Introducing Calculus"},
                {"slug": "polynomials", "title": "Polynomials & Rational Functions"},
                {"slug": "product-rule", "title": "Product Rule & Integration by Parts"},
                {"slug": "quadratics", "title": "Quadratics"},
                {"slug": "sequences", "title": "Sequences"},
                {"slug": "thinking-about-algebra", "title": "Thinking about Algebra"},
                {"slug": "thinking-about-functions", "title": "Thinking about Functions"},
                {"slug": "thinking-about-numbers", "title": "Thinking about Numbers"},
                {"slug": "trigonometry-compound-angles", "title": "Trigonometry: Compound Angles"},
                {"slug": "vector-geometry", "title": "Vector Geometry"}
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-3-iteration.json",
            "res_dir": "UGM-Resources/pure-3-iteration",
            "ledger": "LEDGER.md — T-UGM-MODE1-14 and T-UGM-IMPORT-14 (PR #145)",
            "expected": {"resources": 3, "rows": 15, "aligned": 11, "nonOverlap": 1},
        },
        {
            # T-UGM-HUB-CONSUME-15: the pure-3 plane's seventh lane — CIE
            # 9709 Pure 3 subtopic 3.7 Vectors (spec points 3.7.1–3.7.7,
            # the verbatim spine rows of record; parse artifacts carried).
            # THE DESIGNED HONEST GAP: 3.7.7 is the spec's own exclusion
            # row ('Knowledge of the vector product is not required.') and
            # carries zero rows by rule — the second honest gap of record
            # after 3.5.4, this time by design. THE FIRST ZERO-JOIN LANE
            # of record: 20 aligned rows ALL FRESH BODIES (the vector
            # stations were never mapped by lanes 1–14 — CIE pure-1
            # carries no vectors; vector-geometry 15 + combining-vectors
            # 5) — zero cross-lane joins, zero flips, no pre-baked
            # bearing pool (no prior lane ever routed rows to 'P3 3.7').
            # The stations list is the FULL 21-station sweep closure of
            # record (the lane-13 convention: every station the candidate
            # sweep touched is declared; the 19 non-vector stations carry
            # zero rows — all their candidates were rejected with
            # reasons). 6 non-overlap companion disclosures
            # (bodyImported=false): the plane class (is-it-a-plane,
            # r6006, r9794, r7187 — P3 3.7 is a lines-only syllabus),
            # r5089 (the corpus's vector-product showcase, rejected BY
            # the 3.7.7 exclusion note — first candidate of record
            # rejected by an exclusion row), r8828 (the common
            # perpendicular the 3.7.5 row excludes). 110 candidates
            # rejected with reasons (the coordinate-method line
            # r5202/r9702/r8449 — the words match, the scalar-product
            # method is the served skill; the mechanics class;
            # Euclidean/trig noise). PROMOTION of record: r8456
            # supersedes its stale lane-3-algebra non-overlap row (the
            # r8013 precedent). Picks hit-the-spot (3.7.1) / r8215
            # (3.7.2) / r9575 (3.7.3) / lots-of-vector-lines (3.7.4) /
            # three-lines (3.7.5) / r6493 (3.7.6) — all riding fresh
            # bodies (no r6018 disclosure needed). Figure plane
            # unchanged: figures=0 honestly (the map of record predates
            # the lane; the fresh bodies carry no map rows and no
            # placeholders).
            "laneSlug": "vectors",
            "laneTitle": "Vectors",
            "stations": [
                {"slug": "calculus-meets-functions", "title": "Calculus meets Functions"},
                {"slug": "calculus-of-powers", "title": "Calculus of Powers"},
                {"slug": "calculus-trig-log", "title": "Calculus of Trigonometry & Logarithms"},
                {"slug": "chain-rule", "title": "Chain Rule & Integration by Substitution"},
                {"slug": "circles", "title": "Circles"},
                {"slug": "combining-functions", "title": "Combining Functions"},
                {"slug": "combining-vectors", "title": "Combining Vectors"},
                {"slug": "divisibility-and-induction", "title": "Divisibility & Induction"},
                {"slug": "exp-and-log", "title": "Exponentials & Logarithms"},
                {"slug": "geometry-of-equations", "title": "Geometry of Equations"},
                {"slug": "hyperbolic-functions", "title": "Hyperbolic Functions"},
                {"slug": "introducing-calculus", "title": "Introducing Calculus"},
                {"slug": "product-rule", "title": "Product Rule & Integration by Parts"},
                {"slug": "quadratics", "title": "Quadratics"},
                {"slug": "thinking-about-algebra", "title": "Thinking about Algebra"},
                {"slug": "thinking-about-functions", "title": "Thinking about Functions"},
                {"slug": "thinking-about-geometry", "title": "Thinking about Geometry"},
                {"slug": "thinking-about-numbers", "title": "Thinking about Numbers"},
                {"slug": "trigonometry-compound-angles", "title": "Trigonometry: Compound Angles"},
                {"slug": "trigonometry-triangles-to-functions", "title": "Trigonometry: Triangles to Functions"},
                {"slug": "vector-geometry", "title": "Vector Geometry"}
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-3-vectors.json",
            "res_dir": "UGM-Resources/pure-3-vectors",
            "ledger": "LEDGER.md — T-UGM-MODE1-15 and T-UGM-IMPORT-15 (PR #149)",
            "expected": {"resources": 20, "rows": 29, "aligned": 20, "nonOverlap": 6},
        },
        {
            # T-UGM-HUB-CONSUME-16 — lane 16, CIE 9709 Pure 3 3.8
            # Differential equations (the EIGHTH pure-3 lane): THE
            # ZERO-FRESH-BODY LANE OF RECORD, the exact mirror of lane
            # 15's zero-join lane. The corpus's entire student-facing 3.8
            # pipeline is TWO part-questions, both ALREADY of record under
            # pure-1 lanes — so the lane serves ZERO fresh bodies (res_dir
            # is NOT created; the MANIFEST v17 lane block carries
            # file_count 0 / files []) and BOTH aligned rows are
            # CROSS-COURSE joins by reference (the lane-9 law): r6959
            # rides its pure-1-differentiation 1.7.3 body (the 1979 UCLES
            # patch-of-fluid exam question — part (i) formulates dA/dt = 5
            # from the rate statement, integrates with A(0)=0, interprets
            # the radius and dr/dt via the chain rule → 3.8.1-3.8.4) and
            # r7410 rides its pure-1-integration 1.8.2 body (the 1969
            # UCLES question — part (ii) writes dy/dx = c/x^2 from the
            # proportionality statement, integrates to the general form,
            # evaluates the constant from y(2)=1 → 3.8.1-3.8.3). The psp
            # rows CARRY the join claims per the lane-9 cross-course
            # shape; the index stays fresh-only (resourceCount 0, ugmIds
            # []) with the picks riding the reference rows (the r6018
            # law, the lane-8 all-cross-pick precedent). 4 non-overlap
            # companion disclosures by reference (the modelling-
            # recognition class picture-the-process-i/ii — cooling/
            # decay/logistic narrated or matched, never formulated; the
            # beyond-spec separable-DE class weight-pulling +
            # from-parabolas-to-catenaries — genuine separable skeletons,
            # cosec/arcosh/cosh execution outside the 9709 function set).
            # 47 candidates rejected with reasons. THE CORPUS-BOUNDARY
            # DISCLOSURE: the site's own differential-equations station
            # is EMPTY (0 resources, id 11, created 2015-11-04, never
            # populated — verified live with a populated-station control;
            # one of the four never-captured stations) and the raw-parity
            # audit (855/855) closes the boundary fail-closed. The
            # stations list is the FULL 19-station sweep closure of
            # record (the lane-13/15 convention). Picks r6959 (3.8.1,
            # 3.8.4) / r7410 (3.8.2, 3.8.3) — BOTH riding reference rows
            # (the r6018-style disclosure lane-wide). Figure plane
            # unchanged: figures=0 honestly (no fresh bodies, no map
            # rows).
            "laneSlug": "differential-equations",
            "laneTitle": "Differential equations",
            "stations": [
                {"slug": "calculus-meets-functions", "title": "Calculus meets Functions"},
                {"slug": "calculus-of-powers", "title": "Calculus of Powers"},
                {"slug": "calculus-trig-log", "title": "Calculus of Trigonometry & Logarithms"},
                {"slug": "chain-rule", "title": "Chain Rule & Integration by Substitution"},
                {"slug": "combining-functions", "title": "Combining Functions"},
                {"slug": "counting-and-binomials", "title": "Counting & Binomials"},
                {"slug": "divisibility-and-induction", "title": "Divisibility & Induction"},
                {"slug": "exp-and-log", "title": "Exponentials & Logarithms"},
                {"slug": "hyperbolic-functions", "title": "Hyperbolic Functions"},
                {"slug": "introducing-calculus", "title": "Introducing Calculus"},
                {"slug": "product-rule", "title": "Product Rule & Integration by Parts"},
                {"slug": "quadratics", "title": "Quadratics"},
                {"slug": "sequences", "title": "Sequences"},
                {"slug": "thinking-about-algebra", "title": "Thinking about Algebra"},
                {"slug": "thinking-about-functions", "title": "Thinking about Functions"},
                {"slug": "thinking-about-geometry", "title": "Thinking about Geometry"},
                {"slug": "thinking-about-numbers", "title": "Thinking about Numbers"},
                {"slug": "trigonometry-triangles-to-functions", "title": "Trigonometry: Triangles to Functions"},
                {"slug": "vector-geometry", "title": "Vector Geometry"}
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-3-differential-equations.json",
            "res_dir": "UGM-Resources/pure-3-differential-equations",
            "ledger": "LEDGER.md — T-UGM-MODE1-16 and T-UGM-IMPORT-16 (PR #155)",
            "expected": {"resources": 0, "rows": 7, "aligned": 2, "nonOverlap": 4},
        },
        {
            # T-UGM-HUB-CONSUME-17 — lane 17, CIE 9709 Pure 3 3.9 Complex
            # numbers (the NINTH and FINAL pure-3 lane — the course plane
            # closes): THE CORPUS-BOUNDARY LANE OF RECORD and the FIRST
            # ZERO-ALIGNED LANE of record. The UGM site never published its
            # complex-numbers substrate: both dedicated stations are
            # post-freeze AcademicReview shells with ZERO public resources
            # (complex-numbers-faces id 8 / complex-numbers-plane id 9,
            # verified live with a populated-station control; the four
            # never-captured stations are all empty shells) — the corpus is
            # FINAL at 855 resources / 25 stations. The lane serves ZERO
            # fresh bodies (res_dir is NOT created; the MANIFEST v18 lane
            # block carries file_count 0 / files [] — the lane-16 byref-only
            # law) and ZERO aligned rows of any kind (no joins, no flips, no
            # one-to-many — the pure-1 plane carries no complex numbers
            # either): every perSpecPoint block 3.9.1-3.9.8 is an
            # HONEST-EMPTY block (the lane-13 honest-gap law applied
            # lane-wide for the first time — primaryPick=null, ugmIds=[],
            # the verbatim spine rows carried). The ONE non-overlap
            # companion disclosure rides bodyImported=false (absurder — the
            # conjugate-pair factorisation aside a^2+b^2=(a+ib)(a-ib)
            # derived from i^2=-1; the lane-9 non-overlap row of record
            # stands). 43 candidates of record closed exactly = 0 + 1 + 42
            # (37 prior-home/row closures + 5 fresh rejections). The
            # stations list is the FULL 18-station sweep closure of record
            # (the lane-13/15/16 convention). Row census 0/0 — the first
            # zero-row lane the importer serves; the lane exists in the
            # bundle as its eight honest-empty spec points + its coverage
            # block + the byref disclosure, and NOTHING else. Figure plane
            # unchanged: figures=0 honestly (no fresh bodies, no map rows).
            "laneSlug": "complex-numbers",
            "laneTitle": "Complex numbers",
            "stations": [
                {"slug": "polynomials", "title": "Polynomials & Rational Functions"},
                {"slug": "quadratics", "title": "Quadratics"},
                {"slug": "thinking-about-algebra", "title": "Thinking about Algebra"},
                {"slug": "exp-and-log", "title": "Exponentials & Logarithms"},
                {"slug": "counting-and-binomials", "title": "Counting & Binomials"},
                {"slug": "calculus-meets-functions", "title": "Calculus meets Functions"},
                {"slug": "combining-functions", "title": "Combining Functions"},
                {"slug": "circles", "title": "Circles"},
                {"slug": "vector-geometry", "title": "Vector Geometry"},
                {"slug": "combining-vectors", "title": "Combining Vectors"},
                {"slug": "trigonometry-compound-angles", "title": "Trigonometry: Compound Angles"},
                {"slug": "thinking-about-numbers", "title": "Thinking about Numbers"},
                {"slug": "calculus-of-powers", "title": "Calculus of Powers"},
                {"slug": "chain-rule", "title": "Chain Rule & Integration by Substitution"},
                {"slug": "trigonometry-triangles-to-functions", "title": "Trigonometry: Triangles to Functions"},
                {"slug": "product-rule", "title": "Product Rule & Integration by Parts"},
                {"slug": "geometry-of-equations", "title": "Geometry of Equations"},
                {"slug": "thinking-about-functions", "title": "Thinking about Functions"}
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-3-complex-numbers.json",
            "res_dir": "UGM-Resources/pure-3-complex-numbers",
            "ledger": "LEDGER.md — T-UGM-MODE1-17 and T-UGM-IMPORT-17 (PR #168)",
            "expected": {"resources": 0, "rows": 0, "aligned": 0, "nonOverlap": 1},
        },
    ],
    # T-UGM-HUB-CONSUME-P2: the pure-2 course plane — CIE 9709 Pure 2 in
    # FULL (17 spec points 2.1.1–2.6.3), the FIRST lane on a THIRD course
    # plane and the debut of the COURSE-PLANE SERVE LAW. The corpus lane
    # T-UGM-P2-1 (PR #226) is byref-only: no capture dirs exist (MANIFEST
    # untouched), every aligned row is a cross-course twin join whose text
    # of record lives under a pure-1/pure-3 capture dir. The plane SERVES
    # those of-record bodies under pure-2 (the 2.x.y codes are facts no
    # other bundle carries) — the blocks declare `coursePlane: True`, NO
    # res_dir, and expected.resources = the lane's unique served slugs
    # (expected.rows = the lane's index claims). The integration lane's
    # stationScope carries the corpus's "?" sweep bucket (the two
    # station-less standing-home rows r6592/r7912) — dropped loudly at the
    # hub boundary; both rows resolve to their front-matter UGM station
    # (introducing-calculus), which the block declares.
    "cie-a-level-maths-20-pure-2": [
        {
            "coursePlane": True,
            "laneSlug": "algebra",
            "laneTitle": "Algebra",
            "stations": [
                {"slug": "combining-functions", "title": "Combining Functions"},
                {"slug": "polynomials", "title": "Polynomials & Rational Functions"},
                {"slug": "product-rule", "title": "Product Rule & Integration by Parts"},
                {"slug": "thinking-about-functions", "title": "Thinking about Functions"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-2-algebra.json",
            "ledger": "LEDGER.md — T-UGM-P2-1 (PR #226, the Pure 2 course-plane lane)",
            # 31 served rows (27 of them the 2.1.2 three-bullet merge, 5 ×
            # 2.1.1, plus the 2.1.2 companions); claims 33 = 31 + the two
            # two-code rows (the lane-2/3 strays joining beside standing
            # homes).
            "expected": {"resources": 31, "rows": 33, "aligned": 0, "nonOverlap": 0, "crossLaneAligned": 31},
        },
        {
            "coursePlane": True,
            "laneSlug": "logarithmic-and-exponential-functions",
            "laneTitle": "Logarithmic and exponential functions",
            "stations": [
                {"slug": "calculus-trig-log", "title": "Calculus of Trigonometry & Logarithms"},
                {"slug": "combining-functions", "title": "Combining Functions"},
                {"slug": "exp-and-log", "title": "Exponentials & Logarithms"},
                {"slug": "sequences", "title": "Sequences"},
                {"slug": "thinking-about-algebra", "title": "Thinking about Algebra"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-2-logarithmic-and-exponential-functions.json",
            "ledger": "LEDGER.md — T-UGM-P2-1 (PR #226, the Pure 2 course-plane lane)",
            "expected": {"resources": 39, "rows": 41, "aligned": 0, "nonOverlap": 0, "crossLaneAligned": 39},
        },
        {
            "coursePlane": True,
            "laneSlug": "trigonometry",
            "laneTitle": "Trigonometry",
            "stations": [
                {"slug": "calculus-trig-log", "title": "Calculus of Trigonometry & Logarithms"},
                {"slug": "trigonometry-compound-angles", "title": "Trigonometry: Compound Angles"},
                {"slug": "trigonometry-triangles-to-functions", "title": "Trigonometry: Triangles to Functions"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-2-trigonometry.json",
            "ledger": "LEDGER.md — T-UGM-P2-1 (PR #226, the Pure 2 course-plane lane)",
            "expected": {"resources": 28, "rows": 29, "aligned": 0, "nonOverlap": 0, "crossLaneAligned": 28},
        },
        {
            "coursePlane": True,
            "laneSlug": "differentiation",
            "laneTitle": "Differentiation",
            "stations": [
                {"slug": "calculus-of-powers", "title": "Calculus of Powers"},
                {"slug": "calculus-trig-log", "title": "Calculus of Trigonometry & Logarithms"},
                {"slug": "chain-rule", "title": "Chain Rule & Integration by Substitution"},
                {"slug": "product-rule", "title": "Product Rule & Integration by Parts"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-2-differentiation.json",
            "ledger": "LEDGER.md — T-UGM-P2-1 (PR #226, the Pure 2 course-plane lane)",
            "expected": {"resources": 41, "rows": 42, "aligned": 0, "nonOverlap": 0, "crossLaneAligned": 41},
        },
        {
            "coursePlane": True,
            "laneSlug": "integration",
            "laneTitle": "Integration",
            "stations": [
                {"slug": "calculus-trig-log", "title": "Calculus of Trigonometry & Logarithms"},
                {"slug": "chain-rule", "title": "Chain Rule & Integration by Substitution"},
                {"slug": "introducing-calculus", "title": "Introducing Calculus"},
                {"slug": "product-rule", "title": "Product Rule & Integration by Parts"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-2-integration.json",
            "ledger": "LEDGER.md — T-UGM-P2-1 (PR #226, the Pure 2 course-plane lane)",
            # 20 served rows = 15 one_to_many + the FIVE trapezium flips of
            # record (approximating-areas / r5642 / r7903 / r8140 /
            # underneath-the-arches — beyond-spec routings under the P1/P3
            # plane, realized by the P2-unique 2.5.3); claims 23; the ONE
            # byref companion (r5324, capture gap) rides nonOverlapByReference.
            "expected": {"resources": 20, "rows": 23, "aligned": 0, "nonOverlap": 1, "crossLaneAligned": 20},
        },
        {
            "coursePlane": True,
            "laneSlug": "numerical-solution-of-equations",
            "laneTitle": "Numerical solution of equations",
            "stations": [
                {"slug": "calculus-of-powers", "title": "Calculus of Powers"},
                {"slug": "circles", "title": "Circles"},
                {"slug": "exp-and-log", "title": "Exponentials & Logarithms"},
                {"slug": "geometry-of-equations", "title": "Geometry of Equations"},
                {"slug": "polynomials", "title": "Polynomials & Rational Functions"},
                {"slug": "sequences", "title": "Sequences"},
                {"slug": "thinking-about-numbers", "title": "Thinking about Numbers"},
            ],
            "enrichment": "UGM-Enrichment/cie-a-level-maths-20-pure-2-numerical-solution-of-equations.json",
            "ledger": "LEDGER.md — T-UGM-P2-1 (PR #226, the Pure 2 course-plane lane)",
            "expected": {"resources": 7, "rows": 10, "aligned": 0, "nonOverlap": 0, "crossLaneAligned": 7},
        },
    ],
}

# T-UGM-HUB-CONSUME-9: res_dir basename → course key, for the cross-course
# join law (a crossLaneAligned row whose textOfRecordUnder names another
# course's lane dir joins BY REFERENCE instead of failing).
# T-UGM-HUB-CONSUME-P2: course-plane blocks declare NO res_dir (the byref
# course-plane shape) — they contribute no capture dir and are skipped here;
# the pure-2 supply dirs are the pure-1/pure-3 capture dirs of record.
COURSE_OF_DIR = {
    os.path.basename(lb["res_dir"]): course
    for course, blocks in LANE_STATIONS.items()
    for lb in blocks
    if lb.get("res_dir")
}

# T-UGM-HUB-CONSUME-P2: the UGM station catalog of record — every station
# slug the corpus capture lanes declare, with its site title. The course-plane
# lane blocks (no capture dirs of their own) declare their swept stations
# against this catalog; unknown slugs fail closed. Title resolution: the LAST
# declaration wins — the course-plane-era lane blocks (9+) carry the UGM
# site titles of record ("Calculus of Trigonometry & Logarithms", not the
# lane-7 shorthand "Calculus Trig Log"); the earliest forms are the legacy
# shorthand of the first capture lanes.
STATION_CATALOG = {}
for _course, _blocks in LANE_STATIONS.items():
    for _lb in _blocks:
        if _lb.get("res_dir") and _lb.get("stations"):
            for _s in _lb["stations"]:
                STATION_CATALOG[_s["slug"]] = _s["title"]
        elif _lb.get("res_dir") and _lb.get("station"):
            STATION_CATALOG[_lb["station"]] = _lb["title"]


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
    T-UGM-HUB-CONSUME-P2 adds the third shape: course-plane byref lanes
    (`coursePlane: True`, no res_dir — the pure-2 twin-join serve law).
    """
    if lane_block.get("coursePlane"):
        return _import_course_plane_lane(repo, lane_block, course)
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
        # T-UGM-HUB-CONSUME-17 normalization law (the lane-14 named-pick
        # precedent): the lane-17 corpus enrichment of record (PR #168)
        # carries coverage.stationBreakdown as a LIST of per-station rows
        # (slug inside the row) where lanes 9-16 use the slug-keyed dict —
        # same fields, same facts. Coerce the list shape to the dict shape
        # at the hub boundary; fail-closed on a row without a slug or a
        # slug collision (no silent reshaping).
        if isinstance(breakdown, list):
            norm = {}
            for row in breakdown:
                bslug = (row or {}).get("slug")
                if not bslug or bslug in norm:
                    fail(f"[{station}] stationBreakdown list row without a unique slug: {str(row)[:160]}")
                norm[bslug] = row
            breakdown = norm
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
    # T-UGM-HUB-CONSUME-16 zero-fresh law: a MANIFEST v2 lane block with
    # file_count 0 / files [] and NO lane dir on disk declares a BYREF-ONLY
    # lane (every aligned row is a crossLane join by reference — the lane-16
    # shape). The file census is 0/0 and expected.resources MUST be 0; the
    # aligned rows resolve through the cross-course path of the join phase.
    if (manifest.get("manifest_version") == 2
            and not entries and not os.path.isdir(res_dir)):
        if n_expected != 0:
            fail(f"[{station}] zero-fresh lane block (file_count 0, no dir) but expected "
                 f"{n_expected} resources — the byref-only law requires expected.resources == 0")
        files = []
    else:
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
        # T-UGM-HUB-CONSUME-13 honest-gap law (first of record): a spec
        # point whose corpus-wide sweep closed with ZERO rows (rule 3 — no
        # coverage manufactured) carries primaryPick=None with an empty
        # resources list while still carrying its verbatim spine row. The
        # auditor accepts EXACTLY that shape, loudly; rows present with
        # primaryPick=None still fail.
        if block.get("primaryPick") is None:
            if block.get("resources") or cross:
                fail(f"[{station}] {code}: primaryPick None but rows present — "
                     f"the honest-gap law covers only EMPTY spec points")
            if not block.get("officialText"):
                fail(f"[{station}] {code}: honest-gap spec point must still carry its verbatim spine row")
            print(f"    [honest gap] {code}: zero rows of record (rule 3) — spine row carried, no pick")
        elif block.get("primaryPick") not in fresh_ids and block.get("primaryPick") not in cross:
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


def _import_course_plane_lane(repo, lane_block, course):
    """T-UGM-HUB-CONSUME-P2: the COURSE-PLANE SERVE LAW (first of record).

    A course-plane lane declares NO res_dir and serves ZERO fresh bodies:
    every aligned row of record is a cross-course twin join (the T-UGM-P2-1
    corpus lane) whose text of record lives under an earlier plane's capture
    dir (pure-1/pure-3), named by the row's textOfRecordUnder. The plane
    SERVES those of-record bodies under this course — the row's P2 codes are
    facts no other bundle carries — reading the byte-true text from the
    capture dir and embedding it with full provenance (textOfRecordUnder +
    servedFromCourse). Zero corpus text moves.

    Fail-closed audits: enrichment schema/review_state/coverage (fresh-only
    counting: aligned 0, nonOverlap = the byref companion rows), the
    stationScope string-list law (catalog titles; the "?" sweep bucket
    dropped loudly and only when it holds exactly the station-less rows),
    the stationBreakdown aggregate census, the expected census shape, per-row
    corpus identity (path under a KNOWN capture dir of ANOTHER course,
    sha256 vs MANIFEST v2, front-matter ugm_id/station/source-url, body-H1
    title equality, delimiter balance), the fresh-only psp shape (resources
    [] with a primaryPick string), (slug, code) uniqueness within the lane,
    and the rider law (a row lives in the lane owning its FIRST code; its
    sibling-code claims are validated against the sibling coursePlane lanes'
    psp and reconciled at run level in main()).
    """
    station = lane_block["laneSlug"]
    st_slugs = [s["slug"] for s in lane_block["stations"]]
    exp = lane_block["expected"]

    # ── 1. enrichment facts of record (fresh-only counting) ─────────────
    enr_path = os.path.join(repo, lane_block["enrichment"])
    with open(enr_path, encoding="utf-8") as fh:
        enr = json.load(fh)
    if enr.get("schema") != ENRICHMENT_SCHEMA:
        fail(f"[{station}] enrichment schema {enr.get('schema')!r} != {ENRICHMENT_SCHEMA}")
    if enr.get("review_state", {}).get("state") != "SUGGESTED":
        fail(f"[{station}] enrichment review_state is not SUGGESTED — refuse to import as if it were")
    cov = enr.get("coverage", {})
    cla = enr.get("crossLaneAligned") or []
    nonov = enr.get("nonOverlapRows") or []
    psp = enr.get("perSpecPoint") or {}
    if not cla:
        fail(f"[{station}] a course-plane lane must serve its twin joins of record")
    if cov.get("aligned") != exp["aligned"] or cov.get("nonOverlap") != exp["nonOverlap"]:
        fail(f"[{station}] enrichment coverage {cov.get('aligned')}/{cov.get('nonOverlap')} "
             f"!= expected {exp['aligned']}/{exp['nonOverlap']}")
    if cov.get("aligned") != 0:
        fail(f"[{station}] coverage.aligned {cov.get('aligned')} != 0 — the course-plane law serves ZERO fresh bodies")
    clc = cov.get("crossLaneCoverage") or {}
    if clc.get("crossLaneAligned") != len(cla) or exp.get("crossLaneAligned") != len(cla):
        fail(f"[{station}] crossLaneCoverage {clc.get('crossLaneAligned')}/expected "
             f"{exp.get('crossLaneAligned')} != CLA rows {len(cla)}")

    # ── 1b. the stationScope string-list law + the "?" sweep bucket ─────
    ss_stations = (enr.get("stationScope") or {}).get("stations")
    if not isinstance(ss_stations, list) or not ss_stations:
        fail(f"[{station}] course-plane lane but enrichment carries no stationScope.stations")
    unknown = sorted({s for s in ss_stations if s != "?" and s not in STATION_CATALOG})
    if unknown:
        fail(f"[{station}] stationScope slugs outside the station catalog: {unknown}")
    if sorted(s for s in ss_stations if s != "?") != sorted(st_slugs):
        fail(f"[{station}] stationScope {sorted(s for s in ss_stations if s != '?')} "
             f"!= lane block {sorted(st_slugs)}")
    for s in lane_block["stations"]:
        if STATION_CATALOG.get(s["slug"]) != s["title"]:
            fail(f"[{station}] lane block title drift for {s['slug']}: "
                 f"{s['title']!r} != catalog {STATION_CATALOG.get(s['slug'])!r}")
    qmark = "?" in ss_stations
    sb = cov.get("stationBreakdown")
    if not isinstance(sb, dict) or not sb:
        fail(f"[{station}] course-plane lane carries no stationBreakdown census")
    sb_cla = sum(v.get("crossLaneAligned", 0) for v in sb.values())
    sb_nono = sum(v.get("nonOverlap", 0) for v in sb.values())
    sb_res = sum(v.get("resources", 0) for v in sb.values())
    if sb_cla != len(cla):
        fail(f"[{station}] stationBreakdown crossLaneAligned sum {sb_cla} != CLA rows {len(cla)}")
    # T-UGM-HUB-CONSUME-P2 disclosure law: the corpus stationBreakdown of
    # record attributes the twin joins per station but NOT the byref
    # companions (integration's r5324 rides coverage-level only) — the sum
    # must never EXCEED the byref rows; a shortfall is disclosed loudly.
    if sb_nono > len(nonov):
        fail(f"[{station}] stationBreakdown nonOverlap sum {sb_nono} exceeds byref rows {len(nonov)}")
    if sb_nono < len(nonov):
        print(f"    [byref] {len(nonov) - sb_nono} byref companion(s) ride coverage-level "
              f"(not attributed per-station in the corpus stationBreakdown of record)")
    if sb_res > cov.get("ugmResourcesConsidered"):
        fail(f"[{station}] stationBreakdown resources sum {sb_res} exceeds "
             f"ugmResourcesConsidered {cov.get('ugmResourcesConsidered')}")
    if sb_res < cov.get("ugmResourcesConsidered"):
        print(f"    [sweep] {cov.get('ugmResourcesConsidered') - sb_res} considered candidate(s) ride "
              f"coverage-level (not attributed per-station in the corpus stationBreakdown of record)")
    for s in st_slugs:
        if s not in sb:
            fail(f"[{station}] no stationBreakdown entry for {s}")
    if qmark:
        q = sb.get("?") or {}
        stationless = sum(1 for r in cla if not r.get("station"))
        if q.get("resources") != stationless:
            fail(f"[{station}] the '?' sweep bucket ({q.get('resources')}) does not hold exactly "
                 f"the station-less rows ({stationless}) — refusing to drop it silently")
        print(f"    [?] sweep bucket dropped loudly: {q.get('resources')} station-less row(s) "
              f"resolve via their front-matter UGM station")

    # ── 2. the expected census shape ─────────────────────────────────────
    unique_slugs = {r.get("ugmSlug") for r in cla}
    if exp.get("resources") != len(unique_slugs):
        fail(f"[{station}] expected.resources {exp.get('resources')} != unique served slugs {len(unique_slugs)}")
    if exp.get("nonOverlap") != len(nonov):
        fail(f"[{station}] expected.nonOverlap {exp.get('nonOverlap')} != byref rows {len(nonov)}")
    for r in nonov:
        if r.get("bodyImported") is not False:
            fail(f"[{station}] course-plane non-overlap must ride bodyImported=false: {r.get('ugmSlug')!r}")

    # ── 3. the fresh-only psp shape + the sibling rider map ─────────────
    for c, block in sorted(psp.items()):
        if block.get("resources"):
            fail(f"[{station}] {c}: psp resources non-empty — the fresh-only psp counting law")
        if not block.get("primaryPick"):
            fail(f"[{station}] {c}: primaryPick must name its served row of record "
                 f"(a course-plane lane carries no honest gaps)")
    sibling_picks = {}
    for lb in LANE_STATIONS[course]:
        if lb is lane_block or not lb.get("coursePlane"):
            continue
        with open(os.path.join(repo, lb["enrichment"]), encoding="utf-8") as fh:
            sib = json.load(fh)
        for c, block in (sib.get("perSpecPoint") or {}).items():
            sibling_picks[c] = (block or {}).get("primaryPick")

    # ── 4. resolve every served body of record ───────────────────────────
    manifest = json.load(open(os.path.join(repo, "UGM-Resources", "MANIFEST.json"), encoding="utf-8"))
    mf_by_path = {}
    if manifest.get("manifest_version") == 2:
        for lbm in manifest.get("lanes", []):
            for e in lbm.get("files", []):
                mf_by_path[e.get("path") or e.get("file") or e.get("name")] = e
    parsed = {}
    claims = set()
    own_codes = set(psp)
    for r in cla:
        slug = r.get("ugmSlug")
        rel = r.get("textOfRecordUnder") or ""
        m = re.match(r"UGM-Resources/([^/]+)/", rel)
        if not m:
            fail(f"[{station}] {slug}: textOfRecordUnder {rel!r} is not a corpus capture path")
        supplier_course = COURSE_OF_DIR.get(m.group(1))
        if not supplier_course:
            fail(f"[{station}] {slug}: capture dir {m.group(1)!r} is not a declared course lane dir")
        if supplier_course == course:
            fail(f"[{station}] {slug}: textOfRecordUnder names THIS course's capture dir — "
                 f"the course-plane law serves other planes' bodies of record")
        full = os.path.join(repo, rel)
        if not os.path.exists(full):
            fail(f"[{station}] {slug}: body of record missing: {rel}")
        entry = mf_by_path.get(rel[len("UGM-Resources/"):])
        if entry is None:
            fail(f"[{station}] {slug}: body path not in MANIFEST v2: {rel}")
        h = hashlib.sha256(open(full, "rb").read()).hexdigest()
        if entry.get("sha256") != h:
            fail(f"[{station}] {slug}: sha256 mismatch vs MANIFEST v2: {rel}")
        text = open(full, encoding="utf-8").read()
        fm_m = FM_RE.match(text)
        if not fm_m:
            fail(f"[{station}] {slug}: no front-matter: {rel}")
        fm = yaml.safe_load(fm_m.group(1))
        body = text[fm_m.end():]
        ri = fm.get("resource_identity") or {}
        if ri.get("ugm_id") != slug:
            fail(f"[{station}] {slug}: front-matter ugm_id {ri.get('ugm_id')!r} drift")
        fst = ri.get("station")
        if not fst:
            fail(f"[{station}] {slug}: the serve law requires the front-matter UGM station: {rel}")
        if fst not in st_slugs:
            fail(f"[{station}] {slug}: front-matter station {fst!r} not declared {sorted(st_slugs)}")
        if r.get("station") is not None and r.get("station") != fst:
            fail(f"[{station}] {slug}: row station {r.get('station')!r} != front-matter station {fst!r}")
        if (fm.get("source") or None) != (r.get("url") or None):
            fail(f"[{station}] {slug}: row url {r.get('url')!r} != front-matter source {fm.get('source')!r}")
        h1m = re.search(r"^# (.+)$", body, re.M)
        h1 = h1m.group(1).strip() if h1m else None
        if not h1 or re.sub(r"\s+", " ", h1) != re.sub(r"\s+", " ", r.get("title") or ""):
            fail(f"[{station}] {slug}: body H1 {h1!r} != row title {r.get('title')!r}")
        if body.count(r"\(") != body.count(r"\)") or body.count(r"\[") != body.count(r"\]"):
            fail(f"[{station}] {slug}: delimiter imbalance in {rel}")
        if not body.strip():
            fail(f"[{station}] {slug}: empty body: {rel}")
        codes = r.get("codes") or []
        if not codes:
            fail(f"[{station}] {slug}: a course-plane row must claim its P2 codes")
        row_own, row_riders = [], []
        for c in codes:
            if (slug, c) in claims:
                fail(f"[{station}] {slug}: code {c} claimed twice within the lane")
            claims.add((slug, c))
            if c in own_codes:
                row_own.append(c)
            elif c in sibling_picks:
                row_riders.append(c)
            else:
                fail(f"[{station}] {slug}: code {c} is neither this lane's nor a sibling "
                     f"coursePlane lane's psp code of record")
        if not row_own:
            fail(f"[{station}] {slug}: the filing law requires the row to live in the lane "
                 f"owning its FIRST P2 code")
        if slug in parsed:
            fail(f"[{station}] {slug}: two CLA rows within the lane")
        parsed[slug] = {
            "station": fst,
            "title": r.get("title"),
            "url": r.get("url"),
            "resourceType": (_tag_prefix(fm, "type/") or "").replace("type/", ""),
            "resourceTypeLabel": ri.get("resource_type_label"),
            "level": ri.get("level"),
            "supplierCourse": supplier_course,
            "textOfRecordUnder": rel,
            "bodyMd": body,
            "row": r,
            "own_codes": row_own,
            "rider_codes": row_riders,
        }

    # ── 5. served resources + the spec index (own claims; riders ride) ──
    resources = []
    for slug in sorted(parsed):
        p = parsed[slug]
        r = p["row"]
        sp_rows = []
        for code in p["own_codes"] + p["rider_codes"]:
            pick = psp[code].get("primaryPick") if code in own_codes else sibling_picks.get(code)
            sp_rows.append({
                "code": code,
                "confidence": r.get("confidence"),
                "primaryPick": pick == slug,
                "note": r.get("note"),
                "modesRecorded": r.get("modesRecorded") or [],
            })
        pk = [s["code"] for s in sp_rows if s["primaryPick"]]
        if len(pk) != len(set(pk)):
            fail(f"[{station}] {slug}: primaryPick flagged twice under the same code")
        resources.append({
            "ugmId": slug,
            "slug": slug,
            "station": p["station"],
            "title": p["title"],
            "url": p["url"],
            "resourceType": p["resourceType"],
            "resourceTypeLabel": p["resourceTypeLabel"],
            "level": p["level"],
            "hasTeacherSupport": bool(r.get("hasTeacherSupport")),
            "nonOverlap": False,
            "specPoints": sp_rows,
            "bodyMd": p["bodyMd"],
            # T-UGM-HUB-CONSUME-P2 provenance: the text of record stays
            # first-of-record under the capture dir (zero corpus text moves)
            "textOfRecordUnder": p["textOfRecordUnder"],
            "servedFromCourse": p["supplierCourse"],
        })

    spec_points, rider_claims = [], []
    total_claims = 0
    for code, block in sorted(psp.items(), key=lambda kv: spec_code_key(kv[0])):
        ids = sorted(slug for slug in parsed if code in parsed[slug]["own_codes"])
        spec_points.append({
            "code": code,
            "officialText": block.get("officialText"),
            "primaryPick": block.get("primaryPick"),
            "resourceCount": len(ids),
            "ugmIds": ids,
        })
        total_claims += len(ids)
    for slug in sorted(parsed):
        for c in parsed[slug]["rider_codes"]:
            rider_claims.append((c, slug))
            total_claims += 1
    if total_claims != exp["rows"]:
        fail(f"[{station}] claim census {total_claims} "
             f"(own {total_claims - len(rider_claims)} + riders {len(rider_claims)}) "
             f"!= expected rows {exp['rows']}")

    # ── 6. byref companion disclosures (the r5324 law, unchanged) ───────
    nonoverlap_byref = []
    for r in nonov:
        nonoverlap_byref.append({
            "ugmSlug": r.get("ugmSlug"),
            "station": r.get("station"),
            "title": r.get("title"),
            "url": r.get("url"),
            "reason": r.get("reason"),
        })

    n = exp["resources"]
    if len(resources) != n:
        fail(f"[{station}] served census {len(resources)} != {n}")

    cov_lane = {
        "station": station,
        "stationTitle": lane_block.get("laneTitle", station),
        "ugmResourcesConsidered": cov.get("ugmResourcesConsidered"),
        "aligned": cov.get("aligned"),
        "nonOverlap": cov.get("nonOverlap"),
        "alignedShare": cov.get("alignedShare"),
        "candidateRows": total_claims,
        "crossLaneAligned": len(cla),
    }
    stations_ref = [{"slug": s["slug"], "title": s["title"], "url": None}
                    for s in lane_block["stations"]]
    print(f"    [{station}] course-plane serve: {len(resources)} of-record bodies "
          f"({total_claims} claims, {len(rider_claims)} sibling riders), "
          f"{len(nonoverlap_byref)} byref companion(s)")
    return {
        "stations": stations_ref,
        "resources": resources,
        "spec_points": spec_points,
        "coverage": cov_lane,
        "enr": enr,
        "lb": lane_block,
        "nonoverlap_byref": nonoverlap_byref,
        "_rider_claims": rider_claims,
        "_course_plane": True,
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

    # ── T-UGM-HUB-CONSUME-P2: the course-plane rider reconciliation ──────
    # A CLA row lives in the lane owning its FIRST P2 code (the corpus filing
    # law); sibling-code claims ride the row. Append each rider claim to the
    # owning lane's index entry, then re-audit the pick law at run level
    # (the r6018 law: every pick must resolve to a SERVED row of record).
    if any(p.get("_course_plane") for p in parts):
        for p in parts:
            for code, slug in p.get("_rider_claims") or []:
                idx = next((sp for sp in spec_points if sp["code"] == code), None)
                if idx is None:
                    fail(f"[course-plane] rider code {code} has no index entry of record")
                if slug in idx["ugmIds"]:
                    fail(f"[course-plane] rider double-claim {slug!r}@{code}")
                idx["ugmIds"].append(slug)
        for p in parts:
            if not p.get("_course_plane"):
                continue
            for sp in p["spec_points"]:
                if sp["primaryPick"] is not None and sp["primaryPick"] not in sp["ugmIds"]:
                    fail(f"[course-plane] {sp['code']}: primaryPick {sp['primaryPick']!r} "
                         f"does not resolve to a served row after the rider reconciliation")

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
        # T-UGM-HUB-CONSUME-P2: a course-plane part consumed its CLA rows at
        # import (the serve law resolved every row to its body of record and
        # audited the declared crossLaneCoverage there); the by-reference
        # join below must not re-process them.
        if p.get("_course_plane"):
            continue
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
                    # T-UGM-HUB-CONSUME-14 normalization law: the corpus CLA row
                    # may NAME the pick that rides the reference row
                    # (primaryPick: "r8404" — the lane-14 flip of record, the
                    # first corpus row to carry the string form; lanes 9-13 used
                    # booleans). The bundle's crossCourse row schema types the
                    # field BOOLEAN (the "pick rides here" flag — the reader zod
                    # fails a string, by design). Coerce the named-pick fact to
                    # the flag, same as the same-course join path's bool().
                    row2 = dict(row, servedUnder=supplier_course)
                    row2["primaryPick"] = bool(row2.get("primaryPick"))
                    crosscourse.append(row2)
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
                    row2 = dict(row, servedUnder=supplier_course,
                                nonOverlapRef=True)
                    if "primaryPick" in row2:  # the same normalization law
                        row2["primaryPick"] = bool(row2.get("primaryPick"))
                    crosscourse.append(row2)
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
            "resourcesDir": (
                # T-UGM-HUB-CONSUME-P2: a course-plane run owns no capture
                # dirs — the serve reads the of-record bodies from the
                # pure-1/pure-3 capture dirs named by textOfRecordUnder
                sorted({os.path.dirname(r["textOfRecordUnder"])
                        for r in resources if r.get("textOfRecordUnder")})
                if any(lb.get("coursePlane") for lb in lane_blocks)
                else [lb["res_dir"] for lb in lane_blocks]
            ),
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

    # T-UGM-HUB-CONSUME-P2: the course-plane serve census (additive, only
    # when the run serves a byref course plane) — every served body is a
    # cross-course twin join resolved to its corpus text of record.
    if any(p.get("_course_plane") for p in parts):
        cp_kinds = {}
        for p in parts:
            for r in (p.get("enr") or {}).get("crossLaneAligned") or []:
                k = r.get("kind") or "join"
                cp_kinds[k] = cp_kinds.get(k, 0) + 1
        cp_courses = {}
        for r in resources:
            c = r.get("servedFromCourse")
            if c:
                cp_courses[c] = cp_courses.get(c, 0) + 1
        bundle["coverage"]["coursePlaneJoins"] = {
            "count": len(resources),
            "kinds": cp_kinds,
            "courses": cp_courses,
            "byrefNonOverlap": len(byref),
            "note": ("the course-plane serve law (T-UGM-HUB-CONSUME-P2): every served "
                     "body's text of record stays first-of-record under its capture-lane "
                     "dir (pure-1/pure-3) — zero corpus text moves; this plane serves the "
                     "of-record bodies at its own spec points, each resource carrying "
                     "textOfRecordUnder + servedFromCourse provenance"),
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
