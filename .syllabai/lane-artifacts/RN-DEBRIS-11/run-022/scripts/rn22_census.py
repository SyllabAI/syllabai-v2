#!/usr/bin/env python3
"""RN-DEBRIS-11 run-022 — the open-dispositions state census (computed of record).

READ-ONLY at the pinned base tip. Zero content bytes touched.
Censuses the byte-exact state of every still-open run-019 filing item's rows
(D3 8.1.1a re-code / D4 6.3.4a+6.3.5-6.3.9 re-parent / D5 6.3.1a-6.3.3a+6.3.4
debris / D6b 1.3.1a+1.3.2a disposition) across every plane of record
(curriculum, spine, KG, manifest, index, prerequisites anchors, questions,
flashcards, notes), plus the live duplication classes that the landed
run-020 (D2+D6-adds) and run-021 (D1) rows created against them.
"""
import json, hashlib, sys
from pathlib import Path

ROOT = Path('/home/z/my-project/work/rn22/clone')
ART = Path('/home/z/my-project/work/rn22')
CS = 'cie-igcse-computer-science-23'
P1A = 'cie-a-level-maths-20-pure-1'
P1S = 'cie-as-maths-20-pure-1'

BASE_TIP = subprocess_sha = None
def git(*a):
    import subprocess
    return subprocess.run(['git','-C',str(ROOT),*a],capture_output=True,text=True).stdout.strip()

def load(rel):
    return json.loads((ROOT/rel).read_text(encoding='utf-8'))

def node_of(cur, code):
    return [n for n in cur['nodes'] if n['code']==code]

def kg_node_of(kg, code):
    return [n for n in kg['nodes'] if n.get('code')==code or n.get('id')==code]

def kg_point_of(kg, code):
    return [p for p in kg['points'] if p.get('code')==code]

def refs_in_questions(codes, slug):
    qs = load(f'apps/hub/content/{slug}/questions.json')
    out=[]
    for s in qs:
        for q in s.get('questions',[]):
            for p in q.get('parts',[]):
                hit=set(codes) & set(p.get('specPointCodes') or [])
                if hit: out.append({'set':s.get('slug'),'question':q.get('id'),'part':p.get('id'),'codes':sorted(hit)})
    return out

def refs_in_flashcards(codes, slug):
    fs = load(f'apps/hub/content/{slug}/flashcards.json')
    return [{'id':f['id'],'code':f.get('specPointCode'),'deck':f.get('deckSlug')}
            for f in fs if f.get('specPointCode') in codes]

def refs_in_notes(codes, slug):
    ns = load(f'apps/hub/content/{slug}/notes.json')
    out=[]
    for n in ns:
        hit=set(codes) & set(n.get('specPointCodes') or [])
        if hit: out.append({'noteId':n.get('noteId'),'title':n.get('title'),'codes':sorted(hit)})
    return out

def prereq_anchors(codes, slug):
    pr = load(f'apps/hub/content/{slug}/prerequisites.json')
    out=[]
    for con, anchors in pr['conceptAnchors'].items():
        hit = set(codes) & set(anchors)
        if hit: out.append({'concept':con,'anchors':sorted(hit)})
    # also concept-web edges reference concepts, not codes — but scan anyway for code-shaped mentions
    return out, pr

def plane_records(codes, slug):
    cur = load(f'apps/hub/content/{slug}/curriculum.json')
    spine = load(f'apps/hub/spines/{slug}.json')
    kg = load(f'apps/hub/public/kg/data/{slug}.json')
    rec={}
    for c in codes:
        e={}
        cu=node_of(cur,c); su=node_of(spine['curriculum'],c)
        e['curriculum']=cu[0] if cu else None
        e['spine']=su[0] if su else None
        kn=kg_node_of(kg,c); kp=kg_point_of(kg,c)
        e['kgNode']=kn[0] if kn else None
        e['kgPoint']=kp[0] if kp else None
        rec[c]=e
    return rec, cur, spine, kg

