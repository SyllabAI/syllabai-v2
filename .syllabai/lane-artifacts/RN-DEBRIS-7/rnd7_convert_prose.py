#!/usr/bin/env python3
"""RN-DEBRIS-7 run-001 prose converter — outside-span scope (NEW machinery).

Consumes the rn7 census; fires ONLY items with class 'split-evidenced' AND
guard 'pass' (the additive prose-guard stack carried them). Every split
already passed gates 0-6 (corpus-word gate, dictionary, case guards,
bottleneck DP, junk floor >=100, suffix ban, sentinel-guarded phrase
evidence, blocklist) plus the rn7 prose guards (url-asset, paren-
continuation, marker-stem/follow, invisible-char, fragment-twin,
non-lowercase, weak-evidence, hyphen-twin, inflected-word, inside-quote,
named-keep).

Delta vs the of-record rn6 converter law, disclosed:
  - Unit of surgery is the WHOLE STRING (prose bodies), not the $-segment:
    raw-byte anchoring tries BOTH JSON escape forms (ensure_ascii False and
    True); raw-count-zero is a fail-closed keep (ledger).
  - MARK post-filter is per-RUN on a +-40-char window (the whole-string
    refusal of the segment law is undefined for note bodies): a run is
    refused when its replacement window introduces a speech-marker phrase
    the original window did not carry.
  - $-segments and backtick spans are MASKED (offset-preserving) during
    splice: outside-span surgery cannot touch math or 23a-speech spans by
    construction.
  - Every changed file must still json.loads() before the write; a parse
    failure discards that file's changes (fail-closed, ledgered).

Usage: rnd7_convert_prose.py <BASE> <CENSUS.json> <outReport.json> <outChanged.txt> [--apply]
"""
import json
import os
import re
import sys

BASE = sys.argv[1]
APPLY = "--apply" in sys.argv
CMD = re.compile(r"\\[A-Za-z]+")
RUN = re.compile(r"[A-Za-z]{5,}")
MATHSEG = re.compile(r"\$[^$]+\$|`[^`]+`")
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
WIN = 40

census = json.load(open(sys.argv[2]))
SCOPE = sys.argv[3]
items = [i for i in census["items"]
         if i["class"] == "split-evidenced"
         and i.get("ctxClass") == SCOPE
         and i.get("guard") == "pass"]
print(f"prose firing items (guard=pass, ctxClass={SCOPE}):", len(items))
_red = [i for i in census["items"]
        if i["class"] == "split-evidenced" and i.get("ctxClass") == "dollar-plain"]
print("RED FLAG dollar-plain split-evidenced (must be 0):", len(_red))

# plan: (file, string) -> {run.lower(): [tokens]}
plan = {}
for i in items:
    key = (i["file"], i["s"])
    plan.setdefault(key, {}).setdefault(i["run"].lower(), i["split"])
print("distinct (file,string) anchors:", len(plan))

by_file = {}
for (rel, s), splits in plan.items():
    by_file.setdefault(rel, []).append((s, splits))
for rel in by_file:
    by_file[rel].sort(key=lambda t: t[0])


def splice_string(s, splits):
    """Offset-preserving splice of fired runs in one string. Returns
    (fixed, log, refusals)."""
    mask = list(s)
    for pm in MATHSEG.finditer(s):
        for k in range(pm.start(), pm.end()):
            mask[k] = "\x00"
    masked = "".join(mask)
    mask2 = list(masked)
    for cm in CMD.finditer(masked):
        for k in range(cm.start(), cm.end()):
            if mask2[k] != "\x00":
                mask2[k] = "\x00"
    masked = "".join(mask2)
    out = []
    pos = 0
    log = []
    refusals = []
    for m in RUN.finditer(masked):
        run = m.group(0)
        toks = splits.get(run.lower())
        if not toks:
            continue
        a, b = m.start(), m.end()
        if run[0].isupper():
            repl = toks[0].capitalize() + " " + " ".join(toks[1:])
            kind = "titlecase-split"
        else:
            repl = " ".join(toks)
            kind = "phrase-evidenced-split"
        orig_win = s[max(0, a - WIN):b + WIN]
        cand_win = s[max(0, a - WIN):a] + repl + s[b:b + WIN]
        if MARK.search(cand_win) and not MARK.search(orig_win):
            refusals.append({"run": run, "to": repl, "pos": a})
            continue
        out.append(s[pos:a])
        out.append(repl)
        pos = b
        log.append({"run": run, "to": repl, "kind": kind, "pos": a})
    fixed = "".join(out) + s[pos:]
    return fixed, log, refusals


def raw_forms(s):
    """The two possible JSON-escape encodings of the string body."""
    forms = []
    for ea in (False, True):
        enc = json.dumps(s, ensure_ascii=ea)[1:-1]
        if enc not in forms:
            forms.append(enc)
    return forms


total_conv = 0
total_sites = 0
mark_refusals = []
raw_misses = []
json_fails = []
file_changes = {}
for rel, pairs in sorted(by_file.items()):
    path = os.path.join(BASE, rel)
    raw = open(path, encoding="utf-8").read()
    orig = raw
    seg_report = {}
    for s, splits in pairs:
        fixed, log, refusals = splice_string(s, splits)
        if not log:
            continue
        for r in refusals:
            mark_refusals.append({"file": rel, **r})
        n = 0
        hit = False
        for ea in (False, True):
            enc_s = json.dumps(s, ensure_ascii=ea)[1:-1]
            enc_f = json.dumps(fixed, ensure_ascii=ea)[1:-1]
            if enc_s == enc_f:
                continue
            cnt = raw.count(enc_s)
            if cnt:
                raw = raw.replace(enc_s, enc_f)
                n += cnt
                hit = True
        if not hit:
            raw_misses.append({"file": rel, "head": s[:100]})
            continue
        seg_report[s[:140]] = {"fixed": fixed[:140], "occurrences": n,
                               "runs": log}
        total_conv += 1
        total_sites += n
    if raw != orig:
        try:
            json.loads(raw)
        except Exception as e:
            json_fails.append({"file": rel, "err": str(e)[:200]})
            continue  # fail-closed: discard this file's in-memory changes
        file_changes[rel] = seg_report
        if APPLY:
            open(path, "w", encoding="utf-8").write(raw)

print(f"strings converted: {total_conv} (occurrence sites: {total_sites})")
print(f"files changed: {len(file_changes)}")
print(f"MARK refusals: {len(mark_refusals)}")
for g in mark_refusals[:6]:
    print("   REFUSED:", g["file"][:40], "|", g["run"], "->", g["to"])
print(f"raw-count-zero keeps: {len(raw_misses)}")
for g in raw_misses[:6]:
    print("   MISS:", g["file"][:40], "|", g["head"][:80])
print(f"JSON-parse fail-closed: {len(json_fails)}")
for g in json_fails[:6]:
    print("   PARSE:", g["file"][:60], "|", g["err"][:90])

report = {
    "convertedStrings": total_conv,
    "occurrenceSites": total_sites,
    "files": len(file_changes),
    "markRefusals": mark_refusals,
    "rawMisses": raw_misses,
    "jsonParseFails": json_fails,
    "detail": file_changes,
}
json.dump(report, open(sys.argv[4], "w"), ensure_ascii=False, indent=1)
print("report ->", sys.argv[4])
if APPLY:
    with open(sys.argv[5], "w") as f:
        for rel in sorted(file_changes):
            f.write("apps/hub/content/" + rel + "\n")
    print("changed files ->", sys.argv[5])
