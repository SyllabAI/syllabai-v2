#!/usr/bin/env python3
"""RN-DEBRIS-5 run-001 — command-boundary lane census (stage 1: segment extraction).

Walks apps/hub/content/**/*.json and extracts all $...$ segments from JSON
string values with the of-record jd4/ls3 collection laws exactly:
  - naive SEG regex \\$[^$]+\\$ over every JSON string value,
  - backtick spans protected-skipped (23a-speech class),
  - PROSE_SPAN filter (markdown ** / en-dash => currency-dollar false pair).
Emits the unique-segment set with occurrence sites for the KaTeX stage.
Also counts command-glue regex hits OUTSIDE $-spans (disclosure only).
"""
import json, os, re, sys

BASE = "/tmp/v2c/apps/hub/content"
MATHSEG = re.compile(r"\$[^$]+\$|`[^`]+`")
DOLLAR = re.compile(r"\$[^$]+\$")
PROSE_SPAN = re.compile(r"\*\*|\u2013")
GLUE_WATCH = re.compile(r"\\(times|Delta|rightarrow|Rightarrow|to|infty|approx|leq|geq|pm|cdot)[A-Za-z]")

sites = {}
stats = {"files": 0, "strings": 0, "dollar_segments": 0,
         "prose_span_skipped": 0, "backtick_skipped": 0,
         "outside_span_glue_hits": 0, "outside_span_files": 0}

for root, dirs, files in os.walk(BASE):
    for fn in sorted(files):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(root, fn)
        rel = os.path.relpath(path, BASE)
        try:
            data = json.load(open(path, encoding="utf-8"))
        except Exception as e:
            print(f"SKIP {rel}: {e}", file=sys.stderr)
            continue
        stats["files"] += 1

        def walk(node, jpath):
            if isinstance(node, dict):
                for k, v in node.items():
                    yield from walk(v, f"{jpath}.{k}")
            elif isinstance(node, list):
                for i, v in enumerate(node):
                    yield from walk(v, f"{jpath}[{i}]")
            elif isinstance(node, str):
                yield jpath, node

        file_outside = 0
        for jpath, s in walk(data, "$"):
            stats["strings"] += 1
            for sm in MATHSEG.finditer(s):
                if s[sm.start()] != "$":
                    stats["backtick_skipped"] += 1
                    continue
                seg = sm.group(0)
                if PROSE_SPAN.search(seg):
                    stats["prose_span_skipped"] += 1
                    continue
                stats["dollar_segments"] += 1
                sites.setdefault(seg, []).append({
                    "file": rel, "jpath": jpath,
                    "ctx": s[max(0, sm.start() - 60):sm.end() + 60],
                })
            # disclosure-only: glue-shaped regex OUTSIDE the $-spans of this string
            outside = DOLLAR.sub(" ", s)
            outside = re.sub(r"`[^`]+`", " ", outside)
            hits = GLUE_WATCH.findall(outside)
            if hits:
                stats["outside_span_glue_hits"] += len(hits)
                file_outside += len(hits)
        if file_outside:
            stats["outside_span_files"] += 1

out = {"stats": stats, "uniqueSegments": len(sites), "sites": sites}
json.dump(out, open("/tmp/rnd5_segments.json", "w"), ensure_ascii=False)
print(json.dumps(stats))
print("unique segments:", len(sites))
