#!/usr/bin/env python3
r"""run-019 B1 wave: full field dump for the 20 remaining B1 parts + page-location
hints via pdftotext of the downloaded QP/MS PDFs."""
import json, re, subprocess, os

PLANE = '/home/z/my-project/repos/syllabai-v2/apps/hub/content/igcse-maths-b-16/official-papers.json'
CENSUS = '/home/z/my-project/repos/syllabai-v2/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-018/gs-leads-census.json'
PP = '/home/z/my-project/scratch/pp_4mb1_b1'
RE_MARKLABEL = re.compile(r'\*\*[A-Z]\d+\*\*|\b4MB1\b')

def strip_math(t):
    t = re.sub(r'\$[^$]*\$', ' ', t)
    t = re.sub(r'\\\$[^$]*\\\$', ' ', t)
    return RE_MARKLABEL.sub(' ', t)

census = json.load(open(CENSUS))
b1_pids = [l['pid'] for l in census['leads'] if 'B1' in l.get('hits', {})
           and l['pid'] != 'offp_2026-06_01r_27-b']  # q27-b fixed in run-018
data = json.load(open(PLANE))
index = {}
for s in data:
    for q in s['questions']:
        for p in q['parts']:
            index[p['id']] = (s, q, p)

out = {}
for pid in b1_pids:
    s, q, p = index[pid]
    fields = {'problemMd': p.get('problemMd', ''), 'solutionMd': p.get('solutionMd', '')}
    mp0 = (p.get('markPoints') or [{}])[0]
    fields['markPoints0'] = mp0.get('textMd', '')
    fields['_mirror_ok'] = (fields['markPoints0'] == fields['solutionMd'])
    fields['_marks'] = [(mp.get('marks'), mp.get('code')) for mp in (p.get('markPoints') or [])]
    fields['_paperCode'] = (p.get('sourcePaper') or {}).get('paperCode', '')
    out[pid] = fields

json.dump(out, open('/home/z/my-project/scripts/run019_b1_fields.json', 'w'),
          ensure_ascii=False, indent=1)

for pid, f in out.items():
    print(f"{pid} mirror={f['_mirror_ok']} marks={f['_marks']} fields_with_carets=",
          [k for k in ('problemMd', 'solutionMd') if '^' in strip_math(f[k])])

# page location: pdftotext per PDF, find candidate pages for distinguishing strings
PDFMAP = {
    '2020-06-01-qp': ['Simplify fully'],
    '2020-11-01-qp': ['Simplify fully'],
    '2023-01-02R-ms': [],
    '2023-11-01-qp': ['Simplify fully', 'Hence, or otherwise'],
    '2023-11-01-ms': ['51.3125', 'any number or no number', 'P(2 red)', 'cos 60', 'is a factor'],
    '2025-06-01R-qp': ['standard form'],
    '2025-11-02-qp': ['simultaneous'],
    '2025-11-02-ms': ['simultaneous'],
    '2026-06-01R-ms': ['Examples for B1', 'Must see', 'completing the square'],
}
print('\n=== PAGE MAPS ===')
for pdf, needles in PDFMAP.items():
    path = f'{PP}/{pdf}.pdf'
    if not os.path.exists(path):
        print(f'!! missing {path}')
        continue
    txt = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True).stdout
    pages = txt.split('\f')
    print(f'{pdf}: {len(pages)} pages')
    for needle in needles:
        hits = [i + 1 for i, pg in enumerate(pages) if needle.lower() in pg.lower()]
        print(f'   "{needle}" -> pages {hits[:6]}')
