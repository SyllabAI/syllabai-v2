#!/usr/bin/env python3
"""MB4-MS-FRESHPARSE run-002 — fetch sources of record (rebuild after wipe #2).

Downloads ms.pdf + parsed/{ms.md,questions.json,qp.md} for all 66 4MB1 papers
from SyllabAI/syllabai-pastpapers (raw, PAT via env GH_PAT — never on disk).
Emits url->dest pairs for parallel xargs fetch; resume-aware.
"""
import json, os, subprocess

TREE = "/home/z/my-project/scripts/pp_tree.json"
OUT = "/home/z/my-project/pp-4mb1"
REPO = "SyllabAI/syllabai-pastpapers"
BR = "main"
PREFIX = "pearson-edexcel/international-gcse/mathematics-b/4mb1/past-papers"

d = json.load(open(TREE))
entries = [t for t in d["tree"] if t["type"] == "blob" and t["path"].startswith(PREFIX)]
print(f"blobs under 4mb1: {len(entries)}")

import re
papers = set()
for t in entries:
    m = re.match(rf"{PREFIX}/(\d{{4}}-\d{{2}})/(4MB1-\d{{2}}R?)/", t["path"])
    if m:
        papers.add((m.group(1), m.group(2)))
print(f"paper dirs: {len(papers)}")

WANT_SUFFIX = ("/ms.pdf", "/parsed/ms.md", "/parsed/questions.json", "/parsed/qp.md")
want = [t for t in entries if any(t["path"].endswith(s) for s in WANT_SUFFIX)]
print(f"files to fetch: {len(want)}")

os.makedirs(OUT, exist_ok=True)
pairs = []
for t in want:
    rel = t["path"][len(PREFIX) + 1:]
    dest = os.path.join(OUT, rel)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        continue
    url = f"https://raw.githubusercontent.com/{REPO}/{BR}/past-papers/{t['path']}"
    pairs.append(f"{url}\t{dest}")

with open("/home/z/my-project/scripts/pp_pairs.tsv", "w") as f:
    f.write("\n".join(pairs))
print(f"to fetch: {len(pairs)} (skipped {len(want)-len(pairs)} existing)")
