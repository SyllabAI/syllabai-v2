#!/usr/bin/env python3
"""RN-DEBRIS-10 run-001 converter — the useof/dsin split-law lane.

Operator order (trace 1a19d7d18e382b69): "proceed with useof/d s i n
split-law lane" — the lane reserved of record by RN-DEBRIS-8's receipt
("useof's proper repair is a space split — a candidate for a future
split-law lane with a url-asset-aware guard").

LAW (zero-invention):
  dsin  -> d sin   at every census site (43: 39 dollar-span + 4 prose).
           The debris is ONLY the d|sin fusion (the coefficient d fused into
           the function name sin); whatever follows (θ, θ_{n}, θ_2 …) is
           preserved byte-verbatim. The sin|θ attachment is corpus style
           (sinθ x127 vs "sin θ" x96 — mixed), NOT debris, out of lane law.
           Boundary attestation of record (fixed-string, apps/hub/content):
           "d sin θ" x6, "d sin(" x12, "*d* sin" x16, "d s i n" x8 — and
           "d sinθ" x1; the same three debris files already write the spaced
           form (17-20 sites each). "dsin" has zero legitimate readings.
  useof -> use of  ONLY at the adjudicated clean-prose anchor
           (igcse-maths-b-16/questions.json, mark-scheme note "The
           rearrangement for k or useof gradient must be"). "use of" x216 in
           that file alone, x9,319 corpus-wide.

ADJUDICATED REFUSALS of record (fail-closed):
  useof @ ial-maths-20-pure-3 {curriculum.json, ugm-resources.json,
  spines/ial-maths-20-pure-3.json} (1 string x 3 files):
  'Kn sec² owledgeand⁄θ2=1+tan useof⁄θ2and cosec 2⁄θ=1+cot θ.' — the string
  is INTERLEAVED-RUNS structural corruption (English run "Knowledge and use
  of …" zipped with formula runs "sec²…⁄θ2=1+tan…", "cosec 2⁄θ=1+cot θ.");
  a token split cannot repair the interleave and would half-repair a
  structurally corrupted learner-facing title. Same family as RN-DEBRIS-9's
  disclosed residuals ("need a brace-aware repair lane, NOT run joins").

Guards re-asserted per site at splice time (fail-closed): url-asset class
(the of-record trap: any url-classified site refuses its string), lowercase,
not embedded in a longer word, MARK speech-marker window check (a splice may
not introduce a speech-marker phrase its window did not carry).

Mechanics (byte-verbatim, inherited from the of-record RN-DEBRIS-8
converter): whole-string unit of surgery; raw-byte anchoring tries BOTH JSON
escape forms (ensure_ascii False and True); per-raw-occurrence replacement;
every changed file must still json.loads() before write (a parse failure
discards that file's changes, fail-closed, ledgered).

Usage: rnd10_convert_split.py <CENSUS.json> <outReport.json> <outChanged.txt> [--apply]
"""
import json
import os
import re
import sys

REPO = Path = None
from pathlib import Path
REPO = Path("/home/z/my-project/work/sv2-rn9")
APPLY = "--apply" in sys.argv

OCC = {
    "dsin": re.compile(r"(?<![A-Za-z])dsin(?![A-Za-z])"),
    "useof": re.compile(r"(?<![A-Za-z])useof(?![A-Za-z])"),
}
REPL = {"dsin": "d sin", "useof": "use of"}
URL_RE = re.compile(
    r"(?://[^\s\"'<>]+)|(?:[\w\-]+\.(?:png|jpg|jpeg|svg|gif|webp|json|mp3|mp4)\b)", re.I)
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

# ADJUDICATED REFUSALS of record — key: (tok, exact string value)
REFUSE_LEDGER = {
    ("useof", "Kn sec² owledgeand⁄θ2=1+tan useof⁄θ2and cosec 2⁄θ=1+cot θ."):
        "interleaved-runs structural corruption (English run 'Knowledge and "
        "use of …' zipped with formula runs 'sec²…⁄θ2=1+tan…' / 'cosec "
        "2⁄θ=1+cot θ.'); a token split cannot repair the interleave and "
        "would half-repair a structurally corrupted title — same structural "
        "family as RN-DEBRIS-9's disclosed residuals (brace-aware repair "
        "lane, NOT token laws)",
}

census = json.load(open(sys.argv[1]))
items = census["items"]

# group: (file, tok, s) -> site list
anchors = {}
refusals = []
for it in items:
    key = (it["file"], it["tok"], it["s"])
    anchors.setdefault(key, []).append(it)

