#!/usr/bin/env python3
"""Debug: compare span search on u2:c15 for 2.25C."""
import json
import sys
import types
import importlib.util
from pathlib import Path

BASE = Path("/home/z/my-project")
spec = importlib.util.spec_from_file_location("census", str(BASE / "scripts/133k_census.py"))
cm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cm)

src = (BASE / "scripts/133k_diagnose.py").read_text().split("def main()")[0]
dmod = types.ModuleType("diag")
exec(src, dmod.__dict__)

wsrc = (BASE / "scripts/133k_widening.py").read_text().split("\ndef main():")[0]
wmod = types.ModuleType("w")
exec(wsrc, wmod.__dict__)

SPINE = cm.load_spine(BASE / "upstream/syllabai-v2/apps/api/src/services/teacher/concept-graph/specification_points.yaml")
ch = wmod.build_chapters()["u2:c15"]
toks = wmod.corpus_stream(ch["corpus"])
print("corpus chunks:", [(r["id"], r["content_type"], r["pdf_pages"]) for r in ch["corpus"]])
print("stream tokens:", len(toks))
sp = [s for s in SPINE if s["code"] == "4CH1-2.25C"][0]
T = wmod.norm(sp["wording"]).split()
print("official tokens:", len(T), T)
best = wmod.best_span(toks, T)
print("v2 best:", best["cOff"], best["start"], best["end"])
st, en = best["start"], best["end"]
print("span text:", " ".join(t[0] for t in toks[st:en])[:300])
print()
for r in ch["corpus"]:
    print("---", r["id"], r["content_type"], r["pdf_pages"])
    print(r["text"][:420])
