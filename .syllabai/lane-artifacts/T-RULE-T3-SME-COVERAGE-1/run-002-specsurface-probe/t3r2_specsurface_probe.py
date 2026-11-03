#!/usr/bin/env python3
"""T-RULE-T3-SME-COVERAGE-1 run-002 — the bounded spec-surface probe
(operator decision menu option_4, receipt cie-tranche3-sme-coverage-census-r0).

QUESTION OF RECORD: does SME publish any spec-point DEFINITION surface
(spec pages / syllabus listings / revision-note pages) whose payload carries
specPoint ENTITY records that would define the class-B dangling ids —
before class-B (322 declared-but-dangling refs) is declared a dead-end?

BOUNDED DESIGN (fixed in advance; zero corpus writes either way):
  - 5 probed banks = the top class-B rows (303/322 = 94.1% of the class):
      cie-igcse-business-25 (198), cie-igcse-economics-25 (43),
      cie-igcse-maths-25-core (26), cie-igcse-economics-20 (20),
      cie-a-level-maths-20-probability-and-statistics-2 (16)
  - per bank: 1 revision-notes index fetch + up to 2 note-page fetches
    (pages chosen by highest spec_point_ids in the manifest of record;
    URL taken verbatim from the note file's own front-matter `url`)
  - +1 question-page control for cie-igcse-business-25 (the bank run-001
    did not live-probe; set URL verbatim from the bank manifest)
  - TOTAL = 15 public fetches, single-threaded, 1.5s courtesy delay,
    no credentials, no cookies, no crawling beyond the fixed list.

ADJUDICATION per fetch:
  - __NEXT_DATA__ walk: any dict/list shapes under specpoint-ish keys
  - raw counts: specPoints / spec_points / specPoint / spec-point
  - dangling-id test: every bank dangling id raw-searched in the fetched
    HTML (bare-ref presence vs entity-definition presence)
  - fetch failures are recorded AS FAILURES (never as evidence of absence)

Authorization: LICENSE-DATA.md SME attestation 2026-09-17 + Cambridge
extension 2026-10-17 (public pages, no credentials) — same envelope as the
run-001 source-fidelity probes.
"""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

RES = Path("/home/z/my-project/scripts/tmp/t3r2/resources")
DANGLING = json.loads(Path("/home/z/my-project/scripts/tmp/t3r2/classB_dangling_fresh_e33d4805.json").read_text())
OUT = Path("/home/z/my-project/scripts/tmp/t3r2/specsurface_probe_results.json")

UA = "SyllabAI-corpus-probe/1.0 (attested per resources LICENSE-DATA.md 2026-09-17 + 2026-10-17; public pages only; contact via repo)"
RAW_PATTERNS = ("specPoints", "spec_points", "specPoint", "spec-point")