plan = {}
for (rel, tok, s), sites in sorted(anchors.items()):
    if (tok, s) in REFUSE_LEDGER:
        for site in sites:
            refusals.append({
                "file": rel, "tok": tok, "cls": site["cls"], "pos": site["pos"],
                "why": REFUSE_LEDGER[(tok, s)],
            })
        continue
    plan.setdefault(rel, []).append((tok, s, len(sites), sites))

total_conv = 0
total_sites = 0
guard_refusals = []
raw_misses = []
json_fails = []
file_changes = {}
class_breakdown = {"dollar": 0, "prose": 0, "url": 0}

for rel, triples in sorted(plan.items()):
    path = REPO / rel
    raw = path.read_text(encoding="utf-8")
    orig = raw
    seg_report = {}
    for tok, s, n_sites, sites in triples:
        # per-site guard re-assertion (fail-closed)
        bad = None
        for site in sites:
            cls = site["cls"]
            if cls == "url":
                bad = f"url-asset trap (fail-closed keep) pos={site['pos']}"
                break
            m = OCC[tok].search(s, site["pos"])
            if not m or m.group(0) != site["match"]:
                bad = f"site drift pos={site['pos']}"
                break
            if site["match"] != site["match"].lower():
                bad = f"non-lowercase pos={site['pos']}"
                break
        if bad:
            guard_refusals.append({"file": rel, "tok": tok, "why": bad})
            continue
        n_occ = len(OCC[tok].findall(s))
        if n_occ != n_sites:
            guard_refusals.append({
                "file": rel, "tok": tok,
                "why": f"occurrence count {n_occ} != census sites {n_sites}"})
            continue
        # splice on the decoded string
        fixed, n_spliced = OCC[tok].subn(REPL[tok], s)
        if n_spliced != n_sites or fixed == s:
            guard_refusals.append({"file": rel, "tok": tok, "why": "splice no-op"})
            continue
        # MARK window check: no introduced speech markers
        introduced = 0
        for m in OCC[tok].finditer(s):
            a, b = m.start(), m.end()
            ow = s[max(0, a - WIN):b + WIN]
            cw = s[max(0, a - WIN):a] + REPL[tok] + s[b:b + WIN]
            if MARK.search(cw) and not MARK.search(ow):
                introduced += 1
        if introduced:
            guard_refusals.append({
                "file": rel, "tok": tok,
                "why": f"MARK introduced in {introduced} window(s)"})
            continue
        # raw-byte anchoring, both escape forms
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
            raw_misses.append({"file": rel, "tok": tok, "head": s[:100]})
            continue
        # post-splice asserts on the decoded form
        assert OCC[tok].search(fixed) is None, "residual fused token post-splice"
        seg_report[json.dumps(s)[:140]] = {
            "tok": tok, "sites": n_sites, "rawReplacements": n,
            "head": s[:140], "fixedHead": fixed[:140],
        }
        total_conv += 1
        total_sites += n
        for site in sites:
            class_breakdown[site["cls"]] += 1
    if raw != orig:
        try:
            json.loads(raw)
        except Exception as e:
            json_fails.append({"file": rel, "err": str(e)[:200]})
            continue  # fail-closed: discard this file's in-memory changes
        file_changes[rel] = seg_report
        if APPLY:
            path.write_text(raw, encoding="utf-8")

print(f"strings converted: {total_conv} (occurrence sites: {total_sites})")
print(f"  class breakdown of fired sites: {class_breakdown}")
print(f"files changed: {len(file_changes)}")
print(f"ledger refusals: {len(refusals)}")
for g in refusals:
    print("   REFUSED:", g["file"][:60], "|", g["tok"], "@", g["pos"])
print(f"guard refusals: {len(guard_refusals)}")
for g in guard_refusals:
    print("   GUARD:", g["file"][:60], "|", g["tok"], "|", g["why"])
print(f"raw-count-zero keeps: {len(raw_misses)}")
print(f"JSON-parse fail-closed: {len(json_fails)}")

report = {
    "convertedStrings": total_conv,
    "occurrenceSites": total_sites,
    "classBreakdown": class_breakdown,
    "files": len(file_changes),
    "ledgerRefusals": refusals,
    "guardRefusals": guard_refusals,
    "rawMisses": raw_misses,
    "jsonParseFails": json_fails,
    "detail": file_changes,
}
json.dump(report, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
print("report ->", sys.argv[2])
if APPLY:
    with open(sys.argv[3], "w") as f:
        for rel in sorted(file_changes):
            f.write(rel + "\n")
    print("changed files ->", sys.argv[3])
