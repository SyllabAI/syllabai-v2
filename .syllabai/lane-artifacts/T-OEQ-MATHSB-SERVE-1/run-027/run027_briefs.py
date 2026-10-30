#!/usr/bin/env python3
"""run-027 unit briefs: compact per-unit adjudication digest from the wave-4 worklist.

Usage: run027_briefs.py <paperSlug> [paperSlug...]   |   --all   |   --zero
Prints per unit: members, partLabel, marks, payloadLens, pages, then per-field
candidate lines: [field] cls tok @at (sct/fsw) ctx...
"""
import json, sys

WL = '/home/z/my-project/scratch/oeq_run027/run027_w4_worklist.json'
wl = json.load(open(WL))
units = wl['units']

sel = []
if '--zero' in sys.argv:
    sel = [u for u in units if u['triage'] == 'zeroByClass']
elif '--all' in sys.argv:
    sel = units
else:
    want = set(a for a in sys.argv[1:] if not a.startswith('-'))
    sel = [u for u in units if u['paperSlug'] in want]

for u in sorted(sel, key=lambda x: (x['paperSlug'], x.get('partLabel') or 0)):
    print(f"## {u['unitKey']}  {u['paperSlug']}  part={u.get('partLabel')} marks={u.get('marks')} "
          f"triage={u['triage']} members={u['members']}")
    print(f"   tags={u.get('memberTags')} lens={u.get('payloadLens')}")
    print(f"   ms_pages={u.get('ms_pages')} qp_pages={u.get('qp_pages')}")
    for fld in ('problemMd', 'solutionMd'):
        for c in (u.get('candidates') or {}).get(fld, []):
            print(f"   [{fld}] {c['cls']} tok={c['tok']!r} @at={c.get('at')} sct={c.get('sct')} "
                  f"fsw={c.get('fsw')} ctx={c['ctx'][:110]!r}")
    if u.get('reasons') and u['triage'] == 'zeroByClass':
        print(f"   reasons={json.dumps(u.get('reasons'), ensure_ascii=False)[:400]}")
    print()
print(f'-- {len(sel)} units --')
