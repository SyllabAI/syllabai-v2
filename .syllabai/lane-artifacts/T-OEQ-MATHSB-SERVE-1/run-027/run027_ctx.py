#!/usr/bin/env python3
"""run-027 precision excerpt tool (run-026 ctx clone): dump RAW field bytes around probes.
Usage: run027_ctx.py <pid> <solution|mirror|problem|solutionMd> <probe> [probe...]
"""
import json, sys

REPO = '/home/z/my-project/repos/syllabai-v2'
PLANE = f'{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json'

data = json.load(open(PLANE))
pid, *rest = sys.argv[1:]
field = rest[0]
probes = rest[1:]

part = None
for s in data:
    for q in s.get('questions') or []:
        for p in q.get('parts') or []:
            if p['id'] == pid:
                part = p
if part is None:
    sys.exit(f'pid not found: {pid}')

if field == 'problem':
    txt = part.get('problemMd') or ''
elif field == 'mirror':
    txt = (part.get('markPoints') or [{}])[0].get('textMd') or ''
else:
    txt = part.get('solutionMd') or ''

print(f'{pid} field={field} len={len(txt)}')
for probe in probes:
    n = txt.count(probe)
    print(f'\nPROBE {probe!r} count={n}')
    at = 0
    for i in range(n):
        at = txt.find(probe, at)
        lo, hi = max(0, at - 110), min(len(txt), at + len(probe) + 110)
        print(f'  @{at}: ...{txt[lo:at]!r} <<{probe}>> {txt[at+len(probe):hi]!r}')
        at += 1