def main():
    tip = git('rev-parse','HEAD')
    res={'artifact':'rn11-run-022-open-dispositions-census-r0',
         'baseTip':tip,
         'law':'READ-ONLY census; zero content bytes; every verdict computed, not quoted'}
    assert tip=='0cb0161809765d871b34c1f3e12136f188463184', f'base tip drift: {tip}'

    OPEN = ['8.1.1a','8.1.4','6.3.1a','6.3.2a','6.3.3a','6.3.4','6.3.4a','6.3.5','6.3.6','6.3.7','6.3.8','6.3.9']
    LANDED_D1 = ['7.1','7.2a','7.2b','7.2c','7.3','7.4','7.5a','7.5b','7.6','7.7','7.8','7.9','9.1','9.2','9.3','9.4','10.1','10.2','10.3a','10.3b','10.3c']
    LANDED_D2 = ['8.1.5','8.1.6a','8.1.6b','8.1.6c','8.1.7']

    rec, cur, spine, kg = plane_records(OPEN+LANDED_D1+LANDED_D2, CS)
    res['cs23']={'openItemRows':{c:rec[c] for c in OPEN},
                 'landedD1Rows':{c:rec[c] for c in LANDED_D1},
                 'landedD2Rows':{c:rec[c] for c in LANDED_D2},
                 'curriculumCounts':{'nodes':len(cur['nodes']),'edges':len(cur['edges']),
                                     'families':{f:sum(1 for n in cur['nodes'] if n['family']==f) for f in {n['family'] for n in cur['nodes']}}},
                 'kgCounts':{'nodes':len(kg['nodes']),'edges':len(kg['edges']),'points':len(kg['points'])},
                 'manifestCounts':load(f'apps/hub/content/{CS}/manifest.json')['counts'],
                 'indexEntry':([c for c in load('apps/hub/public/kg/data/index.json')['courses'] if isinstance(c,dict) and c.get('slug')==CS] or [None])[0]}

    # reference planes (cs-23): open-item codes only
    open_codes=OPEN
    anch, pr = prereq_anchors(open_codes, CS)
    res['cs23']['prereqAnchorsOnOpenCodes']=anch
    res['cs23']['questionRefs']=refs_in_questions(open_codes, CS)
    res['cs23']['flashcardRefs']=refs_in_flashcards(open_codes, CS)
    res['cs23']['noteRefs']=refs_in_notes(open_codes, CS)
    def percode(refs, key):
        c={}
        for r in refs:
            for k in (r[key] if isinstance(r[key],list) else [r[key]]):
                if k: c[k]=c.get(k,0)+1
        return c
    res['cs23']['refsPerCode']={
        'questions':percode(res['cs23']['questionRefs'],'codes'),
        'flashcards':percode(res['cs23']['flashcardRefs'],'code'),
        'notes':percode(res['cs23']['noteRefs'],'codes'),
        'prereqConcepts':{a['anchors'][0]:a['concept'] for a in anch}}

    # ---- duplication verdicts (computed) ----
    t=lambda c: (rec[c]['curriculum'] or {}).get('title')
    dup={}
    # D4: mis-filed carriers vs landed official rows
    d4_pairs=[('6.3.4a','7.4'),('6.3.5','7.5a'),('6.3.5','7.5b'),('6.3.6','7.6'),('6.3.7','7.7'),('6.3.8','7.8'),('6.3.9','7.9')]
    dr=[]
    for a,b in d4_pairs:
        ta,tb=t(a),t(b)
        dr.append({'carrier':a,'landed':b,'carrierTitle':ta,'landedTitle':tb,'byteEqual':(ta==tb)})
    # 6.3.5 is the lettered BLOB of official 7.5: prefix-stripped component comparison
    blob65=t('6.3.5') or ''
    comp_a=blob65.split('(b)')[0].replace('(a)','',1).strip()
    comp_b=('(b)' in blob65) and blob65.split('(b)',1)[1].strip()
    dr.append({'carrier':'6.3.5 (blob component a)','landed':'7.5a','carrierTitle':comp_a,'landedTitle':t('7.5a'),'byteEqual':(comp_a==t('7.5a'))})
    dr.append({'carrier':'6.3.5 (blob component b)','landed':'7.5b','carrierTitle':comp_b,'landedTitle':t('7.5b'),'byteEqual':(comp_b==t('7.5b'))})
    dup['D4_carrier_vs_landed']=dr
    # D3: 8.1.1a vs official 8.1.4f + vs 8.1.4 blob containment
    census17=json.loads((ART/'run-017_official_0478_census_r0.json').read_text())
    off_f = census17.get('subRows',{}).get('8.1.4f') or census17.get('rows',{}).get('8.1.4f')
    blob=t('8.1.4'); t811a=t('8.1.1a')
    marker='(f) '+ (off_f or '')
    dup['D3']={'official_8_1_4f':off_f,'corpus_8_1_1a_title':t811a,
               'byteEqual_official':(t811a==off_f),
               'blob_8_1_4_title':blob,
               'blob_contains_(f)stmt': (marker in blob) if (off_f and blob) else None,
               'blob_contains_stmt_bare': (off_f in blob) if (off_f and blob) else None}
    # D6b pure-1 pair
    p1rec={}, 
    p1={}
    for slug in (P1A,P1S):
        r,cur1,sp1,kg1 = plane_records(['1.3.1','1.3.1a','1.3.2','1.3.2a','1.3.3','1.3.4','1.3.5','1.4.1','1.4.1a'], slug)
        g=lambda c:(r[c]['curriculum'] or {}).get('title')
        blob12a=g('1.3.2a'); t133,t134,t135=g('1.3.3'),g('1.3.4'),g('1.3.5')
        resid=blob12a or ''
        parts=[]
        for x in (t133,t134,t135):
            if x and x in resid:
                resid=resid.replace(x,''); parts.append(True)
            else: parts.append(False)
        p1[slug]={'rows':{c:r[c] for c in ['1.3.1','1.3.1a','1.3.2','1.3.2a','1.3.3','1.3.4','1.3.5','1.4.1','1.4.1a']},
                  'blob_1_3_2a':blob12a,'landed_1_3_3':t133,'landed_1_3_4':t134,'landed_1_3_5':t135,
                  'blob_contains_133':parts[0],'blob_contains_134':parts[1],'blob_contains_135':parts[2],
                  'residual_after_subtraction':resid.strip(),
                  'prereqAnchors':prereq_anchors(['1.3.1a','1.3.2a'],slug)[0],
                  'questionRefs':refs_in_questions(['1.3.1a','1.3.2a'],slug),
                  'flashcardRefs':refs_in_flashcards(['1.3.1a','1.3.2a'],slug),
                  'noteRefs':refs_in_notes(['1.3.1a','1.3.2a'],slug)}
    dup['D6b_pure1']=p1
    res['duplicationVerdicts']=dup

    # ---- official-pin byte assertions vs the run-017 census of record ----
    pins={'8.1.1a==official_8.1.4f(subRows)': t('8.1.1a')==census17['subRows']['8.1.4f'],
          '6.3.5_blob==official_7.5(rows)': t('6.3.5')==census17['rows']['7.5']['official'],
          '8.1.4_blob_prefix(a-e)==official_8.1.4_up_to_(e)': (census17['rows']['8.1.4']['official'].startswith(t('8.1.4'))),
          '8.1.4_blob_missing_(f)': ('(f) '+census17['subRows']['8.1.4f']) not in (t('8.1.4') or '')}
    res['officialPinAsserts']=pins
    assert all(pins.values()), f'official pin drift: {pins}'

    # ---- spine per-code parity for all census codes ----
    par={}
    for c in OPEN+LANDED_D1+LANDED_D2:
        cu=(rec[c]['curriculum'] or {}); su=(rec[c]['spine'] or {})
        par[c]= (cu.get('title')==su.get('title') and cu.get('order')==su.get('order') and cu.get('parents')==su.get('parents'))
    res['spineParity']=par
    assert all(par.values()), f'spine parity drift: {[k for k,v in par.items() if not v]}'

    # ---- KG mirror state for open codes (pointSubtopics buckets / points[].code-text mirror) ----
    kgm={}
    kgsel={p.get('id'):(p.get('text') or p.get('title')) for p in kg['points']}
    psubs=kg.get('pointSubtopics') or {}
    def bucket_of(code):
        return [k for k,v in psubs.items() if isinstance(v,list) and code in v]
    for c in OPEN:
        kn=[n for n in kg['nodes'] if n.get('pointId')==c]
        kp=kg.get('points')
        kgm[c]={'kgPointNodePresent':bool(kn),
                'kgPointTextEqualsTitle': (kgsel.get(c)==rec[c]['curriculum']['title']) if kgsel.get(c) else False,
                'pointSubtopicsBuckets':bucket_of(c)}
    res['kgMirrorState']=kgm

    # D5: the four non-rows + candidates for re-anchor (official sec-4 rows of record)
    d5rows={c:rec[c] for c in ['6.3.1a','6.3.2a','6.3.3a','6.3.4']}
    res['cs23']['D5_rows']=d5rows
    # candidates: all cs-23 rows whose title mentions flowchart / logic gate / pseudocode (T4 territory of record)
    cands=[]
    for n in cur['nodes']:
        ttl=(n.get('title') or '').lower()
        if any(w in ttl for w in ('flowchart','flow chart','logic gate','pseudocode','pseudo code')):
            cands.append({'code':n['code'],'family':n['family'],'title':n['title'],'order':n.get('order')})
    res['cs23']['D5_reanchorCandidates_from_corpus_titles']=cands

    out=ART/'out'
    out.mkdir(exist_ok=True)
    (out/'rn22_census_r0.json').write_text(json.dumps(res,indent=1,ensure_ascii=False))
    # console summary
    print('baseTip:', tip)
    print('cs-23 curriculum:', res['cs23']['curriculumCounts'])
    print('kg:', res['cs23']['kgCounts'], 'index:', json.dumps(res['cs23']['indexEntry']))
    print('\nD4 carrier-vs-landed byte-equality:')
    for d in dr: print(f"  {d['carrier']} vs {d['landed']}: {d['byteEqual']}")
    print('\nD3:', json.dumps(dup['D3'], indent=1, ensure_ascii=False)[:600])
    for slug in (P1A,P1S):
        b=dup['D6b_pure1'][slug]
        print(f"\nD6b[{slug}]: blob_contains_133/134/135 = {b['blob_contains_133']}/{b['blob_contains_134']}/{b['blob_contains_135']}")
        print('  residual:', json.dumps(b['residual_after_subtraction'], ensure_ascii=False))
        print('  prereq anchors:', b['prereqAnchors'], 'qRefs:', len(b['questionRefs']), 'fcRefs:', len(b['flashcardRefs']), 'noteRefs:', len(b['noteRefs']))
    print('\ncs-23 prereq anchors on open codes:', json.dumps(res['cs23']['prereqAnchorsOnOpenCodes'], indent=1))
    print('cs-23 qRefs:', len(res['cs23']['questionRefs']), 'fcRefs:', len(res['cs23']['flashcardRefs']), 'noteRefs:', len(res['cs23']['noteRefs']))
    print('\nD5 candidates:', json.dumps(res['cs23']['D5_reanchorCandidates_from_corpus_titles'], indent=1, ensure_ascii=False)[:1500])

if __name__=='__main__':
    main()
