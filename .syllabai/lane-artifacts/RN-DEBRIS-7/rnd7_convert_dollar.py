"""RN-DEBRIS-7 dollar-prose converter — prose-marker $-segments scope.

Faithful mirror of the of-record jd4/rnd6 converter law (RN-DEBRIS-4/6):
consumes the census (class 'split-evidenced', ctxClass filter); every split already
passed gates 0-6 (corpus-word gate, dictionary, case guards, bottleneck DP,
junk floor >=100, suffix ban, sentinel-guarded phrase evidence). Casing
law: printed capital at run start reproduces as capital on the first output
word. Per-RUN fail-closed; whole-segment MARK post-filter; raw-byte
occurrence surgery; JSON untouched outside matched spans.
Delta vs rn6: census path/args parameterized; items filtered on
ctxClass=="dollar-prose" (segments the rn6 census skipped wholesale);
ctxClass=="dollar-plain" split-evidenced items are a RED FLAG (rn6 closed that class;
must be 0) and are reported, never fired.
"""
import json
import os
import re
import sys

BASE = sys.argv[1]
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

census = json.load(open(sys.argv[2]))
SCOPE = sys.argv[3]
items = [i for i in census["items"]
         if i["class"] == "split-evidenced" and i.get("ctxClass") == SCOPE]
print(f"split-evidenced items (ctxClass={SCOPE}):", len(items))
_red = [i for i in census["items"]
        if i["class"] == "split-evidenced" and i.get("ctxClass") == "dollar-plain"]
print("RED FLAG dollar-plain split-evidenced (must be 0):", len(_red))

segmap = {}
for i in items:
    key = (i["file"], i["seg"])
    m = segmap.setdefault(key, {})
    m.setdefault(i["run"].lower(), i["split"])
print("distinct (file,segment):", len(segmap))


def splice(seg, splits):
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
json_fails = []
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
        n = 0
        hit = False
        for ea in (False, True):
            seg_raw = json.dumps(seg, ensure_ascii=ea)[1:-1]
            fixed_raw = json.dumps(fixed, ensure_ascii=ea)[1:-1]
            if seg_raw == fixed_raw:
                continue
            c = raw.count(seg_raw)
            if c:
                raw = raw.replace(seg_raw, fixed_raw)
                n += c
                hit = True
        if not hit:
            raw_misses.append({"file": rel, "seg": seg[:100]})
            continue
        seg_report[seg] = {"fixed": fixed, "occurrences": n, "runs": log}
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

print(f"segments converted: {total_conv} (occurrence sites: {total_sites})")
print(f"files changed: {len(file_changes)}")
print(f"MARK refusals: {len(mark_refusals)}")
for g in mark_refusals[:6]:
    print("   REFUSED:", g["file"][:40], "|", g["fixed"][:90])
print(f"raw-count-zero keeps: {len(raw_misses)}")
print(f"JSON-parse fail-closed: {len(json_fails)}")
for g in raw_misses[:6]:
    print("   MISS:", g["file"][:40], "|", g["seg"][:80])

report = {
    "convertedSegments": total_conv,
    "occurrenceSites": total_sites,
    "files": len(file_changes),
    "markRefusals": mark_refusals,
    "rawMisses": raw_misses,
    "jsonParseFails": json_fails,
    "detail": file_changes,
}
out = sys.argv[4]
json.dump(report, open(out, "w"), ensure_ascii=False, indent=1)
print("report ->", out)
if APPLY:
    with open(sys.argv[5], "w") as f:
        for rel in sorted(file_changes):
            f.write("apps/hub/content/" + rel + "\n")
    print("changed files -> /tmp/rnd6_changed_files.txt")
