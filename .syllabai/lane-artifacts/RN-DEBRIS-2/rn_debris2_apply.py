#!/usr/bin/env python3
"""
RN-DEBRIS-2 run-001 — full-dict re-pass over the RN-DEBRIS-1 floor.
Surgical, fail-closed byte surgery on ONE file:
  apps/hub/content/cie-a-level-physics-25/notes.json (note rn_hCnswpDDCpNDKfkn)

The three replacements are dict-verified joins against the rebuilt MathML
page dictionary (.syllabai/lane-artifacts/RN-DEBRIS-2/pagedict-rn_hCnswpDDCpNDKfkn.json,
fetched from the note's live SME source page by the of-record
cie_fetch_math_23a.ts). Each new form = dict MathML->LaTeX output verbatim
modulo (a) \textrm{ } artifact gaps (of-record mergeTextRuns law),
(b) the E_{k a f t e r} -> E_{kafter} letter-run collapse matching the note's
own six established clean occurrences, (c) whitespace collapse of (a).
All three guards verified green by scripts/rn_debris2_guard.ts (katex throwOnError,
hasResidualGrammar, gate MARK) BEFORE this surgery runs.

Gates (all must hold or NOTHING is written):
  G1 each old string occurs exactly once at byte level
  G2 file parses as JSON before and after
  G3 parse-level diff: exactly 3 string values changed, all in note rn_hCnswpDDCpNDKfkn bodyMd
  G4 idempotency: re-run on the new file changes nothing
"""
import json, sys, copy

TARGET = "apps/hub/content/cie-a-level-physics-25/notes.json"
NOTE_ID = "rn_hCnswpDDCpNDKfkn"

# (old, new) at CONTENT level (unescaped); byte-level via json.dumps(ensure_ascii=False)
PAIRS = [
    (
        "`E_ k a f t e r end_=1 half (m_ x+m_ y) v_ x+y end_ superscript 2`",
        "$E_{kafter} = \\frac{1}{2} \\left(m_{x} + m_{y}\\right) v_{x + y}^{2}$",
    ),
    (
        "`E_ k a f t e r end_=1 half (2m) v_ x+y end_ superscript 2`",
        "$E_{kafter} = \\frac{1}{2} \\left(2 m\\right) v_{x + y}^{2}$",
    ),
    (
        "$E_ k a f t e r end_=1 \\text{half} ( 2m ) (v_ x / 2)\u00b2=1 \\text{fourth} m v_ x^{2}$",
        "$E_{kafter} = \\frac{1}{2} \\left(2 m\\right) \\left(\\frac{v_{x}}{2}\\right)^{2} = \\frac{1}{4} m v_{x}^{2}$",
    ),
]

def esc(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)[1:-1]

def find_note(obj):
    """yield (container, key, note) for every note dict with noteId == NOTE_ID"""
    if isinstance(obj, list):
        for i, v in enumerate(obj):
            if isinstance(v, dict) and v.get("noteId") == NOTE_ID:
                yield obj, i, v
            else:
                yield from find_note(v)
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from find_note(v)

def diff_strings(a, b, path=""):
    """yield (path, old, new) for every differing string value"""
    if isinstance(a, str) and isinstance(b, str):
        if a != b:
            yield path, a, b
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            yield path, f"<len {len(a)}>", f"<len {len(b)}>"
            return
        for i, (x, y) in enumerate(zip(a, b)):
            yield from diff_strings(x, y, f"{path}[{i}]")
    elif isinstance(a, dict) and isinstance(b, dict):
        if set(a.keys()) != set(b.keys()):
            yield path, "<keys>", "<keys>"
            return
        for k in a:
            yield from diff_strings(a[k], b[k], f"{path}.{k}")
    else:
        if a != b:
            yield path, repr(a), repr(b)

def run(path: str) -> int:
    raw = open(path, "rb").read()
    before = json.loads(raw)

    # G1 + apply at byte level
    new_raw = raw
    for old, new in PAIRS:
        ob, nb = esc(old).encode("utf-8"), esc(new).encode("utf-8")
        c = new_raw.count(ob)
        if c != 1:
            print(f"G1 FAIL: old string count={c} (want 1): {old[:70]}")
            return 1
        new_raw = new_raw.replace(ob, nb, 1)

    # G2
    try:
        after = json.loads(new_raw)
    except Exception as e:
        print(f"G2 FAIL: result not JSON: {e}")
        return 1

    # G3 parse-level diff: all PAIRS live inside ONE bodyMd string of the target
    # note -> exactly 1 differing value, located in the note with NOTE_ID
    diffs = list(diff_strings(before, after))
    if len(diffs) != 1:
        print(f"G3 FAIL: {len(diffs)} diffs (want 1 bodyMd):")
        for p, o, n in diffs:
            print(f"   {p}: {o[:60]!r} -> {n[:60]!r}")
        return 1
    p, old_val, new_val = diffs[0]
    if not isinstance(before, list):
        print("G3 FAIL: top-level structure changed (not a list)")
        return 1
    idx = next((i for i, v in enumerate(before) if isinstance(v, dict) and v.get("noteId") == NOTE_ID), None)
    if idx is None or p != f"[{idx}].bodyMd":
        print(f"G3 FAIL: diff at {p}, want [{idx}].bodyMd of note {NOTE_ID}")
        return 1
    for old, new in PAIRS:
        if old in new_val or new not in new_val:
            print(f"G3 FAIL: new bodyMd missing replacement or still carries old: {old[:60]!r}")
            return 1

    # write
    open(path, "wb").write(new_raw)
    print(f"APPLIED: {len(PAIRS)} replacements in {path} (diff at {p})")
    for i, (old, new) in enumerate(PAIRS, 1):
        print(f"  [{i}] {old[:58]!r}")
        print(f"      -> {new[:80]!r}")

    # G4 idempotency on the written file
    raw2 = open(path, "rb").read()
    n_changes = 0
    for old, _ in PAIRS:
        n_changes += raw2.count(esc(old).encode("utf-8"))
    print(f"G4 idempotency: old strings remaining after write = {n_changes} (want 0)")
    if n_changes != 0:
        return 1
    return 0

if __name__ == "__main__":
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    sys.exit(run(f"{root}/{TARGET}"))
