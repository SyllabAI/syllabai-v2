#!/usr/bin/env python3
"""
import_ugm.py — Underground Mathematics lane bundle importer for the hub.

Mirrors the import_content.py discipline: reads a LOCAL checkout/snapshot of
SyllabAI/syllabai-resources at a pinned ref (never GitHub at runtime), and
emits a versioned, self-describing JSON bundle committed under content/.

Source of record (quadratics lane, first UGM lane):
  - UGM-Enrichment/cie-a-level-maths-20-pure-1-quadratics.json  (facts, #55)
  - UGM-Resources/pure-1-quadratics/*.md                        (text, #58)
  - both landed of record at main@91eed732ae69b3cb9eede0529b07a8630651433a
    under ADR-UGM-0001 (as amended 2026-10-23) + the operator attestation of
    2026-10-23 ("downloaded text can ship into SyllabAI. We have permission").

Output: content/<lane>/ugm-resources.json, schema
"syllabai-demo.ugm-lane-resources/1.0" — per-spec-point resource groups with
byte-true markdown bodies (UGM's native \\( \\) / \\[ \\] delimiters are kept;
the hub renderer's normalizeCorpusMath already supports them) plus the
declared non-overlaps. Serve-side gating is the flags.json law (absent=OFF),
not this file — the bundle landing alone does not surface anything.

Usage:
  python3 scripts/import_ugm.py --repo <syllabai-resources-snapshot-dir> \
      [--ref main@91eed732ae69b3cb9eede0529b07a8630651433a] \
      [--lane cie-a-level-maths-20-pure-1]

The script audits before writing (fail-closed): enrichment row census, blob
identity (sha256 vs MANIFEST.json), delimiter balance per body, unique ids,
primaryPick census. Any audit failure aborts with no file written.
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

SCHEMA = "syllabai-demo.ugm-lane-resources/1.0"
ENRICHMENT_SCHEMA = "syllabai.ugm-spec-enrichment/1.0"
DEFAULT_REF = "main@91eed732ae69b3cb9eede0529b07a8630651433a"
DEFAULT_LANE = "cie-a-level-maths-20-pure-1"


def fail(msg):
    print(f"AUDIT FAIL: {msg}")
    sys.exit(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="syllabai-resources snapshot dir (pinned)")
    ap.add_argument("--ref", default=DEFAULT_REF)
    ap.add_argument("--lane", default=DEFAULT_LANE)
    ap.add_argument("--generated-utc", default=None)
    args = ap.parse_args()

    repo = args.repo.rstrip("/")
    lane = args.lane
    station_file = {
        "cie-a-level-maths-20-pure-1": "cie-a-level-maths-20-pure-1-quadratics.json",
    }.get(lane)
    if not station_file:
        fail(f"no UGM station mapping for lane {lane} yet (quadratics is the first lane)")
    station = "quadratics"

    # ── 1. enrichment facts of record ────────────────────────────────────
    enr_path = os.path.join(repo, "UGM-Enrichment", station_file)
    with open(enr_path, encoding="utf-8") as fh:
        enr = json.load(fh)
    if enr.get("schema") != ENRICHMENT_SCHEMA:
        fail(f"enrichment schema {enr.get('schema')!r} != {ENRICHMENT_SCHEMA}")
    if enr.get("review_state", {}).get("state") != "SUGGESTED":
        fail("enrichment review_state is not SUGGESTED — refuse to import as if it were")

    # ── 2. corpus text of record (blob identity vs MANIFEST.json) ───────
    res_dir = os.path.join(repo, "UGM-Resources", "pure-1-quadratics")
    with open(os.path.join(repo, "UGM-Resources", "MANIFEST.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    entries = manifest.get("files", manifest if isinstance(manifest, list) else [])
    by_rel = {}
    for e in entries:
        p = e.get("path") or e.get("file") or e.get("name")
        by_rel[p] = e
    files = sorted(f for f in os.listdir(res_dir) if f.endswith(".md"))
    if len(files) != 59 or len(by_rel) != 59:
        fail(f"file census {len(files)} md / {len(by_rel)} manifest entries != 59")
    for f in files:
        rel = f"pure-1-quadratics/{f}"
        h = hashlib.sha256(open(os.path.join(res_dir, f), "rb").read()).hexdigest()
        if by_rel.get(rel, {}).get("sha256") != h:
            fail(f"sha256 mismatch vs MANIFEST.json: {rel}")

    # ── 3. parse every resource: front-matter + byte-true body ─────────
    parsed = {}
    for f in files:
        text = open(os.path.join(res_dir, f), encoding="utf-8").read()
        m = FM_RE.match(text)
        if not m:
            fail(f"no front-matter: {f}")
        fm = yaml.safe_load(m.group(1))
        body = text[m.end():]
        ri = fm.get("resource_identity") or {}
        ugm_id = ri.get("ugm_id")
        if not ugm_id:
            fail(f"no ugm_id: {f}")
        if ugm_id in parsed:
            fail(f"duplicate ugm_id: {ugm_id}")
        # the corpus law: delimiters stay balanced per file (build audit law)
        if body.count(r"\(") != body.count(r"\)") or body.count(r"\[") != body.count(r"\]"):
            fail(f"delimiter imbalance in {f}")
        if not body.strip():
            fail(f"empty body: {f}")
        spec_pts = ((fm.get("spec_map") or {}).get("spec_points")) or []
        parsed[ugm_id] = {
            "ugmId": ugm_id,
            "file": f,
            "title": _title_from_fm_or_body(fm, body, ugm_id),
            "url": fm.get("source"),
            "resourceType": ri.get("station"),  # replaced below by type label mapping
            "resourceTypeLabel": ri.get("resource_type_label"),
            "typeTag": _tag_prefix(fm, "type/"),
            "levelTag": _tag_prefix(fm, "level/"),
            "level": ri.get("level"),
            "oldSiteId": ri.get("old_site_id"),
            "ref": ri.get("ref"),
            "rights": fm.get("rights"),
            "specPointsFromFm": [sp.get("code") for sp in spec_pts],
            "primaryFromFm": [
                sp.get("code") for sp in spec_pts
                if (sp.get("provenance") or {}).get("primaryPick") is True
            ],
            "bodyMd": body,
        }

    # type slug from the tags (type/package-of-problems etc.)
    for p in parsed.values():
        p["resourceType"] = (p.pop("typeTag") or "").replace("type/", "")

    # ── 4. join facts ↔ text ─────────────────────────────────────────────
    # A resource may candidate under MULTIPLE spec points (61 rows over 56
    # unique aligned resources + 3 non-overlaps = 59). Bodies are stored
    # ONCE in `resources`; spec points reference them by id.
    enr_by_slug = {}   # slug -> {code: enrichment row}
    for code, block in enr["perSpecPoint"].items():
        for r in block.get("resources", []):
            slug = r.get("ugmSlug")
            if slug in enr_by_slug and code in enr_by_slug[slug]:
                fail(f"enrichment lists {slug} twice under {code}")
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
            fail(f"front-matter/enrichment spec-point drift: {slug} fm={codes_fm} enr={codes_en}")
        if not codes_fm:
            fail(f"aligned resource with no spec points: {slug}")
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
            fail(f"resource claims primaryPick under multiple codes: {slug} {primaries}")
        seen_ids.add(slug)
        resources.append({
            "ugmId": slug,
            "slug": slug,
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
            fail(f"non-overlap slug not in corpus: {slug}")
        if p["specPointsFromFm"]:
            fail(f"non-overlap has front-matter spec points: {slug}")
        if slug in seen_ids:
            fail(f"non-overlap also aligned: {slug}")
        seen_ids.add(slug)
        resources.append({
            "ugmId": slug,
            "slug": slug,
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

    if len(seen_ids) != 59 or len(resources) != 59:
        fail(f"join coverage {len(seen_ids)}/{len(resources)} != 59 resources")

    # spec-point index (official code order); bodies stay referenced by id
    spec_points = []
    for code, block in sorted(enr["perSpecPoint"].items()):
        ugm_ids = [r.get("ugmSlug") for r in block.get("resources", [])]
        if block.get("primaryPick") not in ugm_ids:
            fail(f"{code}: primaryPick {block.get('primaryPick')!r} not among rows")
        spec_points.append({
            "code": code,
            "officialText": block.get("officialText"),
            "primaryPick": block.get("primaryPick"),
            "resourceCount": block.get("resourceCount"),
            "ugmIds": ugm_ids,
        })

    total_rows = sum(len(sp["ugmIds"]) for sp in spec_points)
    cov = enr.get("coverage", {})
    if total_rows != 61 or cov.get("aligned") != 56 or cov.get("nonOverlap") != 3:
        fail(f"row census {total_rows}/56/{cov} != 61 rows, 56 aligned, 3 non-overlap")

    # ── 5. emit ──────────────────────────────────────────────────────────
    hub = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(hub, "content", lane)
    os.makedirs(out_dir, exist_ok=True)
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
        "station": station,
        "stationUrl": enr.get("perSpecPoint", {}).get("1.1.1", {}).get("ugmStationUrl"),
        "source": {
            "repo": "SyllabAI/syllabai-resources",
            "ref": args.ref,
            "enrichment": f"UGM-Enrichment/{station_file}",
            "enrichmentSchema": ENRICHMENT_SCHEMA,
            "resourcesDir": "UGM-Resources/pure-1-quadratics",
            "ledger": "LEDGER.md — T-UGM-MODE1-1 (#55) and T-UGM-IMPORT-1 (#58)",
            "adr": "ADR-UGM-0001 as amended 2026-10-23 (syllabai-experimental)",
            "operatorAttestation": "2026-10-23 — text may ship into SyllabAI; permission declared",
        },
        "rights": {
            "holder": "© University of Cambridge (Underground Mathematics); © UCLES for sourced exam questions",
            "license": "LICENSE-DATA.md Amendment 2026-10-23 in the corpus repo; takedown/correction law unchanged",
            "textOnly": True,
            "note": "Image/PDF/GeoGebra assets are referenced by the corpus front-matter, never imported.",
        },
        "coverage": {
            "ugmResourcesConsidered": cov.get("ugmResourcesConsidered"),
            "aligned": cov.get("aligned"),
            "nonOverlap": cov.get("nonOverlap"),
            "alignedShare": cov.get("alignedShare"),
            "candidateRows": total_rows,
            "specPointsCovered": [sp["code"] for sp in spec_points],
        },
        "specPoints": spec_points,
        "resources": resources,
    }
    out_path = os.path.join(out_dir, "ugm-resources.json")
    tmp = out_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(bundle, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    os.replace(tmp, out_path)
    size = os.path.getsize(out_path)
    print(f"OK  {out_path}  ({size/1024:.0f} KB)")
    print(f"    {len(spec_points)} spec points, {total_rows} candidate rows, "
          f"{sum(1 for r in resources if r['nonOverlap'])} non-overlaps, "
          f"{len(resources)}/59 bodies joined")


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
