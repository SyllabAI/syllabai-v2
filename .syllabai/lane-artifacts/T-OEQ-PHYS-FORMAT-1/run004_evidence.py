#!/usr/bin/env python3
"""run-004 evidence layer builder - glyph-span extraction from the archive PDFs of record.

For every QP/MS PDF needed by the residual S1 worklist, extracts PyMuPDF span-level
layout data (text, font size, baseline origin y) per page and builds a whitespace-
normalized page text with a char->span index. This is the PAGE EVIDENCE layer:
superscripts/subscripts on the printed page are real glyphs with reduced size and
raised/lowered baseline - pdftotext flattened them into the corpus, the layout layer
keeps them measurable.

Output: /tmp/run004_evidence/<ser>_<code>_<qp|ms>.json
"""
import json, os, re, sys, collections
import fitz

BASE = "/tmp/pp/past-papers/pearson-edexcel/international-gcse/physics/4ph1/past-papers"
OUT = "/tmp/run004_evidence"
os.makedirs(OUT, exist_ok=True)

PUA_MAP = {'\uf0b4': '×', '\uf070': 'π', '\uf044': 'Δ', '\uf0b0': '°', '\uf0a2': '•', '\uf0b7': '•'}

def norm(s):
    s = s.replace('\u2212', '-').replace('\u2013', '-').replace('\u2019', "'")
    s = s.replace('\u2018', "'").replace('\u00a0', '').replace('\u200b', '')
    s = s.replace('\ufb01', 'fi').replace('\ufb02', 'fl')
    s = ''.join(PUA_MAP.get(c, '') if 0xE000 <= ord(c) <= 0xF8FF else c for c in s)
    return re.sub(r'\s+', '', s)

def build_pdf(path):
    doc = fitz.open(path)
    pages = []
    for pno in range(len(doc)):
        d = doc[pno].get_text('dict')
        spans = []
        for b in d.get('blocks', []):
            if b.get('type') != 0:
                continue
            for l in b.get('lines', []):
                for s in l.get('spans', []):
                    if s.get('text') and s['text'].strip():
                        spans.append({'t': s['text'], 'size': round(s['size'], 2),
                                      'oy': round(s['origin'][1], 2)})
        nchars, cmap, buf = [], [], []
        for si, sp in enumerate(spans):
            t = norm(sp['t'])
            for _ in t:
                cmap.append(si)
            buf.append(t)
        pages.append({'spans': spans, 'ntext': ''.join(buf), 'cmap': cmap})
    return pages

def main():
    need = json.load(open('/tmp/run004_papers.json'))
    built, skipped = 0, []
    for ser, ps in sorted(need.items()):
        for code, pdfs in sorted(ps.items()):
            for kind, pdf in (('ms', 'ms.pdf'), ('qp', 'qp.pdf')):
                if pdf not in pdfs:
                    continue
                outp = f"{OUT}/{ser}_{code.lower()}_{kind}.json"
                if os.path.exists(outp):
                    built += 1
                    continue
                src = f"{BASE}/{ser}/{code}/{pdf}"
                if not os.path.exists(src):
                    skipped.append(src)
                    continue
                pages = build_pdf(src)
                json.dump({'src': src, 'pages': pages}, open(outp, 'w'), ensure_ascii=False)
                built += 1
    print(f'evidence files: {built}, missing sources: {len(skipped)}')
    for s in skipped[:5]:
        print('  MISSING', s)
    # sanity: sample a known restoration page - 2019-06 1P MS should contain v2=u2 family
    ev = json.load(open(f'{OUT}/2019-06_4ph1-1p_ms.json'))
    hit = [p['ntext'].find('v2=u2') for p in ev['pages']]
    print('sanity v2=u2 hits per page:', [i for i, h in enumerate(hit) if h >= 0])

if __name__ == '__main__':
    main()
