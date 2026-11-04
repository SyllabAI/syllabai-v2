#!/usr/bin/env python3
"""RN-DEBRIS-11 run-003 — residue census at the CURRENT tip (worktree sv2-rn11).

Enumerates, byte-exactly, everything the run-002 refusals ledger left behind:
  A/R1   the refused P1 5.2 text (expected 3 sites)
  B/R3c  the refused (x-3)^2 gathered seg (expected 6 occ)
  C      V_{i n} occurrences by span class (expected: dollar 0, backtick 5)
  C      sub-floor _{x y} occurrences by span class
         (expected dollar keeps: b m x2, e l x1; backtick: i n x5, x x x1)
  D      regression re-assert of the run-002 repaired forms (of-record)
  E      hunt: notes potential-divider segs not among the repaired R2a pairs
Fail-closed: expected counts come from the ledger; mismatches are REPORTED,
not silenced.
Writes /tmp/rn11/run3_census.json.
"""
import json, re, sys
from pathlib import Path
from collections import Counter, defaultdict

REPO = Path("/home/z/my-project/work/sv2-rn11")
ART = REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11"
OUT = Path("/tmp/rn11")

R1 = json.load(open(ART / "r1_pairs.json"))
R3 = json.load(open(ART / "r3_pairs.json"))

R1_REFUSED = [p for p in R1 if p.get("refused")]
R1_PAIRS = [(p["corrupted"], p["intended"]) for p in R1 if not p.get("refused")]
R3C_REFUSED = R3["refused"]            # [[fam, seg, note], ...]
R3B_SEGS = [p["seg"] for p in R3["R3b"] if "lambda_{m a x}" not in p["seg"]]
R3B_REPAIRED = [p["repaired"] for p in R3["R3b"] if "lambda_{m a x}" not in p["seg"]]
R3C_SEGS = [p["seg"] for p in R3["R3c"]]
R3C_REPAIRED = [p["repaired"] for p in R3["R3c"]]
R2A_REPAIRED = [
 "$V_{out} = ( \\frac{R_{1}}{R_{1} + R_{2}} ) V_{in}$",
 "$V_{out} = ( \\frac{R_{2} + R_{3} }{R_{1} + R_{2} + R_{3} } ) V_{in}$",
 "$R_{2} = ( \\frac{R_{1} \\times V_{in} }{V_{out} } ) - R_{1}$",
 "$\\lambda_{max} = \\frac{( 6.63 \\times 10^{- 34} ) ( 3.0 \\times 10^{8} )}{( 80 \\times 10^{3} ) ( 1.6 \\times 10^{-19} )}$",
]
R2C_REPAIRED = "$v_{\\uparrow} = \\frac{Momentum after}{( m_{spacecraft} + m_{asteroid} )} = \\frac{p_{spacecraft}}{( m_{spacecraft} + m_{asteroid} )}$"

SUBFLOOR = re.compile(r"_ ?\{([A-Za-z] [A-Za-z])\}")
V_IN = re.compile(r"V_\{i n\}")
MATHSEG = re.compile(r"\$[^$]+\$|`[^`]+`")

def walk(node, jpath):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, f"{jpath}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{jpath}[{i}]")
    elif isinstance(node, str):
        yield jpath, node

def span_class(s, pos):
    """dollar / backtick / prose via mathseg span scan (census law)"""
    for sm in MATHSEG.finditer(s):
        if sm.start() <= pos < sm.end():
            return "dollar" if s[sm.start()] == "$" else "backtick"
    return "prose"

out = {"tip": None, "skips": [], "A_r1_refused": [], "B_r3c_refused": [],
       "C_v_in": [], "C_subfloor": [], "E_potdiv_notes": [],
       "regress": {"r1_corrupted_seen": 0, "r2b_dollar": 0,
                   "r3b_corrupt_seen": 0, "r3c_corrupt_seen": 0,
                   "repaired_missing": [], "r2c_repaired_missing": 0}}

import subprocess
out["tip"] = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO,
                            capture_output=True, text=True).stdout.strip()

ALL_REPAIRED_SEEN = set()
r1_refused_texts = [p["corrupted"] for p in R1_REFUSED]
r3c_refused_segs = [seg for _fam, seg, _n in R3C_REFUSED]
potdiv_marks = ("R_{1}", "R_{2}", "V_{o u t}", "V_{out}", "V_{i} n", "V_{i n}")
ALL_REPAIRED = R3B_REPAIRED + R3C_REPAIRED + R2A_REPAIRED

