#!/usr/bin/env python3
"""run-012 figure lane: 64 crop-required entries that defeated the run-011 auto-crop
(auto-crop returned None: figure on adjacent page, or raster-only page).

Pipeline (extends PLAYBOOK-CONTENT-QUALITY.md section 3):
  1. page find via distinctive-word voting on problemMd
  2. question block = margin qnum y -> next qnum y (margin words x0<62 equal to qnum)
  3. seed-and-grow vector clustering with furniture exclusions on page p, then p+1, p+2,
     p-1, p-2 (adjacent-page extension; figure frequently faces the question)
  4. if still nothing: BLOCK-LEVEL raster crop of the question block (review:true,
     note 'block-level machine crop') — honest machine-staged flag per law 8
  5. output PNGs + attach manifest; the resources push + plane attach run at landing
     (PAT-gated) so the crop-URL gate can pass before attach.

Usage: python3 run012_figures.py
"""
import json, re, os, urllib.request, ssl

REPO = '/home/z/my-project/repos/syllabai-v2'
BASE = f'{REPO}/apps/hub/content/igcse-maths-b-16/official-papers.json'
OUT = '/home/z/my-project/download/t-oeq-mathsb/run012'
MIRROR = ('https://raw.githubusercontent.com/SyllabAI/syllabai-pastpapers/main/'
          'past-papers/pearson-edexcel/international-gcse/mathematics-b/4mb1/past-papers')
MONTH = {'January': '01', 'February': '02', 'June': '06', 'October': '10', 'November': '11'}


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 10000:
        return dest
    ctx = ssl.create_default_context()
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'syllabai-run012'})
        with urllib.request.urlopen(req, timeout=60, context=ctx) as r, open(dest, 'wb') as fh:
            fh.write(r.read())
        return dest
    except Exception as e:
        print('  FETCH FAIL', url.split('/')[-2:], e)
        return None


def page_find(doc, text):
    words = sorted({w for w in re.findall(r'[a-z]{4,}', (text or '').lower())}, key=len, reverse=True)[:10]
    if not words:
        return 0, 0.0
    best, bs = 0, -1.0
    for i in range(doc.page_count):
        pt = doc[i].get_text().lower()
        score = sum(1 for w in words if w in pt) / len(words)
        if score > bs:
            best, bs = i, score
    return best, bs


def question_block(page, qnum):
    """(y0, y1) of the question block via margin qnum words (x0<62). None if not found."""
    words = page.get_text('words')  # x0,y0,x1,y1,word,block,line,wordno
    qn = str(qnum)
    cands = [w for w in words if w[4] == qn and w[0] < 62]
    if not cands:
        return None
    y0 = min(w[1] for w in cands)
    nxt = [w[1] for w in words if w[4].isdigit() and w[0] < 62 and int(w[4]) > int(qn) and w[1] > y0 + 5]
    # only next QUESTION number: pick the smallest strictly-larger margin digit below
    nxt = sorted(nxt)
    y1 = nxt[0] if nxt else page.rect.height
    return (y0, min(y1, page.rect.height))


def furniture(item, page):
    area = (item['x1'] - item['x0']) * (item['y1'] - item['y0'])
    if area > 0.45 * page.rect.width * page.rect.height:
        return True          # answer-box border
    if item['x1'] < 30 or (item['x0'] < 40 and item['y1'] < 40):
        return True          # margin/corner ticks
    if (item['x1'] - item['x0']) > 0.92 * page.rect.width and (item['y1'] - item['y0']) < 6:
        return True          # full-width separator
    return False


def seed_grow(page, block):
    drawings = page.get_drawings()
    x0, y1b = block
    items = []
    for d in drawings:
        r = d['rect']
        cy = (r.y0 + r.y1) / 2
        if x0 - 40 <= cy <= y1b + 40 and r.width > 2 and r.height > 2 and not furniture(
                {'x0': r.x0, 'x1': r.x1, 'y0': r.y0, 'y1': r.y1}, page):
            items.append(r)
    if not items:
        return None
    items.sort(key=lambda r: r.width * r.height, reverse=True)
    seed = items[0]
    union = fitz_rect_copy(seed)
    grown = True
    while grown:
        grown = False
        for r in items:
            if rect_near(union, r, 25):
                nb = fitz_rect_copy(union)
                nb |= r
                if nb != union:
                    union = nb
                    grown = True
    # sliver guard: a tiny union is junk (tick/dot), not a figure -> treat as none
    if union.width < 50 or union.height < 25:
        return None
    return union


def fitz_rect_copy(r):
    import fitz
    return fitz.Rect(r)


