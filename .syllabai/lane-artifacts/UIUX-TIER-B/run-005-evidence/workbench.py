#!/usr/bin/env python3
"""run-005 workbench: extract current bundle state for every target part."""
import json, sys

REPO='/home/z/my-project/ws/syllabai-v2'
EV=f'{REPO}/.syllabai/lane-artifacts/UIUX-TIER-B/run-004-evidence'

bundle=json.load(open(f'{REPO}/apps/hub/content/igcse-maths-b-16/questions.json'))
sets={s['slug']:s for s in bundle}

def get(slug,q,part):
    s=sets.get(slug)
    if not s: return None,'NO-SET'
    qs=[x for x in s['questions'] if x.get('order')==q-1]
    if not qs: return None,'NO-Q'
    obj=qs[0]
    parts=obj.get('parts',[])
    if part >= len(parts): return obj,'NO-PART'
    p=parts[part]
    return p, None

def show(slug,q,part,label):
    p,err=get(slug,q,part)
    print(f"### {label} {slug} q{q}p{part}")
    if err: print('  !!',err); return
    print(f"  marks={p.get('marks')} cw={p.get('commandWord')!r}")
    print(f"  problemMd: {json.dumps(p.get('problemMd'))[:900]}")
    sm=p.get('solutionMd')
    if sm is not None:
        print(f"  solutionMd: {json.dumps(sm)[:900]}")
    ch=p.get('choices')
    if ch: print(f"  choices: {json.dumps(ch)[:400]}")
    print()

ws=json.load(open(f'{EV}/r4a-worksheet.json'))
fixed={'2018-06-4mb1-01--exam-questions':{(16,1)},
 '2020-06-4mb1-01r--exam-questions':{(1,0),(22,0)},
 '2020-11-4mb1-01r--exam-questions':{(1,0),(22,0)},
 '2020-06-4mb1-02r--exam-questions':{(9,1)},
 '2020-11-4mb1-02r--exam-questions':{(9,1)},
 '2024-06-4mb1-01r--exam-questions':{(5,0)},
 '2024-06-4mb1-02--exam-questions':{(6,0)},
 '2019-06-4mb1-02--exam-questions':{(9,3)},   # r4b
 '2025-06-4mb1-01--exam-questions':{(4,0)},   # r4c
}
seen=set(); targets=[]
for r in ws:
    k=(r['slug'],r['q'],r['part'])
    if k in seen or k in fixed: continue
    seen.add(k); targets.append(k)

mode=sys.argv[1] if len(sys.argv)>1 else 'r4a'
if mode=='r4a':
    for slug,q,part in targets:
        show(slug,q,part,'R4A')
elif mode=='annex':
    for slug,q,part in [('2025-11-4mb1-02--exam-questions',5,0),('2025-11-4mb1-02--exam-questions',8,2),
                        ('2025-11-4mb1-02--exam-questions',9,0),('2025-11-4mb1-02--exam-questions',9,3),
                        ('2025-11-4mb1-02--exam-questions',9,4),('2025-11-4mb1-02--exam-questions',11,0),
                        ('2025-11-4mb1-02--exam-questions',12,0),
                        ('2019-01-4mb1-01r--exam-questions',13,0),('2018-06-4mb1-01--exam-questions',7,0),
                        ('2025-11-4mb1-02--exam-questions',6,1),('2025-11-4mb1-02--exam-questions',10,0)]:
        show(slug,q,part,'ANNEX')
elif mode=='defer':
    show('2019-06-4mb1-02--exam-questions',10,1,'DEFER-q10p1')
    show('2019-06-4mb1-02--exam-questions',9,0,'DEFER-q9p0')
