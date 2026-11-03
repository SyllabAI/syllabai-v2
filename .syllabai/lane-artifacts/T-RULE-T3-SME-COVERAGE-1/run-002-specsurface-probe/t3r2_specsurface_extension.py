#!/usr/bin/env python3
"""T-RULE-T3-SME-COVERAGE-1 run-002 extension — the two decisive class-B
questions left open by the first probe pass:

  Q1: do the note-page specPoint widgets carry (id -> definition) ENTITY
      pairs (spcpt_* id + syllabus code/name), or only human-readable
      labels without corpus ids?
  Q2: has the notes surface GROWN since the attested harvest (manifest
      pages_expected vs live index link census)?  New pages could define
      currently-dangling ids.

BOUNDED: 7 fixed fetches (5 notes indexes + 2 note pages), HTML persisted
lane-side, single-threaded, 1.5s courtesy delay, no credentials, no crawl.
Authorization: LICENSE-DATA.md SME attestation 2026-09-17 + 2026-10-17
extension (public pages, no credentials).
"""
import json
import re
import time
import urllib.request
from pathlib import Path

RES = Path("/home/z/my-project/scripts/tmp/t3r2/resources")
OUT = Path("/home/z/my-project/scripts/tmp/t3r2/specsurface_extension_results.json")
HTMLDIR = Path("/home/z/my-project/scripts/tmp/t3r2/html")
HTMLDIR.mkdir(parents=True, exist_ok=True)

UA = "SyllabAI-corpus-probe/1.0 (attested per resources LICENSE-DATA.md 2026-09-17 + 2026-10-17; public pages only; contact via repo)"
DANGLING = json.loads(Path("/home/z/my-project/scripts/tmp/t3r2/classB_dangling_fresh_e33d4805.json").read_text())


def fetch(url, name):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            html = r.read().decode("utf-8", errors="replace")
            (HTMLDIR / name).write_text(html, encoding="utf-8")
            return r.status, html, None
    except Exception as e:  # noqa: BLE001
        return None, None, f"{type(e).__name__}: {e}"


def id_census(html):
    """All spcpt_* ids on the page with a context sample for the first hit."""
    ids = {}
    for m in re.finditer(r"spcpt_[A-Za-z0-9]+", html):
        sid = m.group(0)
        if sid not in ids:
            i = m.start()
            ids[sid] = html[max(0, i - 200): i + 260].replace("\n", " ")[:460]
    return ids


def widget_shape(html):
    """Structure samples around each 'specPoint' occurrence."""
    shapes = []
    for m in list(re.finditer(r"specPoint", html))[:6]:
        i = m.start()
        shapes.append(html[max(0, i - 260): i + 340].replace("\n", " ")[:600])
    return shapes


def index_links(html):
    """Revision-note page links on an index page (bounded freshness signal)."""
    links = sorted(set(re.findall(r'/revision-notes/[a-z0-9\-/]+', html)))
    return links


def main():
    lanes = [
        "cie-igcse-business-25",
        "cie-igcse-economics-25",
        "cie-igcse-maths-25-core",
        "cie-igcse-economics-20",
        "cie-a-level-maths-20-probability-and-statistics-2",
    ]
    results = {"question_1_entity_pairs": [], "question_2_freshness": [], "fetches": 0}

    # Q2: live index link census vs manifest pages_expected
    for lane in lanes:
        nm = json.loads((RES / "SME-RevisionNotes" / lane / "manifest.json").read_text())
        base = nm.get("notes_base")
        st, html, err = fetch(base, f"index_{lane}.html")
        results["fetches"] += 1
        time.sleep(1.5)
        links = index_links(html) if html else []
        dang = next(r for r in DANGLING["rows"] if r["lane"] == lane)["dangling_ids"]
        hit_ids = {sid: html.count(sid) for sid in dang if html and sid in html}
        results["question_2_freshness"].append({
            "lane": lane,
            "url": base,
            "http_status": st,
            "fetch_error": err,
            "manifest_pages_expected": (nm.get("counts") or {}).get("pages_expected"),
            "manifest_pages_scraped": (nm.get("counts") or {}).get("pages_scraped"),
            "live_revision_notes_links": len(links),
            "live_links_sample": links[:12],
            "dangling_ids_on_index": hit_ids,
            "spcpt_ids_on_index": sorted(id_census(html).keys()) if html else [],
        })

    # Q1: two note pages (business-25 content-ish + econ-20 content page)
    page_targets = [
        ("cie-igcse-business-25",
         "https://www.savemyexams.com/igcse/business/cie/25/revision-notes/operations-management/sustainable-production-of-goods-and-services/methods-of-sustainable-production"),
        ("cie-igcse-economics-20", None),  # URL resolved from the note file front-matter below
    ]
    for lane, override in page_targets:
        if override is None:
            nm = json.loads((RES / "SME-RevisionNotes" / lane / "manifest.json").read_text())
            pages = sorted(nm.get("pages") or [],
                           key=lambda p: -(p.get("spec_point_ids") or 0) if isinstance(p.get("spec_point_ids"), int) else 0)
            f = RES / "SME-RevisionNotes" / lane / pages[0]["path"]
            url = json.loads(f.read_text()).get("url")
        else:
            url = override
        name = f"page_{lane}.html"
        st, html, err = fetch(url, name)
        results["fetches"] += 1
        time.sleep(1.5)
        dang = next(r for r in DANGLING["rows"] if r["lane"] == lane)["dangling_ids"]
        ids = id_census(html) if html else {}
        hit_ids = {sid: html.count(sid) for sid in dang if html and sid in html}
        results["question_1_entity_pairs"].append({
            "lane": lane,
            "url": url,
            "http_status": st,
            "fetch_error": err,
            "specpoint_occurrences": len(re.findall(r"specPoint", html)) if html else 0,
            "spcpt_ids_on_page": sorted(ids.keys()),
            "spcpt_id_count": len(ids),
            "context_samples": [ids[k] for k in list(ids)[:4]],
            "widget_shapes": widget_shape(html) if html else [],
            "dangling_ids_on_page": hit_ids,
        })

    OUT.write_text(json.dumps(results, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"fetches: {results['fetches']}")
    for r in results["question_2_freshness"]:
        print(f"  Q2 {r['lane']:66s} expected={r['manifest_pages_expected']} live_links={r['live_revision_notes_links']} idx_spcpt={len(r['spcpt_ids_on_index'])} dangl_idx={len(r['dangling_ids_on_index'])} err={r['fetch_error']}")
    for r in results["question_1_entity_pairs"]:
        print(f"  Q1 {r['lane']:66s} specPoint={r['specpoint_occurrences']} page_spcpt_ids={r['spcpt_id_count']} dangl_page={len(r['dangling_ids_on_page'])} err={r['fetch_error']}")
    print(f"written: {OUT}")


if __name__ == "__main__":
    main()
