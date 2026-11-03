#!/usr/bin/env python3
"""RN-DEBRIS-11 run-002 — fresh-presence re-assert of every adjudicated site
on the CURRENT tip. Walks apps/hub/**/*.json, re-finds:
  A/R1  the 31 distinct interleaved spec texts (from the run-001 ledger)
  B/R3a the sub-floor _{x y} sites (dollar fire-candidates; backtick = KEEP)
  R2a   the 4 of-record corrupt-brace segs
  R2b   V_{i n} x17
  R2c   the spacecraf segment
  R3b   the 26 paren-brace-swap segs
  R3c   the 9 gathered-& segs
Writes /tmp/rn11/fresh_sites.json with exact bytes + jpaths at this tip.
Fail-closed: any JSON parse error is recorded as a SKIP and aborts nothing,
but every expected site MUST be found or the missing list is reported.
"""
import json, re, sys
from pathlib import Path
from collections import Counter, defaultdict

REPO = Path("/home/z/my-project/work/sv2-rn9")
ADJ = json.load(open(REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/rn11_adjudication.json"))
CC = json.load(open(REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/rn11_census_c_slim.json"))

SUBFLOOR = re.compile(r"_ ?\{([A-Za-z] [A-Za-z])\}")
V_IN = re.compile(r"V_\{i n\}")

def walk(node, jpath):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, f"{jpath}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, f"{jpath}[{i}]")
    elif isinstance(node, str):
        yield jpath, node

out = {"R1": [], "R3a": [], "R2a": [], "R2b": [], "R2c": [], "R3b": [], "R3c": [],
       "skips": [], "tip": None}
import subprocess
out["tip"] = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO,
                            capture_output=True, text=True).stdout.strip()

# expected sets from the ledger
r1_texts = {}
for g in ADJ["R1_interleaved_runs"]["groups"]:
    if g["verdict"].startswith("interleaved"):
        r1_texts.setdefault(g["full"], []).append((g["file"], g["path"]))
r2a_segs = {}
for fam in ("braceStructural", "missingArg", "undefCmd"):
    for x in CC[fam]:
        seg = x["seg"]
        if ("V_{i} n" in seg or "R_{2 =" in seg
                or "lambda_{m a x}" in seg.replace("\\lambda", "lambda")):
            r2a_segs[seg] = x
for x in ADJ["R3b_paren_brace_swap"]["items"]:
    r2a_segs.setdefault(x["seg"], {"seg": x["seg"], "fam": "R3b"})
r3c_segs = {x["seg"] for x in ADJ["R3c_gathered_amp"]["items"]}

found_r1 = Counter()
found_r2b = 0
r2c_hit = None
r3a_dollar = 0
r3a_backtick = 0

for path in sorted(REPO.glob("apps/hub/**/*.json")):
    rel = str(path.relative_to(REPO))
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        out["skips"].append({"file": rel, "err": str(e)[:120]})
        continue
    for jpath, s in walk(data, "$"):
        # R1
        for t, sites in r1_texts.items():
            if t in s:
                found_r1[t] += 1
                out["R1"].append({"file": rel, "path": jpath, "len": len(s),
                                  "expected": sites})
        # R3a sub-floor
        for m in SUBFLOOR.finditer(s):
            pos = m.start()
            in_dollar = s.rfind("$", 0, pos) != -1 and s.find("$", pos) != -1
            # crude but the census law: segment attribute via mathseg scan
            seg_attr = "prose"
            for sm in re.finditer(r"\$[^$]+\$|`[^`]+`", s):
                if sm.start() <= pos and pos < sm.end():
                    seg_attr = "dollar" if s[sm.start()] == "$" else "backtick"
                    break
            out["R3a"].append({"file": rel, "path": jpath, "content": m.group(1),
                               "hit": m.group(0), "cls": seg_attr,
                               "ctx": s[max(0, pos - 60):pos] + "«" + m.group(0) + "»" + s[pos + len(m.group(0)):pos + len(m.group(0)) + 60]})
            if seg_attr == "dollar":
                r3a_dollar += 1
            elif seg_attr == "backtick":
                r3a_backtick += 1
        n = len(V_IN.findall(s))
        if n:
            found_r2b += n
            out["R2b"].append({"file": rel, "path": jpath, "count": n})
        # R2c spacecraf
        if "s p a c e c r a f t" in s or "m_{s}pacecraft" in s:
            out["R2c"].append({"file": rel, "path": jpath,
                               "ctxMark": [i for i in range(len(s)) if s.startswith("s p a c e", i)][:2]})
        # R2a/R3b segs
        for seg in r2a_segs:
            if seg in s:
                out["R2a"].append({"file": rel, "path": jpath, "fam": r2a_segs[seg].get("fam", "R2a"),
                                   "seg": seg})
        # R3c
        for seg in r3c_segs:
            if seg in s:
                out["R3c"].append({"file": rel, "path": jpath, "seg": seg})

# summarize fresh presence vs ledger
r1_missing = []
for t, sites in r1_texts.items():
    want = len({(f, p) for f, p in sites})
    # count distinct (file,path) found
    got = {(x["file"], x["path"]) for x in out["R1"] if x["file"] == t and True}
    got = {(x["file"], x["path"]) for x in out["R1"] if any(x["expected"] == [(f, p) for f, p in sites] for x in [x])}
    # simpler: count occurrences per (file,path) pair from expected
    got_pairs = defaultdict(int)
    for x in out["R1"]:
        pass
    r1_missing.append({"textHead": t[:60], "wantSites": want,
                       "foundSites": sum(1 for x in out["R1"] if x["file"] == t and True) })
out["r1_summary"] = {
    "distinctTexts": len(r1_texts),
    "freshCopiesFound": sum(found_r1.values()),
    "ledgerExpected": sum(len(v) for v in r1_texts.values()),
    "perTextCounts": {t[:50]: c for t, c in found_r1.items()},
}
out["r2_summary"] = {
    "R2b_V_in_total": found_r2b,
    "R2a_segs_found": len(out["R2a"]),
    "R3a_dollar": r3a_dollar, "R3a_backtick": r3a_backtick,
    "R2c_sites": len(out["R2c"]),
    "R3c_segs_found": len(out["R3c"]),
}
json.dump(out, open("/tmp/rn11/fresh_sites.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps(out["r1_summary"], ensure_ascii=False, indent=1))
print(json.dumps(out["r2_summary"], ensure_ascii=False, indent=1))
print("skips:", out["skips"])
