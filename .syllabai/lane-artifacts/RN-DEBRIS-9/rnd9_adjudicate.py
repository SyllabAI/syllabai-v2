#!/usr/bin/env python3
"""RN-DEBRIS-9 run-001 — letter-spaced floor close-out: adjudication engine.

Law of record (RN-DEBRIS-3 ls3_convert.py, byte-law preserved and extended):
  collapse = (1) run == dictionary word
             (2) dictionary word at lev<=1 not extending/truncating the run
                 (typo-evidence, starred+disclosed)
             (3) bottleneck DP over dictionary tokens (fewest tokens, then
                 max min-token-prose-freq, then longest) with the junk-path
                 floor (multi-token min-freq < 100 -> keep)
  titlecase handling generalized to maximal case-aware runs: DP runs on the
  lowercased letters; each token is re-capitalized iff the run prints an
  uppercase letter at the token's start position (reproduces the ls3
  titlecase(back1/back2) family and 'Y o u n g M o d u l u s' -> 'Young Modulus').
Guards (fail-closed):
  FUNCS function-argument guard, trailing-variable guard (dollar);
  inside-quote guard + dialect-apostrophe guard + link-marker/url-asset guard
  (prose, the RN-DEBRIS-7/8 lessons); MARK speech-grammar post-filter
  (dollar AND prose — a join must not newly trip the frozen gate classes);
  dollar whole-segment fail-closed (ls3 law).
New paths of record:
  all-caps acronyms in PROSE fire only via the RN-DEBRIS-2 per-page path
  (the joined form occurs clean in the same file); all-caps runs inside
  DOLLAR math keep by law (intentional point-label spacing).
  E_{k a f t e r} family: variable+dict-word joins only with the prefix
  subscript context AND a clean in-file attestation.
Backtick spans: protected class of record (23a speech grammar) — never fired.
"""
import json
import os
import re
import sys
from collections import Counter

BASE = sys.argv[1]                      # apps/hub/content
CENSUS = sys.argv[2]                    # rnd9_census_r0.json
OUT = sys.argv[3]                       # adjudication ledger out

DICT = set(json.load(open("/tmp/rnd9/dict_of_record.json")))
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
FUNCS = ("sin", "cos", "tan", "sec", "csc", "cot", "log", "ln", "exp",
         "sinh", "cosh", "tanh", "mod", "max", "min", "gcd", "arc")
LINKMARK = re.compile(r"(http|\.webp|\.png|\.jpe?g|\.gif|/uploads|\]\()")

WORD = re.compile(r"[A-Za-z]{2,}")
freq = Counter()
prose_freq = Counter()
file_raw = {}
for root, dirs, files in os.walk(BASE):
    for fn in files:
        if fn.endswith(".json"):
            p = os.path.join(root, fn)
            try:
                txt = open(p, encoding="utf-8").read()
                data = json.load(open(p, encoding="utf-8"))
            except Exception:
                continue
            rel = os.path.relpath(p, BASE)
            file_raw[rel] = txt
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

for rel in file_raw:
    _collect_prose(json.loads(file_raw[rel]))
vocab = {w for w, f in freq.items() if f >= 3}
print(f"dict={len(DICT)} vocab={len(vocab)} prose_words={len(prose_freq)}")


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


def dp_tokens(lower):
    """ls3 bottleneck DP verbatim: (fewest tokens, then max min-prose-freq,
    then longest last token); junk floor for multi-token paths."""
    n = len(lower)
    best = [None] * (n + 1)
    best[0] = (10 ** 18, 0, 0, [])
    for i in range(1, n + 1):
        for j in range(max(0, i - 22), i):
            if best[j] is None:
                continue
            tok = lower[j:i]
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
        return None
    return path


def cap_map(run, tokens):
    """map DP tokens back to the printed run; token capitalized iff the run
    prints an uppercase letter at the token start; None on any mismatch."""
    letters_pos = [i for i, ch in enumerate(run) if ch != " "]
    if len(letters_pos) != sum(len(t) for t in tokens):
        return None
    out, k = [], 0
    for t in tokens:
        start_char = run[letters_pos[k]]
        seg_chars = [run[p] for p in letters_pos[k:k + len(t)]]
        if "".join(seg_chars).lower() != t:
            return None
        if start_char.isupper():
            out.append(t[0].upper() + t[1:])
        else:
            out.append(t)
        k += len(t)
    return out


_jpcache = {}

def get_by_jpath(rel, jp):
    """strict jpath walk (census walk law: $.a.b[0].c)"""
    if rel not in _jpcache:
        _jpcache[rel] = json.loads(file_raw[rel])
    node = _jpcache[rel]
    for tok in re.findall(r"\.([^.\[\]]+)|\[(\d+)\]", jp[1:]):
        if tok[0]:
            node = node[tok[0]]
        else:
            node = node[int(tok[1])]
    return node


