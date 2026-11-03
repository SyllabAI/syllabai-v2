#!/usr/bin/env python3
"""run-025 triage classifier: split residual units into PAGE-READ vs ZERO-BY-CLASS.

NEEDS_PAGE if any candidate matches:
  - cls U1/U1D without FSW and tok not a mark-code run (M0/M1/A1/B1/B0...)
  - cls G1 glued letter+digit (e.g. 'h3','r2') where not trig SCT
  - tok is glued digit-sup shape (r'\d{2,4}' ending in 2 or 3 in math ctx)
  - tok G2/G3 whose ctx (window around token) contains '=' or '−'/'–' (math chain)
  - ctx contains 'Cosine rule' / 'Sine rule' (formula box)
ZERO_BY_CLASS otherwise (all cands prose/labels/trig-SCT/FSW/marks-bleed).
"""
import json, re, sys
from collections import defaultdict

OUT = '/home/z/my-project/scratch/oeq_run025'
w2 = json.load(open(f'{OUT}/run025_wave2_worklist.json'))

DONE = set()  # unitKeys already adjudicated in fixes (papers 01-10)
import importlib.util
spec = importlib.util.spec_from_file_location('f', f'{OUT}/run025_fixes.py')
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)
# mark done units via member pids appearing in FIXES or ZERO_FIX
done_pids = set()
for (pid, *_r) in f.FIXES:
    done_pids.add(pid)
for k in f.ZERO_FIX:
    done_pids.add(k.replace('-problem', '').replace('-fences', ''))

wl = json.load(open('/home/z/my-project/scratch/oeq_run024/run024_worklist.json'))
pid_to_key = {}
for u in wl['units']:
    for m in u['members']:
        pid_to_key[m] = u['unitKey']

MARKCODE = re.compile(r'^(M|A|B)[0-3]((M|A|B)[0-3])*$')
TRIG = re.compile(r'(sin|cos|tan)', re.I)
MARKSWORDS = re.compile(r'(significant|decimal|Figure|diagram|marks?|Accept|allow|Allow|award|Dep|dep|reference|awrt)')

def ctx_window(c):
    at = c.get('at', 0)
    tok = c['tok']
    return c['ctx']

def needs_page(u):
    reasons = []
    for fld in ('problemMd', 'solutionMd'):
        for c in (u.get('candidates') or {}).get(fld, []):
            tok = c['tok']; cls = c['cls']; sct = c.get('sct', False); fsw = c.get('fsw', False)
            ctx = c['ctx']
            if fsw:
                continue
            if MARKCODE.match(tok):
                continue
            if cls in ('U1', 'U1D'):
                # uppercase letter + digits: could be flattened sup (BD2) or label
                reasons.append((fld, tok, cls, 'U-class'))
                continue
            if cls == 'G1' and not sct:
                # glued lowercase+digits: 'h3','r2' plausible sup; 'sin'-fragments excluded by SCT usually
                if not TRIG.search(tok):
                    reasons.append((fld, tok, cls, 'G1-glued'))
                    continue
            if cls in ('G2', 'G3'):
                # math chain? window contains = or minus near token
                w = ctx
                if re.search(r'[=−–]|\d\s*[−–]\s*\d', w) and not MARKSWORDS.search(w.split(tok)[0][-40:] if tok in w else w):
                    reasons.append((fld, tok, cls, 'G-math'))
                    continue
                if not sct and not MARKSWORDS.search(w):
                    reasons.append((fld, tok, cls, 'G-nonsct-nomarksword'))
                    continue
            if 'Cosine rule' in ctx or 'Sine rule' in ctx:
                reasons.append((fld, tok, cls, 'formula-box'))
    return reasons

residual = w2['residualUnits']
page_units, zero_units = [], []
for u in residual:
    key = u['unitKey']
    members = u['members']
    if all(m in done_pids for m in members):
        continue
    r = needs_page(u)
    if r:
        page_units.append((u, r))
    else:
        zero_units.append(u)

print(f'already done: units covering pids {len(done_pids)}')
print(f'NEEDS_PAGE units: {len(page_units)}')
print(f'ZERO_BY_CLASS units: {len(zero_units)}')
json.dump({
    'needsPage': [{'unitKey': u['unitKey'], 'members': u['members'], 'paperSlug': u['paperSlug'],
                   'partLabel': u.get('partLabel'), 'marks': u.get('marks'), 'reasons': [
                       {'field': fl, 'tok': t, 'cls': cl, 'why': wh} for (fl, t, cl, wh) in rr],
                   'candidates': u.get('candidates')} for u, rr in page_units],
    'zeroByClass': [{'unitKey': u['unitKey'], 'members': u['members'], 'paperSlug': u['paperSlug'],
                     'partLabel': u.get('partLabel'), 'marks': u.get('marks'),
                     'candidates': u.get('candidates')} for u in zero_units],
}, open(f'{OUT}/run025_triage.json', 'w'), ensure_ascii=False, indent=1)
print('WROTE run025_triage.json')
# per-paper needs-page counts
pp = defaultdict(int)
for u, r in page_units:
    pp[u['paperSlug']] += 1
print('papers with page-work:', len(pp))
for slug, n in sorted(pp.items(), key=lambda x: -x[1])[:25]:
    print(f'  {n} {slug}')
