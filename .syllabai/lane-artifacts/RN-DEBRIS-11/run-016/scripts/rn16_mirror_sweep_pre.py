#!/usr/bin/env python3
"""RN-DEBRIS-11 run-016 evidence pass (pre-apply) — live spine mirror sweep (three-plane census).

Law of record (run-013/014 G6_mirrorEquality): apps/hub/spines/<slug>.json is a
VERBATIM mirror of apps/hub/content/<slug>/curriculum.json node titles, matched
by code (document order within a code; dup-code policy = positional zip).
This sweep writes NOTHING to the repo: it records both observed sides verbatim
(zero-invention). Matching: exact code first; leftovers via suffix
normalization (strip board prefixes at '-' or ':') with ambiguity refusal.

KG (apps/hub/public/kg/data/<slug>.json) is a presentation-projected mirror
(T-SPEC-AUDIT-1 normalization, meta-documented) -> evidence-only census,
never an apply target in this run.
"""
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

WT = Path("/home/z/my-project/work/syllabai-v2")
SPINES = WT / "apps/hub/spines"
CONTENT = WT / "apps/hub/content"
KG = WT / "apps/hub/public/kg/data"
OUT = Path("/home/z/my-project/work/rn16_mirror_sweep_pre.json")
PIN_SHA = "f31323cf9ecb0571f04df2d3ad856a974d226949"

FAMS = ("TOPIC", "SUBTOPIC", "SPEC_POINT")
FRAG_END = {"of", "the", "on", "in", "and", "for", "with", "using", "by", "to",
            "from", "as", "at", "or", "a", "an", "into", "within", "between",
            "including", "through", "per"}


def norm_ws(t):
    return " ".join(str(t).split())


def suffix(code):
    return code.rsplit("-", 1)[-1].rsplit(":", 1)[-1]


def frag(t):
    """Fragment-ending = last whitespace word is a lowercase stopword.
    Trailing digits/quotes/uppercase variables ('set A', 'per 100') are NOT
    fragments — fixes the v0 false positives on maths spec rows."""
    words = str(t).split()
    if len(words) < 2:
        return False
    last = re.sub(r"[\s'\u2019\u2032.:;,!?\u201d\u201c]+$", "", words[-1])
    return bool(re.fullmatch(r"[a-z]+", last or "")) and last in FRAG_END


def title_map(nodes):
    """code -> [titles] in document order, mirror-law families only."""
    m = {}
    for n in nodes:
        if n.get("family") in FAMS:
            m.setdefault(n["code"], []).append(str(n.get("title", "")))
    return m


def fam_counts(nodes):
    return {f: sum(1 for n in nodes if n.get("family") == f) for f in FAMS}


def match_rows(cmap, smap, slug, family):
    """Return (drift rows, unmatched content codes, unmatched spine codes)."""
    rows, unmatched = [], []
    smap_left = {k: list(v) for k, v in smap.items()}
    # pass 1: exact code, positional zip (dup-code policy)
    suffix_want = {}
    for code, ctitles in cmap.items():
        stitles = smap_left.pop(code, None)
        if stitles is None:
            suffix_want.setdefault(suffix(code), []).append((code, ctitles))
            continue
        if len(stitles) != len(ctitles):
            rows.append({"slug": slug, "family": family, "code": code,
                         "matchedBy": "exact",
                         "contentTitle": " <COUNT> ".join(map(norm_ws, ctitles)),
                         "spineTitle": " <COUNT> ".join(map(norm_ws, stitles)),
                         "structural": "count_mismatch",
                         "fragContent": False, "fragSpine": False})
            continue
        for a, b in zip(ctitles, stitles):
            if norm_ws(a) != norm_ws(b):
                rows.append({"slug": slug, "family": family, "code": code,
                             "matchedBy": "exact", "contentTitle": norm_ws(a),
                             "spineTitle": norm_ws(b), "structural": None,
                             "fragContent": frag(a), "fragSpine": frag(b)})
    # pass 2: suffix bucket for unmatched content codes
    sfx_spine = {}
    for code, stitles in smap_left.items():
        sfx_spine.setdefault(suffix(code), []).append((code, stitles))
    for sfx, wants in suffix_want.items():
        have = sfx_spine.get(sfx, [])
        if len(wants) == 1 and len(have) == 1:
            (code, ctitles), (scode, stitles) = wants[0], have[0]
            smap_left.pop(scode, None)
            if len(ctitles) != len(stitles):
                rows.append({"slug": slug, "family": family, "code": code,
                             "matchedBy": f"suffix({scode})",
                             "contentTitle": " <COUNT> ".join(map(norm_ws, ctitles)),
                             "spineTitle": " <COUNT> ".join(map(norm_ws, stitles)),
                             "structural": "count_mismatch",
                             "fragContent": False, "fragSpine": False})
                continue
            for a, b in zip(ctitles, stitles):
                if norm_ws(a) != norm_ws(b):
                    rows.append({"slug": slug, "family": family, "code": code,
                                 "matchedBy": f"suffix({scode})",
                                 "contentTitle": norm_ws(a), "spineTitle": norm_ws(b),
                                 "structural": None,
                                 "fragContent": frag(a), "fragSpine": frag(b)})
        else:
            for code, _t in wants:
                unmatched.append({"slug": slug, "family": family, "code": code,
                                  "reason": "ambiguous_or_missing_spine_partner"})
    spine_unmatched = [{"slug": slug, "family": family, "code": code,
                        "reason": "no_content_partner"}
                       for code in smap_left]
    return rows, unmatched, spine_unmatched


