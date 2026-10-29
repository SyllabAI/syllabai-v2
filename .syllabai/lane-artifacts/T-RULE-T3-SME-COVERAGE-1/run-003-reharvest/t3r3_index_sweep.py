#!/usr/bin/env python3
"""T-RULE-T3-SME-COVERAGE-1 run-003 — index-page freshness sweep (the
run-002 A2 method applied fleet-wide, with pagination detection), because
the live sitemap demonstrably LAGS the notes surface (econ-25's 84 new
leaves absent from the sitemap while live on the site).

Per lane: fetch the notes_base index page, extract /revision-notes/ links
under the base (>=2 remaining segments = leaf), count, detect pagination
markers, and diff against the committed manifest pages_expected.

Discovery union law: leaf set for re-harvest = sitemap leaves UNION index
leaves; fail-closed if any committed page is missing from the union.
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

WT = Path("/home/z/my-project/lane-t3r3/resources")
CACHE = Path("/home/z/my-project/.cache")
OUT = Path("/home/z/my-project/scripts/recon")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
DELAY = 1.5
LEAF_RE = re.compile(r'href="([^"]+/revision-notes/[^"]*)"')


def fetch(url: str, timeout: int = 60) -> str:
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def get(url: str) -> str:
    last = None
    for a in range(3):
        try:
            return fetch(url)
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(2 * (a + 1))
    raise RuntimeError(f"fetch failed x3: {url} ({last})")


def index_leaves(base: str, html: str) -> tuple[set[str], list[str]]:
    """Leaf URLs linked from an index page + pagination markers."""
    urls = set()
    for href in LEAF_RE.findall(html):
        u = urljoin(base, href).split("#")[0]
        if not u.startswith(base):
            continue
        rest = u[len(base):].strip("/").split("/") if u[len(base):] else []
        if len(rest) >= 2:
            urls.add(u.rstrip("/"))
    pages = sorted(set(re.findall(r'[?&]page=(\d+)', html)))
    return urls, pages


def main() -> int:
    t0 = time.time()
    disc = json.loads((CACHE / "sme_notes_urls.json").read_text("utf-8"))
    census = json.loads((CACHE / "sme_cambridge_sitemap_census.json")
                        .read_text("utf-8"))
    rows = []
    union_note_urls = set(disc["notes_urls"])
    for slug in sorted(disc["courses"]):
        base = disc["courses"][slug]["notes_base"]
        html = get(base)
        live, pages = index_leaves(base, html)
        time.sleep(DELAY)
        sitemap_live = set()
        for u in census["cambridge_urls"]:
            if u.startswith(base):
                rest = u[len(base):].strip("/").split("/")
                if len(rest) >= 2:
                    sitemap_live.add(u.rstrip("/"))
        union = live | sitemap_live
        union_note_urls |= union
        mf = WT / "SME-RevisionNotes" / slug / "manifest.json"
        m = json.loads(mf.read_text("utf-8")) if mf.exists() else {}
        expected = (m.get("counts") or {}).get("pages_expected")
        committed_pages = set()
        for p in m.get("pages") or []:
            committed_pages.add(base + p["path"][len("notes/"):][:-len(".json")])
        missing_committed = sorted(committed_pages - union)
        rows.append({
            "lane": slug,
            "index_leaves": len(live),
            "sitemap_leaves": len(sitemap_live),
            "union_leaves": len(union),
            "committed_pages_expected": expected,
            "growth_vs_committed": (len(union) - expected
                                    if expected is not None else None),
            "index_pagination_pages": pages,
            "committed_missing_from_union": missing_committed,
        })
        print(f"  {slug:62s} idx={len(live):4d} sm={len(sitemap_live):4d} "
              f"union={len(union):4d} committed={expected} "
              f"growth={rows[-1]['growth_vs_committed']}"
              f"{' PAGES' + str(pages) if pages else ''}"
              f"{' MISS!' if missing_committed else ''}", flush=True)

    grown = [r for r in rows if (r["growth_vs_committed"] or 0) > 0]
    shrunk = [r for r in rows if (r["growth_vs_committed"] or 0) < 0]
    miss = [r for r in rows if r["committed_missing_from_union"]]
    (CACHE / "sme_notes_urls.json").write_text(json.dumps({
        "notes_urls_total": len(union_note_urls),
        "notes_urls": sorted(union_note_urls),
        "courses": disc["courses"],
    }, indent=1), encoding="utf-8")
    out = {
        "schema": "syllabai.t3r3-index-sweep/1.0",
        "basis": "per-lane notes index page (run-002 A2 method, fleet-wide) "
                 "UNION live sitemap; sitemap lags new content (disclosed)",
        "fetched_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "lanes": len(rows),
        "grown_lanes": [r["lane"] for r in grown],
        "grown_total_new_leaves": sum(r["growth_vs_committed"] for r in grown),
        "shrunk_lanes": [r["lane"] for r in shrunk],
        "committed_missing_from_union_lanes": [r["lane"] for r in miss],
        "rows": sorted(rows, key=lambda r: -(r["growth_vs_committed"] or 0)),
    }
    (OUT / "t3r3_index_sweep.json").write_text(json.dumps(out, indent=1) + "\n",
                                               encoding="utf-8")
    print(f"\nINDEX SWEEP: {len(rows)} lanes | grown {len(grown)} "
          f"(+{out['grown_total_new_leaves']}) | shrunk {len(shrunk)} | "
          f"committed-missing {len(miss)}")
    print(f"elapsed {round(time.time() - t0, 1)} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
