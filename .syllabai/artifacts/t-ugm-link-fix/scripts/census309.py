#!/usr/bin/env python3
"""OPTIONAL-2 lane, step 1: re-run the 309-suspect citation census on current HEAD.

Reconstructs the run-003 external_citation_census detector over apps/hub/content/*/notes.json.
Classes of record (run-003 receipt):
  A. split-URL markdown citations: markdown link whose URL ends with a hyphen,
     remainder orphaned as loose text  ->  ](https://...-
  B. scheme typos: 'ttps://' / 'ttp://'  (not preceded by 'h')
  C. U+2010 hyphens in citation text
Output: per-file counts (all three classes), total, plus evidence samples.
"""
import json, re, sys
from pathlib import Path

ROOT = Path("/home/z/my-project/ws/syllabai-v2")
CONTENT = ROOT / "apps/hub/content"

RE_SPLIT = re.compile(r"\]\(https?://[^)\s]+-\)")      # markdown URL ending in hyphen
RE_TYPO = re.compile(r"(?<![hH])ttps?://")             # scheme typo, not part of https/http
RE_U2010 = re.compile("\u2010")                        # unicode hyphen

rows = []
for nf in sorted(CONTENT.glob("*/notes.json")):
    bundle = nf.parent.name
    notes = json.loads(nf.read_text(encoding="utf-8"))
    a = b = c = 0
    samples = []
    for n in notes:
        body = n.get("bodyMd") or ""
        hits_a = RE_SPLIT.findall(body)
        hits_b = RE_TYPO.findall(body)
        hits_c = RE_U2010.findall(body)
        a += len(hits_a); b += len(hits_b); c += len(hits_c)
        for h in hits_a[:2]:
            i = body.find(h)
            samples.append((n["noteId"], "A-split", body[max(0, i-40):i+len(h)+60]))
        for m in RE_TYPO.finditer(body):
            samples.append((n["noteId"], "B-typo", body[max(0, m.start()-40):m.end()+60]))
            break
        for m in RE_U2010.finditer(body):
            samples.append((n["noteId"], "C-u2010", body[max(0, m.start()-40):m.end()+60]))
            break
    total = a + b + c
    if total:
        rows.append((bundle, a, b, c, total, samples))

rows.sort(key=lambda r: -r[4])
print(f"{'bundle':38} {'A-split':>7} {'B-typo':>7} {'C-u2010':>8} {'total':>6}")
tot_a = tot_b = tot_c = 0
for bundle, a, b, c, t, _ in rows:
    print(f"{bundle:38} {a:>7} {b:>7} {c:>8} {t:>6}")
    tot_a += a; tot_b += b; tot_c += c
print(f"{'TOTAL (' + str(len(rows)) + ' files)':38} {tot_a:>7} {tot_b:>7} {tot_c:>8} {tot_a+tot_b+tot_c:>6}")

print("\n=== evidence samples (first per class overall) ===")
seen = set()
for bundle, a, b, c, t, samples in rows:
    for nid, cls, ctx in samples:
        if cls in seen:
            continue
        seen.add(cls)
        print(f"[{cls}] {bundle}/{nid}: {ctx!r}")
    if len(seen) == 3:
        break

# metadata companion check: sourceUrl fields ending in a hyphen (attribution metadata, disclosure only)
print("\n=== sourceUrl trailing-hyphen counts (metadata, disclosure only) ===")
meta_rows = []
for nf in sorted(CONTENT.glob("*/notes.json")):
    bundle = nf.parent.name
    notes = json.loads(nf.read_text(encoding="utf-8"))
    k = sum(1 for n in notes if (n.get("sourceUrl") or "").rstrip().endswith("-"))
    if k:
        meta_rows.append((bundle, k))
for bundle, k in sorted(meta_rows, key=lambda r: -r[1]):
    print(f"{bundle:38} {k:>4}")
print(f"metadata total across {len(meta_rows)} bundles: {sum(k for _, k in meta_rows)}")
