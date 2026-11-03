#!/usr/bin/env python3
"""RN-DEBRIS-7 run-001 census — the prose-context joined-runs lane.

Faithful extension of the of-record jd4/rnd6 census law (RN-DEBRIS-4/6):
every gate arrives byte-verbatim by exact-string patch (dictionary sha-
anchored at load, corpus-word gate >=3, case guards, bottleneck DP split,
junk floor >=100, suffix ban, sentinel-guarded phrase evidence, blocklist).
Delta of this run, disclosed in-line:
  - The two prose contexts the prior lanes explicitly skipped are now
    classified: ctxClass="outside-span" = runs in plain text outside $...$
    and backtick spans (the RN-DEBRIS-5 disclosed residual, "181 outside-
    span glue-shaped regex hits in 15 files — prose = a different class");
    ctxClass="dollar-prose" = runs inside $-segments carrying the PROSE_SPAN
    markers (** or en-dash) which RN-DEBRIS-6 skipped wholesale ("prose-span
    3,553 skipped").
  - ctxClass="dollar-plain" (math $-segments without prose markers) is
    classified for IDEMPOTENCE reconciliation only: RN-DEBRIS-6 closed this
    class of record (post-apply split-evidenced 0). Any split-evidenced
    item here is a red flag, reported, never fired by this lane.
  - Masking is offset-preserving (char-level), so outside-span run positions
    map 1:1 onto the original string; commands outside spans are masked too
    so a stray backslash-command cannot donate its letter run.
  - rn6 seed tagging (seedRun/rn5seg) is dropped: this census is tree-wide,
    not an rn5-exposure delta.
  - rn7 ADDITIVE prose guards (outside-span scope only; every keep is the
    fail-closed direction): url-asset (run inside a URL/path/asset/internal-
    record token or a +-160-char window carrying a URL/asset/receipt marker),
    paren-continuation (stem + run forms a dictionary word, e.g. add(ition),
    marker-stem/marker-follow (markdown bold/italics/code split a word, e.g.
    c**onvert / hydrogenat**ed / **f**orget), invisible-char (zero-width or
    soft-hyphen neighbour), fragment-twin (an unsegmentable run within 60
    chars — the deeper-defect signature, e.g. sothe lution), non-lowercase
    (prose names/brands; only all-lowercase runs fire), weak-evidence
    (phrase attestation < 3 of cap 5), hyphen-twin (the hyphenated compound
    is attested in the corpus, e.g. user-defined — the correct repair is the
    hyphen, a different debris class), inflected-word (the run is a regular
    inflection of a dictionary word, e.g. reconsidering), inside-quote (odd
    curly-quote count — literary quotes untouched), named-keep (review-of-
    record solid forms/fragments, each with its reason in KEEP_NAMED).
Only 'split-evidenced' items fire in convert; convert filters on ctxClass.
"""
import gc
import hashlib
import json
import os
import re
import sys
import time
from array import array
from collections import Counter, defaultdict

BASE = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/work/sv2-rnd6/apps/hub/content"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/rnd6_census.json"
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
    "payout",
}
PROSE_SPAN = re.compile(r"\*\*|\u2013")
# rn7 additive prose guards (outside-span scope only; fail-closed)
TOKEN_URL = re.compile(r"://|/assets/|raw\.githubusercontent|\.syllabai|/receipts/"
                       r"|\.(?:cms|html?|php|aspx|png|jpe?g|gif|webp|svg|md|json|csv|pdf)\b")
WINDOW_URL = re.compile(r"https?://|/assets/|raw\.githubusercontent|\.syllabai|/receipts/"
                        r"|\.(?:png|jpe?g|gif|webp|svg|md|json|csv|pdf|cms|html?)\b")
INVIS = re.compile(r"[\u00ad\u200b-\u200d\ufeff\u2060]")
RE_PARENSTEM = re.compile(r"([A-Za-z]{1,8})\($")
RE_MKSTEM = re.compile(r"([A-Za-z]{1,8})(?:\*{1,2}|_{1,2}|`)?$")
RE_MKFOLLOW = re.compile(r"^(?:\*{1,2}|_{1,2}|`)?([A-Za-z]{1,8})")
HYPH_FORM = re.compile(r"(?:^|[^a-z-])([a-z]{2,}-[a-z]{2,})(?=[^a-z-]|$)")


def inflected_word(run):
    # G9: the run is a regular inflection of a dictionary word
    for suf in ("ing", "ied", "ies", "ed", "es", "er", "est", "ly", "s"):
        if run.endswith(suf) and len(run) > len(suf) + 2:
            stem = run[:-len(suf)]
            cands = {stem}
            if suf in ("ing", "ed", "er", "est"):
                cands.add(stem + "e")
            if suf in ("ing", "ed") and len(stem) >= 3 and stem[-1] == stem[-2]:
                cands.add(stem[:-1])
            if suf in ("ied", "ies"):
                cands.add(stem + "y")
            if any(c in DICT for c in cands):
                return True
    return False


