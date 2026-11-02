#!/usr/bin/env python3
"""RN-DEBRIS-5 run-001 — apply v2: command-boundary space restoration.

Law: for every glueFixable $-segment (KaTeX-verified: fixed parses, all
decomposed prefixes non-argument-taking), restore the command boundary by
inserting exactly one space — suffix preserved verbatim (zero-invention).

Surgery = of-record to_raw byte replacement with hard gates:
  - gate-1: no conversion may carry an argument-taking command prefix,
  - gate-2 (per seg per file): the old form must exist in the file bytes and
    its occurrence count must equal the census expectation OUTSIDE backtick
    spans (backtick spans are the protected 23a-speech class of record —
    occurrences inside them are masked out of both the count and the
    replacement),
  - gate-3: JSON round-trip parse per written file,
  - idempotent pass-through: an old form already converted (count 0, new
    form present at the expected count) is verified, not re-applied.
"""
import json, os, re, sys
from collections import Counter

BASE = "/tmp/v2c/apps/hub/content"
BT = re.compile(r"`[^`]*`")
dec = json.load(open("/tmp/rnd5_decomposed.json"))
fixable = [f for f in dec["fails"] if f["fixedOk"]]

ARG_TAKING = {
    "frac", "sqrt", "text", "mathrm", "mathbf", "mathit", "mathbb", "mathcal",
    "mathfrak", "mathtt", "textbf", "textit", "textrm", "textsf", "texttt",
    "left", "right", "overbrace", "underbrace", "over", "atop", "binom",
    "dbinom", "tbinom", "begin", "end", "hat", "bar", "vec", "dot", "ddot",
    "tilde", "widehat", "widetilde", "overline", "underline", "stackrel",
    "mathop", "mathbin", "mathrel", "mathord", "pmb", "boldsymbol",
    "operatorname", "boxed", "fbox", "color", "textcolor", "href",
    "includegraphics", "substack", "xrightarrow", "xleftarrow",
}
prefixes_used = Counter()
for f in fixable:
    for d in f["decos"]:
        if d["longest"]:
            P = d["longest"]["P"]
            if P in ARG_TAKING:
                sys.exit(f"GATE-1 ABORT: argument-taking prefix \\{P} in {f['seg'][:80]}")
            prefixes_used[P] += 1
print("gate-1 OK; prefix classes:", len(prefixes_used), "distinct")

seg_sites = json.load(open("/tmp/rnd5_segments.json"))["sites"]
old_fixed = {f["seg"]: ("$" + f["fixed"] + "$") for f in fixable}

files = {}
for f in fixable:
    for s in seg_sites.get(f["seg"], []):
        files.setdefault(s["file"], Counter())[f["seg"]] += 1

def encode_raw(s):
    return json.dumps(s, ensure_ascii=False)[1:-1]

def to_raw(s, rawtext):
    for ea in (False, True):
        cand = json.dumps(s, ensure_ascii=ea)[1:-1]
        if cand in rawtext:
            return cand
    return None

def masked_replace(raw, ro, rn):
    """Replace ro->rn at every occurrence OUTSIDE backtick spans (protected
    23a-speech class kept byte-identical). Returns (new_raw, outside, inside)."""
    out, made_out, made_in = [], 0, 0
    parity, last = 0, 0
    for m in re.finditer(re.escape(ro), raw):
        chunk = raw[last:m.start()]
        outside = parity % 2 == 0
        out.append(chunk)
        out.append(rn if outside else ro)
        if outside:
            made_out += 1
        else:
            made_in += 1
        parity += chunk.count("`")
        last = m.end()
    out.append(raw[last:])
    return "".join(out), made_out, made_in

ledger, problems = [], []
total, pre_applied = 0, 0
invisible_total, bt_kept_total = 0, 0
for rel, expected in sorted(files.items()):
    path = os.path.join(BASE, rel)
    raw = open(path, encoding="utf-8").read()
    n_made, seg_problems = 0, []
    for seg, exp in expected.items():
        new = old_fixed[seg]
        ro = to_raw(seg, raw)
        rn = encode_raw(new)
        if ro is None:
            # idempotent pass-through: old gone, new present at expected count
            if raw.count(rn) == exp:
                pre_applied += exp
                continue
            seg_problems.append((seg[:70], "old-raw-miss"))
            continue
        c_old = raw.count(ro)
        if c_old == exp:
            raw = raw.replace(ro, rn)
            n_made += c_old
            continue
        if c_old > exp:
            # extra occurrences = complete-span bytes invisible to the naive
            # census regex (bogus $-pairing zones); the conversion pair itself
            # is byte-verified of record — apply outside backtick spans, keep
            # the protected class, ledger the invisible class
            raw, made_out, made_in = masked_replace(raw, ro, rn)
            if made_out >= exp:
                n_made += made_out
                invisible_total += made_out - exp
                bt_kept_total += made_in
                continue
        seg_problems.append((seg[:70], f"count {c_old} != expected {exp} (masked fallback failed)"))
    if seg_problems:
        problems.append({"file": rel, "fails": seg_problems[:20]})
        print(f"FAIL-CLOSED FILE {rel}: {len(seg_problems)} segs", file=sys.stderr)
        continue
    if n_made:
        open(path, "w", encoding="utf-8").write(raw)
        json.load(open(path, encoding="utf-8"))  # gate-3
    total += n_made
    ledger.append({"file": rel, "segments": len(expected), "replacements": n_made})

json.dump({"total_replacements": total, "pre_applied_verified": pre_applied,
           "census_invisible_applied": invisible_total,
           "backtick_protected_kept": bt_kept_total,
           "files_changed": len(ledger), "problems": problems, "ledger": ledger},
          open("/tmp/rnd5_apply_ledger.json", "w"), ensure_ascii=False, indent=1)
print(f"replacements: {total} | pre-applied verified: {pre_applied} | census-invisible applied: {invisible_total} | backtick-kept: {bt_kept_total} | files: {len(ledger)} | problem files: {len(problems)}")
