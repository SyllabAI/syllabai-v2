#!/usr/bin/env python3
"""run-005: apply spec_r4a.P to questions.json — fail-closed exact-match, structure/marks gates."""
import json, sys, copy
sys.path.insert(0, '/home/z/my-project/scripts/run005')
from spec_r4a import P

REPO='/home/z/my-project/ws/syllabai-v2'
B=f'{REPO}/apps/hub/content/igcse-maths-b-16/questions.json'
bundle=json.load(open(B, encoding='utf-8'))
orig=copy.deepcopy(bundle)
sets={s['slug']:s for s in bundle}
by_order=lambda s,q: [x for x in s['questions'] if x.get('order')==q-1][0]

applied=[]
for slug,q,part,field,old,new,label in P:
    s=sets.get(slug)
    assert s, f'NO SET {slug}'
    p=by_order(s,q)['parts'][part]
    t=p[field]
    if old is None:
        p[field]=new
    else:
        n=t.count(old)
        assert n==1, f'FAIL-CLOSED {label}: {n} matches in {slug} q{q}p{part} {field}\nOLD: {old[:120]!r}'
        p[field]=t.replace(old,new)
    applied.append(label)

def counts(b):
    return (len(b),
            sum(len(s['questions']) for s in b),
            sum(len(qq['parts']) for s in b for qq in s['questions']),
            sum(pp['marks'] for s in b for qq in s['questions'] for pp in qq['parts']))
c0,c1=counts(orig),counts(bundle)
print('structure BEFORE:',c0); print('structure AFTER :',c1)
assert c0==c1 and c0==(65,1270,2412,6500), 'STRUCTURE LAW VIOLATION'
for s0,s1 in zip(orig,bundle):
    for q0,q1 in zip(s0['questions'],s1['questions']):
        for p0,p1 in zip(q0['parts'],q1['parts']):
            assert p0['marks']==p1['marks'], f"MARKS CHANGED {p0['id']}"
changed=sum(1 for s0,s1 in zip(orig,bundle) for q0,q1 in zip(s0['questions'],s1['questions']) for p0,p1 in zip(q0['parts'],q1['parts']) for fld in ('problemMd','solutionMd') if p0.get(fld)!=p1.get(fld))
ufffd=sum((p.get('problemMd','')+' '+(p.get('solutionMd') or '')).count('\ufffd') for s in bundle for qq in s['questions'] for p in qq['parts'])
assert ufffd==0, 'UFFFD introduced'
print(f'applied {len(applied)} line rules; fields changed {changed}; UFFFD 0')
out=json.dumps(bundle,ensure_ascii=False,separators=(',',':'))
open(B,'w',encoding='utf-8').write(out)
print('WROTE',B,len(out),'bytes')
for l in applied: print('OK',l)
