#!/usr/bin/env python3
"""UIUX-TIER-B run-004 — R4-A workbench.
For every q-deg / 10n candidate: extract the MS layout context (pdftotext -layout)
from the paper of record + flag whether the exponent is algebraically self-evident.
Emits r4a-worksheet.json for adjudication."""
import json, os, re, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json'
PDF = os.path.join(HERE, 'pdf')

d = json.load(open(BUNDLE, encoding='utf-8'))
byk = {}
for s in d:
    for qi, q in enumerate(s['questions']):
        for pi, p in enumerate(q.get('parts') or []):
            byk[(s['slug'], qi+1, pi)] = (s, p)

cands = json.load(open(os.path.join(HERE, 'r4a-census-001.json')))

_layout_cache = {}
def layout_lines(slug):
    if slug in _layout_cache:
        return _layout_cache[slug]
    m = re.match(r'(\d{4}-\d{2})-4mb1-(\d{2}r?)', slug)
    f = os.path.join(PDF, f"{m.group(1)}-4MB1-{m.group(2).upper()}-ms.pdf")
    txt = os.path.join(HERE, f"ms-{m.group(1)}-{m.group(2).upper()}.txt")
    if not os.path.isfile(txt):
        subprocess.run(['pdftotext', '-layout', f, txt], check=False)
    lines = open(txt, encoding='utf-8', errors='replace').read().split('\n') if os.path.isfile(txt) else []
    _layout_cache[slug] = lines
    return lines

rows = []
for c in cands:
    slug, qn, pi, cls, frag = c
    key = (slug, qn, pi)
    if key not in byk:
        continue
    s, p = byk[key]
    sm = p.get('solutionMd') or ''
    i = sm.find(frag)
    ctx = sm[max(0, i-90):i+70].replace('\n', ' | ')
    # find best-matching MS layout line: highest token overlap
    fragtoks = set(re.findall(r'[a-z0-9]+', frag.lower()))
    best, bestscore = None, 0
    for ln in layout_lines(slug):
        toks = set(re.findall(r'[a-z0-9]+', ln.lower()))
        if not fragtoks: break
        score = len(fragtoks & toks)
        # proximity bonus: context words near the fragment
        ctxtoks = set(re.findall(r'[a-z0-9]{3,}', ctx.lower()))
        score += 2 * len(ctxtoks & toks)
        if score > bestscore:
            bestscore, best = score, ln.strip()
    rows.append({'slug': slug, 'q': qn, 'part': pi, 'class': cls, 'frag': frag,
                 'bundle_ctx': ctx, 'ms_line': best, 'ms_score': bestscore})

out = os.path.join(HERE, 'r4a-worksheet.json')
json.dump(rows, open(out, 'w'), indent=1, ensure_ascii=False)
print('rows:', len(rows))
hi = sum(1 for r in rows if r['ms_score'] >= 6)
print(f'strong MS-line match (>=6): {hi} | weak: {len(rows)-hi}')
