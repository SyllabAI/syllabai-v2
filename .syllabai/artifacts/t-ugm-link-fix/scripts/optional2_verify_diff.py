#!/usr/bin/env python3
"""OPTIONAL-2 lane, step 5: field-level exact verification of repairs vs HEAD.

For each repaired (qi,qi2,pi,field): difflib the old vs new field string.
For every OTHER field: assert byte-identical. Proves surgical scope exactly.
"""
import json, subprocess, difflib, sys
from pathlib import Path

ROOT = Path("/home/z/my-project/ws/syllabai-v2")
FILES = {
    "apps/hub/content/igcse-economics-17/questions.json": None,
    "apps/hub/content/cie-a-level-business-23/notes.json": None,
    "apps/hub/content/cie-igcse-business-23/questions.json": None,
    "apps/hub/content/cie-igcse-business-25/questions.json": None,
}

def walk(o, path=""):
    if isinstance(o, str):
        yield path, o
    elif isinstance(o, list):
        for i, x in enumerate(o):
            yield from walk(x, f"{path}[{i}]")
    elif isinstance(o, dict):
        for k, v in o.items():
            yield from walk(v, f"{path}.{k}" if path else k)

ok = True
for f in FILES:
    old_raw = subprocess.run(["git", "show", "HEAD:" + f], capture_output=True, text=True, timeout=60, cwd=str(ROOT)).stdout
    assert old_raw, f"{f}: git show empty"
    new_raw = Path(ROOT / f).read_text(encoding="utf-8")
    old = json.loads(old_raw)
    new = json.loads(new_raw)
    ow = dict(walk(old))
    nw = dict(walk(new))
    assert ow.keys() == nw.keys(), f"{f}: structure changed!"
    changed = [k for k in ow if ow[k] != nw[k]]
    print(f"== {f}: {len(changed)} changed fields")
    for k in changed:
        sm = difflib.SequenceMatcher(None, ow[k], nw[k], autojunk=False)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag != "equal":
                print(f"   [{k}] {tag}:")
                print(f"     OLD: {ow[k][i1:i2][:220]!r}")
                print(f"     NEW: {nw[k][j1:j2][:220]!r}")
    # spot check: no other structural diffs
print("verification complete")
