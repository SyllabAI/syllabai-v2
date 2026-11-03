#!/usr/bin/env python3
"""RN-DEBRIS-4 run-001 — the joined-debris lane (census v3, final law).

Mirror of the of-record letter-spaced law, inverted: glued runs [A-Za-z]{5,}
inside $...$ segments of apps/hub/content/**/*.json. A split FIRES only when
EVERY gate holds:
  0. CORPUS-WORD GATE: the glued run occurs <3x as a standalone token in
     clean context (prose + backtick; dollar interiors are masked before the
     stream is built — debris lives in math, so math cannot attest itself).
     >=3 occurrences -> it is a word of the corpus -> keep.
  1. run.lower() NOT in dictionary (a real word is not debris),
  2. not in the function-name blocklist, not ALL-CAPS, not mixed-case,
  3. bottleneck DP over dictionary tokens (len>=2) covers the run with
     >=2 tokens (fewest tokens -> max min-token-prose-freq -> longest),
  4. junk floor: min token prose-freq >= 100 (of-record floor),
  5. no split token is a bare suffix (ed/er/es/est/ing/ly),
  6. PHRASE EVIDENCE: the exact spaced token sequence occurs >=1x in the
     clean-context stream, which carries SENTINEL tokens at every sentence
     punctuation and string boundary — cross-sentence adjacency
     ('allow. Ed') can never attest a phrase (the RN-DEBRIS-2 'clean
     occurrences' mechanism, zero-invention).
Fail-closed everywhere else. Protected classes (untouched, disclosed):
backtick 23a-speech segments, prose hits.
"""
import gc
import json
import os
import re
import sys
from array import array
from collections import Counter, defaultdict

BASE = "/tmp/v2/apps/hub/content"
MATHSEG = re.compile(r"\$[^$]+\$|`[^`]+`")
DOLLAR = re.compile(r"\$[^$]+\$")
CMD = re.compile(r"\\[A-Za-z]+")
RUN = re.compile(r"[A-Za-z]{5,}")
STREAMTOK = re.compile(r"[A-Za-z]{2,}|[.;:,!?]")
SENTINEL = sys.intern("\x01")
SUFFIX = {"ed", "er", "es", "est", "ing", "ly"}
BLOCKLIST = {
    "arcsin", "arccos", "arctan", "arcsinh", "arccosh", "arctanh",
    "arcsine", "arccosine", "arctangent",
    "payout",  # adjudicated dict-miss real noun (\text{expected} \text{payout})
}
# a $...$ span is PROSE (protected) when it carries markdown bold or en-dash
# typography — currency-dollar false pairs ('$5m revenue ... $12m') pair two
# prose dollars into a bogus 'math' span
PROSE_SPAN = re.compile(r"\*\*|\u2013")

DICT = set(json.load(open("/tmp/ls3_dict.json")))
print("dict:", len(DICT), flush=True)

# ---- corpus string collection (all JSON string values) ----
strings = []
for root, dirs, files in os.walk(BASE):
    for fn in sorted(files):
        if not fn.endswith(".json"):
            continue
        try:
            data = json.load(open(os.path.join(root, fn), encoding="utf-8"))
        except Exception:
            continue

        def collect(node):
            if isinstance(node, dict):
                for v in node.values():
                    collect(v)
            elif isinstance(node, list):
                for v in node:
                    collect(v)
            elif isinstance(node, str):
                strings.append(node)

        collect(data)
print("corpus strings:", len(strings), flush=True)

# ---- prose frequencies (>200-char strings, of-record rule) ----
prose_freq = Counter()
for s in strings:
    if len(s) > 200:
        for w in re.findall(r"[A-Za-z]{2,}", s):
            prose_freq[w.lower()] += 1
print("prose tokens counted", flush=True)

# ---- clean-context token stream: dollar interiors masked; sentinels at
#      sentence punctuation and at every string boundary ----
tokens = []
append = tokens.append
for s in strings:
    clean = DOLLAR.sub(" \x02 ", s)
    for t in STREAMTOK.findall(clean.lower()):
        append(sys.intern(t) if t[0].isalpha() else SENTINEL)
    append(SENTINEL)
del strings
gc.collect()
print("clean-context tokens:", len(tokens), flush=True)

corpus_freq = Counter(tokens)
print("distinct stream tokens:", len(corpus_freq), flush=True)

postings = defaultdict(array)
for idx, t in enumerate(tokens):
    p = postings.get(t)
    if p is None:
        p = postings[t] = array("i")
    p.append(idx)
gc.collect()
print("postings keys:", len(postings), flush=True)


def phrase_count(toks, cap=5):
    """consecutive-match count of toks in the clean stream; sentinel tokens
    occupy slots, so sentence/string boundaries cannot be crossed."""
    lists = [postings.get(t) for t in toks]
    if any(l is None for l in lists):
        return 0
    ri = min(range(len(toks)), key=lambda i: len(lists[i]))
    n = 0
    for pos in lists[ri]:
        base = pos - ri
        if base < 0 or base + len(toks) > len(tokens):
            continue
        if all(tokens[base + j] == toks[j] for j in range(len(toks))):
            n += 1
            if n >= cap:
                break
    return n


