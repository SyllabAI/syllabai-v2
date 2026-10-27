#!/usr/bin/env python3
"""run-014 F5 fleet census: truncated furniture variants (header-prefix law, playbook law 10).
Scans solutionMd + markPoints[].textMd + problemMd of all 2443 parts for:
  - MS table header variants (Question/Qu + Working/Ans + Answer/Ans + Mark/Ma + Notes/Sub-Total)
  - 'Total N marks' footers (as whole line or trailing fused)
  - 'cas for each part' footers
  - 'PMT' page markers
  - spare-grid / do-not-write instructions leaked from figure pages
Every hit gets part id + field + line index for eyes-on triage.
"""
import json, re, sys

PLANE = "/home/z/my-project/repos/syllabai-v2/apps/hub/content/igcse-maths-b-16/official-papers.json"

HEADER_RE = re.compile(r"^\s*(?:Question|Qu)\s+Work\w*\s+Ans\w*(?:\s+\w+){0,6}\s*$", re.I)
TOTAL_RE = re.compile(r"(?:^|\n)\s*(cas\s+for\s+each\s+part\s+)?Total\s+\d+\s+marks?\s*(?:$|\n)")
TOTAL_LINE_RE = re.compile(r"^\s*(?:cas\s+)?Total\s+\d+\s+marks?\s*$")
PMT_RE = re.compile(r"^\s*PMT\s*$", re.M)
SPARE_RE = re.compile(r"spare grid|Do not write in this area|DO NOT WRITE", re.I)

def scan(text, field):
    hits = []
    if not text:
        return hits
    lines = text.split("\n")
    for i, ln in enumerate(lines):
        if re.match(r"^\s*(?:Question|Qu)\s+Work\w*\s+Ans\w*(?:\s+\w+){0,6}\s*$", ln, re.I) and len(ln) < 80:
            hits.append((field, i, "HEADER", ln))
        elif TOTAL_LINE_RE.match(ln):
            hits.append((field, i, "TOTAL", ln))
        elif re.match(r"^\s*cas\s+for\s+each\s+part\s*$", ln):
            hits.append((field, i, "CAS-EACH", ln))
        elif PMT_RE.match(ln):
            hits.append((field, i, "PMT", ln))
    # trailing fused Total-fragment: last line starts with 'Total N marks' then junk after newline handled above;
    # also fused same-line 'Total N marks' NOT alone (e.g. 'Total 5 marks\ndy' has own line — covered)
    if SPARE_RE.search(text):
        hits.append((field, -1, "SPARE-GRID-INSTR", SPARE_RE.search(text).group(0)))
    return hits

plane = json.load(open(PLANE))
census = []
nparts = 0
for paper in plane:
    for q in paper["questions"]:
        for part in q["parts"]:
            nparts += 1
            pid = part["id"]
            for field in ("solutionMd", "problemMd"):
                for h in scan(part.get(field, ""), field):
                    census.append({"pid": pid, **dict(zip(["field", "line", "kind", "text"], h))})
            for mi, mp in enumerate(part.get("markPoints", [])):
                for h in scan(mp.get("textMd", ""), f"markPoints[{mi}]"):
                    census.append({"pid": pid, **dict(zip(["field", "line", "kind", "text"], h))})

print(f"parts scanned: {nparts}")
print(f"hits: {len(census)}")
for c in census:
    print(f"  {c['pid']:<28} {c['field']:<14} L{c['line']:>3} {c['kind']:<16} {c['text'][:70]!r}")
json.dump(census, open("/home/z/my-project/download/t-oeq-mathsb/run014/f5_census.json", "w"), indent=1)
