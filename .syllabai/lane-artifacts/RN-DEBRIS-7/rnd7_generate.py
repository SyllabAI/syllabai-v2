#!/usr/bin/env python3
"""Generate RN-DEBRIS-7 scripts from the of-record RN-DEBRIS-6 sources. v2

Every OLD-string is EXTRACTED from the of-record source file (line-index or
regex anchor) — nothing is retyped by hand. Every patch asserts exactly one
match. The dict sha16 is COMPUTED from the dict file bytes and cross-checked
against the constant in the of-record census, then injected into new code.
Post-generation sanity: py_compile each output; class-literal consistency
check ("split-evidenced" spelling identical to source everywhere).
"""
import hashlib
import py_compile
import re
import sys

ART = "/home/z/my-project/work/sv2-rnd6/.syllabai/lane-artifacts/RN-DEBRIS-6"
OUTD = "/home/z/my-project/scripts"

CEN_SRC = open(f"{ART}/rnd6_census.py", encoding="utf-8").read()
CON_SRC = open(f"{ART}/rnd6_convert.py", encoding="utf-8").read()
cen_lines = CEN_SRC.splitlines(keepends=True)
con_lines = CON_SRC.splitlines(keepends=True)

# --- dict sha: computed, cross-checked against the census constant ----------
SHA = hashlib.sha256(open("/tmp/rnd6_dict.json", "rb").read()).hexdigest()[:16]
cen_sha = re.search(r'"sha\d+": "([0-9a-f]{16})"', CEN_SRC).group(1)
if SHA != cen_sha:
    print("FATAL dict sha mismatch: computed", SHA, "census", cen_sha, file=sys.stderr)
    sys.exit(2)
print("dict sha16 verified:", SHA)

# --- class literals extracted from source ----------------------------------
CLS = re.search(r'i\["class"\] == "([a-z-]+)"', CON_SRC).group(1)
assert CLS == re.search(r'item\["class"\] = \("([a-z-]+)" if pc', CEN_SRC).group(1)
NOPE = re.search(r'else "([a-z-]+)"\)', CEN_SRC).group(1)
print("class literals from source:", CLS, "/", NOPE)


def patch(src, old, new, tag):
    n = src.count(old)
    if n != 1:
        print(f"FATAL patch {tag}: {n} matches", file=sys.stderr)
        sys.exit(2)
    if old.endswith("\n") and not new.endswith("\n"):
        new += "\n"  # keep line structure; never glue onto the next line
    return src.replace(old, new)


def sanity(path, extra_lits):
    py_compile.compile(path, doraise=True)
    gen = open(path, encoding="utf-8").read()
    lits = set(re.findall(r'"([a-z]+(?:-[a-z]+)+)"', gen))
    bad = [l for l in lits if l.endswith(("-evidenced", "-evidence"))
           and l not in {CLS, NOPE} | set(extra_lits)]
    if bad:
        print(f"FATAL {path}: unexpected evidence literals {bad}", file=sys.stderr)
        sys.exit(2)
    print("sanity OK:", path)


# ============================================================ census ========
# docstring: lines 2..15 (index 1..14) of the original
DOC_OLD = "".join(cen_lines[1:15])
DOC_NEW = f'''"""RN-DEBRIS-7 run-001 census — the prose-context joined-runs lane.

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
Only '{CLS}' items fire in convert; convert filters on ctxClass.
"""'''

src = CEN_SRC
src = patch(src, DOC_OLD, DOC_NEW, "doc")
src = patch(src, "import gc\nimport json",
            "import gc\nimport hashlib\nimport json", "import")

DICT_OLD = "".join(cen_lines[40:42])
assert DICT_OLD.startswith("DICT = set(") and "rnd6_dict.json" in DICT_OLD
DICT_NEW = f'''_dict_bytes = open("/tmp/rnd6_dict.json", "rb").read()
_sha16 = hashlib.sha256(_dict_bytes).hexdigest()[:16]
if _sha16 != "{SHA}":
    print("FATAL dict sha16 mismatch:", _sha16, file=sys.stderr)
    sys.exit(2)
DICT = set(json.loads(_dict_bytes))
print("dict:", len(DICT), "sha16", _sha16, "OK", flush=True)'''
src = patch(src, DICT_OLD, DICT_NEW, "dict-sha")

