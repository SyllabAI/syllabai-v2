#!/usr/bin/env python3
"""UIUX-TIER-B run-004 — page-level evidence renderer for R4-A parts.
Renders the full MS page (2.2x gray) for every candidate part; classifies each
part's debris density for rebuild-vs-FP routing."""
import json, os, re, fitz

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json'

d = json.load(open(BUNDLE, encoding='utf-8'))
byk = {}
for s in d:
    for qi, q in enumerate(s['questions']):
        for pi, p in enumerate(q.get('parts') or []):
            byk[(s['slug'], qi+1, pi)] = (s, p)

crops = json.load(open(os.path.join(HERE, 'r4a-crops.json')))
DEBRIS = re.compile(r'(\d[ ,]\d{1,3} [+\-−]|\b\d{1,3} \d{1,3} \d{1,3}\b|\dx\d|x\d{2}\b|\b\d{2}[a-z]\d?|\b[a-z]\d{2}\b|− \d| \d + |\$\d|\b\d \d\b)')

rows = []
seen_pages = {}
for c in crops:
    slug, qn, pi = c['slug'], c['q'], c['part']
    s, p = byk[(slug, qn, pi)]
    sm = p.get('solutionMd') or ''
    debris_lines = sum(1 for l in sm.split('\n')
                       if l.strip().startswith('- Note:') and len(l) < 90 and DEBRIS.search(l) and '$' not in l)
    m = re.match(r'(\d{4}-\d{2})-4mb1-(\d{2}r?)', slug)
    tag = f"{m.group(1)}-4MB1-{m.group(2).upper()}"
    page = c.get('page')
    key = (tag, page)
    png = f"mspage-{tag}-p{page:02d}.png"
    if key not in seen_pages:
        doc = fitz.open(os.path.join(HERE, 'pdf', f'{tag}-ms.pdf'))
        pix = doc[page-1].get_pixmap(matrix=fitz.Matrix(2.2, 2.2), colorspace=fitz.csGRAY)
        pix.save(os.path.join(HERE, png))
        doc.close()
        seen_pages[key] = png
    rows.append({'slug': slug, 'q': qn, 'part': pi, 'debris_lines': debris_lines,
                 'page_png': seen_pages[key], 'census_frags': c.get('frags') or [c.get('frag')]})

json.dump(rows, open(os.path.join(HERE, 'r4a-pages.json'), 'w'), indent=1)
rb = [r for r in rows if r['debris_lines'] >= 3]
print('parts:', len(rows), '| rebuild-class (>=3 debris lines):', len(rb),
      '| light (1-2):', sum(1 for r in rows if 0 < r['debris_lines'] < 3),
      '| clean (0):', sum(1 for r in rows if r['debris_lines'] == 0))
print('distinct pages rendered:', len(seen_pages))
