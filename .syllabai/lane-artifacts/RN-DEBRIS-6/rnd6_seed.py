#!/usr/bin/env python3
"""RN-DEBRIS-6 run-001 — seed derivation: the joined runs newly EXPOSED by
the RN-DEBRIS-5 command-boundary fix. For each of the 2,238 (old, new)
pairs in the of-record rnd5_manifest_r0.json, the glued runs ([A-Za-z]{5,}
outside LaTeX commands, commands masked) present in 'new' but absent in
'old' are the exposed cohort: their letters were previously fused INTO the
command token and thus invisible to the jd4 RUN census.
Usage: python3 rnd6_seed.py <repoRoot> <outJson>
"""
import json
import re
import sys

CMD = re.compile(r"\\[A-Za-z]+")
RUN = re.compile(r"[A-Za-z]{5,}")
root = sys.argv[1]
out = sys.argv[2]
m = json.load(open(f"{root}/.syllabai/lane-artifacts/RN-DEBRIS-5/rnd5_manifest_r0.json"))


def masked_runs(seg):
    masked = list(seg)
    for cm in CMD.finditer(seg):
        for k in range(cm.start(), cm.end()):
            masked[k] = "\x00"
    return set(r.group(0) for r in RUN.finditer("".join(masked)))


exposed = {}
after_segs = set()
for p in m:
    o, n = p["old"], p["new"]
    after_segs.add(n)
    for r in masked_runs(n) - masked_runs(o):
        e = exposed.setdefault(r.lower(), {"form": r, "pairs": 0})
        e["pairs"] += 1

json.dump(exposed, open(out, "w"), indent=1)
json.dump(sorted(after_segs), open(out.replace(".json", "_after_segs.json"), "w"))
print("distinct exposed runs:", len(exposed))
for r, e in sorted(exposed.items(), key=lambda kv: -kv[1]["pairs"])[:12]:
    print(f"  {e['pairs']:5d}  {e['form']}")