SEED_OLD = "".join(cen_lines[43:46])
assert "rnd6_seed.json" in SEED_OLD and "rnd5_after_segs.json" in SEED_OLD
SEED_NEW = ('SEED = set()   # rn6-specific exposure tagging dropped (tree-wide)\n'
            'AFTER = set()   # rn6-specific exposure tagging dropped (tree-wide)\n')
src = patch(src, SEED_OLD, SEED_NEW, "seed-drop")

CTX_OLD = "".join(cen_lines[204:208])
assert "PROSE_SPAN.search(seg)" in CTX_OLD and "prose-span-skipped" in CTX_OLD
assert "continue" in CTX_OLD and "dollar_segments" in CTX_OLD and len(CTX_OLD.splitlines()) == 4
CTX_NEW = '''                if PROSE_SPAN.search(seg):
                    seg_stats["dollar-prose/segments"] += 1
                    ctx = "dollar-prose"
                else:
                    seg_stats["dollar-plain/segments"] += 1
                    ctx = "dollar-plain"'''
src = patch(src, CTX_OLD, CTX_NEW, "ctx-tag")

ITEM_OLD = "".join(cen_lines[216:219])
assert '"run": run, "seg": seg,' in ITEM_OLD
ITEM_NEW = '''                    item = {
                        "file": rel, "path": jpath, "ctxClass": ctx,
                        "run": run, "seg": seg,'''
src = patch(src, ITEM_OLD, ITEM_NEW, "item-ctx")

CONST_OLD = 'PROSE_SPAN = re.compile(r"\\*\\*|\\u2013")\n'
CONST_NEW = ('PROSE_SPAN = re.compile(r"\\*\\*|\\u2013")\n'
             '# rn7 additive prose guards (outside-span scope only; fail-closed)\n'
             'TOKEN_URL = re.compile(r"://|/assets/|raw\\.githubusercontent|\\.syllabai|/receipts/"\n'
             '                       r"|\\.(?:cms|html?|php|aspx|png|jpe?g|gif|webp|svg|md|json|csv|pdf)\\b")\n'
             'WINDOW_URL = re.compile(r"https?://|/assets/|raw\\.githubusercontent|\\.syllabai|/receipts/"\n'
             '                        r"|\\.(?:png|jpe?g|gif|webp|svg|md|json|csv|pdf|cms|html?)\\b")\n'
             'INVIS = re.compile(r"[\\u00ad\\u200b-\\u200d\\ufeff\\u2060]")\n'
             'RE_PARENSTEM = re.compile(r"([A-Za-z]{1,8})\\($")\n'
             'RE_MKSTEM = re.compile(r"([A-Za-z]{1,8})(?:\\*{1,2}|_{1,2}|`)?$")\n'
             'RE_MKFOLLOW = re.compile(r"^(?:\\*{1,2}|_{1,2}|`)?([A-Za-z]{1,8})")\n'
             'HYPH_FORM = re.compile(r"(?:^|[^a-z-])([a-z]{2,}-[a-z]{2,})(?=[^a-z-]|$)")\n'
             '\n'
             '\n'
             'def inflected_word(run):\n'
             '    # G9: the run is a regular inflection of a dictionary word\n'
             '    for suf in ("ing", "ied", "ies", "ed", "es", "er", "est", "ly", "s"):\n'
             '        if run.endswith(suf) and len(run) > len(suf) + 2:\n'
             '            stem = run[:-len(suf)]\n'
             '            cands = {stem}\n'
             '            if suf in ("ing", "ed", "er", "est"):\n'
             '                cands.add(stem + "e")\n'
             '            if suf in ("ing", "ed") and len(stem) >= 3 and stem[-1] == stem[-2]:\n'
             '                cands.add(stem[:-1])\n'
             '            if suf in ("ied", "ies"):\n'
             '                cands.add(stem + "y")\n'
             '            if any(c in DICT for c in cands):\n'
             '                return True\n'
             '    return False\n'
             '\n'
             '\n'
             '# G12 named keeps: review-of-record, each with its reason (receipt)\n'
             'KEEP_NAMED = {\n'
             '    "areaforce": "spec fraction-garble line (force/area interleave); space-split invents word order",\n'
             '    "volumemass": "spec fraction-garble line (mass/volume interleave); space-split invents word order",\n'
             '    "takenwork": "spec fraction-garble line (work/time interleave); space-split invents word order",\n'
             '    "markable": "word fragment (remarkable, letters eaten at a line wrap); unrepairable",\n'
             '    "productin": "word fragment (production, letter loss); split would corrupt",\n'
             '    "inbalance": "ambiguous misspelling (imbalance vs in balance); neither split repairs truth",\n'
             '    "enone": "standard chemistry term (conjugated enone system)",\n'
             '    "ethylmagnesium": "standard chemical name (ethylmagnesium bromide, Grignard)",\n'
             '    "polyalkene": "standard chemistry term (polyalkene)",\n'
             '    "accessor": "standard computing term (accessor method)",\n'
             '    "matchup": "standard word (a matchup)",\n'
             '    "bitrate": "standard technical solid form (adaptive bitrate)",\n'
             '    "offstage": "standard solid adverb (conducted offstage)",\n'
             '    "ballpoint": "standard solid form (ballpoint ink)",\n'
             '    "crosswind": "standard solid form (in a crosswind)",\n'
             '    "flashpoint": "standard solid form (the likeliest flashpoint)",\n'
             '    "showplace": "standard literary word (the common showplace)",\n'
             '    "whitespace": "standard computing term (comments and whitespace)",\n'
             '    "baseflow": "standard hydrology term (baseflow, cf. throughflow)",\n'
             '    "polymeras": "marker-interrupted word (polymeras**e = polymerase); dict lacks the compound - fail-closed keep",\n'
             '    "hydrogenat": "marker-interrupted word (hydrogenat**ed = hydrogenated); dict lacks the compound - fail-closed keep",\n'
             '    "snowwhite": "hyphen-lost literary quote (snow-white); space-split would mis-quote",\n'
             '    "wornout": "hyphen-lost literary quote (worn-out tools); space-split would mis-quote",\n'
             '    "seafloor": "standard geological solid form (seafloor spreading)",\n'
             '    "greenspace": "standard UK planning term (greenspace)",\n'
             '    "printout": "standard solid form (a digital printout)",\n'
             '    "overcontrol": "rare critical coinage (overcontrol); space-split invents a form",\n'
             '}\n')
