#!/usr/bin/env python3
"""T-RULE-T3-SME-COVERAGE-1 run-003 — notes re-harvest driver for the 5
grown CIE lanes (operator dispatch "tranche-3 re-harvest",
trace 1a169db74ca578c9).

Runs the of-record scraper (scripts/sme_notes_scrape.py) from the lane
worktree with BASE-patched constants (exactly-one-replacement asserted, the
T-SPEC-STAGE2-MATHSB-1 precedent), classifies drift against the committed
bytes, and patches the TOP-LEVEL registry additively (the of-record
write_registry() rendering fed the MERGED 94-course dict — the sparse
checkout does not materialize untouched courses, so the naive registry
rebuild would silently drop rows; this patcher prevents that).

Corpus law: corpus mirrors its vintage — changed pages update + disclose
(drift table), identical pages byte-kept, new pages append; removals are
fail-closed alerts (expected zero).
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

WT = Path("/home/z/my-project/lane-t3r3/resources")
CACHE = Path("/home/z/my-project/.cache")
OUT = Path("/home/z/my-project/scripts/recon")
LANES = ["cie-a-level-computer-science-19", "cie-igcse-business-25",
         "cie-igcse-economics-20", "cie-igcse-economics-25",
         "cie-igcse-english-literature-21"]
WORKERS = 4

sys.path.insert(0, str(WT / "scripts"))


def git(*args: str, binary: bool = False):
    r = subprocess.run(["git", "-C", str(WT), *args],
                       capture_output=True, check=True)
    return r.stdout if binary else r.stdout.decode("utf-8", "replace")


def committed_tree() -> dict[str, str]:
    out = git("ls-tree", "-r", "HEAD",
              *(f"SME-RevisionNotes/{l}" for l in LANES))
    files = {}
    for line in out.splitlines():
        meta, _, path = line.partition("\t")
        parts = meta.split()
        if len(parts) >= 3 and parts[1] == "blob":
            files[path] = parts[2]
    return files


def blob_bytes(sha: str) -> bytes:
    return git("cat-file", "blob", sha, binary=True)


def main() -> int:
    t0 = time.time()
    import sme_notes_scrape as ns  # noqa: E402

    # ---- BASE-patch with exactly-one-replacement assertions
    assert str(ns.BASE) == "/home/z/my-project/download/syllabai-resources", \
        f"unexpected BASE: {ns.BASE}"
    ns.BASE = WT
    ns.OUT = WT / "SME-RevisionNotes"
    ns.CACHE = CACHE / "sme_notes"
    ns.DISCOVER = CACHE / "sme_notes_urls.json"

    pre_tree = committed_tree()

    # ---- harvest (resumable via cache; one retry on failures)
    for lane in LANES:
        for attempt in (1, 2):
            ns.scrape_course(lane, WORKERS, force=False)
            mf = json.loads((ns.OUT / lane / "manifest.json")
                            .read_text("utf-8"))
            fails = mf["counts"]["fetch_failures"]
            print(f"[{lane}] attempt {attempt}: scraped "
                  f"{mf['counts']['pages_scraped']}/{mf['counts']['pages_expected']}"
                  f" fetch_failures={fails}", flush=True)
            if fails == 0:
                break

    # ---- drift classification vs committed bytes
    report = {"schema": "syllabai.t3r3-reharvest/1.0",
              "lanes": {}, "generated_utc":
                  time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    for lane in LANES:
        cdir = ns.OUT / lane
        new_files = {}
        for p in sorted(cdir.rglob("*")):
            if p.is_file() and "manifest.json" not in p.parts[-1:]:
                rel = str(p.relative_to(WT))
                new_files[rel] = hashlib.sha256(p.read_bytes()).hexdigest()
        added, changed, identical, removed = [], [], [], []
        for rel, sha in sorted(new_files.items()):
            old_sha = pre_tree.get(rel)
            if old_sha is None:
                added.append(rel)
            elif blob_bytes(old_sha) != (WT / rel).read_bytes():
                changed.append(rel)
            else:
                identical.append(rel)
        for rel, sha in sorted(pre_tree.items()):
            if rel not in new_files and not rel.endswith("manifest.json"):
                removed.append(rel)
        m = json.loads((cdir / "manifest.json").read_text("utf-8"))
        report["lanes"][lane] = {
            "pages_expected": m["counts"]["pages_expected"],
            "pages_scraped": m["counts"]["pages_scraped"],
            "fetch_failures": m["counts"]["fetch_failures"],
            "assets": m["counts"]["assets"],
            "asset_failures": m["counts"]["asset_failures"],
            "spec_point_links": m["counts"]["spec_point_links"],
            "markdown_chars": m["counts"]["markdown_chars"],
            "vintage": m["generated_utc"],
            "files_added": len(added),
            "files_changed": len(changed),
            "files_identical": len(identical),
            "files_removed": removed,
            "added_paths": added,
            "changed_paths": changed,
        }
        print(f"[{lane}] added={len(added)} changed={len(changed)} "
              f"identical={len(identical)} removed={len(removed)}", flush=True)
        if removed:
            print(f"[{lane}] FAIL-CLOSED: removals detected: {removed[:5]}")

    # ---- top-level registry patch (merged 94-course dict, of-record render)
    top_path = ns.OUT / "manifest.json"
    top = json.loads(top_path.read_text("utf-8"))
    courses = {}
    for c in top.get("courses", {}).values():
        courses[c["course_slug"]] = c
    for lane in LANES:
        m = json.loads((ns.OUT / lane / "manifest.json").read_text("utf-8"))
        courses[m["course_slug"]] = {"course_slug": m["course_slug"],
                                     "notes_base": m["notes_base"],
                                     "counts": dict(m["counts"])}
    keys = ("pages_expected", "pages_scraped", "fetch_failures", "assets",
            "asset_failures", "spec_point_links", "guided_study_pages",
            "markdown_chars")
    tot = {k: sum(c["counts"].get(k, 0) for c in courses.values())
           for k in keys}
    doc = {"schema": "syllabai.sme-revision-notes/1.0",
           "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ",
                                          time.gmtime()),
           "totals": tot, "scraped_courses": len(courses),
           "courses": dict(sorted(courses.items()))}
    top_path.write_text(json.dumps(doc, ensure_ascii=False, indent=1),
                        encoding="utf-8")

    lines = ["# SME Revision Notes (Edexcel IGCSE + IAL; Cambridge IGCSE + A Level/AS)",
             "",
             f"Scraped from Save My Exams revision-notes trees "
             f"({len(courses)} courses incl. the Cambridge/CAIE lanes, "
             f"T-SME-CAMBRIDGE 2026-10-17); mirrors `../SME-ExamQuestion/` "
             f"course-for-course. "
             f"{tot['pages_scraped']}/{tot['pages_expected']} leaf pages, "
             f"{tot['assets']} assets, {tot['spec_point_links']} spec-point "
             f"links.",
             "",
             "Per note: `<leaf>.json` (authoritative typed blocks; Wiris "
             "MathML kept verbatim) + `<leaf>.md` (render). Callout variants "
             "map to typed blocks (`exam-tip` -> Exam Hint, `worked-example` "
             "-> Worked Example, `case-study` -> Case Study).",
             "",
             "- Author/reviewer bylines are metadata-only (ids+names in "
             "course `manifest.json`; no avatars or biographies anywhere in "
             "content).",
             "- \"Guided study\" is a client-side SME widget, not note "
             "content; recorded as `guided_study.lesson_ids`.",
             "- Chemistry additionally carries official 4CH1 "
             "`spec_point_codes` (AI_VALIDATED, operator-delegated) and the "
             "operator-validated legacy `spec_map` joined by URL — see "
             "`scripts/sme_notes_chem_join.py`.",
             "- License: operator-authorized; see `../LICENSE-DATA.md`.",
             "",
             "| course | pages | assets | spec links |",
             "|---|---|---|---|"]
    for c in sorted(courses):
        s = courses[c]["counts"]
        lines.append(f"| {c} | {s['pages_scraped']}/{s['pages_expected']} | "
                     f"{s['assets']} | {s['spec_point_links']} |")
    (ns.OUT / "README.md").write_text("\n".join(lines) + "\n",
                                      encoding="utf-8")
    report["registry_totals"] = tot
    report["registry_courses"] = len(courses)
    (OUT / "t3r3_reharvest_report.json").write_text(
        json.dumps(report, indent=1) + "\n", encoding="utf-8")
    print(f"\nregistry: {len(courses)} courses, totals {tot}")
    print(f"elapsed {round(time.time() - t0, 1)} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
