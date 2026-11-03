#!/usr/bin/env python3
"""RN-DEBRIS-9 run-001 — letter-spaced floor close-out: converter.

Surgery law (ls3_convert.py of record, byte-law preserved):
  - raw-byte text surgery, no JSON round-trip; escaped-span replace with a
    count>=1 gate; per-file json.loads gate BEFORE any write (fail-closed);
  - DOLLAR: whole-segment fail-closed — a segment converts iff EVERY maximal
    letter-run inside it carries a final FIRE verdict; MARK speech-grammar
    post-filter (a fixed segment must not NEWLY match MARK);
  - PROSE: span-exact replacement of FIRE maximal runs inside the containing
    string (maximal-run spans — never a substring of a longer run);
    MARK post-filter at string level (disclosed extension of the same law).
EYES-ON REFUSE LEDGER (this adjudication, reasons of record):
  - kind acronym-perpage: ALL refused — all-caps letter notation (geometry
    vertex runs, biological sequences, codon-table cells, card-letter
    enumerations, chemical groups); per-page attestation is not
    occurrence-twin evidence for notation (RN-DEBRIS-2 'h h t t' precedent,
    RN-DEBRIS-8 'walkin' lesson).
  - variable-run / lost-subscript formula classes (to-values listed below).
  - the corrupt-brace spacecraf segment (structural corruption — a run join
    would launder broken subscripts into plausible text).
Dry-run default; --apply writes files.
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

BASE = sys.argv[1]
CENSUS = sys.argv[2]
LEDGER = sys.argv[3]
OUT = sys.argv[4]
APPLY = "--apply" in sys.argv

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
RUN = re.compile(r"(?:\b[A-Za-z] )+[A-Za-z]\b")
MATHSEG = re.compile(r"\$[^$]+\$|`[^`]+`")

DOLLAR_REFUSE_TO = {
    "Are": "truncation-by-subscript (Area_ with the final a inside the subscript)",
    "Ate": "exponent-base fragment (A T e^{...})",
    "abe": "variable product a*b*e^{bx}",
    "andy": "conjunction + variable (and Y; len-1 token banned)",
    "nave": "physics formula I = n A v e",
    "ory": "'or' + variable y",
    "Oxy": "coordinate frame labels O x y",
    "space craft": "corrupt-brace segment (m_{s}pacecraft) — structural class",
    "pace craft": "corrupt-brace segment — structural class",
    "Momentum after": "corrupt-brace segment — structural class",
}
PROSE_REFUSE_TO = {
    "Aby": "vertex label + height variable",
    "Alo": "chemical formula Al2O3 with lost subscripts",
    "Rox": "region/origin/variable labels R O x",
    "abb": "age-sequence variables a b b",
    "bab": "age-sequence variables b a b",
    "hox": "vector/point labels h O X",
    "mab": "length + side label m A B",
    "mad": "length + side label m A D",
    "nab": "set notation n(A B)",
    "wab": "equilibrium constants K_w = K_a K_b with lost subscripts",
}
# render-status precondition (fail-closed): segments whose OLD form already
# fails katex throwOnError belong to the structural-corruption class — a run
# join must not launder them into plausible-looking text (computed by
# katex_precheck.ts over the dry-run candidates).
import json as _json
PREFAIL_SEGS = set(_json.load(open("/tmp/rnd9/katex_preexisting_fails.json")))

census = json.load(open(CENSUS))
ledger = json.load(open(LEDGER))

# verdict index: (file, jpath, run) -> [verdicts in occurrence order]
vindex = defaultdict(list)
for r in ledger:
    vindex[(r["file"], r["path"], r["run"])].append(r)


def final_verdict(rec):
    """eyes-on refusal layer over the mechanical verdict"""
    if rec["v"] != "FIRE":
        return rec
    if rec["kind"] == "acronym-perpage":
        return dict(rec, v="REFUSE-EYES", why="allcaps-notation-class")
    to = rec.get("to")
    if rec["seg"] == "dollar" and to in DOLLAR_REFUSE_TO:
        return dict(rec, v="REFUSE-EYES", why=DOLLAR_REFUSE_TO[to])
    if rec["seg"] == "prose" and to in PROSE_REFUSE_TO:
        return dict(rec, v="REFUSE-EYES", why=PROSE_REFUSE_TO[to])
    return rec


def to_raw(s):
    """parsed string -> raw file bytes.  ls3 law (backslash+quote) extended
    with the JSON control-char escapes (\n \r \t) — this lane's fire set
    includes multi-line gathered segments the ls3 fire set never had."""
    return (s.replace("\\", "\\\\").replace('"', '\\"')
             .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t"))


def maximal_spans(s):
    spans = []
    for m in RUN.finditer(s):
        if spans and m.start() <= spans[-1][1]:
            raise AssertionError("run law broken")
        spans.append((m.start(), m.end()))
    return spans


# ---- pass 1: re-walk the tree, pin every maximal-run occurrence to its verdict
file_data = {}      # rel -> raw text
prose_fix = {}      # rel -> {string_text: fixed_string}
dollar_fix = {}     # rel -> {seg_full: fixed_seg}
converted_log = []
prose_occ = dollar_occ = 0
refusals = []
kept_segments = []

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
        file_data[rel] = open(path, encoding="utf-8").read()

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
            spans = maximal_spans(s)
            if not spans:
                continue
            # dollar segments
            segmap = {}
            for sm in MATHSEG.finditer(s):
                if sm.group(0)[0] != "$":
                    continue
                seg = sm.group(0)
                # segment adjudication floor = the lane's census class floor
                # (maximal runs of >=3 letters); L<=2 runs are the sub-floor
                # class of record (invisible, disclosed) and do NOT block a
                # segment — the ls3 partial-join precedent (V_{out} joined
                # while V_{i} n stayed) is the of-record behavior.
                inner_spans = [(a - sm.start(), b - sm.start())
                               for (a, b) in spans
                               if a >= sm.start() and b <= sm.end()
                               and len(seg[a - sm.start():b - sm.start()].replace(" ", "")) >= 3]
                if not inner_spans:
                    continue
                segmap[seg] = inner_spans
            for seg, inner in segmap.items():
                if seg in PREFAIL_SEGS:
                    for (a, b) in inner:
                        run = seg[a:b]
                        key = (rel, jpath, run)
                        if vindex.get(key):
                            rec = vindex[key].pop(0)
                            if rec["v"] == "FIRE":
                                refusals.append(dict(rec, v="REFUSE-RENDER",
                                                     why="pre-existing-katex-failure",
                                                     scope="segment"))
                    kept_segments.append({"file": rel, "seg": seg[:160],
                                          "why": "pre-existing-katex-failure"})
                    continue
                verdicts, fires = [], []
                ok = True
                for (a, b) in inner:
                    run = seg[a:b]
                    key = (rel, jpath, run)
                    if not vindex.get(key):
                        ok = False
                        break
                    rec = final_verdict(vindex[key].pop(0))
                    verdicts.append(rec)
                    if rec["v"] == "FIRE":
                        fires.append((a, b, rec["to"]))
                    else:
                        ok = False
                if not ok or not fires:
                    for rec in verdicts:
                        if rec["v"] != "FIRE":
                            refusals.append(dict(rec, scope="segment"))
                    if verdicts:
                        kept_segments.append({"file": rel, "seg": seg[:160]})
                    continue
                fixed, pos, out = seg, 0, []
                for (a, b, to) in sorted(fires):
                    out.append(seg[pos:a]); out.append(to); pos = b
                out.append(seg[pos:])
                fixed = "".join(out)
                if MARK.search(fixed) and not MARK.search(seg):
                    for rec in verdicts:
                        refusals.append(dict(rec, v="REFUSE-MARK", scope="segment"))
                    kept_segments.append({"file": rel, "seg": seg[:160], "why": "MARK"})
                    continue
                dollar_fix.setdefault(rel, {})
                if seg not in dollar_fix[rel]:
                    dollar_fix[rel][seg] = fixed
                    dollar_occ += len(inner)
                    converted_log.append({"file": rel, "kind": "dollar-segment",
                                          "before": seg[:400], "after": fixed[:400]})
            # prose runs (outside dollar AND backtick spans)
            covered = [(sm.start(), sm.end()) for sm in MATHSEG.finditer(s)]
            def in_span(p):
                return any(a <= p < b for (a, b) in covered)
            str_fires = []
            for (a, b) in spans:
                if in_span(a):
                    continue
                run = s[a:b]
                key = (rel, jpath, run)
                if not vindex.get(key):
                    continue
                rec = final_verdict(vindex[key].pop(0))
                if rec["v"] == "FIRE":
                    str_fires.append((a, b, rec["to"]))
                else:
                    refusals.append(dict(rec, scope="string"))
            if str_fires:
                out, pos = [], 0
                for (a, b, to) in sorted(str_fires):
                    out.append(s[pos:a]); out.append(to); pos = b
                out.append(s[pos:])
                fixed = "".join(out)
                if MARK.search(fixed) and not MARK.search(s):
                    refusals.append(dict(v="REFUSE-MARK", scope="string",
                                         file=rel, path=jpath))
                    continue
                prose_fix.setdefault(rel, {})
                if s not in prose_fix[rel]:
                    prose_fix[rel][s] = fixed
                    prose_occ += len(str_fires)
                    converted_log.append({"file": rel, "kind": "prose-string",
                                          "before": s[:400], "after": fixed[:400]})

# ---- pass 2: surgery + gates
report_files = {}
changed = []
for rel in sorted(set(dollar_fix) | set(prose_fix)):
    raw = file_data[rel]
    orig = raw
    nseg = nstr = 0
    for seg, fixed in dollar_fix.get(rel, {}).items():
        seg_raw, fixed_raw = to_raw(seg), to_raw(fixed)
        n = raw.count(seg_raw)
        if n == 0:
            refusals.append({"v": "KEEP", "why": "raw-count-zero", "file": rel,
                             "seg": seg[:120]})
            continue
        raw = raw.replace(seg_raw, fixed_raw)
        nseg += n
    for s, fixed in prose_fix.get(rel, {}).items():
        s_raw, fixed_raw = to_raw(s), to_raw(fixed)
        n = raw.count(s_raw)
        if n == 0:
            refusals.append({"v": "KEEP", "why": "raw-count-zero-prose", "file": rel})
            continue
        raw = raw.replace(s_raw, fixed_raw)
        nstr += n
    if raw == orig:
        continue
    # fail-closed JSON gate
    try:
        json.loads(raw)
    except Exception as e:
        print(f"JSON GATE FAIL {rel}: {e} — file left untouched", file=sys.stderr)
        continue
    if APPLY:
        open(os.path.join(BASE, rel), "w", encoding="utf-8").write(raw)
    changed.append(rel)
    report_files[rel] = {"dollarSegments": nseg, "proseStrings": nstr}

vs = Counter((r.get("v"), r.get("kind") or r.get("why")) for r in refusals)
print("converted dollar segments:", sum(v["dollarSegments"] for v in report_files.values()),
      "| prose strings fixed:", sum(v["proseStrings"] for v in report_files.values()))
print("files changed:", len(report_files))
print("occurrences: dollar", dollar_occ, "prose", prose_occ)
print("kept segments (fail-closed):", len(kept_segments))
print("refusals:", json.dumps({f"{k[0]}/{k[1]}": n for k, n in sorted(vs.items())}, indent=1))
json.dump({"files": report_files, "changed": changed,
           "refusals": refusals, "keptSegments": kept_segments[:400],
           "convertedSegments": converted_log,
           "dollarOccurrences": dollar_occ, "proseOccurrences": prose_occ,
           "applied": APPLY},
          open(OUT, "w"), ensure_ascii=False, indent=1)
print("report ->", OUT)