src = patch(src, CONST_OLD, CONST_NEW, "constants")

HYPH_OLD = "".join(cen_lines[72:78])
assert "prose_freq[w.lower()] += 1" in HYPH_OLD and "prose tokens counted" in HYPH_OLD
HYPH_NEW = HYPH_OLD + '''hyphen_freq = Counter()
for _hs in strings:
    for _hw in HYPH_FORM.findall(_hs.lower()):
        hyphen_freq[_hw] += 1
print("hyphen forms counted:", len(hyphen_freq), flush=True)'''
src = patch(src, HYPH_OLD, HYPH_NEW, "hyphen-index")

PASSA_OLD = "".join(cen_lines[199:201])
assert 'for jpath, s in walk(data, "$"):' in PASSA_OLD
assert PASSA_OLD.count("\n") == 2
PASSA_NEW = '''        for jpath, s in walk(data, "$"):
            # ---- pass A (rn7 NEW): outside-span plain-prose runs -----------
            _mask = list(s)
            for _pm in MATHSEG.finditer(s):
                for _k in range(_pm.start(), _pm.end()):
                    _mask[_k] = "\\x00"
            _masked = "".join(_mask)
            _mask2 = list(_masked)
            for _cm in CMD.finditer(_masked):
                for _k in range(_cm.start(), _cm.end()):
                    if _mask2[_k] != "\\x00":
                        _mask2[_k] = "\\x00"
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
                        item["class"] = ("@CLS@" if pc > 0
                                         else "@NOPE@")
                        if pc == 0:
                            run_counts["@NOPE@"][lower] += 1
                        if item["class"] == "@CLS@":
                            item["s"] = s  # full string: the convert anchor
                seg_stats[f"outside-span/{item['class']}"] += 1
                _classified.append(item)
            # rn7 additive prose guards over the split-evidenced class only:
            for item in _classified:
                if item["class"] != "@CLS@":
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
                    elif s[:_a].count("\u201c") - s[:_a].count("\u201d") == 1:
                        item["guard"] = "inside-quote"
                    elif item["run"].lower() in KEEP_NAMED:
                        item["guard"] = "named-keep"
                    else:
                        item["guard"] = "pass"
                seg_stats[f"outside-span/guard/{item['guard']}"] += 1
                results.append(item)
            # ---- pass B: dollar segments (prose-marker vs plain), rn6 law ---
            for sm in MATHSEG.finditer(s):'''
PASSA_NEW = PASSA_NEW.replace("@CLS@", CLS).replace("@NOPE@", NOPE)
src = patch(src, PASSA_OLD, PASSA_NEW, "pass-A")

