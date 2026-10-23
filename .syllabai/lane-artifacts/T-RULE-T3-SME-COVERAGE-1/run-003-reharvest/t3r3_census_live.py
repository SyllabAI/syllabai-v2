#!/usr/bin/env python3
"""T-RULE-T3-SME-COVERAGE-1 run-003 — live sitemap census + fleet-wide
freshness sweep for the 44 CIE SME lanes (operator dispatch "tranche-3
re-harvest", trace 1a169db74ca578c9).

Supersedes run-002's bounded A2 heuristic (index-page link census) with the
EXACT discovery basis of record: the SME sitemap tree (the same channel the
original T-SME-CAMBRIDGE census used 2026-10-17).

Outputs (lane-local, mirrored git-protected at filing time):
  .cache/sme_cambridge_sitemap_census.json  (registrar-compatible shape:
       {"cambridge_urls": [...]})
  .cache/sme_notes_urls.json                (via sme_cambridge_courses
       --notes-cache, the of-record builder)
  /home/z/my-project/scripts/recon/t3r3_sweep.json  (per-lane verdict)

Politeness: 1.5 s courtesy delay between sitemap fetches (run-002 fetch
ledger convention); UA + retries per sme_notes_discover.py.
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
from pathlib import Path

WT = Path("/home/z/my-project/lane-t3r3/resources")
CACHE = Path("/home/z/my-project/.cache")
OUT = Path("/home/z/my-project/scripts/recon")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
DELAY = 1.5


def fetch(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def get(url: str) -> bytes:
    last = None
    for a in range(3):
        try:
            return fetch(url)
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(2 * (a + 1))
    raise RuntimeError(f"fetch failed x3: {url} ({last})")


def sitemap_urls(xml: bytes) -> list[str]:
    return re.findall(r"<loc>\s*(.*?)\s*</loc>",
                      xml.decode("utf-8", "replace"))


def main() -> int:
    t0 = time.time()
    index = sitemap_urls(get("https://www.savemyexams.com/sitemap.xml"))
    print(f"sitemap index entries: {len(index)}")

    level_maps = [u for u in index
                  if re.search(r"/(igcse|a-level|as|international-a-level)[-/]",
                               u) and u.endswith(".xml")]
    if not level_maps:
        level_maps = index
    print(f"candidate level sitemaps: {len(level_maps)}")

    all_urls: list[str] = []
    fetched = 0
    for sm in sorted(level_maps):
        try:
            us = sitemap_urls(get(sm))
        except Exception as exc:  # noqa: BLE001
            print(f"  WARN {sm.rsplit('/', 1)[-1]}: {exc}")
            continue
        fetched += 1
        all_urls.extend(us)
        time.sleep(DELAY)
    print(f"fetched {fetched} sitemaps, {len(all_urls)} urls total")

    cambridge = sorted(u for u in all_urls if "/cie/" in u)
    notes_urls = [u for u in cambridge if "/revision-notes/" in u]
    print(f"cambridge urls {len(cambridge)} | revision-notes urls "
          f"{len(notes_urls)}")

    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / "sme_cambridge_sitemap_census.json").write_text(json.dumps({
        "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sitemaps_fetched": fetched,
        "cambridge_urls_total": len(cambridge),
        "cambridge_urls": cambridge,
    }, indent=1), encoding="utf-8")

    # rebuild the notes discovery cache with the of-record builder
    sys.path.insert(0, str(WT / "scripts"))
    import sme_cambridge_courses as cc  # noqa: E402
    cc.build_notes_cache()

    # ---- fleet-wide freshness sweep (44 cie lanes)
    disc = json.loads((CACHE / "sme_notes_urls.json").read_text("utf-8"))
    sweep = []
    for slug in sorted(disc["courses"]):
        base = disc["courses"][slug]["notes_base"]
        live = 0
        for u in disc["notes_urls"]:
            if not u.startswith(base):
                continue
            rest = u[len(base):].strip("/").split("/") if u[len(base):] else []
            if len(rest) >= 2:
                live += 1
        mf = WT / "SME-RevisionNotes" / slug / "manifest.json"
        if not mf.exists():
            sweep.append({"lane": slug, "live_leaves": live,
                          "committed_pages_expected": None,
                          "growth": None, "note": "no committed manifest"})
            continue
        m = json.loads(mf.read_text("utf-8"))
        expected = m["counts"]["pages_expected"]
        sweep.append({"lane": slug, "live_leaves": live,
                      "committed_pages_expected": expected,
                      "growth": live - expected,
                      "vintage": m.get("generated_utc")})

    grown = [r for r in sweep if (r["growth"] or 0) > 0]
    shrunk = [r for r in sweep if (r["growth"] or 0) < 0]
    out = {
        "schema": "syllabai.t3r3-freshness-sweep/1.0",
        "basis": "live SME sitemap tree (exact leaf census; supersedes "
                 "run-002 bounded A2 index-link heuristic)",
        "fetched_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sitemaps_fetched": fetched,
        "cambridge_notes_urls": len(notes_urls),
        "lanes": len(sweep),
        "grown_lanes": [r["lane"] for r in grown],
        "grown_total_new_leaves": sum(r["growth"] for r in grown),
        "shrunk_lanes": [r["lane"] for r in shrunk],
        "rows": sorted(sweep, key=lambda r: -(r["growth"] or 0)),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "t3r3_sweep.json").write_text(json.dumps(out, indent=1) + "\n",
                                         encoding="utf-8")
    print(f"\nSWEEP: {len(sweep)} lanes | grown {len(grown)} "
          f"(+{out['grown_total_new_leaves']} leaves) | shrunk {len(shrunk)}")
    for r in sorted(sweep, key=lambda r: -(r["growth"] or 0))[:12]:
        print(f"  {r['lane']:62s} live={r['live_leaves']:4d} "
              f"committed={r['committed_pages_expected']} "
              f"growth={r['growth']}")
    print(f"elapsed {round(time.time() - t0, 1)} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
