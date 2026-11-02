#!/usr/bin/env python3
"""RN-DEBRIS-8 run-001 — the census dictionary of record, rebuilt BYTE-EXACT.

Recipe (jd4 lineage, variant B recovered this lane):
  nltk words(en) lowercase-deduped, alpha-only  =  234,375 tokens
+ British -ise supplement variant B: one-for-one transform
  ize/ized/izes/izing -> ise/ised/ises/ising over the base, minus the base,
  EXCLUDING derived forms whose stem is shorter than 3 chars (11 forms:
  baise ecise frise gaise maise phises prise seising sised sises sising)
                                                =    2,521 tokens
= 236,896 tokens, file sha16 db20ed6f4d8c8bac (the of-record assert in the
  census scripts). The variant-B rule was recovered by a sha-guided search
  after the y-stem hypothesis produced a characteristic -3/+3 counter
  signature; the recovered file is byte-identical to the RN-DEBRIS-6
  session's /tmp/rnd6_dict.json and ends the 'built in-session, never
  committed' debt recorded in the RN-DEBRIS-4/5/6 blocks.
Serialization of record: sorted list, json.dumps(ensure_ascii=True) default
separators, no trailing newline.
"""
import hashlib
import json
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/rnd6_dict.json"
WANT_SHA16 = "db20ed6f4d8c8bac"

import nltk
try:
    from nltk.corpus import words as W
    wl = W.words()
except LookupError:
    nltk.download("words")
    from nltk.corpus import words as W
    wl = W.words()

base = {w.lower() for w in wl if w.isalpha()}
assert len(base) == 234375, len(base)

supp = set()
for w in base:
    for suf in ("ize", "ized", "izes", "izing"):
        if w.endswith(suf):
            stem = w[: -len(suf)]
            if len(stem) >= 3:
                supp.add(stem + suf.replace("z", "s"))
            break
supp -= base
assert len(supp) == 2521, len(supp)

full = sorted(base | supp)
assert len(full) == 236896, len(full)
b = json.dumps(full, ensure_ascii=True).encode()
sha = hashlib.sha256(b).hexdigest()[:16]
assert sha == WANT_SHA16, sha
open(OUT, "wb").write(b)
print("dict of record written:", OUT, "-", len(full), "tokens - sha16", sha, "OK")