STATS_OLD = "".join(cen_lines[256:257])
assert 'seg_stats[item["class"]] += 1' in STATS_OLD and STATS_OLD.count("\n") == 1
STATS_NEW = """                    seg_stats[f"{ctx}/{item['class']}"] += 1
"""
src = patch(src, STATS_OLD, STATS_NEW, "stats-key")

OUT_OLD = "".join(cen_lines[264:269])
assert '"dollarSegments"' in OUT_OLD and "seedRuns" in OUT_OLD
assert OUT_OLD.count("\n") == 5
OUT_NEW = '''out = {"files": files_scanned,
       "dollarSegmentsPlain": seg_stats["dollar-plain/segments"],
       "dollarSegmentsProse": seg_stats["dollar-prose/segments"],
       "classes": dict(seg_stats), "runTop": run_top, "items": results,
       "dictMeta": {"source": "nltk words(en) + British -ise variant B",
                    "total": len(DICT), "sha16": "''' + SHA + '''"},
       "seedRuns": len(SEED)}'''
src = patch(src, OUT_OLD, OUT_NEW, "out-meta")

PRINT_OLD = cen_lines[270]
assert "files scanned" in PRINT_OLD and "dollar segments" in PRINT_OLD
PRINT_NEW = ('print(f"files scanned: {files_scanned}, $-segments plain: '
             "{seg_stats['dollar-plain/segments']}, prose-marker: "
             "{seg_stats['dollar-prose/segments']}\")\n")
src = patch(src, PRINT_OLD, PRINT_NEW, "print-meta")

open(f"{OUTD}/rnd7_census.py", "w", encoding="utf-8").write(src)
sanity(f"{OUTD}/rnd7_census.py", {"dollar-prose", "dollar-plain", "outside-span", "weak-evidence"})

# ============================================================ convert =======
CONV_DOC_OLD = "".join(con_lines[0:12])
CONV_DOC_NEW = f'''"""RN-DEBRIS-7 dollar-prose converter — prose-marker $-segments scope.

Faithful mirror of the of-record jd4/rnd6 converter law (RN-DEBRIS-4/6):
consumes the census (class '{CLS}', ctxClass filter); every split already
passed gates 0-6 (corpus-word gate, dictionary, case guards, bottleneck DP,
junk floor >=100, suffix ban, sentinel-guarded phrase evidence). Casing
law: printed capital at run start reproduces as capital on the first output
word. Per-RUN fail-closed; whole-segment MARK post-filter; raw-byte
occurrence surgery; JSON untouched outside matched spans.
Delta vs rn6: census path/args parameterized; items filtered on
ctxClass=="dollar-prose" (segments the rn6 census skipped wholesale);
ctxClass=="dollar-plain" {CLS} items are a RED FLAG (rn6 closed that class;
must be 0) and are reported, never fired.
"""'''

src = CON_SRC
src = patch(src, CONV_DOC_OLD, CONV_DOC_NEW, "c-doc")

CONV_BASE_OLD = "".join(con_lines[17:19])
assert 'BASE = "/home/z/my-project' in CONV_BASE_OLD and "APPLY" in CONV_BASE_OLD
CONV_BASE_NEW = 'BASE = sys.argv[1]\nAPPLY = "--apply" in sys.argv\n'
src = patch(src, CONV_BASE_OLD, CONV_BASE_NEW, "c-args")

m = re.search(
    r'census = json\.load\(open\("/tmp/rnd6_census\.json"\)\)\n'
    r'items = \[i for i in census\["items"\] if i\["class"\] == "[a-z-]+"\]\n'
    r'print\("split-evidenced items:", len\(items\)\)\n', src)
if not m:
    print("FATAL c-census anchor", file=sys.stderr)
    sys.exit(2)
CONV_CEN_NEW = f'''census = json.load(open(sys.argv[2]))
SCOPE = sys.argv[3]
items = [i for i in census["items"]
         if i["class"] == "{CLS}" and i.get("ctxClass") == SCOPE]
print(f"split-evidenced items (ctxClass={{SCOPE}}):", len(items))
_red = [i for i in census["items"]
        if i["class"] == "{CLS}" and i.get("ctxClass") == "dollar-plain"]
print("RED FLAG dollar-plain split-evidenced (must be 0):", len(_red))'''
src = patch(src, m.group(0), CONV_CEN_NEW, "c-census")

