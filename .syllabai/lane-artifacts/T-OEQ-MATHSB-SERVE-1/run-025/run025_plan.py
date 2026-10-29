#!/usr/bin/env python3
"""run-025 wave-2 planner: residual 142 units of the tranche-2 deduped worklist.

Inputs of record (run-024 artifacts, all alive):
  run024_worklist.json   149 units / 153 filed parts (dedup law)
  run024_pagemap.json    unit -> (ms_pages, qp_pages); 207 pages, 1 unfound
  run024_read_order2.json wave-2 page continuation map
  pages/                 212 rendered PNGs (150dpi)
  pdf/                   115 cached QP/MS PDFs

Wave-1 adjudicated (run-024 receipt): 7 units / 10 parts —
  22-a, 7-a, 7-b, 10-b, 26-twin(2), 28-twin(2) fixed; 16-twin(2) zero-fix.
Residual = 149 - 7 = 142 units.
"""
import json, os, sys

SCR = '/home/z/my-project/scratch/oeq_run024'
OUT = '/home/z/my-project/scratch/oeq_run025'
os.makedirs(OUT, exist_ok=True)

wl = json.load(open(f'{SCR}/run024_worklist.json'))
pm = json.load(open(f'{SCR}/run024_pagemap.json'))
ro2 = json.load(open(f'{SCR}/run024_read_order2.json'))

units = wl['units']
print(f'worklist units: {len(units)}')

# ---- wave-1 adjudicated members (part labels from pagemap use paper-slug form) ----
W1_MEMBER_SUFFIXES = [
    'official-4mb1-01r-2022-06 22-a',
    'official-4mb1-02-2024-06 7-a',
    'official-4mb1-02-2024-06 7-b',
    'official-4mb1-02-2021-06 10-b',
    'official-4mb1-01-2020-06 26', 'official-4mb1-01-2020-11 26',
    'official-4mb1-01-2020-06 28', 'official-4mb1-01-2020-11 28',
    'official-4mb1-01-2020-06 16', 'official-4mb1-01-2020-11 16',
]

def unit_members(u):
    return u.get('members', [])

pm_units = {e['unitKey']: e for e in pm['units']}
print(f'pagemap units: {len(pm_units)}  unfound: {pm["unfound"]}')

def w1_match(u):
    tags = u.get('memberTags', []) + unit_members(u)
    for suf in W1_MEMBER_SUFFIXES:
        stem = suf.split(' ')[0]           # e.g. official-4mb1-01r-2022-06
        lab = suf.split(' ')[1]            # e.g. 22-a
        for t in tags:
            if stem in t and t.rstrip().endswith(lab):
                return True
    return False

w1_units = [u for u in units if w1_match(u)]
residual = [u for u in units if not w1_match(u)]
print(f'wave-1 adjudicated units matched: {len(w1_units)}')
print(f'residual units: {len(residual)}')
w1_parts = sum(len(u['members']) for u in w1_units)
res_parts = sum(len(u['members']) for u in residual)
print(f'wave-1 parts: {w1_parts}   residual parts: {res_parts}')

# unfound unit?
unfound_key = pm['unfound'][0] if pm['unfound'] else None
unf_in_residual = [u for u in residual if u['unitKey'] == unfound_key]
print(f'unfound unit in residual: {len(unf_in_residual)}')

# ---- page coverage ----
have_pages = set(x[:-4] for x in os.listdir(f'{SCR}/pages') if x.endswith('.png'))
need_pages = set()
unit_pages = {}
for u in residual:
    e = pm_units.get(u['unitKey'])
    if not e:
        unit_pages[u['unitKey']] = None
        continue
    names = []
    for pg in e.get('ms_pages') or []:
        names.append(f"ms-{e['series']}-{e['paper']}-p{pg:02d}")
    for pg in e.get('qp_pages') or []:
        names.append(f"qp-{e['series']}-{e['paper']}-p{pg:02d}")
    unit_pages[u['unitKey']] = names
    need_pages.update(names)

missing = sorted(p for p in need_pages if p not in have_pages)
print(f'pages needed (superset): {len(need_pages)}  cached: {len(need_pages)-len(missing)}  missing: {len(missing)}')
if missing:
    print('  missing sample:', missing[:12])

ro2_set = set(ro2)
print(f'read_order2 pages: {len(ro2)}  in need_pages: {len(ro2_set & need_pages)}')

# ---- paper batching for wave-2 ----
from collections import defaultdict
paper_units = defaultdict(list)
for u in residual:
    paper_units[u['paperSlug']].append(u)
print(f'residual papers: {len(paper_units)}')

tot_c = sum(len((u.get('candidates') or {}).get('problemMd', [])) +
            len((u.get('candidates') or {}).get('solutionMd', [])) for u in residual)
tot_fixish = sum(u.get('nFixish', 0) for u in residual)
tot_sct = sum(u.get('nSct', 0) for u in residual)
print(f'residual candidates total: {tot_c}  fixish: {tot_fixish}  sct-advisory: {tot_sct}')

sizes = defaultdict(int)
for u in residual:
    sizes[u.get('nFixish', 0)] += 1
print('nFixish distribution:', dict(sorted(sizes.items())))

json.dump({
    'residualUnits': residual,
    'unitPages': unit_pages,
    'missingPages': missing,
    'residualParts': res_parts,
    'stats': {'units': len(residual), 'parts': res_parts, 'candidates': tot_c,
              'fixish': tot_fixish, 'sct': tot_sct, 'papers': len(paper_units)},
}, open(f'{OUT}/run025_wave2_worklist.json', 'w'), ensure_ascii=False, indent=1)
print(f'WROTE {OUT}/run025_wave2_worklist.json')