# G12 named keeps: review-of-record, each with its reason (receipt)
KEEP_NAMED = {
    "areaforce": "spec fraction-garble line (force/area interleave); space-split invents word order",
    "volumemass": "spec fraction-garble line (mass/volume interleave); space-split invents word order",
    "takenwork": "spec fraction-garble line (work/time interleave); space-split invents word order",
    "markable": "word fragment (remarkable, letters eaten at a line wrap); unrepairable",
    "productin": "word fragment (production, letter loss); split would corrupt",
    "inbalance": "ambiguous misspelling (imbalance vs in balance); neither split repairs truth",
    "enone": "standard chemistry term (conjugated enone system)",
    "ethylmagnesium": "standard chemical name (ethylmagnesium bromide, Grignard)",
    "polyalkene": "standard chemistry term (polyalkene)",
    "accessor": "standard computing term (accessor method)",
    "matchup": "standard word (a matchup)",
    "bitrate": "standard technical solid form (adaptive bitrate)",
    "offstage": "standard solid adverb (conducted offstage)",
    "ballpoint": "standard solid form (ballpoint ink)",
    "crosswind": "standard solid form (in a crosswind)",
    "flashpoint": "standard solid form (the likeliest flashpoint)",
    "showplace": "standard literary word (the common showplace)",
    "whitespace": "standard computing term (comments and whitespace)",
    "baseflow": "standard hydrology term (baseflow, cf. throughflow)",
    "polymeras": "marker-interrupted word (polymeras**e = polymerase); dict lacks the compound - fail-closed keep",
    "hydrogenat": "marker-interrupted word (hydrogenat**ed = hydrogenated); dict lacks the compound - fail-closed keep",
    "snowwhite": "hyphen-lost literary quote (snow-white); space-split would mis-quote",
    "wornout": "hyphen-lost literary quote (worn-out tools); space-split would mis-quote",
    "seafloor": "standard geological solid form (seafloor spreading)",
    "greenspace": "standard UK planning term (greenspace)",
    "printout": "standard solid form (a digital printout)",
    "overcontrol": "rare critical coinage (overcontrol); space-split invents a form",
}

_dict_bytes = open("/tmp/rnd6_dict.json", "rb").read()
_sha16 = hashlib.sha256(_dict_bytes).hexdigest()[:16]
if _sha16 != "db20ed6f4d8c8bac":
    print("FATAL dict sha16 mismatch:", _sha16, file=sys.stderr)
    sys.exit(2)
DICT = set(json.loads(_dict_bytes))
print("dict:", len(DICT), "sha16", _sha16, "OK", flush=True)

SEED = set()   # rn6-specific exposure tagging dropped (tree-wide)
AFTER = set()   # rn6-specific exposure tagging dropped (tree-wide)

strings = []
files_scanned = 0
for root, dirs, files in os.walk(BASE):
    for fn in sorted(files):
        if not fn.endswith(".json"):
            continue
        files_scanned += 1
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
print("corpus strings:", len(strings), "files:", files_scanned, flush=True)

prose_freq = Counter()
for s in strings:
    if len(s) > 200:
        for w in re.findall(r"[A-Za-z]{2,}", s):
            prose_freq[w.lower()] += 1
print("prose tokens counted", flush=True)
hyphen_freq = Counter()
for _hs in strings:
    for _hw in HYPH_FORM.findall(_hs.lower()):
        hyphen_freq[_hw] += 1
print("hyphen forms counted:", len(hyphen_freq), flush=True)

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
        return None
    return path


