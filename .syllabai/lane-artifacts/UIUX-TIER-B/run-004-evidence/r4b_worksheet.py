#!/usr/bin/env python3
"""UIUX-TIER-B run-004 — R4-B UFFFD worksheet builder.
Extracts every UFFFD-bearing solutionMd with full context + locates the MS page
carrying the source note (2019-06 4MB1/02). Emits worksheet JSON for eyes-on."""
import json, fitz, os

HERE = os.path.dirname(os.path.abspath(__file__))
BUNDLE = '/home/z/my-project/ws/syllabai-v2/apps/hub/content/igcse-maths-b-16/questions.json'
MS = os.path.join(HERE, 'pdf/2019-06-4MB1-02-ms.pdf')

d = json.load(open(BUNDLE, encoding='utf-8'))
s = [x for x in d if x['slug'] == '2019-06-4mb1-02--exam-questions'][0]

doc = fitz.open(MS)
pages = [doc[i].get_text() for i in range(len(doc))]

rows = []
for qi, q in enumerate(s['questions']):
    for pi, p in enumerate(q.get('parts') or []):
        sm = p.get('solutionMd') or ''
        if '\ufffd' not in sm:
            continue
        lines = sm.split('\n')
        hits = [(j, l) for j, l in enumerate(lines) if '\ufffd' in l]
        ctx = []
        for j, l in hits:
            ctx.append({'line': j, 'ufffd_line': l, 'before': lines[max(0, j-2):j],
                        'after': lines[j+1:j+3]})
        # keyword probe for MS page location
        probe_words = [w for w in ('69.3', '1.7', '6r', 'surd', 'modulus', 'expansion',
                                   '360', 'denominator') if w in sm]
        rows.append({'slug': s['slug'], 'q': qi+1, 'part': pi, 'marks': p.get('marks'),
                     'hits': ctx, 'probe_words': probe_words})

out = os.path.join(HERE, 'r4b-ufffd-worksheet.json')
json.dump(rows, open(out, 'w'), indent=1, ensure_ascii=False)
print('parts with UFFFD:', len(rows))
for r in rows:
    print(f"  q{r['q']} p{r['part']} marks={r['marks']} probes={r['probe_words']}")
print('worksheet:', out)
