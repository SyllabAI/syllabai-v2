#!/usr/bin/env python3
"""run-025 worksheet builder: per-page adjudication briefs in read_order2 order.

Output:
  run025_worksheet.json   ordered list of page entries:
                          {page, paper, kind, units:[{unitKey, members, partLabel,
                           marks, nFixish, candidates:[{cls,tok,at,sct,fsw,ctx}]}]}
  run025_brief_XX.txt     compact text briefs (grouped, 8 pages per file) for
                          reading alongside the rendered PNGs.
"""
import json, os, re
from collections import defaultdict

SCR = '/home/z/my-project/scratch/oeq_run024'
OUT = '/home/z/my-project/scratch/oeq_run025'

wl = json.load(open(f'{SCR}/run024_worklist.json'))
pm = json.load(open(f'{SCR}/run024_pagemap.json'))
ro2 = json.load(open(f'{SCR}/run024_read_order2.json'))
w2 = json.load(open(f'{OUT}/run025_wave2_worklist.json'))

pm_units = {e['unitKey']: e for e in pm['units']}
residual = w2['residualUnits']
unit_pages = w2['unitPages']

# page -> units
page_units = defaultdict(list)
for u in residual:
    for pg in (unit_pages.get(u['unitKey']) or []):
        page_units[pg].append(u)

order = [p for p in ro2 if p in page_units]
# sanity: pages needed but not in ro2
extra = sorted(set(page_units) - set(ro2))
print(f'pages with residual units: {len(page_units)}  in ro2 order: {len(order)}  extra(not in ro2): {len(extra)}')
if extra:
    print('  extra:', extra[:20])
    order.extend(extra)

def kind_of(pg):
    return 'ms' if pg.startswith('ms-') else 'qp'

worksheet = []
for pg in order:
    units = page_units[pg]
    entries = []
    for u in units:
        cands = []
        for fld in ('problemMd', 'solutionMd'):
            for c in (u.get('candidates') or {}).get(fld, []):
                d = dict(c)
                d['field'] = 'problem' if fld == 'problemMd' else 'solution'
                cands.append(d)
        # order: fixish non-sct first, then sct advisory, then fsw last
        cands.sort(key=lambda c: (c.get('fsw', False), c.get('sct', False)))
        entries.append({
            'unitKey': u['unitKey'], 'members': u['members'], 'partLabel': u.get('partLabel'),
            'marks': u.get('marks'), 'nFixish': u.get('nFixish', 0), 'nSct': u.get('nSct', 0),
            'candidates': cands,
        })
    entries.sort(key=lambda e: -e['nFixish'])
    worksheet.append({'page': pg, 'units': entries})

json.dump(worksheet, open(f'{OUT}/run025_worksheet.json', 'w'), ensure_ascii=False, indent=1)

# briefs
os.makedirs(f'{OUT}/briefs', exist_ok=True)
GROUP = 6
ngroups = (len(worksheet) + GROUP - 1) // GROUP
for gi in range(ngroups):
    chunk = worksheet[gi*GROUP:(gi+1)*GROUP]
    lines = [f'=== BRIEF GROUP {gi+1}/{ngroups} ({len(chunk)} pages) ===']
    for ent in chunk:
        pg = ent['page']
        lines.append(f'\n########## PAGE {pg} ##########')
        for e in ent['units']:
            mem = ', '.join(m.replace('offp_', '') for m in e['members'])
            lines.append(f"-- unit {e['unitKey'][:18]}.. parts[{mem}] q{e['partLabel']} ({e['marks']}m) fixish={e['nFixish']} sct={e['nSct']}")
            for i, c in enumerate(e['candidates']):
                flags = ('SCT' if c.get('sct') else '') + ('+FSW' if c.get('fsw') else '')
                lines.append(f"   [{i}] {c['cls']}/{c['field']} tok={c['tok']!r} {('['+flags+']') if flags else ''}")
                lines.append(f"       ctx: {c['ctx'][:150]!r}")
    open(f'{OUT}/briefs/run025_brief_{gi+1:02d}.txt', 'w').write('\n'.join(lines))

print(f'WROTE run025_worksheet.json ({len(worksheet)} pages) + {ngroups} brief files')
unit_total = sum(len(p['units']) for p in worksheet)
print(f'total unit-page assignments: {unit_total}')
