#!/usr/bin/env python3
"""run-027 wave-4 planner: residual of the run-026 wave-3 adjudication (ledger-first).

Reconciliation of record (this run, pre-execution):
  run026_w3_worklist.json units = 103 (the wave-3 worklist of record)
  run026_fixes.py ledger (apply-gated, landed 106b1df2):
    done pids = FIXES pids ∪ ZERO_FIX keys normalized (-problem/-fences/-lead stripped)
    -> fully covered units (ALL members done) = X ; partially covered = Y (disclose)
    -> TRUE residual = 103 - X ; receipt wave4Continuation.residualUnits = 69
  cross-check: receipt wave3Execution.unitList first-tokens == ledger done pids
Outputs:
  scratch/oeq_run027/run027_w4_worklist.json  (the 69-unit wave-4 worklist of record)
  stdout: per-paper clusters, triage split, page needs vs run-026 page cache
"""
import json, importlib.util, os, re
from collections import defaultdict, Counter

REPO = '/home/z/my-project/repos/syllabai-v2'
R26 = f'{REPO}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-026'
REC = f'{REPO}/.syllabai/receipts/T-OEQ-MATHSB-SERVE-1/run-026-tranche2-token-wave3.json'
SCR = '/home/z/my-project/scratch/oeq_run027'
os.makedirs(SCR, exist_ok=True)

spec = importlib.util.spec_from_file_location('f26', f'{R26}/run026_fixes.py')
f26 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f26)
done = set(pid for (pid, *_r) in f26.FIXES)
done |= set(k.replace('-problem', '').replace('-fences', '').replace('-lead', '')
            for k in f26.ZERO_FIX)

wl = json.load(open(f'{R26}/run026_w3_worklist.json'))
units = wl['units']
assert len(units) == 103, f'w3 worklist {len(units)} != 103'

covered = [u for u in units if all(m in done for m in u['members'])]
partial = [u for u in units if any(m in done for m in u['members'])
           and not all(m in done for m in u['members'])]
residual = [u for u in units if not all(m in done for m in u['members'])]

rec = json.load(open(REC))
claimed = rec['wave4Continuation']['residualUnits']
ul = rec['wave3Execution']['unitList']
ul_keys = [s.split(' ')[0] for s in ul]
dup = [k for k, n in Counter(ul_keys).items() if n > 1]
extras = sorted(set(ul_keys) - done)
only_ledger = sorted(done - set(ul_keys))

print(f'done pids (ledger): {len(done)}  (FIXES {len(set(p for (p, *_r) in f26.FIXES))}'
      f' + ZERO_FIX normalized {len(f26.ZERO_FIX)} keys)')
print(f'covered units: {len(covered)}  partial: {len(partial)}  residual: {len(residual)}')
print(f'receipt unitList keys: {len(ul_keys)} unique={len(set(ul_keys))} dup={dup}')
print(f'ul-only (not in ledger): {extras}')
print(f'ledger-only (not in unitList): {only_ledger}')
if partial:
    print('PARTIAL-COVERAGE UNITS (disclose):')
    for u in partial:
        print('  ', u['unitKey'], u['members'], 'done:', [m for m in u['members'] if m in done])

zc_all = [u for u in units if u['triage'] == 'zeroByClass']
zc_members = sorted(m for u in zc_all for m in u['members'])
fix_pids = set(p for (p, *_r) in f26.FIXES)
print(f'\nzeroByClass units in w3 worklist: {len(zc_all)} members={zc_members}')
print(f'zeroByClass members all in residual (not ledger-covered): '
      f'{all(m in {x for u in residual for x in u["members"]} for m in zc_members)}')
print(f'unitList == FIXES pids: {set(ul_keys) == fix_pids}')
# receipt arithmetic of record: 34 "adjudicated" = 30 ledger-covered units + 4 zeroByClass
# units counted as adjudicated-by-triage; unitList(20) = FIXES changed pids; the 10
# ledger-only pids = zero-fix-only pids (44 ZERO_FIX variant-key discharges over them);
# receipt note + remainingPapers admit the 4 zeroByClass are OPEN wave-4 work -> true
# wave-4 scope = 73 = receipt 69 + 4 (ledger-first, receiptDelta +4 disclosed).
closure = (set(ul_keys) == fix_pids and set(ul_keys) <= done and not (set(only_ledger) & fix_pids)
           and all(m in {x for u in residual for x in u['members']} for m in zc_members)
           and len(residual) == claimed + len(zc_all))