def in_subscript(seg, pos):
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
seg_stats = Counter()
t0 = time.time()
for root, dirs, files in os.walk(BASE):
    for fn in sorted(files):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(root, fn)
        rel = os.path.relpath(path, BASE)
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
            # ---- pass A (rn7 NEW): outside-span plain-prose runs -----------
            _mask = list(s)
            for _pm in MATHSEG.finditer(s):
                for _k in range(_pm.start(), _pm.end()):
                    _mask[_k] = "\x00"
            _masked = "".join(_mask)
            _mask2 = list(_masked)
            for _cm in CMD.finditer(_masked):
                for _k in range(_cm.start(), _cm.end()):
                    if _mask2[_k] != "\x00":
                        _mask2[_k] = "\x00"
            _masked = "".join(_mask2)
            _classified = []
            for _m in RUN.finditer(_masked):
                run = _m.group(0)
                lower = run.lower()
                item = {
                    "file": rel, "path": jpath, "ctxClass": "outside-span",
                    "run": run, "pos": _m.start(),
                    "ctx": s[max(0, _m.start() - 80):_m.end() + 80],
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
                        if item["class"] == "split-evidenced":
                            item["s"] = s  # full string: the convert anchor
                seg_stats[f"outside-span/{item['class']}"] += 1
                _classified.append(item)
            # rn7 additive prose guards over the split-evidenced class only:
            for item in _classified:
                if item["class"] != "split-evidenced":
                    if item["class"] in KEEP_ITEMS:
                        results.append(item)
                    continue
                _a = item["pos"]; _b = _a + len(item["run"])
                _tl = _a
                while _tl > 0 and not s[_tl - 1].isspace():
                    _tl -= 1
                _tr = _b
                while _tr < len(s) and not s[_tr].isspace():
                    _tr += 1
                if (TOKEN_URL.search(s[_tl:_tr])
                        or WINDOW_URL.search(s[max(0, _a - 160):_b + 160])):
                    item["guard"] = "url-asset"
                else:
                    _st = RE_PARENSTEM.search(s[:_a])
                    _mk = RE_MKSTEM.search(s[:_a])
                    _fw = RE_MKFOLLOW.match(s[_b:])
                    if _st and (_st.group(1) + item["run"]).lower() in DICT:
                        item["guard"] = "paren-continuation"
                    elif _mk and (_mk.group(1) + item["run"]).lower() in DICT:
                        item["guard"] = "marker-stem"
                    elif _fw and (item["run"] + _fw.group(1)).lower() in DICT:
                        item["guard"] = "marker-follow"
                    elif INVIS.search(s[max(0, _a - 6):_b + 6]):
                        item["guard"] = "invisible-char"
                    elif any(o is not item and o["class"] == "unsegmentable"
                             and abs(o["pos"] - _a) < 60
                             for o in _classified):
                        item["guard"] = "fragment-twin"
                    elif item["run"] != item["run"].lower():
                        item["guard"] = "non-lowercase"
                    elif item["phraseCount"] < 3:
                        item["guard"] = "weak-evidence"
                    elif "-".join(item["split"]) in hyphen_freq:
                        item["guard"] = "hyphen-twin"
                    elif inflected_word(item["run"]):
                        item["guard"] = "inflected-word"
                    elif s[:_a].count("“") - s[:_a].count("”") == 1:
                        item["guard"] = "inside-quote"
                    elif item["run"].lower() in KEEP_NAMED:
                        item["guard"] = "named-keep"
                    else:
                        item["guard"] = "pass"
                seg_stats[f"outside-span/guard/{item['guard']}"] += 1
                results.append(item)
            # ---- pass B: dollar segments (prose-marker vs plain), rn6 law ---
            for sm in MATHSEG.finditer(s):
                if s[sm.start()] != "$":
                    continue  # backtick = protected 23a-speech class
                seg = sm.group(0)
                if PROSE_SPAN.search(seg):
                    seg_stats["dollar-prose/segments"] += 1
                    ctx = "dollar-prose"
                else:
                    seg_stats["dollar-plain/segments"] += 1
                    ctx = "dollar-plain"
                masked = list(seg)
                for cm in CMD.finditer(seg):
                    for k in range(cm.start(), cm.end()):
                        masked[k] = "\x00"
                masked = "".join(masked)
                for m in RUN.finditer(masked):
                    run = m.group(0)
                    lower = run.lower()
                    item = {
                        "file": rel, "path": jpath, "ctxClass": ctx,
                        "run": run, "seg": seg,
                        "subscript": in_subscript(seg, m.start()),
                        "ctx": s[max(0, sm.start() - 80):sm.end() + 80],
                        "seedRun": lower in SEED,
                        "rn5seg": seg in AFTER,
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
                    seg_stats[f"{ctx}/{item['class']}"] += 1
                    if item["class"] in KEEP_ITEMS:
                        results.append(item)
print(f"census walk done in {time.time()-t0:.1f}s", flush=True)

print("dumping...", flush=True)
run_top = {cls: [[w, n] for w, n in c.most_common(120)]
           for cls, c in run_counts.items()}
out = {"files": files_scanned,
       "dollarSegmentsPlain": seg_stats["dollar-plain/segments"],
       "dollarSegmentsProse": seg_stats["dollar-prose/segments"],
       "classes": dict(seg_stats), "runTop": run_top, "items": results,
       "dictMeta": {"source": "nltk words(en) + British -ise variant B",
                    "total": len(DICT), "sha16": "db20ed6f4d8c8bac"},
       "seedRuns": len(SEED)}
json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
print(f"files scanned: {files_scanned}, $-segments plain: {seg_stats['dollar-plain/segments']}, prose-marker: {seg_stats['dollar-prose/segments']}")
print("classes:", {k: v for k, v in seg_stats.items()})
print("->", OUT)
