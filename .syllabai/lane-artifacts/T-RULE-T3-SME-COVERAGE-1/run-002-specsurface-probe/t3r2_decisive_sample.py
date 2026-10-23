#!/usr/bin/env python3
"""T-RULE-T3-SME-COVERAGE-1 run-002 decisive sample — fetch 4 NEW-leaf note
pages (published after the attested harvest per the A2 freshness delta) and
test whether they carry specPoint ENTITY definitions and — the gold
standard — whether any DANGLING id is defined on them.

BOUNDED: 4 fixed fetches from the A2 new-leaf lists (saved HTML), no crawl.
Authorization: LICENSE-DATA.md SME attestation 2026-09-17 + 2026-10-17.
"""
import json
import re
import time
import urllib.request
from pathlib import Path

RES = Path("/home/z/my-project/scripts/tmp/t3r2/resources")
DANGLING = json.loads(Path("/home/z/my-project/scripts/tmp/t3r2/classB_dangling_fresh_e33d4805.json").read_text())
EXT = json.loads(Path("/home/z/my-project/scripts/tmp/t3r2/specsurface_extension_results.json").read_text())
ADJ = json.loads(Path("/home/z/my-project/scripts/tmp/t3r2/specsurface_adjudication.json").read_text())
HTML = Path("/home/z/my-project/scripts/tmp/t3r2/html")
OUT = Path("/home/z/my-project/scripts/tmp/t3r2/specsurface_decisive_sample.json")
UA = "SyllabAI-corpus-probe/1.0 (attested per resources LICENSE-DATA.md 2026-09-17 + 2026-10-17; public pages only; contact via repo)"


def fetch(url, name):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            html = r.read().decode("utf-8", errors="replace")
            (HTML / name).write_text(html, encoding="utf-8")
            return r.status, html, None
    except Exception as e:  # noqa: BLE001
        return None, None, f"{type(e).__name__}: {e}"


def main():
    # pick 2 new leaves for business-25, 1 for econ-25, 1 for econ-20
    picks = []
    for lane, want in (("cie-igcse-business-25", 2), ("cie-igcse-economics-25", 1), ("cie-igcse-economics-20", 1)):
        a2 = next(x for x in ADJ["A2_leaf_freshness"] if x["lane"] == lane)
        new = a2["new_leaf_sample"] if len(a2["new_leaf_sample"]) >= want else None
        # need the full new-leaf list: recompute from saved index html
        nm = json.loads((RES / "SME-RevisionNotes" / lane / "manifest.json").read_text())
        manifest_paths = {p["path"][len("notes/"):].replace(".json", "") for p in nm.get("pages") or []}
        html = (HTML / f"index_{lane}.html").read_text(encoding="utf-8", errors="replace")
        live = sorted({x.rstrip("/") for x in re.findall(r'/revision-notes/([a-z0-9\-/]+)', html)
                       if x.rstrip("/").count("/") >= 2 and x.rstrip("/") not in manifest_paths})
        base = nm.get("notes_base")
        for t in live[:want]:
            picks.append((lane, base + t.rstrip("/") + "/", t))

    uni = {row["lane"]: set(json.loads((RES / "SME-ExamQuestion" / row["lane"] / "spec_point_index.json").read_text()).get("spec_points", {}).keys())
           for row in DANGLING["rows"]}
    dang = {row["lane"]: row["dangling_ids"] for row in DANGLING["rows"]}

    results = []
    for lane, url, tail in picks:
        st, html, err = fetch(url, f"newleaf_{lane}_{re.sub(r'[^a-z0-9]', '_', tail)[:60]}.html")
        time.sleep(1.5)
        ids = sorted(set(re.findall(r"spcpt_[A-Za-z0-9]+", html))) if html else []
        d_hits = {sid: html.count(sid) for sid in dang[lane] if html and sid in html}
        widgets = []
        for sid in ids[:3]:
            i = html.find(sid)
            widgets.append(html[max(0, i - 60): i + 320].replace("\n", " ")[:380])
        results.append({
            "lane": lane,
            "url": url,
            "leaf_tail": tail,
            "http_status": st,
            "fetch_error": err,
            "spcpt_ids_on_page": ids,
            "ids_outside_harvested_universe": sorted(set(ids) - uni[lane]),
            "dangling_ids_on_page": sorted(d_hits.keys()),
            "dangling_hit_count": len(d_hits),
            "widget_samples": widgets,
        })

    # manifest vintages for the receipt (when was the harvest of record taken)
    vintages = {}
    for lane in ("cie-igcse-business-25", "cie-igcse-economics-25", "cie-igcse-economics-20",
                 "cie-igcse-maths-25-core", "cie-a-level-maths-20-probability-and-statistics-2"):
        nm = json.loads((RES / "SME-RevisionNotes" / lane / "manifest.json").read_text())
        vintages[lane] = nm.get("generated_utc")

    OUT.write_text(json.dumps({"sample": results, "manifest_vintages": vintages}, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    for r in results:
        print(f"{r['lane']:30s} st={r['http_status']} ids={len(r['spcpt_ids_on_page']):3d} outside_universe={len(r['ids_outside_harvested_universe']):3d} DANGLING_HITS={r['dangling_hit_count']} err={r['fetch_error']}")
        for w in r["widget_samples"][:1]:
            print("    widget:", w[:220])
    print("vintages:", json.dumps(vintages, indent=1)[:400])
    print(f"written: {OUT}")


if __name__ == "__main__":
    main()
