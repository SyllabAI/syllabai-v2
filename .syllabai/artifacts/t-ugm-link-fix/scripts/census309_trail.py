#!/usr/bin/env python3
"""OPTIONAL-2 lane, step 1d: truncated-URL (trailURL) census, uncapped, per file.

Walks ALL JSON string values in apps/hub/content/*/*.json counting URLs that
END at a hyphen (split point) — the run-003 'split-URL' signature.
Compares per-bundle totals against the run-003 of-record top-5 counts.
"""
import json, re
from pathlib import Path

ROOT = Path("/home/z/my-project/ws/syllabai-v2")
CONTENT = ROOT / "apps/hub/content"

# URL ending at a hyphen: url-chars then hyphen(s), next char is NOT a url-char
RE_TRAIL = re.compile(r"""https?://[^\s"'<>\\()\[\]{}]*-+(?![^\s"'<>\\()\[\]{}])""")   # noqa

def walk_strings(o):
    if isinstance(o, str):
        yield o
    elif isinstance(o, list):
        for x in o:
            yield from walk_strings(x)
    elif isinstance(o, dict):
        for v in o.values():
            yield from walk_strings(v)

OF_RECORD = {"cie-igcse-business-25": 96, "cie-igcse-business-23": 94,
             "cie-a-level-business-23": 43, "igcse-economics-17": 14,
             "cie-igcse-english-language-25": 12}

rows = []
for bundle_dir in sorted(CONTENT.iterdir()):
    if not bundle_dir.is_dir():
        continue
    per_file = {}
    samples = []
    for jf in sorted(bundle_dir.glob("*.json")):
        try:
            data = json.loads(jf.read_text(encoding="utf-8"))
        except Exception:
            continue
        k = 0
        for s in walk_strings(data):
            for m in RE_TRAIL.finditer(s):
                k += 1
                if len(samples) < 3:
                    samples.append((jf.name, s[max(0, m.start()-50):m.end()+40]))
        if k:
            per_file[jf.name] = k
    tot = sum(per_file.values())
    if tot:
        rows.append((bundle_dir.name, tot, per_file, samples))

rows.sort(key=lambda r: -r[1])
print(f"{'bundle':46} {'trailURL':>8}  files")
for name, t, pf, _ in rows:
    detail = ", ".join(f"{fn}:{k}" for fn, k in sorted(pf.items(), key=lambda x: -x[1])[:5])
    print(f"{name:46} {t:>8}  {detail}")
print(f"{'TOTAL (' + str(len(rows)) + ' bundles)':46} {sum(r[1] for r in rows):>8}")

print("\n=== vs run-003 of-record top-5 ===")
mymap = {b: t for b, t, _, _ in rows}
for slug, ref in OF_RECORD.items():
    print(f"  {slug:40} of-record {ref:>3}  current {mymap.get(slug, 0):>3}  {'MATCH' if mymap.get(slug, 0) == ref else 'diff'}")

print("\n=== samples ===")
for name, t, pf, samples in rows[:5]:
    print(f"-- {name} ({t})")
    for fn, ctx in samples[:2]:
        print(f"   [{fn}] {ctx!r}")
