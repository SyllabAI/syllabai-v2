#!/usr/bin/env python3
"""RN-DEBRIS-5 stage 3b — decomposition safety analysis:
A) full distinct-P (command prefix) census,
B) ambiguity shape check (benign = shorter P' is a prefix of longer P),
C) multi-letter suffix (word-glue) cases,
D) per-P sample contexts for eyeball review."""
import json
from collections import Counter, defaultdict

dec = json.load(open("/tmp/rnd5_decomposed.json"))
seg_sites = json.load(open("/tmp/rnd5_segments.json"))["sites"]
fixable = [f for f in dec["fails"] if f["fixedOk"]]

pc = Counter()
wordglue = defaultdict(list)   # (P,S) -> [(seg, file)]
amb_nonprefix = []
for f in fixable:
    for d in f["decos"]:
        if not d["longest"]:
            continue
        P, S = d["longest"]["P"], d["longest"]["S"]
        pc[P] += 1
        if len(S) >= 2:
            st = seg_sites.get(f["seg"], [])
            wordglue[(P, S)].append((f["seg"], st[0]["file"] if st else "?"))
        if len(d["cands"]) > 1:
            for c in d["cands"][1:]:
                if not P.startswith(c["P"]):
                    amb_nonprefix.append((d["name"], d["cands"]))

print("A) DISTINCT COMMAND PREFIXES (P -> total segs):")
for P, n in pc.most_common():
    print(f"  \\{P}: {n}")

print(f"\nB) NON-PREFIX-SHAPED AMBIGUITIES: {len(amb_nonprefix)}")
for name, cands in amb_nonprefix[:20]:
    print(f"  \\{name}: {cands}")

print(f"\nC) WORD-GLUE (suffix len>=2) DISTINCT CASES: {len(wordglue)}")
for (P, S), lst in sorted(wordglue.items(), key=lambda kv: -len(kv[1])):
    seg0, f0 = lst[0]
    print(f"  \\{P} + {S!r}  n={len(lst)}  e.g. {seg0[:100]}")

# D) context samples: 2 per distinct P
print("\nD) CONTEXT SAMPLES PER P (2 each):")
seen = defaultdict(int)
for f in fixable:
    for d in f["decos"]:
        if not d["longest"]:
            continue
        P = d["longest"]["P"]
        if seen[P] >= 2:
            continue
        seen[P] += 1
        st = seg_sites.get(f["seg"], [])
        ctx = st[0]["ctx"][:130] if st else ""
        print(f"  \\{P}: {f['seg'][:90]}  || ctx: {ctx}")
