#!/usr/bin/env python3
"""UIUX-TIER-B census v2 (read-only): figure-granularity accounting.

Per paper: committed asset question numbers (authoritative assets-index) vs embed
state per question group. Soft-skip rule = asset committed whose question group
carries NO embed (or the group is missing entirely = orphan asset).
"""
import json, re, os

BUNDLE = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json'
RES = '/home/z/my-project/ws/syllabai-resources-art3/SME-ExamQuestion/igcse-maths-b-16/past-papers'
STAGING = '/home/z/my-project/scripts/artwork-scale/resources-staging/SME-ExamQuestion/igcse-maths-b-16/past-papers'
IMG = re.compile(r'!\[[^\]]*\]\(([^)]+)\)')
REF = re.compile(r"\b(diagram|grid|graph|shown below|shown in the|the figure|net of|scale drawing|centimetre squares|isometric|protractor|compasses|number line|pie chart|tree diagram|Venn|bar chart|prism|axes)\b", re.I)

d = json.load(open(BUNDLE, encoding='utf-8'))
byslug = {s['slug']: s for s in d}

def assets_for(sess, pap):
    for root in (RES, STAGING):
        idx = os.path.join(root, sess, pap, 'assets-index.json')
        if os.path.isfile(idx):
            ai = json.load(open(idx))
            out = {}
            for a in ai.get('assets', []):
                out.setdefault(int(a['question']), []).append(a['file'])
            return out
    return {}

def group_qnum(q, qi):
    """official question number = paper order (questions array is paper-ordered, qn-1 law)."""
    return qi + 1

rows = []
for s in d:
    m = re.match(r'(\d{4}-\d{2})-4mb1-(\d{2}r?)--exam-questions', s['slug'])
    if not m:
        continue
    sess, pap = m.group(1), m.group(2).upper()
    assets = assets_for(sess, pap)
    if not assets:
        rows.append((s['slug'], 'NO-INDEX', None, None, None, None, ''))
        continue
    groups = {}
    for qi, q in enumerate(s['questions']):
        parts = q.get('parts', [])
        if not parts:
            continue
        qn = group_qnum(q, qi)
        merged = '\n'.join((p.get('problemMd') or '') for p in parts)
        n_emb = len(IMG.findall(merged))
        pins = set(IMG.findall(merged))
        groups[qn] = (qi, len(parts), n_emb, pins, merged, sum(p.get('marks') or 0 for p in parts))
    for qn, files in sorted(assets.items()):
        g = groups.get(qn)
        if g is None:
            rows.append((s['slug'], 'ORPHAN-ASSET', qn, len(files), None, None, f"no question group with label {qn}"))
        else:
            qi, nparts, n_emb, pins, merged, marks = g
            if n_emb == 0:
                rows.append((s['slug'], 'SOFT-SKIP', qn, len(files), nparts, marks, merged[:150].replace('\n', ' | ')))
            elif len(files) > n_emb:
                rows.append((s['slug'], 'PARTIAL-EMBED', qn, len(files), nparts, marks, f"assets={len(files)} embeds={n_emb}"))

print("=== FIGURE-GRANULARITY ACCOUNTING ===")
import collections
cnt = collections.Counter(r[1] for r in rows)
print(dict(cnt))
print()
for r in rows:
    if r[1] in ('SOFT-SKIP', 'PARTIAL-EMBED', 'ORPHAN-ASSET'):
        print(f"{r[1]:14s} {r[0]} q{r[2]} files={r[3]} parts={r[4]} marks={r[5]}")
        print(f"    {r[6][:170]}")
