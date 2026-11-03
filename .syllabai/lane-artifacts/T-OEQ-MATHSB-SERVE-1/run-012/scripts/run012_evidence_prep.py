#!/usr/bin/env python3
"""run-012 fleet-retry evidence prep (T-OEQ-MATHSB-SERVE-1).

Rebuilds the deep-water residual queues (lost with the run-011 session workspace),
stages slices, fetches QP/MS PDFs from the syllabai-pastpapers mirror, page-finds
via distinctive-word voting (playbook PLAYBOOK-CONTENT-QUALITY.md section 3.2) and
renders evidence PNGs for the fleet agents to read.

Usage:
  python3 run012_evidence_prep.py census   # rebuild + print worklist counts
  python3 run012_evidence_prep.py slices   # write slice JSONs
  python3 run012_evidence_prep.py evidence # fetch PDFs + render evidence PNGs
"""
import json, re, sys, os, hashlib, urllib.request, ssl

REPO = '/home/z/my-project/repos/syllabai-v2'
BASE = f'{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json'
OUT = '/home/z/my-project/download/t-oeq-mathsb/run012'
LANE = f'{REPO}/.syllabai/lane-artifacts/T-OEQ-MATHSB-SERVE-1/run-012'
MIRROR = ('https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/'
          'past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/past-papers')

par = re.compile(r'\(([^()]*)\)')
PAREN = re.compile(r'\([^()]*\)')
OPS = set('+-×÷=<>±~∼⩽⩾≥≤−–—')
MONTH = {'January': '01', 'February': '02', 'June': '06', 'October': '10', 'November': '11'}


def ftext(v):
    if isinstance(v, list):
        return ' '.join(str(x) for x in v)
    return v or ''


def series_of(datestr):
    m = re.match(r'(\w+) (\d{4})', datestr or '')
    return f"{m.group(2)}-{MONTH[m.group(1)]}" if m and m.group(1) in MONTH else None


def paper_of(number):
    m = re.search(r'4MB1/?(\d{2}R?)', number or '', re.I)
    return m.group(1).upper() if m else None


def load_parts():
    d = json.load(open(BASE))
    for s in d:
        for q in s['questions']:
            for p in q['parts']:
                yield s, q, p


def census():
    matrixish, unitsup, cjunk, figures = [], [], [], []
    seen_m = set()
    for s, q, p in load_parts():
        sp = p.get('sourcePaper') or {}
        loc = {'set': s['slug'], 'qid': q['id'], 'pid': p['id'], 'marks': p.get('marks'),
               'series': series_of(sp.get('date')), 'paper': paper_of(sp.get('number')),
               'qnum': sp.get('questionNumber'), 'partLabel': sp.get('questionPart')}
        for f in ('problemMd', 'solutionMd', 'markPoints'):
            t = ftext(p.get(f))
            for m in par.finditer(t):
                inner = m.group(1)
                if ',' in inner or any(ch in OPS for ch in inner):
                    continue
                toks = inner.split()
                if len(toks) < 2 or not all(re.search(r'\d', tok) for tok in toks):
                    continue
                key = (p['id'], f, inner)
                if key in seen_m:
                    continue
                seen_m.add(key)
                matrixish.append({**loc, 'field': f, 'match': inner,
                                  'text': t[:500]})
        tu = PAREN.sub(' ', ftext(p.get('problemMd'))) + ' ||| ' + PAREN.sub(' ', ftext(p.get('solutionMd')))
        hits = []
        for m in re.finditer(r'\b(?:k?m|cm|mm)[23]\b(?![\u00b2\u00b3])', tu):
            hits.append(('unit_flat', m.group(0)))
        for m in re.finditer(r'\b[a-z]\d*\s?‒\s?\d\b', tu):
            hits.append(('neg_exp', m.group(0)))
        for m in re.finditer(r'[×x]\s*10\s*[2-9]\b(?!\d)', tu):
            hits.append(('ten_pow', m.group(0)))
        if hits:
            unitsup.append({**loc, 'hits': hits, 'text': tu[:500]})
        if '©' in ftext(p.get('solutionMd')) + ftext(p.get('problemMd')):
            cjunk.append({**loc, 'text': tu[:500]})
        for a in (p.get('assets') or []):
            if isinstance(a, dict) and a.get('kind') == 'crop-required':
                figures.append({**loc, 'asset': a,
                                'text': ftext(p.get('problemMd'))[:500]})
    return matrixish, unitsup, cjunk, figures


def slice_items(items, per=19):
    return [items[i:i + per] for i in range(0, len(items), per)]


