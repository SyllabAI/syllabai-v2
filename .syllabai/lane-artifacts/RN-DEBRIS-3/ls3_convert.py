#!/usr/bin/env python3
"""RN-DEBRIS-3 run-001 — the letter-spaced re-join wave (converter).

Zero-invention collapse law for DOLLAR-segment letter-run debris only:
  1. census-regex runs (?:\\b[a-z] ){3,}[a-z]\\b inside $...$ segments.
  2. collapse = longest-vocabulary DP segmentation (fewest tokens, then
     longest tokens); tokens are corpus-evidenced words (freq>=3 for short
     tokens; >=3 chars or function-word allowlist).
  3. Titlecase extension: capital letter immediately before a lowercase run
     + lowercase form in vocab -> Titlecase word (evidence-gated).
  4. Misspell rule: DP path >2 tokens AND a vocab word (len>=8, Levenshtein<=1)
     equals the full run -> single word (disclosed per run).
  5. Unsatisfiable -> fail-closed: keep debris, disclose.
Protected (untouched, disclosed): backtick 23a-speech false-positives, prose
hits, \\text{stretchy}/\\text{tilde} markers, all math structure.

Text-level surgery on raw file bytes (no JSON round-trip). Dry-run mode
default; --apply writes files under /tmp/v2.
"""
import json
import os
import re
import sys
from collections import Counter

BASE = "/tmp/v2/apps/hub/content"
APPLY = "--apply" in sys.argv
PAT = re.compile(r"(?:\b[a-z] ){3,}[a-z]\b")
DOLLAR = re.compile(r"\$[^$]+\$")
WORD = re.compile(r"[A-Za-z]{2,}")
# the corpus gate's MARK phrase list (verify_corpus_23a.ts) — a conversion
# whose result NEWLY matches MARK would breach the frozen dollar-0 baseline
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
ALLOW = None  # dictionary-gated now
DICT = set(json.load(open("/tmp/ls3_dict.json")))
print("dict:", len(DICT))

# ---- vocabulary: prose-restricted (long human text blocks) + full corpus ----
freq = Counter()
prose_freq = Counter()
for root, dirs, files in os.walk(BASE):
    for fn in files:
        if fn.endswith(".json"):
            try:
                txt = open(os.path.join(root, fn), encoding="utf-8").read()
            except Exception:
                continue
            for w in WORD.findall(txt):
                freq[w.lower()] += 1

def _collect_prose(node):
    if isinstance(node, dict):
        for v in node.values():
            _collect_prose(v)
    elif isinstance(node, list):
        for v in node:
            _collect_prose(v)
    elif isinstance(node, str) and len(node) > 200:
        for w in WORD.findall(node):
            prose_freq[w.lower()] += 1

for root, dirs, files in os.walk(BASE):
    for fn in files:
        if fn.endswith(".json"):
            try:
                data = json.load(open(os.path.join(root, fn), encoding="utf-8"))
            except Exception:
                continue
            _collect_prose(data)
vocab = {w for w, f in freq.items() if f >= 3}
prose = {w for w, f in prose_freq.items() if f >= 3}
print("vocab:", len(vocab), "prose:", len(prose))


def lev(a, b):
    if abs(len(a) - len(b)) > 1:
        return 2
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def tok_ok(t):
    return len(t) >= 2 and t in DICT


def segment(run):
    """priority law (dictionary-gated):
    (1) run is a dictionary word; (2) dictionary word at lev<=1 that does not
    extend the run (typo-evidence join, starred); (3) bottleneck DP over
    dictionary tokens (max min-token-prose-freq; ties -> fewest -> longest)."""
    if run in DICT:
        return [run]
    if len(run) >= 8:
        for w in DICT:
            if w in prose and prose_freq[w] >= 100 and lev(run, w) <= 1 \
                    and not w.startswith(run) and not run.startswith(w):
                return [w + "*"]  # starred = typo-evidence join, disclosed
    n = len(run)
    best = [None] * (n + 1)  # (min_freq, ntokens, lastlen, path)
    best[0] = (10 ** 18, 0, 0, [])
    for i in range(1, n + 1):
        for j in range(max(0, i - 22), i):
            if best[j] is None:
                continue
            tok = run[j:i]
            if not tok_ok(tok):
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
        return None  # junk-path floor: weak evidence, titlecase may rescue
    return path


def _is_compound(w):
    """a joined token that itself splits into >=2 frequent prose words with a
    much higher bottleneck score is a compound artifact, not one word"""
    n = len(w)
    if n < 6:
        return False
    best = 10 ** 18
    multi = 0
    for i in range(1, n):
        a, b = w[:i], w[i:]
        if a in prose and b in prose:
            multi += 1
            best = min(best, prose_freq[a], prose_freq[b])
    if not multi:
        return False
    return prose_freq[w] < best / 4


