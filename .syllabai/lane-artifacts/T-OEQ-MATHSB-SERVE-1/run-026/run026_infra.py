#!/usr/bin/env python3
"""run-026 infra: fetch QP/MS PDFs for the wave-3 worklist papers + render mapped pages.
Source of record: SyllabAI/syllabai-pastpapers (pinned tree 2c438f38 in scratch/pastpapers_tree.json).
Path law: past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/past-papers/{series}/{CODE}/{kind}.pdf
Slug law: official-4mb1-01r-2022-06 -> series=2022-06, CODE=4MB1-01R (uppercased paper code).
Naming: {series}_{code}_{kind}.pdf ; pages/ms-{series}-{code}-p{NN}-{NN}.png @150dpi (run-024 evidence naming).
"""
import json, os, re, subprocess, sys, urllib.request

SCR = '/home/z/my-project/scratch/oeq_run026'
PDF = f'{SCR}/pdf'; PAGES = f'{SCR}/pages'
os.makedirs(PDF, exist_ok=True); os.makedirs(PAGES, exist_ok=True)
BASE = ('https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/'
        'past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/past-papers')

wl = json.load(open(f'{SCR}/run026_w3_worklist.json'))
units = wl['units']

# include zero-class verification pages (their ms_pages come from the pagemap in the worklist)
def slug_to_sc(slug):
    m = re.match(r'official-4mb1-([0-9]+r?)-(\d{4}-\d{2})$', slug)
    if not m:
        sys.exit(f'UNPARSEABLE slug: {slug}')
    return m.group(2), '4MB1-' + m.group(1).upper()

# authoritative path set from the pinned tree
tree_paths = set()
t = json.load(open('/home/z/my-project/scratch/pastpapers_tree.json'))
for e in t['tree']:
    tree_paths.add(e['path'])

need = {}   # (series, code) -> {'ms': set(pages), 'qp': set(pages)}
for u in units:
    series, code = slug_to_sc(u['paperSlug'])
    d = need.setdefault((series, code), {'ms': set(), 'qp': set()})
    for pg in (u.get('ms_pages') or []): d['ms'].add(pg)
    for pg in (u.get('qp_pages') or []): d['qp'].add(pg)

print(f'papers: {len(need)}')
missing_pdf = []
for (series, code), d in sorted(need.items()):
    for kind in ('ms', 'qp'):
        if not d[kind]:
            continue
        rel = f'past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/past-papers/{series}/{code}/{kind}.pdf'
        dest = f'{PDF}/{series}_{code.lower()}_{kind}.pdf'
        if os.path.exists(dest) and os.path.getsize(dest) > 10000:
            continue
        if rel not in tree_paths:
            missing_pdf.append(rel); continue
        req = urllib.request.Request(f'{BASE}/{series}/{code}/{kind}.pdf', headers={'User-Agent': 'run026-infra'})
        try:
            blob = urllib.request.urlopen(req, timeout=90).read()
        except Exception as e:
            missing_pdf.append(f'{rel} ({e})'); continue
        open(dest, 'wb').write(blob)
        print(f'  fetched {series}_{code.lower()}_{kind}.pdf {len(blob)//1024}KB')
if missing_pdf:
    print('MISSING PDFs:'); [print('  ', p) for p in missing_pdf]; sys.exit(2)

# render pages
n_rendered = 0
for (series, code), d in sorted(need.items()):
    for kind in ('ms', 'qp'):
        pdf = f'{PDF}/{series}_{code.lower()}_{kind}.pdf'
        if not d[kind] or not os.path.exists(pdf):
            continue
        prefix = f'{kind}-{series}-{code.lower()}'
        for pg in sorted(d[kind]):
            dest = f'{PAGES}/{prefix}-p{pg:02d}-{pg}.png'
            if os.path.exists(dest):
                continue
            subprocess.run(['pdftoppm', '-f', str(pg), '-l', str(pg), '-r', '150', '-png', pdf, f'/tmp/r26_{pg}'],
                           check=True, capture_output=True)
            moved = False
            for cand in (f'/tmp/r26_{pg}-{pg}.png', f'/tmp/r26_{pg}-0{pg}.png'):
                if os.path.exists(cand):
                    os.replace(cand, dest); moved = True; break
            if not moved:
                sys.exit(f'RENDER FAILED: {pdf} p{pg}')
            n_rendered += 1
print(f'rendered {n_rendered} new pages; total in pages/: {len(os.listdir(PAGES))}')

# index: unit -> page files
idx = []
for u in units:
    series, code = slug_to_sc(u['paperSlug'])
    idx.append({'unitKey': u['unitKey'], 'members': u['members'], 'triage': u['triage'],
                'ms': [f'ms-{series}-{code.lower()}-p{pg:02d}-{pg}.png' for pg in (u.get('ms_pages') or [])],
                'qp': [f'qp-{series}-{code.lower()}-p{pg:02d}-{pg}.png' for pg in (u.get('qp_pages') or [])]})
json.dump(idx, open(f'{SCR}/run026_pagefiles.json', 'w'), ensure_ascii=False, indent=1)
print('pagefile index ->', f'{SCR}/run026_pagefiles.json')
