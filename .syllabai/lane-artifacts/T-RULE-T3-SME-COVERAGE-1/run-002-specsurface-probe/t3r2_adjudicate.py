#!/usr/bin/env python3
"""T-RULE-T3-SME-COVERAGE-1 run-002 adjudication (offline, zero fetches).

A1: are the spcpt_* ids observed live on the two Q1 note pages a SUBSET of
    the harvested bank universe?  (live-surface fidelity vs the index of
    record; any id OUTSIDE the universe = a NEW definition the harvest
    missed — that would re-open class-B)
A2: leaf-path freshness per bank — live index links vs the manifest page
    paths of record (any NEW leaf path = surface growth; bounded heuristic,
    disclosed as such).
A3: cross-lane entity join — do ANY of the 322 dangling ids appear in ANY
    class-B bank universe or any probed live surface? (the dangling class
    is bank-local by construction; attested fleet-wide once more)
"""
import json
import re
from pathlib import Path

RES = Path("/home/z/my-project/scripts/tmp/t3r2/resources")
DANGLING = json.loads(Path("/home/z/my-project/scripts/tmp/t3r2/classB_dangling_fresh_e33d4805.json").read_text())
EXT = json.loads(Path("/home/z/my-project/scripts/tmp/t3r2/specsurface_extension_results.json").read_text())
HTML = Path("/home/z/my-project/scripts/tmp/t3r2/html")
OUT = Path("/home/z/my-project/scripts/tmp/t3r2/specsurface_adjudication.json")


def bank_universe(lane):
    idx = json.loads((RES / "SME-ExamQuestion" / lane / "spec_point_index.json").read_text())
    return set((idx.get("spec_points") or {}).keys())


def main():
    doc = {"A1_live_ids_vs_universe": [], "A2_leaf_freshness": [], "A3_cross_lane_join": {}}

    # A1
    for r in EXT["question_1_entity_pairs"]:
        lane = r["lane"]
        uni = bank_universe(lane)
        live = set(r["spcpt_ids_on_page"])
        new = sorted(live - uni)
        doc["A1_live_ids_vs_universe"].append({
            "lane": lane,
            "universe_of_record": len(uni),
            "live_ids_on_page": len(live),
            "live_ids_subset_of_universe": not new,
            "ids_outside_universe": new,
            "dangling_ids_on_page": sorted(r["dangling_ids_on_page"].keys()),
        })

    # A2 — leaf-path freshness (heuristic: compare live /revision-notes/ links
    # to the manifest page paths; count links not present in the manifest set)
    for r in EXT["question_2_freshness"]:
        lane = r["lane"]
        nm = json.loads((RES / "SME-RevisionNotes" / lane / "manifest.json").read_text())
        manifest_paths = set()
        for p in nm.get("pages") or []:
            # path like notes/<section>/<topic>/<leaf>.json -> live slug tail
            tail = p["path"][len("notes/"):].replace(".json", "")
            manifest_paths.add(tail)
        html = (HTML / f"index_{lane}.html").read_text(encoding="utf-8", errors="replace")
        live = set(re.findall(r'/revision-notes/([a-z0-9\-/]+)', html))
        new_leaves = sorted(x.rstrip("/") for x in live
                            if x.rstrip("/") not in manifest_paths
                            and x.rstrip("/").count("/") >= 2)  # leaf-ish depth only
        doc["A2_leaf_freshness"].append({
            "lane": lane,
            "manifest_pages": (nm.get("counts") or {}).get("pages_expected"),
            "live_leaf_links_total": len([x for x in live if x.rstrip("/").count("/") >= 2]),
            "new_leaf_links_not_in_manifest": len(new_leaves),
            "new_leaf_sample": new_leaves[:8],
            "heuristic_note": "index nav/cross-links inflate raw counts; leaf-depth-2+ filter applied; pagination not crawled (bounded)",
        })

    # A3 — cross-lane join of all 322 dangling ids against every class-B
    # universe + every saved live HTML surface
    all_dangling = {}
    for row in DANGLING["rows"]:
        for sid in row["dangling_ids"]:
            all_dangling.setdefault(sid, []).append(row["lane"])
    universes = {lane: bank_universe(lane) for lane in
                 [r["lane"] for r in DANGLING["rows"]]}
    hits_universe = {sid: lanes for sid, lanes in all_dangling.items()
                     if any(sid in universes[l] for l in lanes)}
    hits_live = {}
    for f in HTML.glob("*.html"):
        html = f.read_text(encoding="utf-8", errors="replace")
        for sid in all_dangling:
            if sid in html:
                hits_live.setdefault(sid, []).append(f.name)
    doc["A3_cross_lane_join"] = {
        "dangling_unique_ids_total": len(all_dangling),
        "found_in_any_classB_universe": len(hits_universe),
        "found_in_any_probed_live_surface": len(hits_live),
        "universe_hits": dict(sorted(hits_universe.items())[:10]),
        "live_hits": dict(sorted(hits_live.items())[:10]),
    }

    OUT.write_text(json.dumps(doc, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    for a in doc["A1_live_ids_vs_universe"]:
        print(f"A1 {a['lane']:66s} uni={a['universe_of_record']:4d} live={a['live_ids_on_page']} subset={a['live_ids_subset_of_universe']} outside={a['ids_outside_universe']}")
    for a in doc["A2_leaf_freshness"]:
        print(f"A2 {a['lane']:66s} manifest={a['manifest_pages']:4d} live_leaves~={a['live_leaf_links_total']:4d} new={a['new_leaf_links_not_in_manifest']:3d} sample={a['new_leaf_sample'][:3]}")
    a3 = doc["A3_cross_lane_join"]
    print(f"A3 dangling_unique={a3['dangling_unique_ids_total']} in_universes={a3['found_in_any_classB_universe']} on_live_surfaces={a3['found_in_any_probed_live_surface']}")
    print(f"written: {OUT}")


if __name__ == "__main__":
    main()
