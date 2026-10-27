#!/usr/bin/env python3
"""run-012 gate battery: structure/marks law, KaTeX $-segments, unbalanced-$,
furniture census, residual defect census, asset sanity."""
import json, re, sys

REPO = '/home/z/my-project/repos/syllabai-v2'
BASE = f'{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json'
d = json.load(open(BASE))
fails = []

# 1. structure + marks law
sets_n = len(d)
qn = sum(len(s['questions']) for s in d)
pn = sum(len(q['parts']) for s in d for q in s['questions'])
tm = sum(q['totalMarks'] for s in d for q in s['questions'])
pm = sum(p['marks'] for s in d for q in s['questions'] for p in q['parts'])
print(f'structure: {sets_n} sets / {qn} questions / {pn} parts | marks {tm} (Q) vs {pm} (parts)')
if tm != pm:
    fails.append('MARKS LAW')

# 2. unbalanced-$ and KaTeX segments (count only; parse via node if available)
unbal = 0
segs = []
for s in d:
    for q in s['questions']:
        for p in q['parts']:
            for f in ('problemMd', 'solutionMd'):
                t = (p.get(f) or '').replace('\\$', '')  # escaped currency is not math-$
                if t.count('$') % 2:
                    unbal += 1
                    if unbal < 5:
                        print('  UNBALANCED:', p['id'], f, repr(t[max(0, t.find('$')-40):t.find('$')+40]))
                for m in re.finditer(r'(?<!\\)\$(.+?)\$', t):
                    segs.append((p['id'], m.group(1)))
mp_strings = []
for s in d:
    for q in s['questions']:
        for p in q['parts']:
            v = p.get('markPoints')
            mp_strings += [x for x in (v if isinstance(v, list) else [v] if v else []) if isinstance(x, str)]
unbal += sum(1 for t in mp_strings if t.replace('\\$', '').count('$') % 2)
print(f'KaTeX segments: {len(segs)} | unbalanced-$ fields: {unbal}')
if unbal:
    fails.append('UNBALANCED-$')
json.dump([s for _, s in segs], open('/tmp/katex_segments.json', 'w'))
print('non-latex-$ check: currency class (\\$) count:',
      sum(1 for s in d for q in s['questions'] for p in q['parts']
          if '\\$' in (p.get('problemMd') or '') + (p.get('solutionMd') or '')))

# 3. furniture census
FURN = ['pearson edexcel', 'paper reference', 'total marks', 'use black ink',
        'fill in the boxes', 'write your name', 'turn over', 'candidate surname',
        'every question with', 'you must write down']
furn = 0
for s in d:
    for q in s['questions']:
        for p in q['parts']:
            t = ((p.get('problemMd') or '') + (p.get('solutionMd') or '')).lower()
            for f in FURN:
                if f in t:
                    furn += 1
                    print('  FURNITURE:', p['id'], f)
print('furniture hits:', furn)
if furn:
    fails.append('FURNITURE')

# 4. residual defect census
par = re.compile(r'\(([^()]*)\)')
PAREN = re.compile(r'\([^()]*\)')
OPS = set('+-×÷=<>±~∼⩽⩾≥≤−–—')
mat, unit, cj = [], [], []
for s in d:
    for q in s['questions']:
        for p in q['parts']:
            def ft(v):
                return ' '.join(str(x.get('textMd', '')) if isinstance(x, dict) else str(x)
                                for x in v) if isinstance(v, list) else (v or '')
            t = ft(p.get('problemMd')) + ' ||| ' + ft(p.get('solutionMd'))
            for m in par.finditer(ft(p.get('problemMd')) + ' ### ' + ft(p.get('solutionMd')) + ' ### ' + ft(p.get('markPoints'))):
                inner = m.group(1)
                if ',' in inner or any(ch in OPS for ch in inner):
                    continue
                toks = inner.split()
                if len(toks) >= 2 and all(re.search(r'\d', tok) for tok in toks):
                    mat.append((p['id'], inner))
            tu = PAREN.sub(' ', ft(p.get('problemMd'))) + ' ||| ' + PAREN.sub(' ', ft(p.get('solutionMd')))
            if re.search(r'[×x]\s*10(?![\u2070-\u2099])\d(?!\d)(?![\d\s])', tu) or \
               re.search(r'\b(?:k?m|cm|mm)[23]\b(?![\u00b2\u00b3])', tu) or \
               re.search(r'\b[a-z]\d*\s?‒\s?\d\b', tu):
                unit.append(p['id'])
            if '©' in ft(p.get('solutionMd')):
                cj.append(p['id'])
print(f'residual matrixish hits: {len(mat)} | residual unit-sup parts: {len(unit)} | residual c-junk parts: {len(cj)}')
print('  (expected residual = the STAGED fleet-retry remainder, not new regressions)')
json.dump({'matrix': mat, 'unit': unit, 'cj': cj}, open('/tmp/residual.json', 'w'))

# 5. asset sanity: crop assets carry rawUrl
crop = sum(1 for s in d for q in s['questions'] for p in q['parts']
           for a in (p.get('assets') or []) if isinstance(a, dict) and a.get('kind') == 'crop')
crq = sum(1 for s in d for q in s['questions'] for p in q['parts']
          for a in (p.get('assets') or []) if isinstance(a, dict) and a.get('kind') == 'crop-required')
print(f'assets: crop={crop} crop-required={crq}')
if crop != 562:
    fails.append('CROP COUNT CHANGED')

print('GATE RESULT:', 'FAIL ' + '; '.join(fails) if fails else 'ALL GREEN')
sys.exit(1 if fails else 0)
