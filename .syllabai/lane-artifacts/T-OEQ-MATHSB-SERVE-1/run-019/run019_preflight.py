#!/usr/bin/env python3
r"""run-019 pre-flight: old-string count verification + new math span extraction.
FAIL-CLOSED: any count mismatch -> exit 2 with the offending fix."""
import json, re, sys
sys.path.insert(0, '/home/z/my-project/scripts')
from run019_fixes import FIXES

PLANE = '/home/z/my-project/repos/syllabai-v2/apps/hub/content/igcse-maths-b-16/official-papers.json'
data = json.load(open(PLANE))
index = {}
for s in data:
    for q in s['questions']:
        for p in q['parts']:
            index[p['id']] = p

def field_text(p, which):
    if which == 'problem':
        return p.get('problemMd', '')
    return p.get('solutionMd', '')

spans = []
errors = []
for i, (pid, which, old, new, exp, ev, note) in enumerate(FIXES):
    if pid not in index:
        errors.append(f'fix#{i} pid missing: {pid}')
        continue
    p = index[pid]
    txt = field_text(p, which)
    cnt = txt.count(old)
    if cnt != exp:
        errors.append(f'fix#{i} {pid} {which}: expected {exp} hit(s), found {cnt}\n  old={old!r}')
    # dollar parity of the NEW field projection (apply all fixes for this field cumulatively)
    # extract math spans from new
    for m in re.finditer(r'\$[^$]+\$', new):
        spans.append({'fix': i, 'pid': pid, 'span': m.group(0)[1:-1]})

# cumulative dollar parity per edited field (simulated)
from collections import defaultdict
proj = defaultdict(lambda: None)
for (pid, which, old, new, exp, ev, note) in FIXES:
    key = (pid, which)
    if proj[key] is None:
        proj[key] = field_text(index[pid], which)
    proj[key] = proj[key].replace(old, new)
for (pid, which), txt in proj.items():
    if txt.count('$') % 2 != 0:
        errors.append(f'dollar parity FAIL: {pid} {which} raw-$ count odd ({txt.count("$")})')
    # post-projection bare-caret check (outside math)
    stripped = re.sub(r'\$[^$]*\$', ' ', txt)
    stripped = re.sub(r'\*\*[A-Z]\d+\*\*|\b4MB1\b', ' ', stripped)
    left = [m.start() for m in re.finditer(r'\^', stripped)]
    if left:
        errors.append(f'bare caret still present after projection: {pid} {which} at {left}')

# mirror simulation: solution edits must leave markPoints[0] == solutionMd
for (pid, which, *_ ) in FIXES:
    if which != 'solution':
        continue
    p = index[pid]
    mp0 = (p.get('markPoints') or [{}])[0]
    if mp0.get('textMd') != p.get('solutionMd', ''):
        errors.append(f'mirror PRE-state broken: {pid}')

json.dump(spans, open('/home/z/my-project/scripts/run019_spans.json', 'w'), ensure_ascii=False, indent=1)

if errors:
    print(f'PREFLIGHT FAIL ({len(errors)} errors):')
    for e in errors[:20]:
        print(' -', e)
    sys.exit(2)
print(f'PREFLIGHT OK: {len(FIXES)} fixes verified, {len(spans)} new math spans extracted, '
      f'dollar-parity + post-projection caret-zero + mirror PRE all green')
