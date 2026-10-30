#!/usr/bin/env python3
"""run-026 wave-3 planner: ledger-verified residual of the tranche-2 deduped worklist.

Reconciliation of record (this run, pre-execution):
  run025_wave2_worklist.json residualUnits = 142 units / 143 parts
  run025_fixes.py ledger (apply-gated: 67 tuples / 48 writes / 24 changed pids)
    -> FIXES pids 24 + ZERO_FIX normalized 33 = union 40 done pids
    -> 39 worklist units fully covered, 0 partial
    -> TRUE residual = 103 units / 103 parts
  run-025 receipt wave3Continuation claimed 101; the +2 delta is receipt-side
  sub-adjudication counting (the '-lead'/'-problem'/'-fences' variants). Ledger wins;
  delta filed as run-026 disclosure. Triage classification remap on the 103:
  needsPage 99 / zeroByClass 4 (triage.json snapshot was mid-run; all 103 classified).
Outputs:
  scratch/oeq_run026/run026_w3_worklist.json   (the 103-unit worklist of record)
  stdout: per-paper clusters with pages, zeroByClass detail
"""
import json, importlib.util
from collections import defaultdict

REPO = '/home/z/my-project/repos/syllabai-v2'
R25 = f'{REPO}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-025'
SCR = '/home/z/my-project/scratch/oeq_run026'

spec = importlib.util.spec_from_file_location('f', f'{R25}/run025_fixes.py')
f = importlib.util.module_from_spec(spec); spec.loader.exec_module(f)
done = set(pid for (pid, *_r) in f.FIXES)
done |= set(k.replace('-problem', '').replace('-fences', '').replace('-lead', '') for k in f.ZERO_FIX)

w2 = json.load(open(f'{R25}/run025_wave2_worklist.json'))
units = w2['residualUnits']
tri = json.load(open(f'{R25}/run025_triage.json'))
tri_np = {u['unitKey']: u for u in tri['needsPage']}
tri_zc = {u['unitKey']: u for u in tri['zeroByClass']}
pm = json.load(open(f'{REPO}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-024/run024_pagemap.json'))
pmu = {e['unitKey']: e for e in pm['units']}

residual = [u for u in units if not all(m in done for m in u['members'])]
assert len(residual) == 103, f'residual {len(residual)} != 103'
for u in residual:
    t = tri_np.get(u['unitKey'])
    u['triage'] = 'needsPage' if t else 'zeroByClass'
    u['reasons'] = t['reasons'] if t else tri_zc[u['unitKey']].get('candidates', u.get('candidates'))
    p = pmu.get(u['unitKey'], {})
    u['ms_pages'] = p.get('ms_pages', [])
    u['qp_pages'] = p.get('qp_pages', [])

by_paper = defaultdict(list)
for u in residual:
    by_paper[u['paperSlug']].append(u)

out = {
    'lane': 'T-OEQ-MATHSB-SERVE-1',
    'run': 'run-026-tranche2-token-wave3',
    'basis': 'run025_wave2_worklist 142 - run025_fixes ledger covered 39 units = 103 (ledger-verified; receipt said 101, +2 receipt-side sub-adjudication counting, disclosed)',
    'planePin': '1a479c05194e1da7',
    'units': residual,
}
json.dump(out, open(f'{SCR}/run026_w3_worklist.json', 'w'), ensure_ascii=False, indent=1)

np_ = [u for u in residual if u['triage'] == 'needsPage']
zc = [u for u in residual if u['triage'] == 'zeroByClass']
print(f'worklist of record: {len(residual)} units ({len(np_)} needsPage + {len(zc)} zeroByClass)')
print(f'papers: {len(by_paper)}')
npapers_ms = len({u["paperSlug"] for u in residual if u["ms_pages"]})
print(f'papers needing MS pages: {npapers_ms}')
pages_needed = sorted({(u['paperSlug'], pg) for u in np_ for pg in u['ms_pages']})
print(f'distinct (paper, ms_page) pairs: {len(pages_needed)}')
print('\n== zeroByClass units (4) ==')
for u in zc:
    print(f"  {u['unitKey']} members={u['members']}")
    for fld in ('problemMd', 'solutionMd'):
        for c in (u.get('candidates') or {}).get(fld, []):
            print(f"    [{fld}] {c['cls']} tok={c['tok']!r} sct={c.get('sct')} fsw={c.get('fsw')} ctx={c['ctx'][:90]!r}")
print('\n== needsPage per paper (top 20 by units) ==')
pp = defaultdict(int)
for u in np_: pp[u['paperSlug']] += 1
for s, n in sorted(pp.items(), key=lambda x: -x[1])[:20]:
    print(f'  {n:2d} {s}')
