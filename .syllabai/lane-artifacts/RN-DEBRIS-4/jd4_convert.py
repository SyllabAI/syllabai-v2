#!/usr/bin/env python3
"""RN-DEBRIS-4 run-001 — the joined-debris lane (converter).

Zero-invention split law for DOLLAR-segment glued debris only. Consumes the
v4 census (/tmp/jd4_census.json, class 'split-evidenced'): every split there
already passed (0) corpus-word gate, (1) dictionary law-1, (2) case guards,
(3) bottleneck DP over dictionary tokens, (4) junk floor >=100, (5) suffix
ban, (6) sentinel-guarded corpus phrase evidence.

Casing law (mirrors ls3): a printed capital starting the run reproduces as a
capital on the first output word ('Notprime' -> 'Not prime',
'Changeintotal' -> 'Change in total'); otherwise all lowercase.

Per-RUN fail-closed (disclosed delta from ls3's per-segment all-or-nothing:
mixed segments are the norm in the joined class — each split stands on its
own dictionary + phrase evidence). Whole-segment guards still apply: MARK
post-filter (a fixed segment that NEWLY matches the corpus gate's
speech-grammar list is refused whole), raw-byte occurrence surgery, JSON
untouched outside the matched spans.

Text-level surgery on raw file bytes (no JSON round-trip). Dry-run default;
--apply writes files under /tmp/v2.
"""
import json
import os
import re
import sys

BASE = "/tmp/v2/apps/hub/content"
APPLY = "--apply" in sys.argv
CMD = re.compile(r"\\[A-Za-z]+")
RUN = re.compile(r"[A-Za-z]{5,}")
MARK = re.compile(
    "\\b(open parentheses|close parentheses|open bracket|close bracket|"
    "open curly|close curly|open square brackets|close square brackets|"
    "open angle brackets|close angle brackets|fraction numerator|"
    "over denominator|end fraction|end table|end cell|end row|end stack|"
    "end attributes|end style|end enclose|end exponent|to the power|"
    "square root|end root|cube root|with bar on top|subscript|superscript|"
    "presubscript|presuperscript|stack sum|sum from|sum for|begin mathsize|"
    "rightwards arrow|left parenthesis|right parenthesis|left bracket|"
    "right bracket|vertical line|vertical strike|horizontal strike|"
    "identical to|cross times|plus-or-minus|end strike|asterisk times|"
    "enclose|up diagonal strike|down diagonal strike|intersection|union|"
    "empty set|proportional to|almost equal to|less or equal than|"
    "greater or equal than|apostrophe)\\b", re.I)

census = json.load(open("/tmp/jd4_census.json"))
items = [i for i in census["items"] if i["class"] == "split-evidenced"]
print("split-evidenced items:", len(items))

# (file, seg) -> {run.lower(): [tokens]}
segmap = {}
for i in items:
    key = (i["file"], i["seg"])
    m = segmap.setdefault(key, {})
    m.setdefault(i["run"].lower(), i["split"])
print("distinct (file,segment):", len(segmap))


def splice(seg, splits):
    """rebuild seg replacing each maximal run that has a mapping; returns
    (fixed, log). Maximal-run rescan guarantees runs never overlap."""
    masked = list(seg)
    for cm in CMD.finditer(seg):
        for k in range(cm.start(), cm.end()):
            masked[k] = "\x00"
    masked = "".join(masked)
    out = []
    pos = 0
    log = []
    for m in RUN.finditer(masked):
        run = m.group(0)
        toks = splits.get(run.lower())
        if not toks:
            continue
        if run[0].isupper():
            repl = toks[0].capitalize() + " " + " ".join(toks[1:])
            kind = "titlecase-split"
        else:
            repl = " ".join(toks)
            kind = "phrase-evidenced-split"
        out.append(seg[pos:m.start()])
        out.append(repl)
        pos = m.end()
        log.append({"run": run, "to": repl, "kind": kind})
    out.append(seg[pos:])
    return "".join(out), log


def to_raw(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')


by_file = {}
for (rel, seg), splits in segmap.items():
    by_file.setdefault(rel, []).append((seg, splits))
for rel in by_file:
    by_file[rel].sort()

total_conv = 0
total_sites = 0
mark_refusals = []
raw_misses = []
file_changes = {}
for rel, segs in sorted(by_file.items()):
    path = os.path.join(BASE, rel)
    raw = open(path, encoding="utf-8").read()
    orig = raw
    seg_report = {}
    for seg, splits in segs:
        fixed, log = splice(seg, splits)
        if fixed == seg or not log:
            continue
        if MARK.search(fixed) and not MARK.search(seg):
            mark_refusals.append({"file": rel, "fixed": fixed[:140]})
            continue
        seg_raw = to_raw(seg)
        fixed_raw = to_raw(fixed)
        n = raw.count(seg_raw)
        if n == 0:
            raw_misses.append({"file": rel, "seg": seg[:100]})
            continue
        raw = raw.replace(seg_raw, fixed_raw)
        seg_report[seg] = {"fixed": fixed, "occurrences": n, "runs": log}
        total_conv += 1
        total_sites += n
    if raw != orig:
        file_changes[rel] = seg_report
        if APPLY:
            open(path, "w", encoding="utf-8").write(raw)

print(f"segments converted: {total_conv} (occurrence sites: {total_sites})")
print(f"files changed: {len(file_changes)}")
print(f"MARK refusals: {len(mark_refusals)}")
for g in mark_refusals[:6]:
    print("   REFUSED:", g["file"][:40], "|", g["fixed"][:90])
print(f"raw-count-zero keeps: {len(raw_misses)}")
for g in raw_misses[:6]:
    print("   MISS:", g["file"][:40], "|", g["seg"][:80])

report = {
    "convertedSegments": total_conv,
    "occurrenceSites": total_sites,
    "files": len(file_changes),
    "markRefusals": mark_refusals,
    "rawMisses": raw_misses,
    "detail": file_changes,
}
out = "/tmp/jd4_apply_report.json"
json.dump(report, open(out, "w"), ensure_ascii=False, indent=1)
print("report ->", out)
if APPLY:
    with open("/tmp/jd4_changed_files.txt", "w") as f:
        for rel in sorted(file_changes):
            f.write("apps/hub/content/" + rel + "\n")
    print("changed files -> /tmp/jd4_changed_files.txt")