def rect_near(a, b, prox):
    import fitz
    return fitz.Rect(a.x0 - prox, a.y0 - prox, a.x1 + prox, a.y1 + prox).intersects(b)


def main():
    import fitz
    os.makedirs(f'{OUT}/figures', exist_ok=True)
    d = json.load(open(BASE))
    entries = []
    for s in d:
        for q in s['questions']:
            for p in q['parts']:
                for a in (p.get('assets') or []):
                    if isinstance(a, dict) and a.get('kind') == 'crop-required':
                        sp = p.get('sourcePaper') or {}
                        m = re.match(r'(\w+) (\d{4})', sp.get('date') or '')
                        series = f"{m.group(2)}-{MONTH[m.group(1)]}" if m else None
                        pm = re.search(r'4MB1/?(\d{2}R?)', sp.get('number') or '', re.I)
                        entries.append({'set': s['slug'], 'qid': q['id'], 'pid': p['id'],
                                        'series': series, 'paper': pm.group(1).upper() if pm else None,
                                        'qnum': sp.get('questionNumber'),
                                        'text': (p.get('problemMd') or '')[:600],
                                        'asset': a})
    print('figure entries:', len(entries))
    manifest = []
    occ_counter = {}
    for e in entries:
        if not e['series'] or not e['paper']:
            manifest.append({**e, 'status': 'NO-LOOKUP'})
            continue
        tag = f"{e['series'].replace('-', '')}_{e['paper']}_q{e['qnum']}"
        qpdf = fetch(f"{MIRROR}/{e['series']}/4MB1-{e['paper']}/qp.pdf", f'{OUT}/pdfs/{tag}_qp.pdf')
        if not qpdf:
            manifest.append({**e, 'status': 'NO-PDF', 'tag': tag})
            continue
        doc = fitz.open(qpdf)
        pg, vote = page_find(doc, e['text'])
        chosen = None
        mode = None
        # scan order: found page, then adjacent +1 +2, then -1 -2 (adjacent-page extension)
        for off, tagm in ((0, 'in-block'), (1, 'adjacent+1'), (2, 'adjacent+2'),
                          (-1, 'adjacent-1'), (-2, 'adjacent-2')):
            k = pg + off
            if not (0 <= k < doc.page_count):
                continue
            blk = question_block(doc[k], e['qnum']) if off == 0 else None
            if blk:
                r = seed_grow(doc[k], blk)
                if r:
                    chosen, mode, page_used, rect = r, tagm, k, r
                    break
            else:
                # block find failed on the voted page — try whole-page vector census
                pge = doc[k]
                blk_alt = (40, pge.rect.height - 30)
                r = seed_grow(pge, blk_alt)
                if r:
                    chosen, mode, page_used, rect = r, tagm + '(no-block)', k, r
                    break
        status = 'CROPPED'
        if chosen is None:
            # raster/block-level fallback: crop the question block itself
            blk = question_block(doc[pg], e['qnum']) if pg < doc.page_count else None
            if blk:
                chosen = fitz.Rect(40, max(0, blk[0] - 10), doc[pg].rect.width - 30,
                                   min(doc[pg].rect.height, blk[1] + 10))
                mode, page_used = 'block-raster', pg
            else:
                manifest.append({**e, 'status': 'UNRESOLVED', 'tag': tag, 'qpPage0': pg})
                doc.close()
                continue
        clip = fitz.Rect(max(0, chosen.x0 - 16), max(0, chosen.y0 - 10),
                         min(doc[page_used].rect.width, chosen.x1 + 16),
                         min(doc[page_used].rect.height, chosen.y1 + 10))
        pix = doc[page_used].get_pixmap(matrix=fitz.Matrix(3, 3), clip=clip)
        occ = occ_counter.get((e['pid'], e['qnum']), 0)
        occ_counter[(e['pid'], e['qnum'])] = occ + 1
        suffix = f"_{occ}" if occ else ""
        name = f"asset_{e['qnum']}_{e['pid'].split('_')[-1]}{suffix}.png"
        pix.save(f'{OUT}/figures/{tag}_{name}')
        manifest.append({**e, 'status': status, 'tag': tag, 'mode': mode,
                         'pageUsed': page_used, 'vote': round(vote, 2),
                         'png': f'{tag}_{name}'})
        doc.close()
    json.dump(manifest, open(f'{OUT}/figure_manifest.json', 'w'), ensure_ascii=False, indent=1)
    from collections import Counter
    print(Counter(m['status'] for m in manifest))
    print(Counter(m.get('mode') for m in manifest if m['status'] == 'CROPPED'))


if __name__ == '__main__':
    main()
