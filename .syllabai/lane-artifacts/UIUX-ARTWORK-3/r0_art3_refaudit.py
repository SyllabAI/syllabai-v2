#!/usr/bin/env python3
"""UIUX-ARTWORK-3 residual audit: for the 3 uncovered sets, list every question whose
problemMd matches the massrun REF diagram law and has no img embed — with flattened
text preview. This is the accounting of record for commit/skip decisions."""
import json, re

d = json.load(open('/home/z/my-project/scripts/artwork-scale/bundle_at_fetchhead.json'))
SETS = ['2023-01-4mb1-01--exam-questions', '2021-01-4mb1-02--exam-questions', '2021-01-4mb1-02r--exam-questions']

REF = re.compile(r"\b(diagram|grid|graph|shown below|shown in the|the figure|net of|scale drawing|centimetre squares|isometric|protractor|compasses|triangles? \w+ (?:and|to)|number line|pie chart|tree diagram|Venn)\b", re.I)
IMG = re.compile(r'!\[[^\]]*\]\([^)]+\)')

for slug in SETS:
    s = next(x for x in d if x['slug'] == slug)
    print(f"\n########## {slug} ##########")
    for qi, q in enumerate(s['questions']):
        parts = q.get('parts', [])
        if not parts:
            continue
        merged = '\n'.join((p.get('problemMd') or '') for p in parts)
        if IMG.search(merged):
            continue
        if REF.search(merged):
            # infer question number: use label of first part if present
            lbl = parts[0].get('label', '')
            marks = [p.get('marks') for p in parts]
            flat = ' | '.join((p.get('problemMd') or '').replace('\n', ' ')[:110] for p in parts[:2])
            print(f"  q(idx{qi} lbl={lbl!r} marks={marks}) REF-HIT:")
            print(f"     {flat[:340]}")
