#!/usr/bin/env python3
"""OPTIONAL-2 lane, step 1c: precise orphaned-citation census (detector v2).

Primary class: orphaned markdown closers `](url)` NOT preceded by a `[text`
opener on the same line -> renders as loose text on the live page.
Method: per bodyMd line, remove ALL well-formed links/images
(!?[...](url)), then count remaining `](http...)` occurrences.
Companion metadata class: sourceUrl fields truncated at a hyphen.
Output compared against run-003 of-record: business-25 96 / business-23 94 /
a-level-business-23 43 / economics-17 14 / english-language-25 12.
"""
import json, re
from pathlib import Path

ROOT = Path("/home/z/my-project/ws/syllabai-v2")
CONTENT = ROOT / "apps/hub/content"

# well-formed: optional !, [text no brackets no newline], (url no space no paren)
RE_WELLFORMED = re.compile(r"!?\[[^\]\n]*\]\([^)\s]+\)")
RE_ORPHAN = re.compile(r"\]\(https?://[^)\s]{1,300}\)")

rows = []
for nf in sorted(CONTENT.glob("*/notes.json")):
    bundle = nf.parent.name
    notes = json.loads(nf.read_text(encoding="utf-8"))
    orphans = 0
    per_note = {}
    samples = []
    for n in notes:
        b = n.get("bodyMd") or ""
        c = 0
        for line in b.split("\n"):
            stripped = RE_WELLFORMED.sub("", line)
            hits = RE_ORPHAN.findall(stripped)
            c += len(hits)
            for h in hits[:1]:
                if len(samples) < 6:
                    samples.append((n["noteId"], line.strip()[:180]))
        if c:
            per_note[n["noteId"]] = c
            orphans += c
    if orphans:
        rows.append((bundle, orphans, per_note, samples))

rows.sort(key=lambda r: -r[1])
print(f"{'bundle':44} {'orphans':>7}  notes-with-defects")
for bundle, t, pn, _ in rows:
    print(f"{bundle:44} {t:>7}  {len(pn)}")
print(f"{'TOTAL (' + str(len(rows)) + ' bundles)':44} {sum(r[1] for r in rows):>7}")

print("\n=== vs run-003 of-record top-5 ===")
of_record = {"cie-igcse-business-25": 96, "cie-igcse-business-23": 94,
             "cie-a-level-business-23": 43, "igcse-economics-17": 14,
             "cie-igcse-english-language-25": 12}
for slug, ref in of_record.items():
    mine = dict((b, t) for b, t, _, _ in rows).get(slug, 0)
    print(f"  {slug:38} of-record {ref:>3}  mine {mine:>3}  {'MATCH' if mine == ref else 'diff'}")

print("\n=== evidence samples ===")
for bundle, t, pn, samples in rows[:4]:
    print(f"-- {bundle} ({t})")
    for nid, line in samples[:2]:
        print(f"   [{nid}] {line!r}")