def kg_census(slug, ctitles):
    """Evidence-only: multiset compare KG point labels vs content SPEC_POINT titles."""
    p = KG / f"{slug}.json"
    if not p.exists():
        return {"kgFile": "missing"}
    kg = json.loads(p.read_text(encoding="utf-8"))
    labels = []
    for pt in kg.get("points", []) or []:
        for key in ("text", "label", "statement", "title"):
            v = pt.get(key) if isinstance(pt, dict) else None
            if isinstance(v, str) and v.strip():
                labels.append(norm_ws(v))
                break
    want = Counter(norm_ws(t) for t in ctitles)
    got = Counter(labels)
    matched = sum((want & got).values())
    return {"kgLabels": len(labels), "contentPoints": sum(want.values()),
            "verbatimMatched": matched,
            "contentOnlySample": sorted(want - got)[:5],
            "kgOnlySample": sorted(got - want)[:5]}


def spine_roundtrip_probe():
    """Prove load->dump byte-stability for every spine before any writer exists."""
    stable, unstable = 0, []
    for p in sorted(SPINES.glob("*.json")):
        if p.name.startswith("_"):
            continue
        raw = p.read_bytes()
        doc = json.loads(raw)
        out = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if raw == out or raw == out + b"\n":
            stable += 1
        else:
            unstable.append(p.name)
    return stable, unstable


