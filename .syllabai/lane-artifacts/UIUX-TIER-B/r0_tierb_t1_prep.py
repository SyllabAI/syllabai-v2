#!/usr/bin/env python3
"""TIER-B T1 prep: for each soft-skip group, dump problemMd (first part), asset files
+ descriptions, and candidate referencing lines (extended REF law incl. histogram /
bar chart / spinner / scale drawing / locus / symmetry / pattern / shape above)."""
import json, re, os

BUNDLE = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json'
RES = '/home/z/my-project/ws/syllabai-resources-art3/SME-ExamQuestion/igcse-maths-b-16/past-papers'
STAGING = '/home/z/my-project/scripts/artwork-scale/resources-staging/SME-ExamQuestion/igcse-maths-b-16/past-papers'
IMG = re.compile(r'!\[[^\]]*\]\([^)]+\)')

ANCH = re.compile(r"(diagram|grid|graph|shown below|shown in the|the figure|figure \d|net of|scale drawing|centimetre squares|isometric|protractor|compasses|number line|pie chart|tree diagram|venn|bar chart|prism|axes|histogram|spinner|locus|symmetry|pattern|shape above|shapes? [A-Z]|in the space|on the opposite|opposite page|above)", re.I)

d = json.load(open(BUNDLE, encoding='utf-8'))

def assets_for(sess, pap):
    for root in (RES, STAGING):
        idx = os.path.join(root, sess, pap, 'assets-index.json')
        if os.path.isfile(idx):
            ai = json.load(open(idx))
            out = {}
            for a in ai.get('assets', []):
                out.setdefault(int(a['question']), []).append((a['file'], a.get('desc', '')))
            return out
    return {}

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
        files = assets.get(qn)
        if not files:
            continue
        merged = '\n'.join((p.get('problemMd') or '') for p in parts)
        if IMG.search(merged):
            continue
        print(f"\n##### {s['slug']} q{qn} | parts={len(parts)} | marks={sum(p['marks'] for p in parts)}")
        for f, desc in files:
            print(f"  ASSET: {f}  ::  {desc}")
        for pi, p in enumerate(parts):
            lines = [l.strip() for l in (p.get('problemMd') or '').split('\n') if l.strip()]
            hits = [l for l in lines if ANCH.search(l)]
            print(f"  part{pi} (marks={p['marks']}) anchor-cands: {hits[:3]}")
        print(f"  FULL part0: {(parts[0].get('problemMd') or '')[:600]}".replace('\n', ' ⏎ '))