print(f'CLOSURE: unitList==FIXES-pids, zeroByClass in residual, '
      f'residual {len(residual)} == receipt {claimed} + {len(zc_all)}: {closure}')
assert not dup, f'dup keys in unitList: {dup}'
assert len(partial) == 0, 'partial coverage — investigate before proceeding'
assert closure, ('reconciliation does not close — investigate before building the worklist')
assert len(residual) == claimed + len(zc_all) == 73, 'residual arithmetic broke'

out = {
    'lane': 'T-OEQ-MATHSB-SERVE-1',
    'run': 'run-027-tranche2-token-wave4',
    'basis': ('run026_w3_worklist 103 - run026_fixes ledger fully-covered units '
              f'{len(covered)} = {len(residual)} units of record. RECEIPT-DELTA DISCLOSED: receipt '
              f'wave4Continuation claimed {claimed}, computed as 103 - "34 adjudicated" where 34 = '
              f'{len(covered)} ledger-covered units + {len(zc_all)} zeroByClass units counted as '
              'adjudicated-by-triage (receipt unitList 20 = the FIXES changed pids; 10 zero-fix-only '
              'pids carry the 44 ZERO_FIX discharges). The receipt own note + remainingPapers list '
              'those 4 zeroByClass units as OPEN wave-4 work ("NOT yet discharged... cheapest wave-4 '
              f'openers" + "zeroByClass verification pages"). Ledger-first law (run-026 101-vs-103 '
              f'precedent) -> true wave-4 = {len(residual)} = {claimed} + 4. Ledger wins, delta filed.'),
    'planePin': '37fc0a18720d82ff',
    'priorArtifacts': 'run-026 receipt + run026_w3_worklist.json + run026_fixes.py (landed 106b1df2)',
    'receiptDelta': {'claimed': claimed, 'ledgerDerived': len(residual), 'delta': len(residual) - claimed,
                     'deltaUnits': [u['unitKey'] for u in zc_all], 'law': 'ledger-first, disclosed'},
    'units': residual,
}
json.dump(out, open(f'{SCR}/run027_w4_worklist.json', 'w'), ensure_ascii=False, indent=1)

np_ = [u for u in residual if u['triage'] == 'needsPage']
zc = [u for u in residual if u['triage'] == 'zeroByClass']
by_paper = Counter(u['paperSlug'] for u in residual)
pages = sorted({(u['paperSlug'], pg) for u in np_ for pg in (u.get('ms_pages') or [])})
qpages = sorted({(u['paperSlug'], pg) for u in np_ for pg in (u.get('qp_pages') or [])})

import glob
cache = set(os.path.basename(p) for p in glob.glob('/home/z/my-project/scratch/oeq_run026/pages/*.png'))
def need_pages(pl, kind):
    miss = []
    for slug, pg in pl:
        m = re.match(r'official-4mb1-([0-9]+r?)-(\d{4}-\d{2})$', slug)
        f = f'{kind}-{m.group(2)}-4mb1-{m.group(1).lower()}-p{pg:02d}-{pg}.png'
        if f not in cache:
            miss.append(f)
    return miss

print(f'\nworklist of record -> {SCR}/run027_w4_worklist.json')
print(f'wave-4 residual: {len(residual)} units ({len(np_)} needsPage + {len(zc)} zeroByClass)')
print(f'papers: {len(by_paper)}')
for s, n in sorted(by_paper.items(), key=lambda x: (-x[1], x[0])):
    print(f'  {n} {s}')
print(f'\ndistinct (paper, ms_page) pairs: {len(pages)}; (paper, qp_page): {len(qpages)}')
ms_miss = need_pages(pages, 'ms')
qp_miss = need_pages(qpages, 'qp')
print(f'ms pages missing from run-026 cache: {len(ms_miss)}')
for f in ms_miss: print('   ', f)
print(f'qp pages missing from run-026 cache: {len(qp_miss)}')
for f in qp_miss: print('   ', f)
print('\n== zeroByClass units (wave-4 openers) ==')
for u in zc:
    print(f"  {u['unitKey']} members={u['members']} ms={u.get('ms_pages')} qp={u.get('qp_pages')}")
    for fld in ('problemMd', 'solutionMd'):
        for c in (u.get('candidates') or {}).get(fld, []):
            print(f"    [{fld}] {c['cls']} tok={c['tok']!r} sct={c.get('sct')} fsw={c.get('fsw')} ctx={c['ctx'][:80]!r}")
