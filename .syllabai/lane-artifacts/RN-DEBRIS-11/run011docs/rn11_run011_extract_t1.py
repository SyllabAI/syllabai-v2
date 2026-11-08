#!/usr/bin/env python3
"""RN-DEBRIS-11 run-011 — the F4 0264 T1 official-point extraction of record.

Sources of record (the run-009 evidence chain, byte-verified this run):
  PDF  work/run009/0264-2027-2029-syllabus.pdf  (sha256/sha1 re-verified against
       the run-009 pins in .syllabai/lane-artifacts/.../run009docs/pdf_sha*.txt)
  TXT  pdftotext -layout regeneration, byte-compared to the run-009 cached text

Laws (inherited, cited):
  - run-009 rn11_run009_extract_cie.py topic/subsection/point regexes + norm laws
    (CTRL strip [\x00-\x1f]; trailing 'continued' strip) — cross-checked
    byte-exact against the run-009 official_evidence artifact F4_0264.
  - run-010 G4 wrap-continuation law: wrapped lines join with a single space.
  - corpus flatten law (the hub's import join shape, visible in every existing
    0264 point node): "<statement>: • <bullet> • <bullet>".
  - zero-invention: every emitted byte traces to the pinned PDF; topic 1 is
    absent from the upstream parse (run-009 disclosure), so the PDF is the
    only source of record.

Output: work/run011/run011_official_evidence.json
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

RUN = Path("/home/z/my-project/work/run009")
OUT = Path("/home/z/my-project/work/run011")
HUB = Path("/home/z/my-project/work/syllabai-v2/apps/hub/content")
REPO = Path("/home/z/my-project/work/syllabai-v2")
PDF = RUN / "0264-2027-2029-syllabus.pdf"
TXT = RUN / "0264.txt"

CONT_RE = re.compile(r"\s*\(*continued\)*\s*$", re.I)
CTRL_RE = re.compile(r"[\x00-\x1f]")
FURNITURE = ("www.cambridgeinternational.org", "Back to contents page",
             "Cambridge IGCSE Business 0264 syllabus")

# run-009 regex laws (verbatim shapes)
topic_re = re.compile(r"^ {6,}([1-6]) {2,}([A-Z]\w.*?) *$")
sub_re = re.compile(r"^ {6,}([1-6])\.([1-9]) {2,}(\S.*?) *$")
pt_re = re.compile(r"^ {6,}([1-6])\.([1-9])\.([0-9]+)[ \t]+(\S.*?) *$")


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 16), b""):
            h.update(b)
    return h.hexdigest()


def sha1(p):
    h = hashlib.sha1()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 16), b""):
            h.update(b)
    return h.hexdigest()


def norm_title(s):
    return CTRL_RE.sub("", CONT_RE.sub("", s)).strip()


def norm_text(s):
    return CTRL_RE.sub("", s).strip()


def fail(msg):
    print(f"FAIL: {msg}", flush=True)
    sys.exit(2)


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    # ── pin verification ────────────────────────────────────────────────
    pins = {}
    for name, line in (("sha256", "pdf_sha256.txt"), ("sha1", "pdf_sha1.txt")):
        for ln in (RUN / line).read_text().splitlines():
            if "0264" in ln:
                digest, path = ln.split(None, 1)
                pins[name] = digest
    got256, got1 = sha256(PDF), sha1(PDF)
    if got256 != pins["sha256"] or got1 != pins["sha1"]:
        fail(f"PDF pin mismatch: {got256} {got1} vs {pins}")
    print(f"PIN OK sha256={got256[:16]} sha1={got1}")

    # ── text regeneration + byte continuity ─────────────────────────────
    fresh = subprocess.run(["pdftotext", "-layout", str(PDF), "-"],
                           capture_output=True, check=True).stdout
    cached = TXT.read_bytes()
    if fresh != cached:
        fail("pdftotext regeneration differs from the run-009 cached text "
             f"(fresh {len(fresh)}B vs cached {len(cached)}B) — poppler drift, abort")
    print(f"TXT OK byte-identical regeneration ({len(cached)} B)")

    lines = cached.decode("utf-8").splitlines()

    # ── the run-009 region law: '3 Subject content' → '4 Details of...' ──
    start = end = None
    for i, ln in enumerate(lines):
        s = ln.strip()
        if start is None and re.match(r"^3 Subject content$", s):
            start = i
        elif start is not None and re.match(r"^4 Details of the assessment$", s):
            end = i
            break
    if not start or not end:
        fail(f"subject-content region not found ({start},{end})")

    topics, subsections, points = {}, {}, {}   # run-009 census shapes
    cur_point = None
    cur_sub = None
    t1_lines = []

    for ln in lines[start:end]:
        raw = ln.rstrip("\n")
        s = raw.rstrip()
        if not s.strip():
            continue
        if any(f in s for f in FURNITURE):
            continue
        if CONT_RE.fullmatch(s.strip()) or norm_title(s) == "":
            continue
        m = topic_re.match(s)
        if m and m.group(1) not in topics and not re.match(r"^\d+\.\d", m.group(2)):
            n = int(m.group(1))
            topics[n] = norm_title(m.group(2))
            if n == 1:
                t1_lines.append(("TOPIC", i_ := s.strip(), None))
            cur_point = None
            cur_sub = None
            continue
        m = sub_re.match(s)
        if m:
            key = (int(m.group(1)), int(m.group(2)))
            subsections[key] = norm_title(m.group(3))
            cur_point = None
            cur_sub = key
            if key[0] == 1:
                t1_lines.append(("SUB", key, norm_title(m.group(3))))
            continue
        m = pt_re.match(s)
        if m:
            t, sb, p = int(m.group(1)), int(m.group(2)), int(m.group(3))
            code = f"{t}.{sb}.{p}"
            stmt = norm_text(m.group(4))
            points[t] = points.get(t) or {}
            points[t][code] = {"statement": stmt, "bullets": [],
                               "sub": f"{t}.{sb}", "line": None}
            cur_point = (t, code)
            if t == 1:
                t1_lines.append(("POINT", code, stmt))
            continue
        # bullet row (• = U+2022, deep indent)
        bm = re.match(r"^ {10,}•\s*(\S.*?)\s*$", s)
        if bm and cur_point:
            points[cur_point[0]][cur_point[1]]["bullets"].append(norm_text(bm.group(1)))
            continue
        # wrap continuation: deep-indented plain text inside an open point
        indent = len(s) - len(s.lstrip())
        if cur_point and indent >= 20:
            b = points[cur_point[0]][cur_point[1]]["bullets"]
            frag = norm_text(s)
            if frag:
                if b:
                    b[-1] = b[-1] + " " + frag     # run-010 wrap-join law
                else:
                    points[cur_point[0]][cur_point[1]]["statement"] += " " + frag
            continue
        # anything else at T1 scope is the topic intro paragraph — recorded, not repaired

    # ── cross-checks (fail-closed) ──────────────────────────────────────
    # 1. run-009 evidence of record (F4_0264) — byte-exact
    r9 = json.loads(subprocess.run(
        ["git", "-C", str(REPO), "show",
         "lane/rn-debris-11-run-009-rowlabel-evidence:.syllabai/lane-artifacts/"
         "RN-DEBRIS-11/run009_official_evidence.json"],
        capture_output=True, check=True).stdout)
    f4 = r9["F4_0264"]["extraction"]
    for n, t in f4["topics"].items():
        if topics[int(n)] != t:
            fail(f"topic {n} drift: {topics[int(n)]!r} vs run-009 {t!r}")
    for k, t in f4["subsections"].items():
        tn, sn = (int(x) for x in k.split("."))
        if subsections[(tn, sn)] != t:
            fail(f"subsection {k} drift: {subsections[(tn, sn)]!r} vs run-009 {t!r}")
    r9_t1 = f4["pointNumbersByTopic"]["1"]
    got_t1 = sorted(points[1].keys())
    if got_t1 != r9_t1:
        fail(f"point numbers drift: {got_t1} vs run-009 {r9_t1}")
    print(f"RUN-009 CROSS-CHECK OK: 6 topics, {len(f4['subsections'])} subs, "
          f"T1 points {len(got_t1)} byte-exact vs the evidence pass")

    # 2. curriculum truth — T1 title + 5 sub titles byte-exact (titles
    #    official-correct per the run-009 verdict, re-proven here)
    cur = json.loads((HUB / "cie-igcse-business-25" / "curriculum.json")
                     .read_text(encoding="utf-8"))
    by_code = {n["code"]: n for n in cur["nodes"]}
    t1 = by_code["cie-igcse-business-2027-2029-T1"]
    if t1["title"] != topics[1]:
        fail(f"T1 title drift: {t1['title']!r} vs PDF {topics[1]!r}")
    for n in range(1, 6):
        node = by_code[f"cie-igcse-business-2027-2029-T1:SUB1.{n}"]
        if node["title"] != subsections[(1, n)]:
            fail(f"SUB1.{n} title drift: {node['title']!r} vs PDF")
    print("CURRICULUM CROSS-CHECK OK: T1 + SUB1.1-1.5 titles byte-exact vs the PDF")

    # ── flatten law: "<statement>: • <b1> • <b2>" (the corpus's own shape) ─
    t1_points = []
    for code in got_t1:
        rec = points[1][code]
        if not rec["bullets"]:
            fail(f"{code}: no bullets extracted — flatten law needs the bullet list")
        flat = rec["statement"] + ": " + "• " + " • ".join(rec["bullets"])
        t1_points.append({
            "code": code,
            "subtopic": rec["sub"],
            "statement": rec["statement"],
            "bullets": rec["bullets"],
            "officialTitle": flat,
        })
        print(f"  {code} [{rec['sub']}] {rec['statement']} ({len(rec['bullets'])} bullets)")

    evidence = {
        "source": {
            "pdf": "work/run009/0264-2027-2029-syllabus.pdf",
            "sha256": got256,
            "sha1": got1,
            "pinCheck": "PASS (run-009 pins of record)",
            "textRegen": "pdftotext -layout byte-identical to the run-009 cached text",
            "region": f"'3 Subject content' line {start} -> '4 Details of the assessment' line {end}",
        },
        "topic1": {"number": 1, "title": topics[1]},
        "subsections1": {f"1.{n}": subsections[(1, n)] for n in range(1, 6)},
        "points": t1_points,
        "crossChecks": {
            "run009Evidence": "PASS (topics/subsections/pointNumbers byte-exact)",
            "curriculumTitles": "PASS (T1 + 5 SUB titles byte-exact)",
        },
        "flattenLaw": "statement + ': ' + bullets joined ' • ' — the corpus's own import-join shape (cf. 2.1.1/6.5.1 nodes)",
    }
    outp = OUT / "run011_official_evidence.json"
    outp.write_text(json.dumps(evidence, indent=1, ensure_ascii=False) + "\n",
                    encoding="utf-8")
    print(f"WROTE {outp} ({len(t1_points)} points of record)")


if __name__ == "__main__":
    main()
