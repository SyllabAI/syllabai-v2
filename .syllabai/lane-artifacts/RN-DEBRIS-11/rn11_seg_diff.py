#!/usr/bin/env python3
"""RN-DEBRIS-11 run-002 — precise per-seg occurrence diff (fresh tip vs ledger)."""
import json
from pathlib import Path
from collections import defaultdict

REPO = Path("/home/z/my-project/work/sv2-rn9")
ADJ = json.load(open(REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/rn11_adjudication.json"))
CC = json.load(open(REPO / ".syllabai/lane-artifacts/RN-DEBRIS-11/rn11_census_c_slim.json"))

def walk(n, jp):
    if isinstance(n, dict):
        for k, v in n.items(): yield from walk(v, jp + "." + k)
    elif isinstance(n, list):
        for i, v in enumerate(n): yield from walk(v, jp + "[" + str(i) + "]")
    elif isinstance(n, str): yield jp, n

ledger = {}  # seg -> (fam, ledger_count)
def add(seg, fam, cnt):
    if seg in ledger:
        ledger[seg] = (ledger[seg][0] + "+" + fam, ledger[seg][1] + cnt)
    else:
        ledger[seg] = (fam, cnt)

for fam in ("braceStructural", "missingArg", "undefCmd"):
    for x in CC[fam]:
        s = x["seg"]
        if ("V_{i} n" in s or "R_{2 =" in s
                or "lambda_{m a x}" in s.replace("\\lambda", "lambda")):
            add(s, "R2a", x["count"])
for x in ADJ["R3b_paren_brace_swap"]["items"]:
    add(x["seg"], "R3b", x["count"])
for x in ADJ["R3c_gathered_amp"]["items"]:
    add(x["seg"], "R3c", x["count"])

found = defaultdict(int)
found_paths = defaultdict(list)
for p in sorted(REPO.glob("apps/hub/**/*.json")):
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        continue
    for jp, s in walk(data, "$"):
        for seg in ledger:
            n = s.count(seg)
            if n:
                found[seg] += n
                found_paths[seg].append((str(p.relative_to(REPO)), jp, n))

print("ledger segs:", len(ledger), "ledger occ:", sum(v[1] for v in ledger.values()),
      "fresh occ:", sum(found.values()))
bad = 0
for seg, (fam, lc) in sorted(ledger.items()):
    fc = found.get(seg, 0)
    if fc != lc:
        bad += 1
        print(f"DIFF {fam} ledger={lc} fresh={fc} seg={json.dumps(seg, ensure_ascii=False)[:150]}")
        for fp in found_paths.get(seg, []):
            print("   fresh at:", fp)
print("diff segs:", bad)
