#!/usr/bin/env python3
"""RN-DEBRIS-5 stage 3 — review report: seed cross-check, decomposition
table, blocked cases, occurrence-site expansion, noGlue error classes."""
import json
from collections import Counter, defaultdict

dec = json.load(open("/tmp/rnd5_decomposed.json"))
seg_sites = json.load(open("/tmp/rnd5_segments.json"))["sites"]
seed = json.load(open("/tmp/jd4_katex_pair_r0.json"))

fixable = [f for f in dec["fails"] if f["fixedOk"]]
blocked = [f for f in dec["fails"] if f["fixed"] and not f["fixedOk"]]
noglue = [f for f in dec["fails"] if not f["fixed"]]
fixset = {f["seg"] for f in fixable}

# 1) seed cross-check: the 31 of-record introduced strings must all be found
intro = seed["introduced"]
missing = [s for s in intro if s not in fixset]
print(f"SEED CROSS-CHECK: {len(intro) - len(missing)}/{len(intro)} of-record introduced strings re-found as glueFixable")
for s in missing:
    print("  MISSING:", s[:120])

# 2) distinct decomposition table (longest-prefix law)
deco_count = Counter()
depo_ambig = {}
for f in fixable:
    for d in f["decos"]:
        if d["longest"]:
            key = (d["name"], d["longest"]["P"], d["longest"]["S"])
            deco_count[key] += 1
            if len(d["cands"]) > 1:
                depo_ambig[key] = d["cands"]
print(f"\nDISTINCT DECOMPOSITIONS: {len(deco_count)} (ambiguous-prefix cases: {len(depo_ambig)})")
for (name, P, S), n in sorted(deco_count.items(), key=lambda kv: -kv[1]):
    amb = " AMBIG:" + repr(depo_ambig[(name, P, S)]) if (name, P, S) in depo_ambig else ""
    print(f"  \\{name} -> \\{P} + {S!r}  segs={n}{amb}")

# 3) blocked cases
print(f"\nBLOCKED (glue present, fixed still fails): {len(blocked)}")
for f in blocked:
    print("  SEG:", f["seg"][:130])
    print("    err:", (f["err"] or "")[:100])
    print("    fixedErr:", (f["fixedErr"] or "")[:100])

# 4) occurrence-site expansion
total_sites = 0
file_counts = Counter()
for f in fixable:
    st = seg_sites.get(f["seg"], [])
    total_sites += len(st)
    for s in st:
        file_counts[s["file"]] += 1
print(f"\nOCCURRENCE SITES: {total_sites} across {len(file_counts)} files (jd4 of-record set was 385 sites / 34 files)")
for fn, n in file_counts.most_common(12):
    print(f"  {n:4d}  {fn}")
print(f"  ... {len(file_counts)} files total")

# 5) noGlue error classes (disclosure)
errcls = Counter()
for f in noglue:
    e = f["err"] or ""
    if "Undefined control sequence" in e:
        errcls["undefined-cmd-no-decomposition"] += 1
    elif "Expected" in e:
        errcls["expected-structural"] += 1
    elif "Unicode" in e or "unicode" in e:
        errcls["unicode"] += 1
    else:
        errcls["other"] += 1
print(f"\nNOGLUE failure classes (out of scope, kept): {len(noglue)}")
for k, v in errcls.most_common():
    print(f"  {k}: {v}")

# 6) outside-span glue hits for disclosure
st = json.load(open("/tmp/rnd5_segments.json"))["stats"]
print(f"\nOUTSIDE-SPAN glue-shaped regex hits (disclosure only): {st['outside_span_glue_hits']} in {st['outside_span_files']} files")

# 7) dump the apply manifest: unique fixable segments -> fixed
manifest = [{"old": f["seg"], "new": "$" + f["fixed"] + "$"} for f in fixable]
json.dump(manifest, open("/tmp/rnd5_manifest.json", "w"), ensure_ascii=False, indent=0)
print(f"\nmanifest -> /tmp/rnd5_manifest.json ({len(manifest)} segment conversions)")
