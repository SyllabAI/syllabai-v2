#!/usr/bin/env python3
"""run-025 needle locator: find pages in cached QP/MS PDFs containing a ctx needle.
Method of record (run-024 pagemap lineage): whitespace-collapsed + alphanumeric-
projected matching, tolerant of line breaks and digit spacing.
Usage: python3 run025_locate.py <series_paper_kind> <needle> [needle2 ...]
  e.g. python3 run025_locate.py 2018-06_01R_ms "82 + 152" "Using Pythagoras correctly"
"""
import sys, os, re, subprocess, tempfile

PDFDIR = '/home/z/my-project/scratch/oeq_run024/pdf'
PAGEDIR = '/home/z/my-project/scratch/oeq_run024/pages'

def render_pages(pdf, pages, outprefix):
    for pg in pages:
        name = f'{outprefix}-p{pg:02d}'
        dest = f'{PAGEDIR}/{name}-{pg}.png'
        if os.path.exists(dest):
            continue
        subprocess.run(['pdftoppm', '-f', str(pg), '-l', str(pg), '-r', '150',
                        '-png', pdf, f'/tmp/oeq25_{pg}'], check=True)
        # pdftoppm names /tmp/oeq25_<pg>-<pg>.png (or -0<p>)
        for cand in (f'/tmp/oeq25_{pg}-{pg}.png', f'/tmp/oeq25_{pg}-0{pg}.png'):
            if os.path.exists(cand):
                os.replace(cand, dest)
                break
    return True

def main():
    key = sys.argv[1]
    needles = sys.argv[2:]
    pdf = f'{PDFDIR}/{key}.pdf'
    if not os.path.exists(pdf):
        print(f'NO PDF: {pdf}')
        sys.exit(2)
    # page count
    info = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
    npages = int(re.search(r'Pages:\s+(\d+)', info).group(1))
    kind = 'ms' if key.endswith('_ms') else 'qp'
    series_paper = key[:-3] if key.endswith('_ms') else key[:-3]
    series, paper = series_paper.rsplit('_', 1)
    prefix = f'{kind}-{series}-{paper}'
    # extract all pages once (pdftotext per page)
    hits = {n: [] for n in needles}
    for pg in range(1, npages + 1):
        txt = subprocess.run(['pdftotext', '-f', str(pg), '-l', str(pg), pdf, '-'],
                             capture_output=True, text=True).stdout
        coll = re.sub(r'\s+', ' ', txt)
        proj = re.sub(r'[^A-Za-z0-9]', '', coll).lower()
        for n in needles:
            n_coll = re.sub(r'\s+', ' ', n)
            n_proj = re.sub(r'[^A-Za-z0-9]', '', n_coll).lower()
            if n_proj and n_proj in proj:
                hits[n].append(pg)
    for n, pgs in hits.items():
        print(f'{n!r}: pages {pgs}')
        for pg in pgs:
            render_pages(pdf, [pg], prefix)
            print(f'   rendered -> {PAGEDIR}/{prefix}-p{pg:02d}-{pg}.png')

if __name__ == '__main__':
    main()
