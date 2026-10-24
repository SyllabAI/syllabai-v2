#!/usr/bin/env python3
"""run-005: R4-A worksheet with exact current bytes for the outstanding parts."""
import json, os, collections
REPO='/home/z/my-project/ws/syllabai-v2'
EV=f'{REPO}/.syllabai/lane-artifacts/UIUX-TIER-B/run-004-evidence'
bundle=json.load(open(f'{REPO}/apps/hub/content/igcse-maths-b-16/questions.json'))
sets={s['slug']:s for s in bundle}

ws=json.load(open(f'{EV}/r4a-worksheet.json'))
pmap={(r['slug'],r['q'],r['part']):r.get('page_png') for r in json.load(open(f'{EV}/r4a-pages.json'))}
fixed={('2018-06-4mb1-01--exam-questions',16,1),('2020-06-4mb1-01r--exam-questions',1,0),
 ('2020-06-4mb1-01r--exam-questions',22,0),('2020-11-4mb1-01r--exam-questions',1,0),
 ('2020-11-4mb1-01r--exam-questions',22,0),('2020-06-4mb1-02r--exam-questions',9,1),
 ('2020-11-4mb1-02r--exam-questions',9,1),('2024-06-4mb1-01r--exam-questions',5,0),
 ('2024-06-4mb1-02--exam-questions',6,0),('2019-06-4mb1-02--exam-questions',9,3),
 ('2025-06-4mb1-01--exam-questions',4,0)}

seen=set(); rows=[]
for r in ws:
    k=(r['slug'],r['q'],r['part'])
    if k in seen or k in fixed: continue
    seen.add(k)
    s=sets[r['slug']]; o=[x for x in s['questions'] if x.get('order')==r['q']-1][0]
    p=o['parts'][r['part']]
    rows.append({'slug':r['slug'],'q':r['q'],'part':r['part'],'frag':r['frag'],
                 'page':pmap.get(k),'marks':p.get('marks'),
                 'problemMd':p.get('problemMd'),'solutionMd':p.get('solutionMd')})

os.makedirs('/home/z/my-project/scripts/run005/work',exist_ok=True)
json.dump(rows,open('/home/z/my-project/scripts/run005/work/r4a-targets.json','w'),indent=1,ensure_ascii=False)
print('rows:',len(rows))
# check 2024-06-02 q6p3 current 10n state
r=[x for x in rows if x['slug']=='2024-06-4mb1-02--exam-questions' and x['q']==6][0]
print('2024-06-02 q6p3 SMD tail:', json.dumps(r['solutionMd'][-700:]))