def slices():
    os.makedirs(f'{OUT}/slices', exist_ok=True)
    os.makedirs(LANE, exist_ok=True)
    m, u, c, g = census()
    wl = {'built': 'run-012', 'matrixish_hits': len(m), 'matrixish_parts': len({x['pid'] for x in m}),
          'unitsup_parts': len(u), 'cjunk_parts': len(c), 'figure_entries': len(g)}
    json.dump(wl, open(f'{OUT}/worklists.json', 'w'), indent=1)
    print('worklists:', wl)
    # text slices: matrix A*, unitsup B*, cjunk C
    n = 1
    for chunk in slice_items(m):
        json.dump({'slice': f'w2-A{n}', 'class': 'matrixish', 'items': chunk},
                  open(f'{OUT}/slices/w2-A{n}.json', 'w'), ensure_ascii=False, indent=1)
        n += 1
    n = 1
    for chunk in slice_items(u):
        json.dump({'slice': f'w2-B{n}', 'class': 'unit-sup', 'items': chunk},
                  open(f'{OUT}/slices/w2-B{n}.json', 'w'), ensure_ascii=False, indent=1)
        n += 1
    json.dump({'slice': 'w2-C1', 'class': 'c-junk', 'items': c},
              open(f'{OUT}/slices/w2-C1.json', 'w'), ensure_ascii=False, indent=1)
    json.dump({'slice': 'w3-figures', 'class': 'crop-required', 'items': g},
              open(f'{OUT}/slices/w3-figures.json', 'w'), ensure_ascii=False, indent=1)
    # persist the whole lane in-repo (self-improving lesson: scripts die with the workspace)
    for f in os.listdir(f'{OUT}/slices'):
        json.dump(json.load(open(f'{OUT}/slices/{f}')), open(f'{LANE}/{f}', 'w'),
                  ensure_ascii=False, indent=1)
    json.dump(wl, open(f'{LANE}/worklists.json', 'w'), indent=1)
    print('slices written:', sorted(os.listdir(f'{OUT}/slices')))


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 10000:
        return dest
    ctx = ssl.create_default_context()
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'syllabai-run012'})
            with urllib.request.urlopen(req, timeout=60, context=ctx) as r, open(dest, 'wb') as fh:
                fh.write(r.read())
            return dest
        except Exception as e:
            if attempt == 2:
                print('  FETCH FAIL', url, e)
                return None
    return dest


def find_page(doc, text, qnum=None):
    words = sorted({w for w in re.findall(r'[a-z]{4,}', text.lower())}, key=len, reverse=True)[:10]
    if not words:
        return 0, 0.0
    best, bestscore = 0, -1.0
    for i in range(doc.page_count):
        ptext = doc[i].get_text().lower()
        hits = sum(1 for w in words if w in ptext)
        score = hits / len(words)
        if qnum and re.search(rf'\b0?{qnum}\b', ptext):
            score += 0.05
        if score > bestscore:
            best, bestscore = i, score
    return best, bestscore


def evidence():
    import fitz
    os.makedirs(f'{OUT}/pdfs', exist_ok=True)
    os.makedirs(f'{OUT}/evidence', exist_ok=True)
    m, u, c, g = census()
    items = {}
    for x in m:
        items.setdefault((x['series'], x['paper'], x['qnum']), {'text': ''})['text'] += ' ' + x['text']
    for x in u:
        items.setdefault((x['series'], x['paper'], x['qnum']), {'text': ''})['text'] += ' ' + x['text']
    for x in c:
        items.setdefault((x['series'], x['paper'], x['qnum']), {'text': ''})['text'] += ' ' + x['text']
    # figures: QP pages of record
    figpages = {}
    done = 0
    for (series, paper, qnum), meta in sorted(items.items(), key=lambda kv: str(kv[0])):
        if not series or not paper:
            print('  SKIP no-series/paper', series, paper, qnum)
            continue
        tag = f"{series.replace('-', '')}_{paper}_q{qnum}"
        qpdf = fetch(f'{MIRROR}/{series}/4MB1-{paper}/qp.pdf', f'{OUT}/pdfs/{tag}_qp.pdf')
        spdf = fetch(f'{MIRROR}/{series}/4MB1-{paper}/ms.pdf', f'{OUT}/pdfs/{tag}_ms.pdf')
        entry = {}
        if qpdf:
            doc = fitz.open(qpdf)
            pg, score = find_page(doc, meta['text'], qnum)
            entry['qpPage0'] = pg
            entry['qpVote'] = round(score, 2)
            for k, suffix in ((pg, 'qp'), (pg + 1, 'qp2')):
                if k < doc.page_count:
                    pix = doc[k].get_pixmap(matrix=fitz.Matrix(2.2, 2.2))
                    pix.save(f'{OUT}/evidence/{tag}_p{k}_{suffix}.png')
            doc.close()
        if spdf:
            doc = fitz.open(spdf)
            pg, score = find_page(doc, meta['text'])
            entry['msPage0'] = pg
            entry['msVote'] = round(score, 2)
            if pg < doc.page_count:
                pix = doc[pg].get_pixmap(matrix=fitz.Matrix(2.2, 2.2))
                pix.save(f'{OUT}/evidence/{tag}_p{pg}_ms.png')
            doc.close()
        figpages[f'{series}|{paper}|{qnum}'] = entry
        done += 1
        if done % 10 == 0:
            print(f'  evidence {done}/{len(items)}')
    json.dump(figpages, open(f'{OUT}/figpages.json', 'w'), indent=1)
    json.dump(figpages, open(f'{LANE}/figpages.json', 'w'), indent=1)
    print('evidence pages rendered:', len(figpages),
          'pngs:', len(os.listdir(f'{OUT}/evidence')))


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'census'
    if cmd == 'census':
        m, u, c, g = census()
        print(f"matrixish hits: {len(m)}  parts: {len({x['pid'] for x in m})}")
        print(f"unit-sup parts: {len(u)}")
        print(f"c-junk parts:   {len(c)}")
        print(f"figure entries: {len(g)}")
    elif cmd == 'slices':
        slices()
    elif cmd == 'evidence':
        evidence()
