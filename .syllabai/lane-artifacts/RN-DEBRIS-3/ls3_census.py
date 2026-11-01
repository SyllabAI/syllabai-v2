#!/usr/bin/env python3
"""RN-DEBRIS-3 run-001 — census reproduction + per-hit context capture.

Census law (of-record artifact rn_debris2_letterspace_census_r0.json):
regex (?:\\b[a-z] ){3,}[a-z]\\b over all parsed-corpus string values.
Parsed corpus = apps/hub/content/**/*.json string values.
Output: JSON with per-hit context for classification.
"""
import json
import os
import re
import sys

BASE = "/tmp/v2/apps/hub/content"
PAT = re.compile(r"(?:\b[a-z] ){3,}[a-z]\b")
MATHSEG = re.compile(r"\$[^$]+\$|`[^`]+`")

results = []
files_scanned = 0
for root, dirs, files in os.walk(BASE):
    for fn in sorted(files):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(root, fn)
        rel = os.path.relpath(path, BASE)
        files_scanned += 1
        try:
            data = json.load(open(path, encoding="utf-8"))
        except Exception as e:
            print(f"SKIP {rel}: {e}", file=sys.stderr)
            continue

        def walk(node, jpath):
            if isinstance(node, dict):
                for k, v in node.items():
                    yield from walk(v, f"{jpath}.{k}")
            elif isinstance(node, list):
                for i, v in enumerate(node):
                    yield from walk(v, f"{jpath}[{i}]")
            elif isinstance(node, str):
                yield jpath, node

        for jpath, s in walk(data, "$"):
            for m in PAT.finditer(s):
                start = max(0, m.start() - 130)
                end = min(len(s), m.end() + 130)
                ctx = s[start:end]
                # which segment does the hit sit in?
                seg = None
                for sm in MATHSEG.finditer(s):
                    if sm.start() <= m.start() and m.end() <= sm.end():
                        seg = "dollar" if s[sm.start()] == "$" else "backtick"
                        seg_full = sm.group(0)
                        break
                else:
                    seg = "prose"
                    seg_full = None
                results.append({
                    "file": rel, "path": jpath,
                    "hit": m.group(0),
                    "seg": seg,
                    "seg_full": seg_full,
                    "ctx": ctx,
                })

out = {"files": files_scanned, "hits": len(results), "items": results}
json.dump(out, open("/tmp/ls3_census.json", "w"), ensure_ascii=False, indent=1)
print(f"files scanned: {files_scanned}, hits: {len(results)}")
from collections import Counter
print("by file (top 25):")
for f, n in Counter(r["file"] for r in results).most_common(25):
    print(f"  {n:4d}  {f}")
print("by segment:", Counter(r["seg"] for r in results))