def main():
    spine_files = sorted(p for p in SPINES.glob("*.json")
                         if not p.name.startswith("_"))
    content_dirs = sorted(d.name for d in CONTENT.iterdir()
                          if (d / "curriculum.json").is_file())
    missing_content = [p.stem for p in spine_files
                       if not (CONTENT / p.stem / "curriculum.json").is_file()]
    missing_spine = [d for d in content_dirs
                     if not (SPINES / f"{d}.json").is_file()]
    slugs = [p.stem for p in spine_files if p.stem not in missing_content]

    drift, unmatched_c, unmatched_s, census_bad, per_slug = [], [], [], [], {}
    for slug in slugs:
        sdoc = json.loads((SPINES / f"{slug}.json").read_text(encoding="utf-8"))
        cdoc = json.loads((CONTENT / slug / "curriculum.json").read_text(encoding="utf-8"))
        snodes, cnodes = sdoc["curriculum"]["nodes"], cdoc["nodes"]
        meta = sdoc.get("meta", {})
        counts_meta = meta.get("counts", {})
        live = fam_counts(cnodes)
        for family in FAMS:
            cmap, smap = {}, {}
            for n in cnodes:
                if n.get("family") == family:
                    cmap.setdefault(n["code"], []).append(str(n.get("title", "")))
            for n in snodes:
                if n.get("family") == family:
                    smap.setdefault(n["code"], []).append(str(n.get("title", "")))
            rows, unc, sun = match_rows(cmap, smap, slug, family)
            drift.extend(rows)
            unmatched_c.extend(unc)
            unmatched_s.extend(sun)
            if live[family] != sum(len(v) for v in smap.values()):
                census_bad.append({"slug": slug, "family": family,
                                   "content": live[family],
                                   "spine": sum(len(v) for v in smap.values())})
        meta_sp = counts_meta.get("specPoints")
        n_drift_slug = sum(1 for r in drift if r["slug"] == slug)
        per_slug[slug] = {
            "slug": slug, "driftRows": n_drift_slug,
            "census": {"content": live, "spineMeta": counts_meta,
                       "metaSpecPointsMatchesLive": (
                           meta_sp == live["SPEC_POINT"]) if meta_sp is not None else None},
            "resourcesSha": meta.get("resourcesSha"),
            "driftWarnings": [w for w in (meta.get("warnings") or [])
                              if isinstance(w, str)
                              and ("drift" in w.lower() or "title" in w.lower())][:6]}

    # ---- full unmatched lists (no caps) + SME synthetic classification ----
    unmatched_c = [dict(u, synthetic=("SME" in u["code"])) for u in unmatched_c]
    unmatched_s = [dict(u) for u in unmatched_s]
    rt_spine, rt_unstable = spine_roundtrip_probe()

    # ---- anti-truncation asserts ----
    assert len(spine_files) > 0, "no spines discovered"
    assert len(missing_content) + len(slugs) == len(spine_files), "slug partition broken"
    for r in drift:
        for k in ("slug", "family", "code", "matchedBy", "contentTitle", "spineTitle"):
            assert r.get(k) not in (None, ""), f"drift row missing {k}: {r}"
    assert all(v["driftRows"] >= 0 for v in per_slug.values()), "bad per_slug entry"
    assert rt_spine > 0 and rt_unstable == [], \
        f"spine byte round-trip broken: {rt_unstable[:3]}"

    drift_slugs = sorted({r["slug"] for r in drift})
    kg_out = {}
    for slug in drift_slugs:
        cnodes = json.loads((CONTENT / slug / "curriculum.json")
                            .read_text(encoding="utf-8"))["nodes"]
        ctitles = [n["title"] for n in cnodes if n.get("family") == "SPEC_POINT"]
        kg_out[slug] = kg_census(slug, ctitles)

    art = {
        "artifact": "rn11-run-016-mirror-sweep-pre-r0",
        "pinSha": PIN_SHA,
        "law": "spine titles == content titles (verbatim, code-matched, document order)",
        "spineByteRoundTrip": {
            "stable": rt_spine, "unstable": rt_unstable,
            "law": "json.dumps(load(b), ensure_ascii=False, separators=(',',':')) "
                   "preserves bytes (+/- trailing newline)"},
        "totals": {
            "spines": len(spine_files), "contentDirs": len(content_dirs),
            "slugsSwept": len(slugs), "missingContent": missing_content,
            "missingSpine": missing_spine,
            "driftRows": len(drift), "driftCourses": len(drift_slugs),
            "driftByFamily": dict(Counter(r["family"] for r in drift)),
            "driftByMatchedBy": dict(Counter(r["matchedBy"].split("(")[0] for r in drift)),
            "fragContentEnding": sum(1 for r in drift if r["fragContent"]),
            "fragSpineEnding": sum(1 for r in drift if r["fragSpine"]),
            "structuralRows": sum(1 for r in drift if r.get("structural")),
            "unmatchedContentCodes": len(unmatched_c),
            "unmatchedSpineCodes": len(unmatched_s),
            "unmatchedSynthetic": sum(1 for u in unmatched_c if u.get("synthetic")),
            "censusMismatches": len(census_bad),
        },
        "perSlug": per_slug,
        "driftRows": drift,
        "unmatchedContentCodes": unmatched_c,
        "unmatchedSpineCodes": unmatched_s,
        "censusMismatches": census_bad,
        "kgEvidenceCensus": kg_out,
    }
    OUT.write_text(json.dumps(art, ensure_ascii=False, indent=1), encoding="utf-8")
    rtr = json.loads(OUT.read_text(encoding="utf-8"))
    assert rtr["totals"]["driftRows"] == len(drift), "artifact round-trip count mismatch"
    assert rtr["totals"]["unmatchedContentCodes"] == len(unmatched_c), "cap leaked"
    digest = hashlib.sha256(OUT.read_bytes()).hexdigest()

    t = art["totals"]
    print(f"pinSha           : {PIN_SHA}")
    print(f"spine roundtrip  : {rt_spine} stable / {len(rt_unstable)} unstable")
    print(f"spines/content   : {t['spines']} spines, {t['contentDirs']} content dirs, "
          f"{t['slugsSwept']} swept")
    print(f"missing          : content={t['missingContent']} spine={t['missingSpine']}")
    print(f"DRIFT            : {t['driftRows']} rows across {t['driftCourses']} courses")
    print(f"  by family      : {t['driftByFamily']}")
    print(f"  by matchedBy   : {t['driftByMatchedBy']}")
    print(f"  frag-ending    : content-side={t['fragContentEnding']} "
          f"spine-side={t['fragSpineEnding']} structural={t['structuralRows']}")
    print(f"unmatched codes  : content={t['unmatchedContentCodes']} "
          f"(synthetic={t['unmatchedSynthetic']}) spine={t['unmatchedSpineCodes']}")
    print(f"census mismatch  : {t['censusMismatches']}")
    print(f"artifact         : {OUT} ({OUT.stat().st_size} bytes) sha256={digest[:16]}…")
    print("\ndrifted slugs:")
    for slug in drift_slugs:
        n = sum(1 for r in drift if r["slug"] == slug)
        kg = kg_out[slug]
        kgm = (f"kg {kg.get('verbatimMatched', '?')}/{kg.get('contentPoints', '?')}"
               if "kgLabels" in kg else kg.get("kgFile", "?"))
        print(f"  {slug:52s} {n:3d} rows | {kgm}")


if __name__ == "__main__":
    sys.exit(main())
