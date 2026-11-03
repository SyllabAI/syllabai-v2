#!/usr/bin/env python3
"""run-005 planning: compute outstanding R4-A rebuild-class queue from run-004 evidence pack."""
import json, os, collections

EV = '/home/z/my-project/ws/syllabai-v2/.syllabai/lane-artifacts/UIUX-TIER-B/run-004-evidence'
ws = json.load(open(f'{EV}/r4a-worksheet.json'))

# run-004 receipt: r4a fixed 9 part-instances (parts_touched.r4a = 9)
fixed = {
 ('2018-06-4mb1-01--exam-questions',16,1),
 ('2020-06-4mb1-01r--exam-questions',1,0), ('2020-06-4mb1-01r--exam-questions',22,0),
 ('2020-11-4mb1-01r--exam-questions',1,0), ('2020-11-4mb1-01r--exam-questions',22,0),
 ('2020-06-4mb1-02r--exam-questions',9,1), ('2020-11-4mb1-02r--exam-questions',9,1),
 ('2024-06-4mb1-01r--exam-questions',5,0), ('2024-06-4mb1-02--exam-questions',6,0),
}

rows = [(r['slug'], r['q'], r['part'], r['class'], r['frag'], r.get('ms_line',''), r.get('bundle_ctx','')) for r in ws]
parts = collections.OrderedDict()
for slug,q,p,cls,frag,msl,ctx in rows:
    key=(slug,q,p)
    parts.setdefault(key, []).append((cls,frag,msl,ctx))

outstanding = {k:v for k,v in parts.items() if k not in fixed}
print(f"worksheet rows={len(rows)} distinct parts={len(parts)} fixed(run-004)={len([k for k in parts if k in fixed])} OUTSTANDING={len(outstanding)} across {len(set(k[0] for k in outstanding))} sets")

cls_count = collections.Counter(c for v in outstanding.values() for c,_,_,_ in v)
print("classes:", dict(cls_count))

pages = sorted(f for f in os.listdir(EV) if f.startswith('mspage-'))
crops = sorted(f for f in os.listdir(EV) if f.startswith('crop-'))
print(f"pages={len(pages)} crops={len(crops)}")

for (slug,q,p), v in sorted(outstanding.items()):
    tags = ';'.join(sorted(set(c for c,_,_,_ in v)))
    frags = ','.join(sorted(set(f for _,f,_,_ in v)))
    print(f"{slug} q{q}p{p} [{tags}] {frags}")