def attests_in_file(rel, phrase, ci=False):
    """RN-DEBRIS-2 per-page path: the joined phrase occurs clean (outside the
    spaced form) in the same file."""
    txt = file_raw.get(rel, "")
    if not phrase:
        return 0
    if ci:
        n = len(re.findall(re.escape(phrase), txt, re.I))
    else:
        n = txt.count(phrase)
    return n


def verdict(item):
    """returns ledger dict for one maximal run item (D1/D2/D3, dollar/prose)."""
    run, letters = item["run"], item["letters"]
    lower = letters.lower()
    seg, cls = item["seg"], item["cls"]
    ctx = item["ctx"]
    rec = {"file": item["file"], "path": item["path"], "run": run,
           "cls": cls, "seg": seg, "letters": letters}

    if seg == "backtick":
        rec.update(v="KEEP", kind="backtick-protected-23a")
        return rec

    # string-level context for prose guards
    s = None
    if seg == "prose":
        s = get_by_jpath(item["file"], item["path"])
        if not isinstance(s, str) or run not in s:
            rec.update(v="ERROR", kind="jpath-miss")
            return rec

    # ---- guards (fail-closed) ----
    if seg == "dollar":
        if any(lower.startswith(f) and 0 < len(lower) - len(f) <= 2 for f in FUNCS):
            rec.update(v="KEEP", kind="funcs-guard")
            return rec
        if len(lower) >= 5 and lower[-1] in "xy" and lower[:-1] in (
            "with", "without", "for", "and", "of", "in", "to", "from", "by", "at"
        ):
            rec.update(v="KEEP", kind="trailing-variable-guard")
            return rec
    if seg == "prose" and s is not None:
        pos = s.find(run)
        if pos >= 0:
            if s[:pos].count('"') % 2 == 1:
                rec.update(v="KEEP", kind="inside-quote-guard")
                return rec
            if pos + len(run) < len(s) and s[pos + len(run)] == "'":
                rec.update(v="KEEP", kind="dialect-apostrophe-guard")
                return rec
            win = s[max(0, pos - 130):min(len(s), pos + len(run) + 130)]
            if LINKMARK.search(win):
                rec.update(v="KEEP", kind="link-marker-guard")
                return rec

    # ---- verdict paths ----
    if letters.isupper():
        if seg == "dollar":
            rec.update(v="KEEP", kind="allcaps-in-math")
            return rec
        joined = letters
        n = attests_in_file(item["file"], joined)
        if n >= 1:
            rec.update(v="FIRE", kind="acronym-perpage", to=joined, attest=n)
        else:
            rec.update(v="KEEP", kind="acronym-unattested-perpage")
        return rec

    # mixed-case or all-lower: dict law (MARK post-filter enforced at surgery)
    if lower in DICT:
        caps = cap_map(run, [lower])
        if caps:
            rec.update(v="FIRE", kind="dict-word", to=" ".join(caps))
        else:
            rec.update(v="KEEP", kind="cap-map-mismatch")
        return rec

    if len(lower) >= 8:
        for w in DICT:
            if w in prose_freq and prose_freq[w] >= 100 and lev(lower, w) <= 1 \
                    and not w.startswith(lower) and not lower.startswith(w):
                caps = cap_map(run, [w])
                if caps:
                    rec.update(v="FIRE", kind="typo-evidence*", to=" ".join(caps))
                    return rec

    toks = dp_tokens(lower)
    if toks is None:
        # E_{k a f t e r} family: variable + dict word under a subscript prefix,
        # fired only via the RN-DEBRIS-2 per-page attestation path
        if seg == "dollar" and len(lower) >= 5 and lower[0] in "kbxvtpAE" and lower[1:] in DICT:
            seg_full = item.get("seg_full") or ""
            pre = seg_full[:seg_full.find(run)] if run in seg_full else ""
            if pre.rstrip().endswith("_") or pre.rstrip().endswith("{"):
                join = lower[0] + " " + lower[1:]
                n = attests_in_file(item["file"], join)
                if n >= 1:
                    rec.update(v="FIRE", kind="eperpage", to=join, attest=n)
                    return rec
        rec.update(v="KEEP", kind="dp-fail")
        return rec
    caps = cap_map(run, toks)
    if not caps:
        rec.update(v="KEEP", kind="cap-map-mismatch")
        return rec
    rec.update(v="FIRE", kind="dp", to=" ".join(caps))
    return rec


census = json.load(open(CENSUS))
items = census["run_items"]
ledger = []
for it in items:
    r0 = dict(verdict(it))
    r0["ctx"] = it.get("ctx", "")
    ledger.append(r0)

vs = Counter((r["v"], r["kind"]) for r in ledger)
print(json.dumps({f"{k[0]}/{k[1]}": n for k, n in sorted(vs.items())}, indent=1))
json.dump(ledger, open(OUT, "w"), ensure_ascii=False, indent=1)
print("ledger ->", OUT)
