#!/usr/bin/env python3
"""Fleet audit: for every semantic-desc asset, verify the indexed group's content
matches. Flags mis-filed assets whose true target may be another group (embedded or
not). 'censused figure' descs are skipped (no semantics)."""
import json, re, os

BUNDLE = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json'
RES = '/home/z/my-project/ws/syllabai-resources-art3/SME-ExamQuestion/igcse-maths-b-16/past-papers'
STAGING = '/home/z/my-project/scripts/artwork-scale/resources-staging/SME-ExamQuestion/igcse-maths-b-16/past-papers'
IMG = re.compile(r'!\[[^\]]*\]\([^)]+\)')

d = json.load(open(BUNDLE, encoding='utf-8'))

def assets_for(sess, pap):
    for root in (RES, STAGING):
        idx = os.path.join(root, sess, pap, 'assets-index.json')
        if os.path.isfile(idx):
            ai = json.load(open(idx))
            out = {}
            for a in ai.get('assets', []):
                out.setdefault(int(a['question']), []).append(a.get('desc', ''))
            return out
    return {}

def kw_from_desc(desc):
    """content keywords expected in the true target's text"""
    toks = re.split(r'[-/\s]+', desc.lower())
    stop = {'q1','q2','q3','q4','q5','q6','q7','q8','q9','q10','q11','q12','q13','q14','q15','q16','q17','q18','q19','q20','q21','q22','q23','q24','q25','q26','q27','q28','censused','figure','with','and','of','the','a','on','in','small','diagram','point','cm','deg','scale'}
    return [t for t in toks if t and t not in stop and not t.isdigit()]

flagged = 0
checked = 0
for s in d:
    m = re.match(r'(\d{4}-\d{2})-4mb1-(\d{2}r?)--exam-questions', s['slug'])
    if not m:
        continue
    assets = assets_for(m.group(1), m.group(2).upper())
    for qi, q in enumerate(s['questions']):
        parts = q.get('parts', [])
        if not parts:
            continue
        qn = qi + 1
        descs = assets.get(qn, [])
        for desc in descs:
            kws = kw_from_desc(desc)
            if not kws:
                continue  # censused-class, no semantics
            checked += 1
            merged = ' '.join((p.get('problemMd') or '') for p in parts)
            hit = sum(1 for k in kws if k in merged.lower())
            if hit == 0:
                flagged += 1
                has_img = bool(IMG.search(merged))
                print(f"MISFILE? {s['slug']} indexed q{qn} has_img={has_img} desc='{desc}'")
                print(f"    content: {merged[:160]}")

print(f"\nchecked={checked} flagged={flagged}")
