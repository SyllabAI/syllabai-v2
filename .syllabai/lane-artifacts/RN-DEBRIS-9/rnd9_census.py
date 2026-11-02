#!/usr/bin/env python3
"""RN-DEBRIS-9 run-001 — the letter-spaced floor close-out census.

Extends the of-record ls3 census law (RN-DEBRIS-3, .syllabai/lane-artifacts/
RN-DEBRIS-3/ls3_census.py) byte-verbatim on the D1 class and adds the two
disclosed invisible classes:

  D1  the of-record regex (?:\\b[a-z] ){3,}[a-z]\\b  (>=4 single lowercase
      letters, exactly one space) — reconciliation anchor: post-RN-DEBRIS-3
      floor of record = 246 hits / 91 distinct segments (dollar) + prose 69
      + backtick 51 (protected).
  D2  maximal case-aware letter-runs of length >=4 that are NOT all-lowercase
      (the 'A r e a' family — invisible to D1's [a-z]-only law).
  D3  maximal letter-runs of length exactly 3, case-aware (the 'C B I' /
      't h e' sub-4-letter floor disclosed by RN-DEBRIS-3).
  L<=2 runs: below both floors, ignored (disclosed, unchanged).

Attribution law byte-identical: MATHSEG = \\$[^$]+\\$|`[^`]+` per hit position;
hit inside a dollar span -> 'dollar', inside a backtick span -> 'backtick',
else 'prose'.  Walking law byte-identical: every string value of every JSON
under apps/hub/content.

Output: JSON census {counts, d1_items, run_items, per_file}.
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

BASE = sys.argv[1]          # .../apps/hub/content
OUT = sys.argv[2]           # output json path

PAT = re.compile(r"(?:\b[a-z] ){3,}[a-z]\b")      # of-record D1
RUN = re.compile(r"(?:\b[A-Za-z] )+[A-Za-z]\b")    # maximal-run candidate
MATHSEG = re.compile(r"\$[^$]+\$|`[^`]+`")         # of-record attribution

d1_items = []
run_items = []
files_scanned = 0
strings_scanned = 0
dollar_pairs = set()          # (file, seg_full) for D1 dollar hits
backtick_pairs = set()

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
            strings_scanned += 1
            if not (PAT.search(s) or RUN.search(s)):
                continue

            def attr(pos, end):
                for sm in MATHSEG.finditer(s):
                    if sm.start() <= pos and end <= sm.end():
                        return ("dollar" if s[sm.start()] == "$" else "backtick"), sm.group(0)
                return "prose", None

            # D1 — of-record law byte-verbatim
            for m in PAT.finditer(s):
                seg, seg_full = attr(m.start(), m.end())
                d1_items.append({
                    "file": rel, "path": jpath, "hit": m.group(0),
                    "seg": seg, "seg_full": seg_full,
                    "ctx": s[max(0, m.start() - 130):min(len(s), m.end() + 130)],
                })
                if seg == "dollar":
                    dollar_pairs.add((rel, seg_full))
                elif seg == "backtick":
                    backtick_pairs.add((rel, seg_full))

            # D2/D3 — maximal case-aware runs
            spans = []
            for m in RUN.finditer(s):
                if spans and m.start() <= spans[-1][1]:
                    raise AssertionError(f"overlapping run law broken in {rel}: {m.group(0)!r}")
                spans.append((m.start(), m.end()))
            for (a, b) in spans:
                run = s[a:b]
                letters = run.replace(" ", "")
                L = len(letters)
                if L <= 2:
                    continue
                all_lower = letters.islower()
                is_d1_whole = all_lower and L >= 4
                seg, seg_full = attr(a, b)
                # D1 sub-hits inside a mixed-case run (of-record law saw these)
                subhits = [mm.group(0) for mm in PAT.finditer(run)] if not is_d1_whole else []
                run_items.append({
                    "file": rel, "path": jpath, "run": run, "letters": letters,
                    "L": L, "allLower": all_lower,
                    "cls": ("D1" if is_d1_whole else ("D2" if L >= 4 else "D3")),
                    "seg": seg, "seg_full": seg_full,
                    "containsD1Subhit": bool(subhits),
                    "subhits": subhits,
                    "ctx": s[max(0, a - 130):min(len(s), b + 130)],
                })

by_seg_d1 = Counter(i["seg"] for i in d1_items)
by_cls = Counter((i["cls"], i["seg"]) for i in run_items)
dollar_d1_pairs = len(dollar_pairs)
out = {
    "files": files_scanned,
    "strings": strings_scanned,
    "d1_hits": len(d1_items),
    "d1_by_seg": dict(by_seg_d1),
    "d1_dollar_distinct_pairs": dollar_d1_pairs,
    "d1_dollar_distinct_segtexts": len({sg for _, sg in dollar_pairs}),
    "runs_total": len(run_items),
    "runs_by_cls_seg": {f"{c}/{s}": n for (c, s), n in sorted(by_cls.items())},
    "d1_items": d1_items,
    "run_items": run_items,
}
json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
print(f"files={files_scanned} strings={strings_scanned}")
print(f"D1 hits={len(d1_items)} by seg={dict(by_seg_d1)} "
      f"dollar_pairs={dollar_d1_pairs} dollar_segtexts={out['d1_dollar_distinct_segtexts']}")
print("runs by class/seg:", out["runs_by_cls_seg"])