def dp_split(run):
    n = len(run)
    best = [None] * (n + 1)
    best[0] = (10 ** 18, 0, 0, [])
    for i in range(1, n + 1):
        for j in range(max(0, i - 22), i):
            if best[j] is None:
                continue
            tok = run[j:i]
            if len(tok) < 2 or tok not in DICT:
                continue
            f = min(best[j][0], prose_freq.get(tok, 0))
            cand = (f, best[j][1] + 1, len(tok), best[j][3] + [tok])
            if best[i] is None or (
                (cand[1], -cand[0], -cand[2]) < (best[i][1], -best[i][0], -best[i][2])
            ):
                best[i] = cand
    if best[n] is None:
        return None
    path = best[n][3]
    if len(path) > 1 and best[n][0] < 100:
        return None  # junk-path floor (of-record)
    return path


def in_subscript(seg, pos):
    """true if seg[pos] sits inside a _{...} group or directly after an
    unbraced _ (report metadata)."""
    i = 0
    n = len(seg)
    while i < n:
        if seg[i] == "_" and i + 1 < n:
            j = i + 1
            if seg[j] == "{":
                d = 1
                k = j + 1
                while k < n and d:
                    if seg[k] == "{":
                        d += 1
                    elif seg[k] == "}":
                        d -= 1
                    k += 1
                if j < pos < k:
                    return True
                i = k
                continue
            elif pos == j:
                return True
        i += 1
    return False


KEEP_ITEMS = {"split-evidenced", "corpusword-border", "blocklist",
              "allcaps", "mixedcase", "single-nodict"}
results = []
run_counts = {"realword": Counter(), "unsegmentable": Counter(),
              "corpusword": Counter(), "no-phrase-evidence": Counter()}
files_scanned = 0
seg_stats = Counter()
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
            print(f"SKIP {rel}: {e}", file=sys.stderr, flush=True)
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
            for sm in MATHSEG.finditer(s):
                if s[sm.start()] != "$":
                    continue  # backtick = protected 23a-speech class
                seg = sm.group(0)
                if PROSE_SPAN.search(seg):
                    seg_stats["prose-span-skipped"] += 1
                    continue  # currency-dollar false pair -> protected prose
                seg_stats["dollar_segments"] += 1
                masked = list(seg)
                for cm in CMD.finditer(seg):
                    for k in range(cm.start(), cm.end()):
                        masked[k] = "\x00"
                masked = "".join(masked)
                for m in RUN.finditer(masked):
                    run = m.group(0)
                    lower = run.lower()
                    item = {
                        "file": rel, "path": jpath,
                        "run": run, "seg": seg,
                        "subscript": in_subscript(seg, m.start()),
                        "ctx": s[max(0, sm.start() - 80):sm.end() + 80],
                    }
                    cfreq = corpus_freq.get(lower, 0)
                    item["corpusFreq"] = cfreq
                    if lower in DICT:
                        item["class"] = "realword"
                        run_counts["realword"][lower] += 1
                    elif cfreq >= 3:
                        item["class"] = "corpusword"
                        run_counts["corpusword"][lower] += 1
                    elif lower in BLOCKLIST:
                        item["class"] = "blocklist"
                    elif run.isupper():
                        item["class"] = "allcaps"
                    elif any(c.isupper() for c in run[1:]):
                        item["class"] = "mixedcase"
                    else:
                        toks = dp_split(lower)
                        if toks is None:
                            item["class"] = "unsegmentable"
                            run_counts["unsegmentable"][lower] += 1
                        elif len(toks) < 2:
                            item["class"] = "single-nodict"
                        elif any(t in SUFFIX for t in toks):
                            item["class"] = "suffixtoken"
                        else:
                            item["split"] = toks
                            item["floor"] = min(prose_freq.get(t, 0) for t in toks)
                            pc = phrase_count(toks)
                            item["phraseCount"] = pc
                            item["class"] = ("split-evidenced" if pc > 0
                                             else "no-phrase-evidence")
                            if pc == 0:
                                run_counts["no-phrase-evidence"][lower] += 1
                    seg_stats[item["class"]] += 1
                    if item["class"] in KEEP_ITEMS:
                        results.append(item)

print("dumping...", flush=True)
run_top = {cls: [[w, n] for w, n in c.most_common(80)]
           for cls, c in run_counts.items()}
out = {"files": files_scanned, "dollarSegments": seg_stats["dollar_segments"],
       "classes": dict(seg_stats), "runTop": run_top, "items": results}
json.dump(out, open("/tmp/jd4_census.json", "w"), ensure_ascii=False, indent=1)
print(f"files scanned: {files_scanned}, dollar segments: {seg_stats['dollar_segments']}")
print("classes:", dict(seg_stats))
print("-> /tmp/jd4_census.json")
