#!/usr/bin/env python3
"""extract_cie_titles.py — evidence pass for the run-013 CIE batch.
For each wreck row: locate the official-code line in the pdftotext -layout dump,
capture the title column (split at 3+ spaces), join wrapped continuations.
Prints candidates + conflict flags for manual review. Zero content writes."""
import json, re, sys

TXT = "/home/z/my-project/work/run013/txt"
DOC = {
    "cie-a-level-biology-25": "9700", "cie-as-biology-25": "9700",
    "cie-a-level-chemistry-25": "9701", "cie-as-chemistry-25": "9701",
    "cie-igcse-further-maths-additional-maths-25": "0606",
    "cie-igcse-religious-studies-23": "0490",
}

def norm(s):
    s = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", " ", s)   # control dirt (keep \t via \x09? we replace tab too)
    s = s.replace("\t", " ")
    s = re.sub(r"\s+", " ", s)
    return s.strip()

def code_from_hub(code):
    # 'cie-a-level-biology-2025-2027-T1:SUB1.2' -> '1.2'; 'TC1:SUBC1.3' -> 'C1.3'
    m = re.search(r":SUB_?([A-Za-z]?\d+(?:\.\d+)?)$", code)
    if not m:
        raise ValueError(f"cannot derive official code from {code}")
    return m.group(1)

def left_column(line):
    """split a layout line at first run of 3+ spaces; return left part (raw)"""
    m = re.split(r"\s{3,}", line.rstrip(), maxsplit=1)
    return m[0]

STOP_PAT = re.compile(
    r"^\s*([A-Z]?\d+\.\d+|[A-Z]\d+\.\d+|\(\d+\)|\([a-z]\)|•|Learning outcomes|"
    r"Candidates should|Notes|Back to contents|www\.|Cambridge IGCSE|Cambridge International)"
    r"|^\s*$")

RIGHT_COL_MIN = {"9700": 40, "9701": 40, "0606": 60, "0490": 999}

def extract_for_code(lines, code, tag):
    """return list of (lineno, title) candidates for the official code"""
    cpat = re.compile(r"^" + re.escape(code) + r"(?=[\s\x07])")
    rcut = RIGHT_COL_MIN[tag]
    cands = []
    i = 0
    while i < len(lines):
        raw = lines[i]
        body = raw.strip()
        m = cpat.match(body)
        if m:
            match_indent = len(raw) - len(raw.lstrip())
            first = re.split(r"\s{3,}", body[m.end():].strip(), maxsplit=1)[0]
            parts = [norm(first)] if norm(first) else []
            j = i + 1
            while j < len(lines):
                l = lines[j]
                if STOP_PAT.match(l):
                    break
                lstrip_ = len(l) - len(l.lstrip())
                if not l.strip():
                    break
                if lstrip_ >= rcut:      # right-column-only line
                    break
                if lstrip_ <= match_indent:  # next block (bullet/section/footer)
                    break
                lleft = re.split(r"\s{3,}", l.strip(), maxsplit=1)[0]
                lnorm = norm(lleft)
                if not lnorm:
                    break
                parts.append(lnorm)
                j += 1
            title = " ".join(parts)
            if title.endswith(" (continued)") or title.endswith(" continued"):
                title = re.sub(r"\s*\(?continued\)?$", "", title)
            cands.append((i + 1, title))
            i = max(j, i + 1)
        else:
            i += 1
    return cands

worklist = json.load(open("/home/z/my-project/work/run013/worklist_cie.json"))
results = {}
_lines_cache = {}
def doc_lines(tag):
    if tag not in _lines_cache:
        raw = open(f"{TXT}/{tag}.txt").read()
        raw = raw.replace("\x0c", "\n").replace("\x0b", "\n").replace("\x07", " ")
        _lines_cache[tag] = raw.split("\n")
    return _lines_cache[tag]

for entry in worklist:
    slug = entry["slug"]
    tag = DOC[slug]
    lines = doc_lines(tag)
    for row in entry["rows"]:
        code = code_from_hub(row["code"])
        cands = extract_for_code(lines, code, tag)
        titles = sorted({t for _, t in cands})
        status = "OK" if len(titles) == 1 and titles[0] else f"CONFLICT({len(cands)}@{[c[0] for c in cands]})"
        results.setdefault(slug, []).append({
            "code": row["code"], "officialCode": code, "wreck": row["wreckTitle"],
            "candidates": cands, "distinct": titles, "status": status,
        })

out = "/home/z/my-project/work/run013/cie_extract_candidates.json"
json.dump(results, open(out, "w"), ensure_ascii=False, indent=1)
print(f"-> {out}\n")
for slug, rows in results.items():
    print(f"== {slug} ==")
    for r in rows:
        print(f"  [{r['officialCode']:>7}] {r['status']}")
        print(f"      wreck: {r['wreck'][:80]!r}")
        for ln, t in r["candidates"]:
            print(f"      L{ln}: {t!r}")
