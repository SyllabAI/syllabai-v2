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
DEFAULT_REF = "main@8c6339bd115034d2762e6c142256151f9ded3412"
DEFAULT_LANE = "cie-a-level-maths-20-pure-1"

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
}


def fail(msg):
    print(f"AUDIT FAIL: {msg}")
    sys.exit(1)


def spec_code_key(code):
    parts = re.split(r"\.", str(code))
    return tuple(int(p) if p.isdigit() else p for p in parts)


def import_lane(repo, lane_block):
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
        if len(primaries) > 1:
            fail(f"[{station}] resource claims primaryPick under multiple codes: {slug} {primaries}")
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

    # spec-point index (official code order); bodies stay referenced by id
    spec_points = []
    for code, block in sorted(enr["perSpecPoint"].items()):
        ugm_ids = [r.get("ugmSlug") for r in block.get("resources", [])]
        if block.get("primaryPick") not in ugm_ids:
            fail(f"[{station}] {code}: primaryPick {block.get('primaryPick')!r} not among rows")
        spec_points.append({
            "code": code,
            "officialText": block.get("officialText"),
            "primaryPick": block.get("primaryPick"),
            "resourceCount": block.get("resourceCount"),
            "ugmIds": ugm_ids,
        })

    total_rows = sum(len(sp["ugmIds"]) for sp in spec_points)
    if total_rows != exp["rows"]:
        fail(f"[{station}] row census {total_rows} != {exp['rows']}")

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
    }


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
    parts = [import_lane(repo, lb) for lb in lane_blocks]

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
    by_id = {}
    part_of = {}
    for p in parts:
        for r in p["resources"]:
            by_id[r["ugmId"]] = r
            part_of[r["ugmId"]] = p
    cross = {"aligned": 0, "nonOverlap": 0}
    for p in parts:
        enr = p.get("enr") or {}
        cla = enr.get("crossLaneAligned") or []
        cno = enr.get("crossLaneNonOverlap") or []
        if not cla and not cno:
            continue
        own_codes = set(enr["perSpecPoint"].keys())
        sp_by_code = {sp["code"]: sp for sp in p["spec_points"]}
        for row in cla:
            slug = row.get("ugmSlug")
            target = by_id.get(slug)
            if target is None:
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
        for row in cno:
            slug = row.get("ugmSlug")
            if by_id.get(slug) is None:
                fail(f"[cross-lane] {slug}: not among the joined resources")
            supplier = os.path.basename((part_of[slug].get("lb") or {}).get("res_dir", ""))
            if supplier != os.path.basename(row.get("textOfRecordUnder") or ""):
                fail(f"[cross-lane] {slug}: textOfRecordUnder mismatch")
            cross["nonOverlap"] += 1
        for r in p["resources"]:
            if sum(1 for s in r["specPoints"] if s.get("primaryPick")) > 1:
                fail(f"[cross-lane] {r['ugmId']}: multiple primaryPick rows after join")
        p["coverage"]["crossLaneAligned"] = len(cla)
        p["coverage"]["crossLaneNonOverlap"] = len(cno)

    # spec-index resourceCount is derived (the join may extend ugmIds)
    for sp in spec_points:
        sp["resourceCount"] = len(sp["ugmIds"])

    # the fleet census reflects the MERGED SERVE (after the cross-lane join);
    # per-lane coverage blocks keep the enrichments-of-record censuses
    total_rows = sum(len(sp["ugmIds"]) for sp in spec_points)
    aligned_total = sum(1 for r in resources if r["specPoints"])
    considered_total = len(resources)  # the served corpus (strand-lane sweeps count once)
    nonov_total = sum(1 for r in resources if r["nonOverlap"])

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
            "operatorAttestation": "2026-10-23 — text may ship into SyllabAI; permission declared",
        },
        "rights": {
            "holder": "© University of Cambridge (Underground Mathematics); © UCLES / Oxford MAT / "
                      "NRICH for sourced exam questions",
            "license": "LICENSE-DATA.md Amendment 2026-10-23 in the corpus repo; takedown/correction law unchanged",
            "textOnly": True,
            "note": "Image/PDF/GeoGebra assets are referenced by the corpus front-matter, never imported.",
        },
        "coverage": {
            "ugmResourcesConsidered": considered_total,
            "aligned": aligned_total,
            "nonOverlap": nonov_total,
            "alignedShare": round(aligned_total / considered_total, 3) if considered_total else None,
            "candidateRows": total_rows,
            "crossLaneJoined": cross,
            "specPointsCovered": [sp["code"] for sp in spec_points],
            "lanes": [p["coverage"] for p in parts],
        },
        "specPoints": spec_points,
        "resources": resources,
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