def fetch(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status, r.read().decode("utf-8", errors="replace"), None
    except Exception as e:  # noqa: BLE001 — fail-closed recording
        return None, None, f"{type(e).__name__}: {e}"


def next_data(html: str):
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return "UNPARSEABLE"


def walk_specpoint(node, path, hits):
    if isinstance(node, dict):
        for k, v in node.items():
            kl = k.lower()
            if "specpoint" in kl or "spec_point" in kl:
                sample = json.dumps(v)[:300] if isinstance(v, (list, dict)) else repr(v)[:300]
                hits.append((path + "/" + k, sample))
            walk_specpoint(v, path + "/" + k, hits)
    elif isinstance(node, list):
        for i, v in enumerate(node[:500]):
            walk_specpoint(v, f"{path}[{i}]", hits)


def analyze(html: str, dangling_ids):
    nd = next_data(html)
    hits = []
    if isinstance(nd, dict):
        walk_specpoint(nd, "__NEXT_DATA__", hits)
    raw_counts = {p: len(re.findall(re.escape(p), html)) for p in RAW_PATTERNS}
    id_hits = {}
    for sid in dangling_ids:
        n = html.count(sid)
        if n:
            i = html.find(sid)
            id_hits[sid] = {"count": n, "context": html[max(0, i - 120): i + 160].replace("\n", " ")[:280]}
    return {
        "next_data_present": nd is not None,
        "next_data_parseable": isinstance(nd, dict),
        "specpoint_key_shapes": hits[:20],
        "specpoint_key_shape_count": len(hits),
        "raw_counts": raw_counts,
        "dangling_id_hits": id_hits,
        "dangling_ids_hit": len(id_hits),
    }


def pick_pages(lane, count):
    """Pages chosen by highest spec_point_ids in the manifest of record;
    URL taken verbatim from the note file front-matter."""
    nm = json.loads((RES / "SME-RevisionNotes" / lane / "manifest.json").read_text())
    pages = sorted(
        nm.get("pages") or [],
        key=lambda p: -(p.get("spec_point_ids") or 0) if isinstance(p.get("spec_point_ids"), int) else 0,
    )
    out = []
    for p in pages:
        if len(out) >= count:
            break
        f = RES / "SME-RevisionNotes" / lane / p["path"]
        if not f.exists():
            continue
        try:
            doc = json.loads(f.read_text())
        except json.JSONDecodeError:
            continue
        u = doc.get("url")
        if u:
            out.append({"url": u, "title": doc.get("title"), "note_id": doc.get("note_id"),
                        "manifest_spec_point_ids": p.get("spec_point_ids")})
    return out


def question_control_url(lane):
    m = json.loads((RES / "SME-ExamQuestion" / lane / "manifest.json").read_text())
    s = json.dumps(m)
    urls = sorted(set(re.findall(r'https://www\.savemyexams\.com/[^"\s]*?/exam-questions/', s)))
    return urls[0] if urls else None


def main():
    plan = [
        ("cie-igcse-business-25", 2),
        ("cie-igcse-economics-25", 1),
        ("cie-igcse-maths-25-core", 2),
        ("cie-igcse-economics-20", 2),
        ("cie-a-level-maths-20-probability-and-statistics-2", 2),
    ]
    results = []
    fetch_n = 0
    for lane, page_budget in plan:
        dang = next(r for r in DANGLING["rows"] if r["lane"] == lane)["dangling_ids"]
        nm = json.loads((RES / "SME-RevisionNotes" / lane / "manifest.json").read_text())
        entry = {
            "lane": lane,
            "dangling_count": len(dang),
            "notes_manifest_of_record": nm.get("counts"),
            "notes_base": nm.get("notes_base"),
            "probes": [],
        }
        # 1) notes index
        url = nm.get("notes_base")
        st, html, err = fetch(url)
        fetch_n += 1
        entry["probes"].append({"kind": "notes_index", "url": url, "http_status": st,
                                "fetch_error": err, **(analyze(html, dang) if html else {})})
        time.sleep(1.5)
        # 2) note pages
        for pg in pick_pages(lane, page_budget):
            st, html, err = fetch(pg["url"])
            fetch_n += 1
            entry["probes"].append({"kind": "note_page", **pg, "http_status": st,
                                    "fetch_error": err, **(analyze(html, dang) if html else {})})
            time.sleep(1.5)
        # 3) question-page control (business-25 only)
        if lane == "cie-igcse-business-25":
            q = question_control_url(lane)
            if q:
                st, html, err = fetch(q)
                fetch_n += 1
                entry["probes"].append({"kind": "question_page_control", "url": q, "http_status": st,
                                        "fetch_error": err, **(analyze(html, dang) if html else {})})
        results.append(entry)

    doc = {
        "run": "T-RULE-T3-SME-COVERAGE-1 run-002 bounded spec-surface probe",
        "menu_option": "option_4 (targeted source-surface probe) of cie-tranche3-sme-coverage-census-r0",
        "pin_resources": "e33d4805f97af6d18a71f87d8d994e143ab66126",
        "fetch_budget": 15,
        "fetches_made": fetch_n,
        "authorization": "LICENSE-DATA.md SME attestation 2026-09-17 + Cambridge extension 2026-10-17 (public pages, no credentials)",
        "banks": results,
    }
    OUT.write_text(json.dumps(doc, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"fetches made: {fetch_n}")
    for e in results:
        ent = sum(1 for p in e["probes"] if p.get("specpoint_key_shape_count", 0) > 0)
        hits = sum(p.get("dangling_ids_hit", 0) for p in e["probes"])
        errs = sum(1 for p in e["probes"] if p.get("fetch_error"))
        print(f"  {e['lane']:66s} dangl={e['dangling_count']:4d} probes={len(e['probes'])} ent_surfaces={ent} dangling_hits_sum={hits} fetch_errors={errs}")
    print(f"written: {OUT}")


if __name__ == "__main__":
    main()
