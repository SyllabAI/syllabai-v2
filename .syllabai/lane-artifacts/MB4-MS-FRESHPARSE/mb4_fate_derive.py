#!/usr/bin/env python3
"""Derive the math-italic fate table from the 6bedab62 pairs."""
import json, difflib, collections

pairs = json.load(open("/home/z/my-project/scripts/mb4_latex1_pairs.json"))

def is_ital_cp(o):
    return 0x1D400 <= o <= 0x1D7FF

fate = collections.defaultdict(collections.Counter)
for p in pairs:
    b, a = p["before"], p["after"]
    sm = difflib.SequenceMatcher(None, b, a, autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op != "replace":
            continue
        bs, as_ = b[i1:i2], a[j1:j2]
        bcps = [c for c in bs if is_ital_cp(ord(c))]
        if not bcps:
            continue
        collapsed = []
        for c in bs:
            if not collapsed or collapsed[-1] != c:
                collapsed.append(c)
        if len(collapsed) == 1 and is_ital_cp(ord(collapsed[0])) and len(as_) == 1:
            fate[collapsed[0]][as_] += 1
        elif len(collapsed) > 1 and all(is_ital_cp(ord(c)) for c in collapsed) \
                and collapsed == list(set(collapsed)):
            if len(as_) == len(collapsed):
                for c, r in zip(collapsed, as_):
                    fate[c][r] += 1

table = {}
print("FATE TABLE (majority, n):")
for cp, ctr in sorted(fate.items(), key=lambda x: -sum(x[1].values())):
    total = sum(ctr.values())
    top, n = ctr.most_common(1)[0]
    print(f"  U+{ord(cp):05X} {cp!r} n={total:4d} -> {top!r} ({n}/{total})")
    table[cp] = top
json.dump({hex(ord(k)): v for k, v in table.items()},
          open("/home/z/my-project/scripts/mb4_ital_fate.json", "w"), ensure_ascii=False)
print("saved -> mb4_ital_fate.json")