for path in sorted(REPO.glob("apps/hub/**/*.json")):
    rel = str(path.relative_to(REPO))
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        out["skips"].append({"file": rel, "err": str(e)[:120]})
        continue
    raw = path.read_text(encoding="utf-8")
    for jpath, s in walk(data, "$"):
        # A — R1 refused text
        for t in r1_refused_texts:
            if t == s or t in s:
                out["A_r1_refused"].append({"file": rel, "path": jpath,
                                            "whole": t == s, "len": len(s)})
        # B — refused (x-3)^2 gathered seg
        for seg in r3c_refused_segs:
            n = s.count(seg)
            if n:
                out["B_r3c_refused"].append({"file": rel, "path": jpath,
                                             "count": n})
        # C — V_{i n} by span class
        for m in V_IN.finditer(s):
            out["C_v_in"].append({"file": rel, "path": jpath,
                                  "cls": span_class(s, m.start())})
        # C — sub-floor by span class
        for m in SUBFLOOR.finditer(s):
            out["C_subfloor"].append({"file": rel, "path": jpath,
                                      "content": m.group(1),
                                      "cls": span_class(s, m.start()),
                                      "hit": m.group(0)})
        # D — regressions of record (corrupted forms must be gone)
        for cor, _rep in R1_PAIRS:
            if s == cor:
                out["regress"]["r1_corrupted_seen"] += 1
        for seg in R3B_SEGS + R3C_SEGS:
            if seg in s:
                if seg in R3B_SEGS:
                    out["regress"]["r3b_corrupt_seen"] += 1
                else:
                    out["regress"]["r3c_corrupt_seen"] += 1
        # E — potential-divider segs in notes files not among repaired pairs
        if "notes" in rel and s.startswith("$") and s.endswith("$"):
            if any(mk in s for mk in potdiv_marks):
                known = any(rp in s or rp == s for rp in R2A_REPAIRED)
                out["E_potdiv_notes"].append({"file": rel, "path": jpath,
                                              "knownR2a": known,
                                              "seg": s})
    # D (per-file, once): repaired forms must be present in every file that
    # ever carried them — cheap proxy: file must contain the repaired segs
    # it is known for; here we only assert presence somewhere in the corpus.
    for seg in ALL_REPAIRED:
        if seg in raw:
            ALL_REPAIRED_SEEN.add(seg)
    if R2C_REPAIRED in raw:
        ALL_REPAIRED_SEEN.add(R2C_REPAIRED)
        out["regress"]["r2c_repaired_missing"] = 0

# ---- expected-count reconciliation ----
got = {
 "A_r1_refused": len(out["A_r1_refused"]),
 "B_r3c_occ": sum(x["count"] for x in out["B_r3c_refused"]),
 "C_v_in_backtick": sum(1 for x in out["C_v_in"] if x["cls"] == "backtick"),
 "C_v_in_dollar": sum(1 for x in out["C_v_in"] if x["cls"] == "dollar"),
}
sub_dollar = Counter(x["content"] for x in out["C_subfloor"] if x["cls"] == "dollar")
sub_bt = Counter(x["content"] for x in out["C_subfloor"] if x["cls"] == "backtick")
got["subfloor_dollar"] = dict(sub_dollar)
got["subfloor_backtick"] = dict(sub_bt)
out["got"] = got
missing_after = [s for s in ALL_REPAIRED if s not in ALL_REPAIRED_SEEN]
out["regress"]["repaired_missing_corpuswide"] = [
    {"segHead": s[:70]} for s in missing_after]
if R2C_REPAIRED not in ALL_REPAIRED_SEEN and True:
    out["regress"]["r2c_repaired_missing"] = 1
out["reconcile"] = {
 "A_ok(3)": got["A_r1_refused"] == 3,
 "B_ok(6)": got["B_r3c_occ"] == 6,
 "C_vin_ok(bt5,d0)": (got["C_v_in_backtick"] == 5
                      and got["C_v_in_dollar"] == 0),
 "C_subfloor_ok(bm2,el1 dollar; in5,xx1 backtick)": (
   sub_dollar.get("b m", 0) == 2 and sub_dollar.get("e l", 0) == 1
   and sub_bt.get("i n", 0) == 5 and sub_bt.get("x x", 0) == 1),
}
json.dump(out, open(OUT / "run3_census.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps({"tip": out["tip"], "got": got, "reconcile": out["reconcile"],
                  "skips": len(out["skips"]),
                  "regress": out["regress"],
                  "E_potdiv_notes_n": len(out["E_potdiv_notes"])},
                 ensure_ascii=False, indent=1))