CONV_OUT_OLD = con_lines[135]
assert '"/tmp/rnd6_apply_report.json"' in CONV_OUT_OLD
src = patch(src, CONV_OUT_OLD, 'out = sys.argv[4]\n', "c-out")

CONV_CH_OLD = con_lines[139]
assert '"/tmp/rnd6_changed_files.txt"' in CONV_CH_OLD
src = patch(src, CONV_CH_OLD,
            '    with open(sys.argv[5], "w") as f:\n', "c-changed")
# c-anchors: dual-form JSON-escape anchoring (dollar-prose segments carry
# newlines/en-dash which the rn6 to_raw() backslash+quote law cannot
# re-escape) plus a per-file JSON-parse gate (fail-closed, ledgered).
m_anch = re.search(
    r'        seg_raw = to_raw\(seg\)\n'
    r'        fixed_raw = to_raw\(fixed\)\n'
    r'        n = raw\.count\(seg_raw\)\n'
    r'        if n == 0:\n'
    r'            raw_misses\.append\(\{"file": rel, "seg": seg\[:100\]\}\)\n'
    r'            continue\n'
    r'        raw = raw\.replace\(seg_raw, fixed_raw\)\n', src)
assert m_anch, "c-anch block not found"
CONV_ANCH_NEW = '        n = 0\n        hit = False\n        for ea in (False, True):\n            seg_raw = json.dumps(seg, ensure_ascii=ea)[1:-1]\n            fixed_raw = json.dumps(fixed, ensure_ascii=ea)[1:-1]\n            if seg_raw == fixed_raw:\n                continue\n            c = raw.count(seg_raw)\n            if c:\n                raw = raw.replace(seg_raw, fixed_raw)\n                n += c\n                hit = True\n        if not hit:\n            raw_misses.append({"file": rel, "seg": seg[:100]})\n            continue\n'
src = src[:m_anch.start()] + CONV_ANCH_NEW + src[m_anch.end():]

m_led = re.search(r'mark_refusals = \[\]\nraw_misses = \[\]\nfile_changes = \{\}\n', src)
assert m_led, "ledger init not found"
src = src[:m_led.end()] + 'json_fails = []\n' + src[m_led.end():]

m_wr = re.search(
    r'    if raw != orig:\n'
    r'        file_changes\[rel\] = seg_report\n'
    r'        if APPLY:\n'
    r'            open\(path, "w", encoding="utf-8"\)\.write\(raw\)\n', src)
assert m_wr, "write block not found"
CONV_WR_NEW = '    if raw != orig:\n        try:\n            json.loads(raw)\n        except Exception as e:\n            json_fails.append({"file": rel, "err": str(e)[:200]})\n            continue  # fail-closed: discard this file\'s in-memory changes\n        file_changes[rel] = seg_report\n        if APPLY:\n            open(path, "w", encoding="utf-8").write(raw)\n'
src = src[:m_wr.start()] + CONV_WR_NEW + src[m_wr.end():]

m_rep = re.search('    "rawMisses": raw_misses,\n    "detail": file_changes,\n', src)
assert m_rep, "report block not found"
src = src[:m_rep.start()] + '    "rawMisses": raw_misses,\n    "jsonParseFails": json_fails,\n    "detail": file_changes,\n' + src[m_rep.end():]

m_pr = re.search(r'print\(f"raw-count-zero keeps: \{len\(raw_misses\)\}"\)\n', src)
assert m_pr, "miss print not found"
src = src[:m_pr.end()] + 'print(f"JSON-parse fail-closed: {len(json_fails)}")\n' + src[m_pr.end():]

open(f"{OUTD}/rnd7_convert_dollar.py", "w", encoding="utf-8").write(src)
sanity(f"{OUTD}/rnd7_convert_dollar.py", {"dollar-prose", "dollar-plain"})

# ============================================================ diffs =========
import difflib
for name, orig in (("census", CEN_SRC), ("convert_dollar", CON_SRC)):
    d = list(difflib.unified_diff(
        orig.splitlines(keepends=True),
        open(f"{OUTD}/rnd7_{name}.py", encoding="utf-8").read().splitlines(keepends=True),
        fromfile=f"rnd6_{name}.py", tofile=f"rnd7_{name}.py"))
    open(f"/tmp/rnd7_{name}.diff", "w", encoding="utf-8").write("".join(d))
    hunks = [h for h in d if h.startswith("@@")]
    print(f"diff rnd6_{name} -> rnd7_{name}: {len(hunks)} hunks")
    for h in hunks:
        print("  ", h.strip())
print("ALL GENERATED")
