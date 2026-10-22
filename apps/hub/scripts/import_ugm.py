#!/usr/bin/env python3
"""
import_ugm.py — Underground Mathematics lane bundle importer for the hub.

Mirrors the import_content.py discipline: reads a LOCAL checkout/snapshot of
SyllabAI/syllabai-resources at a pinned ref (never GitHub at runtime), and
emits a versioned, self-describing JSON bundle committed under content/.

Sources of record (course cie-a-level-maths-20-pure-1, three UGM lanes):
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
      [--ref main@7e11a74c40eb5667fedea5cd9a3c49e03b302e8b] \
      [--lane cie-a-level-maths-20-pure-1]

The script audits before writing (fail-closed, PER LANE): enrichment row
census, blob identity (sha256 vs MANIFEST.json v2 lane block), the
stationScope/stationBreakdown census for multi-station lanes, front-matter ↔
enrichment spec-point set equality per resource, primaryPick uniqueness,
delimiter balance per body — ANY failure aborts with no file written.
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
DEFAULT_REF = "main@7e11a74c40eb5667fedea5cd9a3c49e03b302e8b"
DEFAULT_LANE = "cie-a-level-maths-20-pure-1"

# Per-course UGM lane mapping. Single-station blocks (`station` + `title`)
# mirror one UGM station; multi-station blocks (lane 3+) declare `laneSlug` +
# `laneTitle` + `stations[]` and are audited against the enrichment's
# stationScope of record. The bundle merges lanes (a course's UGM surface is
# one index).
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

    total_rows = sum(len(sp["ugmIds"]) for sp in spec_points)
    aligned_total = sum(p["coverage"]["aligned"] for p in parts)
    considered_total = sum(p["coverage"]["ugmResourcesConsidered"] or 0 for p in parts)
    nonov_total = sum(p["coverage"]["nonOverlap"] for p in parts)

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