def fix_segment(seg):
    """collapse letter-runs in a $...$ segment; returns (fixed, log) or None"""
    FUNCS = ("sin", "cos", "tan", "sec", "csc", "cot", "log", "ln", "exp",
             "sinh", "cosh", "tanh", "mod", "max", "min", "gcd", "arc")
    runs = list(PAT.finditer(seg))
    if not runs:
        return None
    log = []
    out = []
    pos = 0
    for m in runs:
        run = m.group(0)
        lower = run.replace(" ", "")
        # 23a-speech guard: function-prefix chains (e.g. 's i n c' = sin c)
        # are the protected speech-grammar family, NOT aria word debris;
        # remainder <=2 letters only ('sector' stays convertible)
        if any(lower.startswith(f) and 0 < len(lower) - len(f) <= 2 for f in FUNCS):
            return None
        # trailing-variable guard: 'w i t h y' = 'with y' — the variable letter
        # cannot be produced (len-1 tokens banned), so joining 'withy' would
        # trade one defect for another -> fail-closed
        if len(lower) >= 5 and lower[-1] in "xy" and lower[:-1] in (
            "with", "without", "for", "and", "of", "in", "to", "from", "by", "at"
        ):
            return None
        # dictionary law supersedes the ad-hoc func/vowel guards ('sinc',
        # 'dsin', 'kgms', 'changeinvelocity' all fail the dictionary), so
        # only this strict function-argument guard remains
        # titlecase evidence FIRST: a printed capital starting the word is
        # stronger evidence than any later join ('P e r i m e t e r' -> 'Perimeter')
        i = m.start()
        tc_done = False
        for back in (1, 2):
            k = i - back
            if k < 0:
                continue
            cap = seg[k]
            if not (cap.isupper() and (back == 1 or seg[k + 1:i] == " ")):
                continue
            joined = (cap + lower).lower()
            if joined in DICT:
                repl = cap + lower
                out.append(seg[pos:k])
                out.append(repl)
                pos = m.end()
                log.append((run, repl, f"titlecase(back{back})"))
                tc_done = True
                break
        if tc_done:
            continue
        toks = segment(lower)
        if toks is None:
            return None  # fail-closed whole segment
        repl = " ".join(t.rstrip("*") for t in toks)
        star = any(t.endswith("*") for t in toks)
        out.append(seg[pos:m.start()])
        out.append(repl)
        pos = m.end()
        log.append((run, repl, "misspell-evidence" if star else "vocab"))
    out.append(seg[pos:])
    return "".join(out), log


def to_raw(s):
    """parsed-string -> raw file bytes (JSON escaping: backslash and quote)"""
    return s.replace("\\", "\\\\").replace('"', '\\"')


census = json.load(open("/tmp/ls3_census.json"))["items"]
dollar_hits = [r for r in census if r["seg"] == "dollar"]
by_file = {}
for r in dollar_hits:
    by_file.setdefault(r["file"], set()).add(r["seg_full"])
print("dollar files:", len(by_file), "distinct segments:", sum(len(v) for v in by_file.values()))

total_conv = total_keep = 0
misspell_log = []
gate_refusals = []
file_changes = {}
for rel, segs in sorted(by_file.items()):
    path = os.path.join(BASE, rel)
    raw = open(path, encoding="utf-8").read()
    orig = raw
    file_conv = 0
    segmap = {}
    for seg in sorted(segs):
        fx = fix_segment(seg)
        if fx is None:
            total_keep += 1
            continue
        fixed, log = fx
        seg_raw = to_raw(seg)
        fixed_raw = to_raw(fixed)
        n = raw.count(seg_raw)
        if n == 0:
            total_keep += 1
            continue
        if MARK.search(fixed) and not MARK.search(seg):
            # would newly trip the corpus gate's speech-grammar detector
            total_keep += 1
            gate_refusals.append({"file": rel, "segment": seg[:120],
                                  "fixed": fixed[:120]})
            continue
        raw = raw.replace(seg_raw, fixed_raw)
        segmap[seg] = {"fixed": fixed, "occurrences": n,
                       "log": [list(x) for x in log]}
        total_conv += 1
        file_conv += 1
        for run, repl, kind in log:
            if kind == "misspell-evidence":
                misspell_log.append({"file": rel, "run": run, "to": repl})
    if raw != orig:
        file_changes[rel] = {"segments": segmap, "conversions": file_conv}
        if APPLY:
            open(path, "w", encoding="utf-8").write(raw)

print(f"segments converted: {total_conv}, fail-closed kept: {total_keep}")
print("gate-refused (new MARK match):", len(gate_refusals))
for g in gate_refusals[:10]:
    print("  ", g["file"][:36], "|", g["fixed"][:90])
print("files changed:", len(file_changes))
print("misspell-evidence joins:", len(misspell_log))
for m in misspell_log[:12]:
    print("  ", m["file"][:40], m["run"], "->", m["to"])

json.dump({"converted": total_conv, "kept": total_keep,
           "gateRefusals": gate_refusals,
           "files": {k: {"conversions": v["conversions"],
                          "segments": v["segments"]}
                      for k, v in file_changes.items()},
           "misspellJoins": misspell_log},
          open("/tmp/ls3_apply_report.json", "w"), ensure_ascii=False, indent=1)
print("report -> /tmp/ls3_apply_report.json")
